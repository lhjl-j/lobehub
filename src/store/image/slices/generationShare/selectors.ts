import type { ImageStoreState } from '../../initialState';
import type { GenerationShareEntry } from './projection';

const getGenerationShare =
  (generationId?: string | null) =>
  (s: ImageStoreState): GenerationShareEntry | undefined =>
    generationId ? s.generationShareMap[generationId] : undefined;

export const generationShareSelectors = { getGenerationShare };
