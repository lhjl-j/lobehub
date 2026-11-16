'use client';

import { createModal } from '@lobehub/ui';
import { t } from 'i18next';

import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import GenerationShareContent, { type GenerationShareContentProps } from './GenerationShareContent';

/** Opens the share panel of one generation result (image, video or song). */
export const openGenerationShareModal = (props: GenerationShareContentProps) =>
  createModal({
    content: <GenerationShareContent {...props} />,
    footer: null,
    maskClosable: true,
    title: t('shareModal.generation.title', { ns: 'chat' }),
    width: 'min(92vw, 400px)',
  });

/**
 * Only the creator manages a generation's public link (the server enforces the
 * same). A batch without a creator is a personal-space one, always the user's.
 */
export const useCanShareGeneration = (creatorId?: string | null) => {
  const currentUserId = useUserStore(userProfileSelectors.userId);

  return !creatorId || creatorId === currentUserId;
};
