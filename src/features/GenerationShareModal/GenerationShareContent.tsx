'use client';

import type { SharedGenerationType, ShareVisibility } from '@lobechat/types';
import { generationSharePath } from '@lobechat/utils/generationShare';
import {
  Button,
  copyToClipboard,
  Flexbox,
  Input,
  Skeleton,
  Switch,
  Text,
  toast,
  useModalContext,
} from '@lobehub/ui';
import { CopyIcon } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import SocialShare from '@/features/SocialShare';
import { useAppOrigin } from '@/hooks/useAppOrigin';
import { useImageStore } from '@/store/image';
import { generationShareSelectors } from '@/store/image/slices/generationShare';

export interface GenerationShareContentProps {
  generationId: string;
  /** Prompt of the batch; leads the post when there is no title. */
  prompt?: string;
  /** Song title, when the generation has one. */
  title?: string;
  type: SharedGenerationType;
}

/**
 * The owner's share panel for one generation: a public-link switch, the link,
 * and the four-channel social share that needs it.
 */
const GenerationShareContent = memo<GenerationShareContentProps>(
  ({ generationId, prompt, title, type }) => {
    const { t } = useTranslation('chat');
    const { close } = useModalContext();
    const appOrigin = useAppOrigin();
    const [updating, setUpdating] = useState(false);

    const { error, revalidate } = useImageStore((s) => s.useFetchGenerationShare)(generationId);
    const entry = useImageStore(generationShareSelectors.getGenerationShare(generationId));
    const setGenerationShareVisibility = useImageStore((s) => s.setGenerationShareVisibility);
    const data = entry?.share;

    const isPublic = data?.visibility === 'link';
    const shareUrl = isPublic ? `${appOrigin}${generationSharePath(data.shareId)}` : undefined;

    const setVisibility = useCallback(
      async (visibility: ShareVisibility) => {
        setUpdating(true);
        let next: Awaited<ReturnType<typeof setGenerationShareVisibility>>;
        try {
          next = await setGenerationShareVisibility(generationId, visibility);
        } catch {
          toast.error(t('shareModal.generation.updateError'));
          return;
        } finally {
          setUpdating(false);
        }

        if (visibility !== 'link' || !next) {
          toast.success(t('shareModal.generation.disabled'));
          return;
        }

        // Turning the link on is the moment people want it: copy it right away.
        // The link is already live, so a refused clipboard is not a failed update.
        try {
          await copyToClipboard(`${appOrigin}${generationSharePath(next.shareId)}`);
          toast.success(t('shareModal.generation.enabled'));
        } catch {
          toast.success(t('shareModal.generation.enabledNotCopied'));
        }
      },
      [appOrigin, generationId, setGenerationShareVisibility, t],
    );

    const copyLink = useCallback(async () => {
      if (!shareUrl) return;
      await copyToClipboard(shareUrl);
      toast.success(t('shareModal.copyLinkSuccess'));
    }, [shareUrl, t]);

    // An absent entry is the loading signal; a failed refresh keeps a known link on screen.
    if (!entry && !error) return <Skeleton.Text rows={4} />;

    if (!entry)
      return (
        <Flexbox align={'center'} gap={12} paddingBlock={16}>
          <Text type={'secondary'}>{t('shareModal.generation.loadError')}</Text>
          <Button size={'small'} onClick={() => revalidate()}>
            {t('retry', { ns: 'common' })}
          </Button>
        </Flexbox>
      );

    return (
      <Flexbox gap={16}>
        <Flexbox horizontal align={'center'} gap={12} justify={'space-between'}>
          <Flexbox gap={2}>
            <Text strong>{t('shareModal.generation.link.label')}</Text>
            <Text fontSize={12} type={'secondary'}>
              {t('shareModal.generation.link.desc')}
            </Text>
          </Flexbox>
          <Switch
            aria-label={t('shareModal.generation.link.label')}
            checked={isPublic}
            loading={updating}
            onChange={(checked) => setVisibility(checked ? 'link' : 'private')}
          />
        </Flexbox>

        {shareUrl && (
          <Flexbox horizontal gap={8}>
            <Input readOnly value={shareUrl} variant={'filled'} />
            <Button icon={CopyIcon} onClick={copyLink}>
              {t('shareModal.copyLink')}
            </Button>
          </Flexbox>
        )}

        <SocialShare
          description={t(`shareModal.social.generation.description.${type}`)}
          disabledHint={t('shareModal.generation.disabledHint')}
          shareUrl={shareUrl}
          title={title || prompt || t(`sharePage.generation.type.${type}`)}
          onLeave={close}
        />
      </Flexbox>
    );
  },
);

GenerationShareContent.displayName = 'GenerationShareContent';

export default GenerationShareContent;
