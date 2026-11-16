import type { GenerationShareSettings } from '@lobechat/types';

import { defineReplica } from '@/libs/replica';

/** A generation's share link, or `null` when it has never been shared (private). */
export interface GenerationShareEntry {
  share: GenerationShareSettings | null;
}

/**
 * The share link behind the generation Share panel, by generation id
 * (`generationShareMap[generationId]`). Only an existing link is persisted:
 * "no link" reads as private, and a stale copy of that could hide a link
 * published from another device, so a reload waits for the server instead.
 */
export const generationShareResource = defineReplica<string, GenerationShareEntry>({
  key: (generationId) => generationId,
  name: 'generationShareInfo',
  persist: { maxEntries: 50 },
  storage: 'indexedDB',
  version: 1,
});
