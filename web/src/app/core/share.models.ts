export type Platform = 'linkedin' | 'instagram' | 'x' | 'facebook' | 'tiktok';

/**
 * The ways a partner can share on a platform:
 * - api:     Tisoro posts for them through the platform's API (LinkedIn, X, TikTok)
 * - self:    they repost on X themselves; we find it by username
 * - story:   Instagram Story mentioning @tisoroglobal; Instagram tells us
 * - page:    Tisoro posts to their Facebook company Page
 * - profile: they share on their personal Facebook profile and confirm it
 * - app:     they repost in the TikTok app and confirm it
 */
export type SharePath = 'api' | 'self' | 'story' | 'page' | 'profile' | 'app';

/**
 * NotStarted → nothing yet. Waiting → the platform hasn't confirmed yet (Instagram mention, TikTok processing).
 * Verified → the platform proved it. SelfConfirmed → the partner tapped "Yes, I shared".
 */
export type ShareStatus = 'NotStarted' | 'Waiting' | 'Verified' | 'SelfConfirmed';

export type PlatformAvailability = 'enabled' | 'comingSoon' | 'hidden';

/** GET /api/ceremonies/{ceremonyId}/share-config */
export interface ShareConfig {
  ceremonyId: string;
  title: string;
  companyName: string;
  platforms: PlatformConfig[];
}

export interface PlatformConfig {
  platform: Platform;
  availability: PlatformAvailability;
  paths: SharePath[];
  /** e.g. "Full video · 16:9 · 3:12" */
  format: string;
  /** Tisoro's official post for this ceremony. */
  postId: string;
  postUrl: string;
  caption: string;
}

/** One platform's share state — GET .../shares, every action response, and SignalR pushes. */
export interface Submission {
  platform: Platform;
  status: ShareStatus;
  path: SharePath | null;
  /** A usable OAuth token is stored for this platform. */
  connected: boolean;
  /** Account name from the platform sign-in. */
  handle: string | null;
  /** Username the partner typed (X self path, Instagram). */
  username: string | null;
  postUrl: string | null;
  method: string | null;
  evidence: string | null;
  failureReason: string | null;
  updatedAt: string | null;
}

/** SignalR `shareStatusChanged` on /hubs/share. */
export interface ShareStatusChanged {
  ceremonyId: string;
  submission: Submission;
}

export interface FacebookPage {
  id: string;
  name: string;
  followers: number;
  canPost: boolean;
}

export interface TikTokCreatorInfo {
  nickname: string;
  privacyOptions: string[];
}

/** GET /api/admin/ceremonies/{ceremonyId}/shares */
export interface AdminCeremony {
  ceremonyId: string;
  companyName: string;
  official: { platform: Platform; postUrl: string; format: string }[];
  partners: {
    partner: string;
    shares: {
      platform: Platform;
      status: ShareStatus;
      path: SharePath | null;
      method: string | null;
      evidence: string | null;
      postUrl: string | null;
      updatedAt: string | null;
      handle: string | null;
    }[];
  }[];
}

/** Message the OAuth callback popup posts back to the page that opened it. */
export interface OAuthResult {
  type: 'tisoro-oauth';
  platform: Platform;
  success: boolean;
  handle?: string;
  error?: string;
  errorDescription?: string;
}
