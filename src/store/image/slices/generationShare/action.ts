import type { GenerationShareSettings, ShareVisibility } from '@lobechat/types';

import { createReplicaSlice, recordLens, type ReplicaSyncResult } from '@/libs/replica';
import { generationShareService } from '@/services/generationShare';
import type { StoreSetter } from '@/store/types';
import { setNamespace } from '@/utils/storeDebug';

import type { ImageStore } from '../../store';
import { type GenerationShareEntry, generationShareResource } from './projection';

type Setter = StoreSetter<ImageStore>;

const createShareReplica = (set: Setter, get: () => ImageStore) =>
  createReplicaSlice(generationShareResource, {
    actionPrefix: setNamespace('generationShare')('share'),
    fetcher: async (generationId): Promise<GenerationShareEntry> => ({
      share: await generationShareService.getShareSettings(generationId),
    }),
    get,
    set,
    stateKey: 'generationShareReplica',
    // "No link" is never persisted, and evicts a link persisted earlier.
    toPersisted: (data) => (data.share ? data : null),
    view: recordLens<ImageStore, GenerationShareEntry>('generationShareMap'),
  });

export const createGenerationShareSlice = (set: Setter, get: () => ImageStore, _api?: unknown) =>
  new GenerationShareActionImpl(set, get, _api);

/** The public link of one generation result (image, video or song). */
export class GenerationShareActionImpl {
  readonly #share;

  constructor(set: Setter, get: () => ImageStore, _api?: unknown) {
    void _api;
    this.#share = createShareReplica(set, get);
  }

  /** Read with `generationShareSelectors.getGenerationShare`; an absent id disables the read. */
  useFetchGenerationShare = (generationId?: string | null): ReplicaSyncResult =>
    this.#share.useSync(generationId || null, {
      dedupingInterval: 10_000,
      revalidateOnFocus: false,
    });

  /**
   * Turn a generation's public link on or off (the first call creates it) and
   * land the server's answer on the replica. Resolves to the settings after
   * the change.
   */
  setGenerationShareVisibility = async (
    generationId: string,
    visibility: ShareVisibility,
  ): Promise<GenerationShareSettings | null> => {
    // The link belongs to the identity that started the change; never adopt
    // (and persist) it into another account's or workspace's scope.
    const scope = this.#share.resource.scope.get();
    const share = await generationShareService.setVisibility(generationId, visibility);

    if (this.#share.resource.scope.get() === scope) {
      if (share) this.#share.update(generationId, () => ({ share }));
      else await this.#share.fetch(generationId, { fresh: true });
    }

    return share;
  };
}

export type GenerationShareAction = Pick<
  GenerationShareActionImpl,
  keyof GenerationShareActionImpl
>;
