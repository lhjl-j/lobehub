import type { Message } from 'chat';
import debug from 'debug';
import type { ChainableCommander, Redis } from 'ioredis';

import { getAgentRuntimeRedisClient } from '@/server/modules/AgentRuntime/redis';

const log = debug('lobe-server:bot:deferred-messages');

/**
 * Cross-process queue for inbound bot messages that arrive while the thread's
 * topic still has a live agent run.
 *
 * Why this exists: in queue mode the bridge hands the run to the job queue and
 * returns immediately, so both the Chat SDK thread lock and the in-process
 * `activeThreads` guard are released long before the agent finishes. A
 * follow-up that lands in that window (WeChat delivers "one image + one
 * sentence" as two messages a few hundred ms apart) used to race the
 * topic-start reservation, lose, and surface as "Agent Execution Failed".
 *
 * Instead the bridge parks the serialized message here, and the completion
 * callback replays every parked message through the Chat SDK once the run is
 * done — the same path a brand-new inbound message takes, so subscription /
 * mention / command routing stay untouched.
 *
 * Key layout: `bot:deferred-messages:<applicationId>:<platformThreadId>`.
 * Scoped by application because one WeChat user can talk to several bots and
 * their thread ids collide (`wechat:single:<userId>`).
 *
 * Entries are `Message.toJSON()` payloads. `raw` survives serialization, which
 * is what the per-platform `extractFiles` needs to re-download media after the
 * round-trip (the same contract the SDK's own queue relies on).
 */
export type DeferredBotMessage = ReturnType<Message['toJSON']>;

/** Matches the agent execution ceiling so a crashed run can't strand entries. */
const TTL_SECONDS = 30 * 60;

/** Hard cap so a runaway sender cannot grow the list unboundedly. */
export const MAX_DEFERRED_PER_THREAD = 20;

export const buildDeferredMessagesKey = (applicationId: string, platformThreadId: string): string =>
  `bot:deferred-messages:${applicationId}:${platformThreadId}`;

/**
 * Whether deferral is available at all — it needs Redis because the replay
 * happens in the callback process, not the one that received the message.
 */
export const isDeferredMessagesAvailable = (): boolean => !!getAgentRuntimeRedisClient();

/**
 * Park messages (chronological) for replay after the running agent completes.
 * A merged message should be passed as its individual sources so each one
 * keeps its own `raw` for media re-download.
 *
 * @returns `true` when the messages were stored; `false` when Redis is
 * unavailable or the write failed — callers should then fall back to the
 * previous (fail-fast) behavior rather than drop the message silently.
 */
export async function deferBotMessages(
  applicationId: string,
  platformThreadId: string,
  messages: Message[],
): Promise<boolean> {
  const redis = getAgentRuntimeRedisClient();
  if (!redis || messages.length === 0) return false;

  const key = buildDeferredMessagesKey(applicationId, platformThreadId);
  try {
    const payloads = messages.map((message) => JSON.stringify(message.toJSON()));
    const results = await redis
      .multi()
      .rpush(key, ...payloads)
      .ltrim(key, -MAX_DEFERRED_PER_THREAD, -1)
      .expire(key, TTL_SECONDS)
      .exec();
    const failure = results?.find(([error]) => error)?.[0];
    if (!results || failure) throw failure ?? new Error('Deferred write aborted');
    log(
      'deferred %d message(s) [%s] for thread=%s app=%s',
      messages.length,
      messages.map((message) => message.id).join(','),
      platformThreadId,
      applicationId,
    );
    return true;
  } catch (error) {
    log('deferBotMessage failed for thread=%s: %O', platformThreadId, error);
    return false;
  }
}

/**
 * How long one replay may hold an entry before another replay takes it over.
 * Handing a message to the SDK in queue mode returns at the job handoff, so
 * this only expires when the replaying process died mid-dispatch.
 */
const REPLAY_CLAIM_TTL_SECONDS = 5 * 60;

const REPLAY_PENDING = 'pending';
const REPLAY_DONE = 'done';

/**
 * Per-entry replay marker: `pending` while a replay dispatches the entry,
 * `done` once the SDK accepted it. Lives as long as the deferred list itself.
 */
export const buildDeferredReplayMarkerKey = (
  applicationId: string,
  platformThreadId: string,
  messageId: string,
): string => `bot:deferred-replayed:${applicationId}:${platformThreadId}:${messageId}`;

interface DeferredSnapshotEntry {
  marker: string;
  message: DeferredBotMessage;
  /** The exact stored string — the only value `LREM` is guaranteed to match. */
  payload: string;
}

const execOrThrow = async (transaction: ChainableCommander, action: string) => {
  const results = await transaction.exec();
  const failure = results?.find(([error]) => error)?.[0];
  if (!results || failure) throw failure ?? new Error(`${action} aborted`);
  return results;
};

