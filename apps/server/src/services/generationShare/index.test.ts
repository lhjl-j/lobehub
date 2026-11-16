// @vitest-environment node
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GenerationShareData } from '@/database/models/generationShare';

const mocks = vi.hoisted(() => ({
  createCachedPreSignedUrlForPreview: vi.fn(),
  createDownloadUrl: vi.fn(),
  fileServiceUserIds: [] as string[],
  findByShareIdWithAccessCheck: vi.fn(),
}));

vi.mock('@/database/models/generationShare', () => ({
  GenerationShareModel: { findByShareIdWithAccessCheck: mocks.findByShareIdWithAccessCheck },
}));

vi.mock('@/server/services/file', () => ({
  FileService: class {
    constructor(_db: unknown, userId: string) {
      mocks.fileServiceUserIds.push(userId);
    }
    createCachedPreSignedUrlForPreview = mocks.createCachedPreSignedUrlForPreview;
    createDownloadUrl = mocks.createDownloadUrl;
  },
}));

const {
  resolveSharedGenerationAsset,
  resolveSharedGenerationAssetKey,
  sharedGenerationFileName,
  toSharedGenerationData,
} = await import('./index');

const share = (overrides: Partial<GenerationShareData> = {}): GenerationShareData =>
  ({
    asset: { height: 768, thumbnailUrl: 'gen/thumb.webp', url: 'gen/full.png', width: 1024 },
    createdAt: new Date('2026-11-16T08:00:00Z'),
    generationId: 'gen_1',
    model: 'flux-pro',
    ownerId: 'owner',
    pageViewCount: 3,
    prompt: 'A calm lake at dawn',
    provider: 'fal',
    shareId: 'Ab3xYz9Kq1Lm',
    topicTitle: 'Landscapes',
    type: 'image',
    visibility: 'link',
    workspaceId: null,
    ...overrides,
  }) as GenerationShareData;

describe('toSharedGenerationData', () => {
  it('exposes share-scoped addresses, never storage keys', () => {
    const data = toSharedGenerationData(share(), false);

    expect(data.asset).toEqual({
      coverUrl: '/webapi/share/generation/Ab3xYz9Kq1Lm/cover',
      downloadUrl: '/webapi/share/generation/Ab3xYz9Kq1Lm/media?download=1',
      duration: undefined,
      height: 768,
      lyrics: undefined,
      mediaUrl: '/webapi/share/generation/Ab3xYz9Kq1Lm/media',
      width: 1024,
    });
    expect(JSON.stringify(data)).not.toContain('gen/full.png');
    expect(data).toMatchObject({
      prompt: 'A calm lake at dawn',
      title: 'Landscapes',
      type: 'image',
    });
  });

  it('titles a song by its own title and keeps its lyrics', () => {
    const data = toSharedGenerationData(
      share({
        asset: {
          coverUrl: 'm/cover.jpg',
          lyrics: 'la la',
          title: 'Dawn Song',
          url: 'm/a.mp3',
        } as any,
        type: 'music',
      }),
      true,
    );

    expect(data).toMatchObject({ isOwner: true, title: 'Dawn Song', type: 'music' });
    expect(data.asset.lyrics).toBe('la la');
    expect(data.asset.coverUrl).toBe('/webapi/share/generation/Ab3xYz9Kq1Lm/cover');
  });

  it('has no cover address when the generation has no cover', () => {
    const data = toSharedGenerationData(share({ asset: { url: 'v/a.mp4' }, type: 'video' }), false);
    expect(data.asset.coverUrl).toBeUndefined();
  });
});

describe('resolveSharedGenerationAssetKey', () => {
  it('uses the thumbnail as the cover of an image and the cover art otherwise', () => {
    expect(resolveSharedGenerationAssetKey(share(), 'cover')).toBe('gen/thumb.webp');
    expect(
      resolveSharedGenerationAssetKey(
        share({ asset: { coverUrl: 'v/poster.jpg', url: 'v/a.mp4' }, type: 'video' }),
        'cover',
      ),
    ).toBe('v/poster.jpg');
    expect(resolveSharedGenerationAssetKey(share(), 'media')).toBe('gen/full.png');
  });
});

describe('sharedGenerationFileName', () => {
  it('names the download after the prompt, keeping the extension', () => {
    expect(sharedGenerationFileName(share(), 'gen/full.png')).toBe('A-calm-lake-at-dawn.png');
  });

  it('strips characters a file system rejects', () => {
    expect(sharedGenerationFileName(share({ prompt: 'a/b: "c"?' }), 'x.mp4')).toBe('a-b-c.mp4');
  });

  it('falls back to a stable name without a prompt', () => {
    expect(sharedGenerationFileName(share({ prompt: '' }), 'k')).toBe('lobehub-image-Ab3xYz9Kq1Lm');
  });
});

describe('resolveSharedGenerationAsset', () => {
  beforeEach(() => {
    mocks.findByShareIdWithAccessCheck.mockReset();
    mocks.createCachedPreSignedUrlForPreview.mockReset().mockResolvedValue('https://s3/preview');
    mocks.createDownloadUrl.mockReset().mockResolvedValue('https://s3/download');
    mocks.fileServiceUserIds = [];
  });

  const run = (overrides: Partial<Parameters<typeof resolveSharedGenerationAsset>[0]> = {}) =>
    resolveSharedGenerationAsset({
      db: {} as any,
      download: false,
      kind: 'media',
      shareId: 'Ab3xYz9Kq1Lm',
      ...overrides,
    });

  it('signs the media as the share owner after the share check passes', async () => {
    mocks.findByShareIdWithAccessCheck.mockResolvedValue(share());

    await expect(run({ userId: 'visitor' })).resolves.toEqual({
      status: 'ok',
      url: 'https://s3/preview',
    });
    expect(mocks.findByShareIdWithAccessCheck).toHaveBeenCalledWith({}, 'Ab3xYz9Kq1Lm', 'visitor');
    expect(mocks.createCachedPreSignedUrlForPreview).toHaveBeenCalledWith('gen/full.png');
    expect(mocks.fileServiceUserIds).toEqual(['owner']);
  });

  it('signs a named download', async () => {
    mocks.findByShareIdWithAccessCheck.mockResolvedValue(share());

    await expect(run({ download: true })).resolves.toEqual({
      status: 'ok',
      url: 'https://s3/download',
    });
    expect(mocks.createDownloadUrl).toHaveBeenCalledWith('gen/full.png', 'A-calm-lake-at-dawn.png');
  });

  it('stops serving a link turned private', async () => {
    mocks.findByShareIdWithAccessCheck.mockRejectedValue(
      new TRPCError({ code: 'FORBIDDEN', message: 'private' }),
    );

    await expect(run()).resolves.toEqual({ status: 'forbidden' });
    expect(mocks.createCachedPreSignedUrlForPreview).not.toHaveBeenCalled();
  });

  it('is not found for an unknown link or a missing cover', async () => {
    mocks.findByShareIdWithAccessCheck.mockRejectedValueOnce(
      new TRPCError({ code: 'NOT_FOUND', message: 'missing' }),
    );
    await expect(run()).resolves.toEqual({ status: 'not_found' });

    mocks.findByShareIdWithAccessCheck.mockResolvedValueOnce(
      share({ asset: { url: 'v/a.mp4' }, type: 'video' }),
    );
    await expect(run({ kind: 'cover' })).resolves.toEqual({ status: 'not_found' });
  });
});
