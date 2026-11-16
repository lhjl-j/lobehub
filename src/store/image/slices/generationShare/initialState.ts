import { createReplicaState, type ReplicaState } from '@/libs/replica';

import type { GenerationShareEntry } from './projection';

export interface GenerationShareState {
  /** Replica view: share link of each generation, by generation id. */
  generationShareMap: Record<string, GenerationShareEntry>;
  /** Replica bookkeeping of `generationShareMap`. */
  generationShareReplica: ReplicaState<GenerationShareEntry>;
}

export const initialGenerationShareState: GenerationShareState = {
  generationShareMap: {},
  generationShareReplica: createReplicaState<GenerationShareEntry>(),
};
