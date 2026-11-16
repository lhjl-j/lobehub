import type { GenerationShareSettings, ShareVisibility } from '@lobechat/types';

import { lambdaClient } from '@/libs/trpc/client';

/** Public share links of single generation results (`/share/g/<shareId>`). */
class GenerationShareService {
  getShareSettings = (generationId: string): Promise<GenerationShareSettings | null> =>
    lambdaClient.generationShare.getShareSettings.query({ generationId });

  /** Creates the link on first use; resolves to the settings after the change. */
  setVisibility = (
    generationId: string,
    visibility: ShareVisibility,
  ): Promise<GenerationShareSettings | null> =>
    lambdaClient.generationShare.setVisibility.mutate({ generationId, visibility });
}

export const generationShareService = new GenerationShareService();
