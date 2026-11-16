import type { ShareVisibility } from './topic';

/** What kind of generation a share link points at. */
export type SharedGenerationType = 'image' | 'music' | 'video';

/** The owner's view of a generation's share link. */
export interface GenerationShareSettings {
  generationId: string;
  pageViewCount: number;
  /** The share link id: `/share/g/<shareId>`. */
  shareId: string;
  visibility: ShareVisibility;
}

/**
 * What a share link visitor reads.
 *
 * Asset addresses are scoped to the SHARE (`/webapi/share/generation/<shareId>/<kind>`)
 * and re-check it on every request, so turning the link off cuts off a page
 * already open, and they never expire under a paused video. The generation's
 * own file id is deliberately absent: the `/f/:fileId` proxy is public by id
 * and would outlive the share.
 */
export interface SharedGenerationData {
  asset: {
    /** Cover art (music) or poster frame (video). */
    coverUrl?: string;
    /** Address that downloads the media under a readable name. */
    downloadUrl: string;
    duration?: number;
    height?: number;
    lyrics?: string;
    /** Address the page renders / plays from. */
    mediaUrl: string;
    width?: number;
  };
  createdAt: string;
  isOwner: boolean;
  model: string | null;
  pageViewCount: number;
  prompt: string;
  provider: string | null;
  shareId: string;
  /** Song title for music; the topic title otherwise. */
  title: string | null;
  type: SharedGenerationType;
}
