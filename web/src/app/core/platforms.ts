import { Platform, SharePath } from './share.models';

/** auto = the platform confirms the share; tap = the partner confirms it. */
export type Verification = 'auto' | 'tap';

export interface PathMeta {
  label: string;
  /** Shown in the "How do you want to share?" chooser. */
  desc: string;
  ver: Verification;
  /** Label on the green/amber pill once shared. */
  done: string;
}

export interface PlatformMeta {
  platform: Platform;
  name: string;
  /** Main button label on the row. */
  act: string;
  /** Row subtitle before sharing. */
  how: string;
  /** Thumbnail shape of the ceremony video on this platform. */
  shape: 'wide' | 'tall';
  /** Caption limit when Tisoro posts it (X counts the quoted post separately). */
  captionLimit: number;
  paths: Partial<Record<SharePath, PathMeta>>;
}

export const TISORO_INSTAGRAM = 'tisoroglobal';

export const PLATFORMS: readonly PlatformMeta[] = [
  {
    platform: 'linkedin',
    name: 'LinkedIn',
    act: 'Repost on LinkedIn',
    how: 'Reposts Tisoro’s post to your profile with our caption',
    shape: 'wide',
    captionLimit: 3000,
    paths: {
      api: { label: 'Repost through Tisoro', desc: 'Connect LinkedIn once and we repost it with our caption.', ver: 'auto', done: 'Reposted' },
    },
  },
  {
    platform: 'instagram',
    name: 'Instagram',
    act: 'Share to your Story',
    how: `Share the Reel to your Story and mention @${TISORO_INSTAGRAM}`,
    shape: 'tall',
    captionLimit: 2200,
    paths: {
      story: { label: `Story with @${TISORO_INSTAGRAM} mention`, desc: 'Add the Reel to your Story and mention us.', ver: 'auto', done: 'Story shared' },
    },
  },
  {
    platform: 'x',
    name: 'X',
    act: 'Repost on X',
    how: 'Repost through Tisoro, or on X yourself',
    shape: 'wide',
    captionLimit: 280,
    paths: {
      api: { label: 'Repost through Tisoro', desc: 'Connect X once and we post the quote with our caption for you.', ver: 'auto', done: 'Reposted' },
      self: { label: 'Repost on X yourself', desc: 'Repost or quote it in X as usual. We find your repost by your username.', ver: 'auto', done: 'Repost found' },
    },
  },
  {
    platform: 'facebook',
    name: 'Facebook',
    act: 'Share on Facebook',
    how: 'Share to your company Page or your personal profile',
    shape: 'wide',
    captionLimit: 5000,
    paths: {
      page: { label: 'Post to your company Page', desc: 'Connect Facebook and pick your Page. We post it for you and it’s confirmed automatically.', ver: 'auto', done: 'Posted to Page' },
      profile: { label: 'Share on your personal profile', desc: 'Facebook doesn’t tell us about shares from personal profiles, so you confirm it with one tap.', ver: 'tap', done: 'Shared' },
    },
  },
  {
    platform: 'tiktok',
    name: 'TikTok',
    act: 'Share on TikTok',
    how: 'Post the video to your TikTok, or repost it in the app',
    shape: 'tall',
    captionLimit: 2200,
    paths: {
      api: { label: 'Post to your TikTok', desc: 'We upload the video to your account. It shows as a new video on your profile, not a repost. Confirmed automatically.', ver: 'auto', done: 'Posted' },
      app: { label: 'Repost in the TikTok app', desc: 'TikTok doesn’t share repost data, so you confirm it with one tap.', ver: 'tap', done: 'Reposted' },
    },
  },
];

export function platformMeta(platform: Platform): PlatformMeta {
  return PLATFORMS.find((p) => p.platform === platform)!;
}

export function verificationLabel(ver: Verification): string {
  return ver === 'auto' ? 'Confirmed automatically' : 'You confirm it';
}

export function facebookSharerUrl(postUrl: string): string {
  return `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: postUrl })}`;
}

/** TikTok's privacy level codes → the wording TikTok's UX guidelines ask for. */
export const TIKTOK_PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: 'Everyone',
  MUTUAL_FOLLOW_FRIENDS: 'Friends',
  FOLLOWER_OF_CREATOR: 'Followers',
  SELF_ONLY: 'Only me',
};

/** Phones open platform links straight in the app; computers get a QR code instead. */
export function isPhone(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}
