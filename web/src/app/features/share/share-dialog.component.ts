import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, OnInit, afterRenderEffect, computed, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OAuthError } from '../../core/oauth.service';
import { PathMeta, TIKTOK_PRIVACY_LABELS, TISORO_INSTAGRAM, facebookSharerUrl, isPhone, platformMeta, verificationLabel } from '../../core/platforms';
import { FacebookPage, Platform, SharePath, Submission } from '../../core/share.models';
import { copyToClipboard } from '../../shared/clipboard';
import { PlatformIconComponent } from '../../shared/platform-icon.component';
import { qrDataUrl } from '../../shared/qr';
import { ToastService } from '../../shared/toast.service';
import { VideoThumbComponent } from '../../shared/video-thumb.component';
import { FlowStep, buildSteps } from './flow-steps';
import { ShareStore, describeError } from './share.store';

export type DialogRequest =
  | { mode: 'preview'; platform: Platform }
  | { mode: 'chooser'; platform: Platform }
  | { mode: 'flow'; platform: Platform; path: SharePath }
  | { mode: 'guide'; platform: Platform; path?: SharePath };

const X_USERNAME = /^[A-Za-z0-9_]{1,15}$/;
const IG_USERNAME = /^[A-Za-z0-9._]{1,30}$/;
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

/** Modal for one platform: preview, "how do you want to share?", the step-by-step flow, or the steps overview. */
@Component({
  selector: 'app-share-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, PlatformIconComponent, VideoThumbComponent],
  templateUrl: './share-dialog.component.html',
  styleUrl: './share-dialog.component.scss',
  host: { '(document:keydown.escape)': 'close()' },
})
export class ShareDialogComponent implements OnInit {
  protected readonly store = inject(ShareStore);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly request = input.required<DialogRequest>();
  readonly closed = output<void>();

  protected readonly tisoroIg = TISORO_INSTAGRAM;
  protected readonly privacyLabels = TIKTOK_PRIVACY_LABELS;
  protected readonly phone = isPhone();

  protected readonly mode = signal<DialogRequest['mode']>('preview');
  protected readonly platform = signal<Platform>('linkedin');
  protected readonly path = signal<SharePath>('api');

  // flow state
  protected readonly steps = signal<FlowStep[]>([]);
  protected readonly i = signal(0);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly miss = signal(false);
  protected readonly caption = signal('');
  protected readonly xUser = signal('');
  protected readonly igUser = signal('');
  protected readonly pages = signal<FacebookPage[] | null>(null);
  protected readonly pageId = signal<string | null>(null);
  protected readonly privacyOptions = signal<string[] | null>(null);
  protected readonly privacy = signal('');
  protected readonly postLink = signal('');
  protected readonly result = signal<Submission | null>(null);
  protected readonly qr = signal<string | null>(null);

  protected readonly meta = computed(() => platformMeta(this.platform()));
  protected readonly config = computed(() => this.store.platformConfig(this.platform()));
  protected readonly company = computed(() => this.store.config()?.companyName ?? '');
  protected readonly pathMeta = computed(() => this.meta().paths[this.path()] as PathMeta);
  protected readonly pathKeys = computed(() => this.config().paths.filter((p) => this.meta().paths[p]));
  protected readonly step = computed(() => this.steps()[this.i()]);
  protected readonly captionLength = computed(() => [...this.caption()].length);
  protected readonly captionOver = computed(() => this.captionLength() > this.meta().captionLimit);
  protected readonly pageName = computed(() => this.pages()?.find((p) => p.id === this.pageId())?.name ?? 'your Page');
  protected readonly canGoBack = computed(() => {
    const s = this.step();
    return this.i() > 0 && !s.final && !s.auto && !this.busy();
  });
  protected readonly guideSteps = computed(() => buildSteps(this.platform(), this.path(), { connected: false, knownIgUser: false, phone: false }));

  /** Final screen wording, from what the API returned. */
  protected readonly doneView = computed(() => this.doneFor(this.result()));

