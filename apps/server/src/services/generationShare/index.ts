import type { SharedGenerationData, SharedGenerationType } from '@lobechat/types';
import type { TRPCError } from '@trpc/server';

import { type GenerationShareData, GenerationShareModel } from '@/database/models/generationShare';
import type { LobeChatDatabase } from '@/database/type';
import { FileService } from '@/server/services/file';

/** Which stored file of a shared generation an asset address points at. */
export type SharedGenerationAssetKind = 'cover' | 'media';

export const SHARED_GENERATION_ASSET_KINDS: SharedGenerationAssetKind[] = ['cover', 'media'];

/**
 * Share-scoped address of one asset. It is served by the
 * `/webapi/share/generation/<shareId>/<kind>` route, which re-checks the share
 * on every request (see `SharedGenerationData`). Relative on purpose: the share
 * app forwards `/webapi` to the API on its own origin.
 */
export const sharedGenerationAssetPath = (
  shareId: string,
  kind: SharedGenerationAssetKind,
  download = false,
) =>
  `/webapi/share/generation/${encodeURIComponent(shareId)}/${kind}${download ? '?download=1' : ''}`;

interface StoredAsset {
  coverUrl?: string;
  duration?: number;
  height?: number;
  lyrics?: string;
  thumbnailUrl?: string;
  title?: string;
  url?: string;
  width?: number;
}

const toType = (type: string | null | undefined): SharedGenerationType =>
  type === 'music' || type === 'video' ? type : 'image';

/** Storage key of an asset kind, or undefined when the generation has none. */
export const resolveSharedGenerationAssetKey = (
  share: Pick<GenerationShareData, 'asset' | 'type'>,
  kind: SharedGenerationAssetKind,
): string | undefined => {
  const asset = (share.asset ?? {}) as StoredAsset;
  if (kind === 'media') return asset.url || undefined;

  // Images carry a resized thumbnail; videos and songs carry cover art.
  return toType(share.type) === 'image'
    ? asset.thumbnailUrl || undefined
    : asset.coverUrl || asset.thumbnailUrl || undefined;
};

const FILE_NAME_LIMIT = 60;

/** `a-calm-lake-at-dawn.png` — a readable download name from the title or prompt. */
export const sharedGenerationFileName = (
  share: Pick<GenerationShareData, 'asset' | 'prompt' | 'shareId' | 'type'>,
  key: string,
) => {
  const asset = (share.asset ?? {}) as StoredAsset;
  const base =
    (asset.title || share.prompt || '')
      .normalize('NFKC')
      .replaceAll(/[\\/:*?"<>|]+/g, ' ')
      // Control characters (Unicode category Cc).
      .replaceAll(/\p{Cc}+/gu, ' ')
      .trim()
      .replaceAll(/\s+/g, '-')
      .slice(0, FILE_NAME_LIMIT)
      .replaceAll(/-+$/g, '') || `lobehub-${toType(share.type)}-${share.shareId}`;
  const extension = /\.([a-z\d]{2,5})(?:$|\?)/i.exec(key)?.[1];

  return extension ? `${base}.${extension.toLowerCase()}` : base;
};

/** What the public share page reads. Asset addresses are share-scoped, never storage URLs. */
export const toSharedGenerationData = (
  share: GenerationShareData,
  isOwner: boolean,
): SharedGenerationData => {
  const asset = (share.asset ?? {}) as StoredAsset;
  const type = toType(share.type);
  const hasCover = !!resolveSharedGenerationAssetKey(share, 'cover');

  return {
    asset: {
      coverUrl: hasCover ? sharedGenerationAssetPath(share.shareId, 'cover') : undefined,
      downloadUrl: sharedGenerationAssetPath(share.shareId, 'media', true),
      duration: asset.duration,
      height: asset.height,
      lyrics: type === 'music' ? asset.lyrics : undefined,
      mediaUrl: sharedGenerationAssetPath(share.shareId, 'media'),
      width: asset.width,
    },
    createdAt: new Date(share.createdAt).toISOString(),
    isOwner,
    model: share.model,
    pageViewCount: share.pageViewCount,
    prompt: share.prompt,
    provider: share.provider,
    shareId: share.shareId,
    title: (type === 'music' ? asset.title : undefined) || share.topicTitle || null,
    type,
  };
};

export type SharedGenerationAssetResult =
  { status: 'ok'; url: string } | { status: 'forbidden' | 'not_found' };

/**
 * Re-check the share, then hand out a short-lived storage address for one of
 * its assets. Called on every request to a share-scoped asset address, so a
 * link turned private (or a generation trashed) stops serving immediately.
 */
export const resolveSharedGenerationAsset = async ({
  db,
  download,
  kind,
  shareId,
  userId,
}: {
  db: LobeChatDatabase;
  download: boolean;
  kind: SharedGenerationAssetKind;
  shareId: string;
  userId?: string | null;
}): Promise<SharedGenerationAssetResult> => {
  let share: GenerationShareData;
  try {
    share = await GenerationShareModel.findByShareIdWithAccessCheck(
      db,
      shareId,
      userId ?? undefined,
    );
  } catch (error) {
    return { status: (error as TRPCError)?.code === 'FORBIDDEN' ? 'forbidden' : 'not_found' };
  }

  const key = resolveSharedGenerationAssetKey(share, kind);
  if (!key) return { status: 'not_found' };

  // Storage is read as the owner: the visitor has no rights of their own.
  const fileService = new FileService(db, share.ownerId);
  const url = download
    ? await fileService.createDownloadUrl(key, sharedGenerationFileName(share, key))
    : await fileService.createCachedPreSignedUrlForPreview(key);

  return { status: 'ok', url };
};
