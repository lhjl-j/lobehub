/**
 * SWR key of a shared generation on its public page, shared by the SSR loader
 * (fallback) and the view. Kept in the share app on purpose: the app registry
 * (`@/libs/swr/keys`) is frozen for the main app's replica migration, and this
 * public page has no replica store.
 */
export const sharedGenerationKey = (shareId: string) => ['share:generation', shareId] as const;