  /** The same final screen with sample proof, for the steps overview. */
  protected readonly sampleDoneView = computed(() => {
    const tap = this.pathMeta().ver === 'tap';
    const samples: Record<string, string> = {
      'linkedin/api': 'LinkedIn returned post ID urn:li:share:7383910246518',
      'x/api': 'X returned post ID 1978102274651',
      'x/self': '@yourcompany found in the reposts of Tisoro’s post',
      'facebook/page': 'Facebook returned post ID 1029384756 on Harrington Wells Private Bank',
      'tiktok/api': 'TikTok confirmed publish, video ID 7560219',
    };
    return this.doneFor({ status: tap ? 'SelfConfirmed' : 'Verified', evidence: samples[`${this.platform()}/${this.path()}`] ?? null } as Submission, 'Harrington Wells Private Bank');
  });

  private doneFor(r: Submission | null, pageName = this.pageName()) {
    const name = this.meta().name;
    const key = `${this.platform()}/${this.path()}`;
    if (r?.status === 'SelfConfirmed') {
      const tiktok = this.platform() === 'tiktok';
      return {
        self: true,
        waiting: false,
        title: tiktok ? 'Thanks for reposting' : 'Thanks for sharing',
        detail: `You confirmed your ${name} ${tiktok ? 'repost' : 'share'}. Your ceremony will be featured on Tisoro Global’s channels.`,
        evidence: tiktok ? 'Confirmed by you. TikTok doesn’t report reposts.' : 'Confirmed by you. Facebook doesn’t report personal shares.',
      };
    }
    if (r?.status === 'Waiting') {
      return {
        self: false,
        waiting: true,
        title: 'Uploading to TikTok',
        detail: 'TikTok is processing the video. We’ll confirm it here as soon as it’s live, usually within a minute. You can close this window; the row updates by itself.',
        evidence: null,
      };
    }
    const titles: Record<string, string> = {
      'linkedin/api': 'Reposted on LinkedIn',
      'x/api': 'Posted on X',
      'x/self': 'Repost found',
      'facebook/page': `Posted to ${pageName}`,
      'tiktok/api': 'Posted on TikTok',
    };
    return {
      self: false,
      waiting: false,
      title: titles[key] ?? 'Shared',
      detail:
        key === 'x/self'
          ? 'We found your repost on X. Your ceremony will be featured on Tisoro Global’s channels.'
          : `${name} confirmed your post. Your ceremony will be featured on Tisoro Global’s channels.`,
      evidence: r?.evidence ?? null,
    };
  }

  constructor() {
    // Keep keyboard focus inside the dialog: first field, else the primary button.
    afterRenderEffect(() => {
      this.mode();
      this.i();
      this.miss();
      const el = this.host.nativeElement.querySelector<HTMLElement>('.mb input:not([disabled]), .mb select, .mf .b.red, .mf .b.dk');
      el?.focus({ preventScroll: true });
    });
  }

  ngOnInit(): void {
    const r = this.request();
    this.platform.set(r.platform);
    if (r.mode === 'flow') this.startFlow(r.path);
    else if (r.mode === 'guide') this.openGuide(r.path ?? this.pathKeys()[0]);
    else this.mode.set(r.mode);
  }

  // ── navigation between modes ───────────────────────────────────────────────

  /** Row/preview "Share" button: chooser when there are two ways, else straight into the flow. */
  protected share(): void {
    const keys = this.pathKeys();
    if (keys.length > 1) this.mode.set('chooser');
    else this.startFlow(keys[0]);
  }

  protected openGuide(path: SharePath): void {
    this.path.set(path);
    this.mode.set('guide');
    void this.ensureQr();
  }

  protected startFlow(path: SharePath): void {
    const sub = this.store.submission(this.platform());
    this.path.set(path);
    this.steps.set(buildSteps(this.platform(), path, { connected: sub.connected, knownIgUser: !!sub.username && this.platform() === 'instagram', phone: this.phone }));
    this.caption.set(this.config().caption);
    this.xUser.set(sub.username ?? (this.platform() === 'x' && sub.connected ? (sub.handle ?? '') : ''));
    this.igUser.set(this.platform() === 'instagram' ? (sub.username ?? '') : '');
    this.result.set(null);
    this.mode.set('flow');
    this.go(0);
  }