async function readDeferredSnapshot(
  redis: Redis,
  applicationId: string,
  platformThreadId: string,
): Promise<DeferredSnapshotEntry[]> {
  const key = buildDeferredMessagesKey(applicationId, platformThreadId);
  const payloads = await redis.lrange(key, 0, -1);
  const snapshot: DeferredSnapshotEntry[] = [];
  for (const payload of payloads) {
    try {
      const message = JSON.parse(payload) as DeferredBotMessage;
      const marker = buildDeferredReplayMarkerKey(applicationId, platformThreadId, message.id);
      snapshot.push({ marker, message, payload });
    } catch (error) {
      log('Invalid deferred payload for thread=%s: %O', platformThreadId, error);
    }
  }
  return snapshot;
}

/** Read a snapshot without removing messages before the SDK accepts them. */
export async function readDeferredBotMessages(
  applicationId: string,
  platformThreadId: string,
): Promise<DeferredBotMessage[]> {
  const redis = getAgentRuntimeRedisClient();
  if (!redis) return [];
  const snapshot = await readDeferredSnapshot(redis, applicationId, platformThreadId);
  return snapshot.map((entry) => entry.message);
}

/**
 * Split a snapshot into entries this replay now owns, entries an earlier
 * replay already handed to the SDK, and (implicitly) entries another replay
 * is still dispatching — those stay queued for their owner to acknowledge.
 */
async function claimDeferredEntries(redis: Redis, snapshot: DeferredSnapshotEntry[]) {
  const claims = redis.multi();
  for (const entry of snapshot) {
    claims.set(entry.marker, REPLAY_PENDING, 'EX', REPLAY_CLAIM_TTL_SECONDS, 'NX');
  }
  const claimResults = await execOrThrow(claims, 'Deferred replay claim');

  const claimed: DeferredSnapshotEntry[] = [];
  const taken: DeferredSnapshotEntry[] = [];
  snapshot.forEach((entry, index) => {
    (claimResults[index]?.[1] === 'OK' ? claimed : taken).push(entry);
  });
  if (taken.length === 0) return { claimed, replayed: [] };

  const lookups = redis.multi();
  for (const entry of taken) lookups.get(entry.marker);
  const states = await execOrThrow(lookups, 'Deferred replay lookup');
  const replayed = taken.filter((_, index) => states[index]?.[1] === REPLAY_DONE);
  return { claimed, replayed };
}

/**
 * Replay a snapshot of the parked messages, each at most once.
 *
 * Every entry is claimed before dispatch and marked `done` in the same
 * transaction that removes it, so a later pass (a completion callback, a
 * retried replay job, or the post-enqueue recheck) never hands an entry the
 * SDK already accepted to the agent again. A replayed message gets a fresh id
 * (see `buildReplayMessages`), so the SDK's own inbound dedupe cannot catch
 * this; without the marker every run's completion would start another run.
 *
 * Removal matches the exact stored string: the pipeline may mutate the
 * parsed entry while replaying (the Feishu client writes the quoted message
 * onto `raw`), so re-serializing it would no longer match.
 *
 * A failed replay releases its claims and leaves the batch queued for retry,
 * so a batch that partially succeeds is still delivered at least once.
 */
export async function replayDeferredBotMessages(
  applicationId: string,
  platformThreadId: string,
  replay: (entries: DeferredBotMessage[]) => Promise<void>,
): Promise<void> {
  const redis = getAgentRuntimeRedisClient();
  if (!redis) return;
  const snapshot = await readDeferredSnapshot(redis, applicationId, platformThreadId);
  if (snapshot.length === 0) return;

  const { claimed, replayed } = await claimDeferredEntries(redis, snapshot);
  if (claimed.length === 0 && replayed.length === 0) return;
  if (replayed.length > 0) {
    console.warn(
      `[bot:deferred-messages] skipped ${replayed.length} already-replayed deferred message(s)`,
      {
        applicationId,
        messageIds: replayed.map((entry) => entry.message.id),
        platformThreadId,
      },
    );
  }

  if (claimed.length > 0) {
    try {
      await replay(claimed.map((entry) => entry.message));
    } catch (error) {
      try {
        await redis.del(...claimed.map((entry) => entry.marker));
      } catch (releaseError) {
        log('Could not release replay claims for thread=%s: %O', platformThreadId, releaseError);
      }
      throw error;
    }
  }

  const key = buildDeferredMessagesKey(applicationId, platformThreadId);
  const transaction = redis.multi();
  for (const entry of claimed) {
    transaction.set(entry.marker, REPLAY_DONE, 'EX', TTL_SECONDS);
  }
  for (const entry of [...claimed, ...replayed]) transaction.lrem(key, 1, entry.payload);
  await execOrThrow(transaction, 'Deferred replay acknowledgement');
}
