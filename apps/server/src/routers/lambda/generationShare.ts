import type { GenerationShareSettings, SharedGenerationData } from '@lobechat/types';
import { z } from 'zod';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { GenerationShareModel } from '@/database/models/generationShare';
import { publicProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { toSharedGenerationData } from '@/server/services/generationShare';

const ownerProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;

  return opts.next({
    ctx: {
      generationShareModel: new GenerationShareModel(
        ctx.serverDB,
        ctx.userId,
        ctx.workspaceId ?? undefined,
      ),
    },
  });
});

const toSettings = (
  share: { generationId: string; id: string; pageViewCount: number; visibility: string } | null,
): GenerationShareSettings | null =>
  share
    ? {
        generationId: share.generationId,
        pageViewCount: share.pageViewCount,
        shareId: share.id,
        visibility: share.visibility as GenerationShareSettings['visibility'],
      }
    : null;

/**
 * Public share links for one generation result (`/share/g/<shareId>`).
 *
 * The owner procedures manage the link; `getSharedGeneration` is what the
 * public share page reads, with no login.
 */
export const generationShareRouter = router({
  getShareSettings: ownerProcedure
    .input(z.object({ generationId: z.string() }))
    .query(async ({ ctx, input }) =>
      toSettings(await ctx.generationShareModel.getByGenerationId(input.generationId)),
    ),

  /** Create the link on first use, then flip it between owner-only and anyone-with-the-link. */
  setVisibility: ownerProcedure
    .input(z.object({ generationId: z.string(), visibility: z.enum(['private', 'link']) }))
    .mutation(async ({ ctx, input }) =>
      toSettings(
        await ctx.generationShareModel.setVisibility(input.generationId, input.visibility),
      ),
    ),

  getSharedGeneration: publicProcedure
    .use(serverDatabase)
    .input(z.object({ shareId: z.string() }))
    .query(async ({ ctx, input }): Promise<SharedGenerationData> => {
      const share = await GenerationShareModel.findByShareIdWithAccessCheck(
        ctx.serverDB,
        input.shareId,
        ctx.userId ?? undefined,
      );

      await GenerationShareModel.incrementPageViewCount(ctx.serverDB, input.shareId);

      return toSharedGenerationData(share, !!ctx.userId && share.ownerId === ctx.userId);
    }),
});

export type GenerationShareRouter = typeof generationShareRouter;
