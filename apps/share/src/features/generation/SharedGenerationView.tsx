'use client';

import type { SharedGenerationData } from '@lobechat/types';
import { Button, Flexbox, Text } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import dayjs from 'dayjs';
import { DownloadIcon, ImageIcon, MusicIcon, VideoIcon } from 'lucide-react';
import { memo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import useSWR from 'swr';

import { ShareHero } from '@/business/client/features/ShareShell';
import SocialShare from '@/features/SocialShare';
import { lambdaClient } from '@/libs/trpc/client';

import ShareLayout from '../../shell/ShareLayout';
import { sharedGenerationKey } from './sharedGenerationKey';

const PAGE_WIDTH = 960;

const TYPE_ICONS = { image: ImageIcon, music: MusicIcon, video: VideoIcon } as const;

const styles = stylex.create({
  column: {
    marginInline: 'auto',
    maxWidth: PAGE_WIDTH,
    paddingBlockEnd: 64,
    paddingInline: 24,
    width: '100%',
  },
  cover: {
    aspectRatio: '1',
    borderRadius: cssVar.borderRadiusLG,
    flex: 'none',
    objectFit: 'cover',
    width: 160,
  },
  media: {
    display: 'block',
    height: 'auto',
    marginInline: 'auto',
    maxHeight: '70vh',
    maxWidth: '100%',
  },
  prompt: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  scroll: {
    flex: '1',
    overflowY: 'auto',
  },
  section: {
    backgroundColor: cssVar.colorFillQuaternary,
    backgroundImage: 'none',
    borderRadius: cssVar.borderRadiusLG,
    padding: 16,
  },
  stage: {
    backgroundColor: cssVar.colorFillQuaternary,
    backgroundImage: 'none',
    borderRadius: cssVar.borderRadiusLG,
    overflow: 'hidden',
  },
});

const MediaStage = ({ data }: { data: SharedGenerationData }) => {
  const { asset, prompt, title, type } = data;

  if (type === 'image')
    return (
      <div {...stylex.props(styles.stage)}>
        <img
          alt={prompt}
          height={asset.height}
          src={asset.mediaUrl}
          width={asset.width}
          {...stylex.props(styles.media)}
        />
      </div>
    );

  if (type === 'video')
    return (
      <div {...stylex.props(styles.stage)}>
        <video
          controls
          playsInline
          aria-label={title || prompt}
          poster={asset.coverUrl}
          preload={'metadata'}
          src={asset.mediaUrl}
          {...stylex.props(styles.media)}
        />
      </div>
    );

  return (
    <Flexbox horizontal align={'center'} gap={16} wrap={'wrap'} {...stylex.props(styles.section)}>
      {asset.coverUrl && (
        <img alt={title || prompt} src={asset.coverUrl} {...stylex.props(styles.cover)} />
      )}
      {/* The page heading already names the song. */}
      <Flexbox flex={1} gap={12} style={{ minWidth: 240 }}>
        <audio
          controls
          aria-label={title || prompt}
          preload={'metadata'}
          src={asset.mediaUrl}
          style={{ width: '100%' }}
        />
      </Flexbox>
    </Flexbox>
  );
};

const GenerationHero = ({ data }: { data: SharedGenerationData }) => {
  const { t } = useTranslation('chat');
  const TypeIcon = TYPE_ICONS[data.type];

  return (
    <Flexbox horizontal align={'flex-end'} gap={16} justify={'space-between'} wrap={'wrap'}>
      <ShareHero
        avatar={<TypeIcon size={32} />}
        title={data.title || t(`sharePage.generation.type.${data.type}`)}
        byline={[
          t(`sharePage.generation.type.${data.type}`),
          data.model,
          dayjs(data.createdAt).format('YYYY-MM-DD'),
        ]
          .filter(Boolean)
          .join(' · ')}
      />
      <Flexbox paddingBlock={'0 16px'}>
        <Button
          href={data.asset.downloadUrl}
          icon={DownloadIcon}
          type={'primary'}
          // The address answers with `Content-Disposition: attachment`, so
          // following it downloads without leaving the page.
        >
          {t('sharePage.file.download')}
        </Button>
      </Flexbox>
    </Flexbox>
  );
};

// The page address never changes under the view; the server render has none.
const subscribeNever = () => () => {};
const readPageUrl = () => window.location.origin + window.location.pathname;
const readNoPageUrl = () => undefined;

const SharedGenerationView = memo(() => {
  const { t } = useTranslation('chat');
  const { id: shareId } = useParams<{ id: string }>();
  // The page's own address is what gets re-shared; known only in the browser.
  const pageUrl = useSyncExternalStore(subscribeNever, readPageUrl, readNoPageUrl);

  const { data, error, isLoading } = useSWR(
    shareId ? sharedGenerationKey(shareId) : null,
    () => lambdaClient.generationShare.getSharedGeneration.query({ shareId: shareId! }),
    // Every read counts a view; the asset addresses re-check the share per
    // request (`SharedGenerationData`), so the copy on screen never goes stale.
    { revalidateIfStale: false, revalidateOnFocus: false, revalidateOnReconnect: false },
  );

  const loading = isLoading && !data;
  const typeLabel = data ? t(`sharePage.generation.type.${data.type}`) : undefined;

  return (
    <ShareLayout
      contentWidth={PAGE_WIDTH}
      error={error || (!loading && !data)}
      loading={loading}
      title={data?.title || typeLabel}
      notFound={{
        desc: t('sharePage.error.generationNotFound.subtitle'),
        title: t('sharePage.error.generationNotFound.title'),
      }}
    >
      {data && (
        <div {...stylex.props(styles.scroll)}>
          <Flexbox gap={20} {...stylex.props(styles.column)}>
            <GenerationHero data={data} />
            <MediaStage data={data} />
            <Flexbox gap={8} {...stylex.props(styles.section)}>
              <Text fontSize={12} type={'secondary'}>
                {t('sharePage.generation.prompt')}
              </Text>
              <Text {...stylex.props(styles.prompt)}>{data.prompt}</Text>
              {data.asset.lyrics && (
                <>
                  <Text fontSize={12} style={{ marginBlockStart: 8 }} type={'secondary'}>
                    {t('sharePage.generation.lyrics')}
                  </Text>
                  <Text {...stylex.props(styles.prompt)}>{data.asset.lyrics}</Text>
                </>
              )}
            </Flexbox>
            <SocialShare
              description={t(`shareModal.social.generation.description.${data.type}`)}
              shareUrl={pageUrl}
              title={data.title || data.prompt}
              {...stylex.props(styles.section)}
            />
          </Flexbox>
        </div>
      )}
    </ShareLayout>
  );
});

SharedGenerationView.displayName = 'SharedGenerationView';

export default SharedGenerationView;
