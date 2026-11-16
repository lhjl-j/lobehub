import { type CreateImageState } from './slices/createImage/initialState';
import { initialCreateImageState } from './slices/createImage/initialState';
import { type GenerationBatchState } from './slices/generationBatch/initialState';
import { initialGenerationBatchState } from './slices/generationBatch/initialState';
import { type GenerationConfigState } from './slices/generationConfig/initialState';
import { initialGenerationConfigState } from './slices/generationConfig/initialState';
import { type GenerationShareState } from './slices/generationShare/initialState';
import { initialGenerationShareState } from './slices/generationShare/initialState';
import { type GenerationTopicState } from './slices/generationTopic/initialState';
import { initialGenerationTopicState } from './slices/generationTopic/initialState';

export type ImageStoreState = GenerationConfigState &
  GenerationTopicState &
  GenerationBatchState &
  GenerationShareState &
  CreateImageState;

export const initialState: ImageStoreState = {
  ...initialGenerationConfigState,
  ...initialGenerationTopicState,
  ...initialGenerationBatchState,
  ...initialGenerationShareState,
  ...initialCreateImageState,
};
