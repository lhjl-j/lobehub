import type { NextRequest } from 'next/server';

import { getServerDB } from '@/database/server';
import { createLambdaContext } from '@/libs/trpc/lambda/context';
import {
  resolveSharedGenerationAsset,
  SHARED_GENERATION_ASSET_KINDS,
  type SharedGenerationAssetKind,
} from '@/server/services/generationShare';

type Params = Promise<{ kind: string; shareId: string }>;

/** The visitor's user id, if any; a missing or broken session just means anonymous. */
const readSessionUserId = async (req: NextRequest) => {
  try {
    return (await createLambdaContext(req)).userId ?? null;
  } catch {
    return null;
  }
};

/**
 * Share-scoped asset of a shared generation:
 * GET /webapi/share/generation/:shareId/(media|cover)[?download=1]
 *
 * Re-checks the share on every request and 302s to a short-lived storage URL,
 * so a link turned private stops serving at once. The visitor's session only
 * matters for an owner previewing a still-private link.
 */
export const GET = async (req: NextRequest, segmentData: { params: Params }) => {
  const { kind, shareId } = await segmentData.params;
  if (!SHARED_GENERATION_ASSET_KINDS.includes(kind as SharedGenerationAssetKind)) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const db = await getServerDB();
    const userId = await readSessionUserId(req);

    const result = await resolveSharedGenerationAsset({
      db,
      download: new URL(req.url).searchParams.get('download') === '1',
      kind: kind as SharedGenerationAssetKind,
      shareId,
      userId,
    });

    if (result.status === 'ok') return Response.redirect(result.url, 302);

    return new Response(result.status === 'forbidden' ? 'This share is private' : 'Not found', {
      status: result.status === 'forbidden' ? 403 : 404,
    });
  } catch (error) {
    console.error('Shared generation asset error:', error);
    return new Response('Internal server error', { status: 500 });
  }
};