  protected close(): void {
    this.closed.emit();
  }

  /** Closes on a click outside the dialog. Must not return false: Angular would preventDefault every click inside. */
  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  protected notYet(): void {
    this.toast.show('No problem. You can share later from your Partner Area');
    this.close();
  }

  protected back(): void {
    let to = this.i() - 1;
    while (to > 0 && this.steps()[to].auto) to--;
    this.error.set(null);
    this.miss.set(false);
    this.go(to);
  }

  /** Moves to a step and runs what that step does on arrival. Synchronous so clipboard/popup calls keep the user gesture. */
  private go(index: number): void {
    this.i.set(index);
    this.miss.set(false);
    const s = this.steps()[index];
    switch (s.kind) {
      case 'fbChoosePage':
        if (!this.pages()) void this.loadPages();
        break;
      case 'fbShareWindow':
        void this.copyCaption();
        break;
      case 'ttReview':
        if (!this.privacyOptions()) void this.loadPrivacyOptions();
        break;
      case 'openOnPhone':
        void this.ensureQr();
        break;
      case 'posting':
        void this.runPosting();
        break;
      case 'xChecking':
        void this.runCheck();
        break;
    }
  }

  // ── primary button ─────────────────────────────────────────────────────────

  protected next(): void {
    const s = this.step();
    this.error.set(null);
    switch (s.kind) {
      case 'connect':
        void this.connect();
        return;
      case 'review':
      case 'ttReview':
        if (!this.caption().trim()) return this.error.set('Add a caption, or keep ours.');
        if (this.captionOver()) return this.error.set(`Shorten the caption to ${this.meta().captionLimit} characters.`);
        if (s.kind === 'ttReview' && !this.privacy()) return this.error.set('Choose who can view the video.');
        return this.go(this.i() + 1);
      case 'xUsername': {
        const v = this.xUser().trim().replace(/^@+/, '');
        if (!X_USERNAME.test(v)) return this.error.set('Enter your X username, for example @harringtonwells');
        this.xUser.set(v);
        return this.go(this.i() + 1);
      }
      case 'igUsername': {
        const v = this.igUser().trim().replace(/^@+/, '');
        if (!IG_USERNAME.test(v)) return this.error.set('Enter your Instagram username, for example @harringtonwells.bank');
        this.igUser.set(v);
        return this.go(this.i() + 1);
      }
      case 'fbChoosePage':
        if (!this.pages()?.some((p) => p.id === this.pageId() && p.canPost)) return this.error.set('Choose a Page you can post to.');
        return this.go(this.i() + 1);
      case 'igMention':
        void this.call(() => this.store.api.expectInstagramMention(this.store.ceremonyId, this.igUser()));
        return;
      case 'confirmSelf':
        void this.call(() => this.store.api.selfConfirm(this.store.ceremonyId, this.platform() as 'facebook' | 'tiktok', this.postLink().trim() || null));
        return;
      case 'xRepost':
      case 'openOnPhone':
      case 'igAddToStory':
      case 'fbShareWindow':
      case 'ttRepost':
        return this.go(this.i() + 1);
      case 'done':
      case 'igConfirming':
        return this.close();
    }
  }

  private async connect(): Promise<void> {
    this.busy.set(true);
    try {
      await this.store.connect(this.platform()); // opens the popup synchronously, inside this click
      this.toast.show(`${this.meta().name} connected`);
      this.go(this.i() + 1);
    } catch (err) {
      if (!(err instanceof OAuthError && err.code === 'cancelled')) this.error.set(describeError(err, 'Sign-in didn’t finish. Please try again.'));
    } finally {
      this.busy.set(false);
    }
  }

