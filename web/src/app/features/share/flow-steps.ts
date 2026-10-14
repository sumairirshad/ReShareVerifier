import { Platform, SharePath } from '../../core/share.models';

export type StepKind =
  | 'connect'
  | 'review'
  | 'posting'
  | 'xUsername'
  | 'xRepost'
  | 'xChecking'
  | 'igUsername'
  | 'openOnPhone'
  | 'igAddToStory'
  | 'igMention'
  | 'igConfirming'
  | 'fbChoosePage'
  | 'fbShareWindow'
  | 'ttReview'
  | 'ttRepost'
  | 'confirmSelf'
  | 'done';

export interface FlowStep {
  kind: StepKind;
  label: string;
  /** Footer note in the dialog, and the caption under the step in "View sharing steps". */
  note?: string;
  /** Primary button label. Absent on automatic steps. */
  btn?: string;
  /** Secondary "Not yet" style button that closes the flow. */
  alt?: string;
  /** Runs by itself (API call with a spinner); no buttons. */
  auto?: boolean;
  final?: boolean;
  /** Tags in the steps overview. */
  first?: boolean;
  onComputer?: boolean;
}

export interface StepContext {
  connected: boolean;
  /** Instagram username already known from an earlier share. */
  knownIgUser: boolean;
  phone: boolean;
}

/** The step-by-step flow for one platform and sharing path (Tisoro screen 09 prototype). */
export function buildSteps(platform: Platform, path: SharePath, ctx: StepContext): FlowStep[] {
  const st: FlowStep[] = [];
  const connect = (note: string, btn: string) => {
    if (!ctx.connected) st.push({ kind: 'connect', label: 'Connect', first: true, note, btn });
  };
  const toPhone = () => {
    if (!ctx.phone) st.push({ kind: 'openOnPhone', label: 'Open on phone', onComputer: true, btn: 'I’ve opened it on my phone' });
  };
  const done = (btn = 'Done') => st.push({ kind: 'done', label: 'Done', final: true, btn });

  switch (`${platform}/${path}`) {
    case 'linkedin/api':
      connect('You sign in on LinkedIn’s own page. LinkedIn asks you to reconnect about every 60 days.', 'Continue with LinkedIn');
      st.push({ kind: 'review', label: 'Review', btn: 'Repost now' });
      st.push({ kind: 'posting', label: 'Posting', auto: true });
      done();
      break;
    case 'x/api':
      connect('You sign in on X’s own page.', 'Continue with X');
      st.push({ kind: 'review', label: 'Review', btn: 'Post to X' });
      st.push({ kind: 'posting', label: 'Posting', auto: true });
      done();
      break;
    case 'x/self':
      st.push({ kind: 'xUsername', label: 'Your username', btn: 'Next' });
      st.push({ kind: 'xRepost', label: 'Repost on X', note: 'Come back here after you repost.', btn: 'I’ve reposted. Check now' });
      st.push({ kind: 'xChecking', label: 'Checking', auto: true });
      done();
      break;
    case 'instagram/story':
      if (!ctx.knownIgUser) st.push({ kind: 'igUsername', label: 'Your username', first: true, note: 'We only use it to match your Story mention.', btn: 'Next' });
      toPhone();
      st.push({ kind: 'igAddToStory', label: 'Add to Story', btn: 'Next' });
      st.push({ kind: 'igMention', label: 'Mention us', note: 'Instagram tells Tisoro when an account mentions us. That’s the confirmation.', btn: 'I’ve posted my Story' });
      st.push({ kind: 'igConfirming', label: 'Confirming', final: true, btn: 'Close' });
      break;
    case 'facebook/page':
      connect('You sign in on Facebook’s own page. You need to be an admin of the Page.', 'Continue with Facebook');
      st.push({ kind: 'fbChoosePage', label: 'Choose Page', btn: 'Next' });
      st.push({ kind: 'review', label: 'Review', btn: 'Post to Page' });
      st.push({ kind: 'posting', label: 'Posting', auto: true });
      done();
      break;
    case 'facebook/profile':
      st.push({ kind: 'fbShareWindow', label: 'Share window', note: 'Facebook’s share window opens in a new tab.', btn: 'Next' });
      st.push({ kind: 'confirmSelf', label: 'Confirm', btn: 'Yes, I shared', alt: 'Not yet' });
      done();
      break;
    case 'tiktok/api':
      connect('You sign in on TikTok’s own page.', 'Continue with TikTok');
      st.push({ kind: 'ttReview', label: 'Review', note: 'TikTok has to approve Tisoro’s app before videos can be public.', btn: 'Post to TikTok' });
      st.push({ kind: 'posting', label: 'Uploading', auto: true });
      done();
      break;
    case 'tiktok/app':
      toPhone();
      st.push({ kind: 'ttRepost', label: 'Repost', btn: 'Next' });
      st.push({ kind: 'confirmSelf', label: 'Confirm', btn: 'Yes, I reposted', alt: 'Not yet' });
      done();
      break;
  }
  return st;
}
