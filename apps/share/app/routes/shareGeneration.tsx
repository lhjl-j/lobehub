import { BRANDING_NAME } from '@lobechat/business-const';
import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { SWRConfig, unstable_serialize } from 'swr';

import { resolveRequestLocale } from '@/locales/requestLocale';

import { sharedGenerationKey } from '../../src/features/generation/sharedGenerationKey';
import SharedGenerationView from '../../src/features/generation/SharedGenerationView';
import { loadShareT } from '../../src/shell/createShareI18n';
import { cloudflareContext } from '../lib/cloudflareContext';
import { buildPageMeta, shareMetaDescription, truncateDescription } from '../lib/seo';
import { createServerLambdaClient } from '../lib/serverTrpc';

export const loader = async ({ context, params, request }: LoaderFunctionArgs) => {
  const shareId = params.id!;
  const locale = resolveRequestLocale(request);
  const apiBase = context.get(cloudflareContext).env.SHARE_API_BASE as string | undefined;

  const sharedGeneration = await createServerLambdaClient(request, apiBase)
    .generationShare.getSharedGeneration.query({ shareId })
    .catch((error) => {
      console.error('[share] shared generation SSR fetch failed:', error);
      return null;
    });

  return {
    // The prompt is the most telling preview of an AI creation.
    description:
      truncateDescription(sharedGeneration?.prompt) ??
      shareMetaDescription(await loadShareT(locale), 'generationDescription'),
    locale,
    shareId,
    sharedGeneration,
  };
};

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => {
  const title = loaderData?.sharedGeneration?.title;

  return buildPageMeta({
    description: loaderData?.description ?? '',
    locale: loaderData?.locale,
    title: title ? `${title} · ${BRANDING_NAME}` : BRANDING_NAME,
    type: 'website',
  });
};

export default function ShareGenerationRoute() {
  const { shareId, sharedGeneration } = useLoaderData<typeof loader>();

  return (
    <SWRConfig
      value={{
        fallback: sharedGeneration
          ? { [unstable_serialize(sharedGenerationKey(shareId))]: sharedGeneration }
          : {},
      }}
    >
      <SharedGenerationView />
    </SWRConfig>
  );
}