  /** The automatic "Posting/Uploading" step: Tisoro posts through the platform's API. */
  private async runPosting(): Promise<void> {
    const id = this.store.ceremonyId;
    const api = this.store.api;
    const reviewIndex = this.i() - 1;
    try {
      const sub = await firstValueFrom(
        this.platform() === 'facebook'
          ? api.publishToFacebookPage(id, this.pageId()!, this.caption().trim())
          : this.platform() === 'tiktok'
            ? api.publishToTikTok(id, this.caption().trim(), this.privacy())
            : api.publish(id, this.platform() as 'linkedin' | 'x', this.caption().trim()),
      );
      this.finish(sub);
    } catch (err) {
      this.fail(err, reviewIndex);
    }
  }

  /** The automatic "Checking" step of "Repost on X yourself". */
  private async runCheck(): Promise<void> {
    try {
      const { found, submission } = await firstValueFrom(this.store.api.checkXRepost(this.store.ceremonyId, this.xUser()));
      this.store.apply(submission);
      if (found) this.finish(submission);
      else this.miss.set(true);
    } catch (err) {
      this.fail(err, this.i() - 1);
    }
  }

  protected checkAgain(): void {
    this.miss.set(false);
    void this.runCheck();
  }

  /** Non-automatic API steps (Instagram mention, self-confirm). */
  private async call(request: () => import('rxjs').Observable<Submission>): Promise<void> {
    this.busy.set(true);
    try {
      this.finish(await firstValueFrom(request()));
    } catch (err) {
      this.fail(err, this.i());
    } finally {
      this.busy.set(false);
    }
  }

  private finish(sub: Submission): void {
    this.store.apply(sub);
    this.result.set(sub);
    this.go(this.i() + 1);
  }

  private fail(err: unknown, returnTo: number): void {
    if (this.store.handleUnauthorized(this.platform(), err)) {
      // Sign-in expired: restart the flow, which now begins with Connect.
      const message = describeError(err, 'Please connect again.');
      this.startFlow(this.path());
      this.error.set(message);
      return;
    }
    this.go(Math.max(0, returnTo));
    this.error.set(describeError(err, 'Something went wrong. Please try again.'));
  }

  // ── step helpers ───────────────────────────────────────────────────────────

  private async loadPages(): Promise<void> {
    this.busy.set(true);
    try {
      const pages = await firstValueFrom(this.store.api.getFacebookPages());
      this.pages.set(pages);
      this.pageId.set(pages.find((p) => p.canPost)?.id ?? null);
    } catch (err) {
      this.fail(err, this.i());
    } finally {
      this.busy.set(false);
    }
  }

  private async loadPrivacyOptions(): Promise<void> {
    this.busy.set(true);
    try {
      const info = await firstValueFrom(this.store.api.getTikTokCreatorInfo());
      this.privacyOptions.set(info.privacyOptions);
      // TikTok's guidelines: no default; the creator picks. Pre-select only when there's a single option.
      if (info.privacyOptions.length === 1) this.privacy.set(info.privacyOptions[0]);
    } catch (err) {
      this.fail(err, this.i());
    } finally {
      this.busy.set(false);
    }
  }

  private async ensureQr(): Promise<void> {
    if (!this.qr()) this.qr.set(await qrDataUrl(this.config().postUrl));
  }

  protected async copyCaption(): Promise<void> {
    const ok = await copyToClipboard(this.caption() || this.config().caption);
    this.toast.show(ok ? '✓ Caption copied' : 'Couldn’t copy. Select the caption and copy it yourself', ok ? 'success' : 'error');
  }

  protected async copyLink(): Promise<void> {
    const ok = await copyToClipboard(this.config().postUrl);
    this.toast.show(ok ? '✓ Link copied' : 'Couldn’t copy the link', ok ? 'success' : 'error');
  }

  protected openFacebookSharer(): void {
    window.open(facebookSharerUrl(this.config().postUrl), '_blank', 'noopener');
  }

  protected verificationLabel = verificationLabel;
  protected followers(n: number): string {
    return `Company Page, ${compact.format(n)} followers`;
  }
  protected initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  }
  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
