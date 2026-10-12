export type Platform = 'linkedin' | 'instagram' | 'x' | 'tiktok' | 'facebook';

export type ShareStatus = 'NotStarted' | 'Pending' | 'Verified' | 'Failed' | 'ManualReview';

/** hidden = not rendered; comingSoon = rendered but disabled (e.g. TikTok before audit approval). */
export type PlatformAvailability = 'enabled' | 'comingSoon' | 'hidden';

/** GET /api/ceremonies/{ceremonyId}/share-config */
export interface ShareConfig {
  ceremonyId: string;
  ceremonyTitle: string;
  platforms: PlatformShareConfig[];
}

export interface PlatformShareConfig {
  platform: Platform;
  availability: PlatformAvailability;
  /** Tisoro's original post for this ceremony on this platform. */
  postUrl: string;
  postId: string;
  defaultCaption: string;
}

/** GET /api/ceremonies/{ceremonyId}/shares and the body of every share/verify/publish response. */
export interface ShareSubmission {
  platform: Platform;
  status: ShareStatus;
  /** A usable OAuth token is stored for this platform (user already completed step 1). */
  connected?: boolean;
  handle?: string | null;
  sharedPostUrl?: string | null;
  failureReason?: string | null;
  shareClickedAt?: string | null;
}

/** SignalR event `shareStatusChanged` on /hubs/share. */
export interface ShareStatusChanged {
  ceremonyId: string;
  platform: Platform;
  status: ShareStatus;
  postUrl?: string | null;
  handle?: string | null;
  failureReason?: string | null;
}

/** Message the OAuth callback popup posts back to the page that opened it. */
export interface OAuthResult {
  type: 'tisoro-oauth';
  platform: Platform;
  success: boolean;
  /** Account handle resolved by the backend from the provider profile. */
  handle?: string;
  /** Machine-readable error, e.g. `personal_account`, `access_denied`, `cancelled`. */
  error?: string;
  errorDescription?: string;
}
