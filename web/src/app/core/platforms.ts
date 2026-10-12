import { Platform } from './share.models';

/**
 * How a platform is shared and verified (see spec §2):
 * - intentHandle:   open X's quote-post intent, then verify by the handle the user types.
 * - sharerOAuthVerify: open Facebook's sharer (caption must be pasted), then log in so we can read /me/posts.
 * - oauthPublish:   log in, confirm the caption, and the backend posts on the user's behalf.
 */
export type ShareFlow = 'intentHandle' | 'sharerOAuthVerify' | 'oauthPublish';

export interface PlatformMeta {
  platform: Platform;
  name: string;
  flow: ShareFlow;
  /** Max caption length, if the platform enforces one we need to respect client-side. */
  captionLimit?: number;
}

/** Display order matches the design: two columns, LinkedIn/Instagram, X/TikTok, Facebook. */
export const PLATFORMS: readonly PlatformMeta[] = [
  { platform: 'linkedin', name: 'LinkedIn', flow: 'oauthPublish', captionLimit: 3000 },
  { platform: 'instagram', name: 'Instagram', flow: 'oauthPublish', captionLimit: 2200 },
  // 280 minus the 23-char t.co link X appends for the quoted post, plus a separating space.
  { platform: 'x', name: 'X', flow: 'intentHandle', captionLimit: 256 },
  { platform: 'tiktok', name: 'TikTok', flow: 'oauthPublish', captionLimit: 2200 },
  { platform: 'facebook', name: 'Facebook', flow: 'sharerOAuthVerify' },
];

export function platformMeta(platform: Platform): PlatformMeta {
  return PLATFORMS.find((p) => p.platform === platform)!;
}

export function xIntentUrl(caption: string, tisoroPostUrl: string): string {
  const params = new URLSearchParams({ text: caption, url: tisoroPostUrl });
  return `https://x.com/intent/post?${params}`;
}

export function facebookSharerUrl(tisoroPostUrl: string): string {
  return `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: tisoroPostUrl })}`;
}

/** Counts user-perceived characters so emoji count once, like the platforms do. */
export function captionLength(caption: string): number {
  return [...caption].length;
}
