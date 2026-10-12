import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, forkJoin } from 'rxjs';
import { OAuthError, OAuthService } from '../../core/oauth.service';
import { PLATFORMS, PlatformMeta, facebookSharerUrl, xIntentUrl } from '../../core/platforms';
import { PublishPlatform, ShareApiService } from '../../core/share-api.service';
import { ShareRealtime } from '../../core/share-realtime';
import { Platform, PlatformShareConfig, ShareStatus, ShareSubmission } from '../../core/share.models';
import { copyToClipboard } from '../../shared/clipboard';
import { ToastService } from '../../shared/toast.service';

export interface PlatformState {
  meta: PlatformMeta;
  config: PlatformShareConfig;
  status: ShareStatus;
  caption: string;
  /** Signed in through OAuth. Every platform is connected first; sharing unlocks after. */
  connected: boolean;
  /** Account handle returned by the provider on connect. */
  handle: string;
  /** Share button clicked (this session or a previous one) — Submit is gated on this for X/Facebook. */
  shareClicked: boolean;
  /** A local action (OAuth popup, API call) is in flight. */
  busy: boolean;
  sharedPostUrl?: string | null;
  failureReason?: string | null;
  /** Instagram rejected a personal account; show the Creator/screenshot fallback. */
  needsProfessionalAccount?: boolean;
}

/** Page-scoped state for one ceremony's share verification. Provided by VerifySharePage. */
@Injectable()
export class ShareStore {
  private readonly api = inject(ShareApiService);
  private readonly oauth = inject(OAuthService);
  private readonly realtime = inject(ShareRealtime);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  private ceremonyId = '';

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly ceremonyTitle = signal('');
  private readonly states = signal<Partial<Record<Platform, PlatformState>>>({});

  /** Platform waiting for the user to confirm its caption before we post on their behalf. */
  readonly captionDialogFor = signal<Platform | null>(null);

  readonly cards = computed(() =>
    PLATFORMS.map((m) => this.states()[m.platform]).filter(
      (s): s is PlatformState => !!s && s.config.availability !== 'hidden',
    ),
  );
  readonly enabledCount = computed(() => this.cards().filter((c) => c.config.availability === 'enabled').length);
  readonly verifiedCount = computed(() => this.cards().filter((c) => c.status === 'Verified').length);

  constructor() {
    this.realtime.statusChanged$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.ceremonyId !== this.ceremonyId) return;
      this.patch(e.platform, {
        status: e.status,
        sharedPostUrl: e.postUrl ?? this.state(e.platform)?.sharedPostUrl,
        failureReason: e.failureReason ?? null,
        ...(e.handle ? { handle: e.handle } : {}),
      });
      if (e.status === 'Verified') this.toast.show(`${this.state(e.platform)?.meta.name} share verified`, 'success');
    });
    this.destroyRef.onDestroy(() => void this.realtime.disconnect());
  }

  state(platform: Platform): PlatformState | undefined {
    return this.states()[platform];
  }

  async load(ceremonyId: string): Promise<void> {
    this.ceremonyId = ceremonyId;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const { config, submissions } = await firstValueFrom(
        forkJoin({ config: this.api.getConfig(ceremonyId), submissions: this.api.getSubmissions(ceremonyId) }),
      );
      this.ceremonyTitle.set(config.ceremonyTitle);
      const states: Partial<Record<Platform, PlatformState>> = {};
      for (const meta of PLATFORMS) {
        const cfg = config.platforms.find((p) => p.platform === meta.platform);
        if (!cfg) continue;
        const sub = submissions.find((s) => s.platform === meta.platform);
        states[meta.platform] = {
          meta,
          config: cfg,
          status: sub?.status ?? 'NotStarted',
          caption: cfg.defaultCaption,
          connected: !!sub?.connected,
          handle: sub?.handle ?? '',
          shareClicked: !!sub?.shareClickedAt,
          busy: false,
          sharedPostUrl: sub?.sharedPostUrl,
          failureReason: sub?.failureReason,
        };
      }
      this.states.set(states);
    } catch (err) {
      this.loadError.set(errorMessage(err, 'We could not load this ceremony.'));
    } finally {
      this.loading.set(false);
    }

    this.realtime.connect(ceremonyId).catch(() =>
      this.toast.show('Live updates are unavailable — refresh the page to see new statuses.', 'error', 6000),
    );
  }

  setCaption(platform: Platform, caption: string): void {
    this.patch(platform, { caption });
  }

  /** X only: a typed handle is an alternative to connecting. Connecting fills it in. */
  setHandle(platform: Platform, handle: string): void {
    this.patch(platform, { handle });
  }

  async copyCaption(platform: Platform): Promise<void> {
    const copied = await copyToClipboard(this.state(platform)!.caption);
    this.toast.show(copied ? 'Caption copied' : 'Could not copy — select the caption and copy it manually', copied ? 'success' : 'error');
  }

  // ── Step 1 (all platforms): connect the account through OAuth ─────────────

  async connect(platform: Platform): Promise<void> {
    this.patch(platform, { busy: true, needsProfessionalAccount: false, failureReason: null });
    try {
      const result = await this.oauth.connect(this.ceremonyId, platform);
      this.patch(platform, { connected: true, handle: result.handle ?? '' });
      this.toast.show(`${this.state(platform)!.meta.name} connected`, 'success');
    } catch (err) {
      this.handleOAuthError(platform, err);
    } finally {
      this.patch(platform, { busy: false });
    }
  }

  // ── X: quote-post intent, then Submit (backend checks the connected account) ──

  shareX(): void {
    const s = this.state('x')!;
    window.open(xIntentUrl(s.caption, s.config.postUrl), '_blank', 'noopener');
    this.markClicked('x');
  }

  async verifyX(): Promise<void> {
    const handle = normalizeHandle(this.state('x')!.handle);
    if (!handle) {
      this.toast.show('Connect X or enter your X username', 'error');
      return;
    }
    this.patch('x', { handle });
    await this.run('x', () => firstValueFrom(this.api.verifyX(this.ceremonyId, handle)));
  }

  // ── Facebook: sharer (caption pasted by the user), then Submit to check /me/posts ──

  shareFacebook(): void {
    const s = this.state('facebook')!;
    // Facebook forbids prefilled captions, so copy it for the user to paste. Must start inside the click.
    void this.copyCaption('facebook');
    window.open(facebookSharerUrl(s.config.postUrl), '_blank', 'noopener');
    this.markClicked('facebook');
  }

  async verifyFacebook(): Promise<void> {
    await this.run('facebook', () => firstValueFrom(this.api.verifyFacebook(this.ceremonyId)));
  }

  // ── LinkedIn / Instagram / TikTok: confirm caption, we post ───────────────

  openPublish(platform: PublishPlatform): void {
    this.captionDialogFor.set(platform);
  }

  async confirmPublish(platform: PublishPlatform, caption: string): Promise<void> {
    this.captionDialogFor.set(null);
    this.patch(platform, { caption });
    await this.run(platform, () => firstValueFrom(this.api.publish(this.ceremonyId, platform, caption)));
  }

  cancelPublish(): void {
    this.captionDialogFor.set(null);
  }

  // ── Screenshot fallback ───────────────────────────────────────────────────

  async uploadScreenshot(platform: Platform, file: File): Promise<void> {
    if (!file.type.startsWith('image/')) {
      this.toast.show('Please choose an image file', 'error');
      return;
    }
    await this.run(platform, () => firstValueFrom(this.api.uploadScreenshot(this.ceremonyId, platform, file)));
    this.patch(platform, { needsProfessionalAccount: false });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private markClicked(platform: Platform): void {
    this.patch(platform, { shareClicked: true });
    this.api.recordClick(this.ceremonyId, platform).subscribe({
      error: () => this.toast.show('Could not record your share — please try again', 'error'),
    });
  }

  /** Runs an action that ends in a ShareSubmission, applying it or surfacing the error. */
  private async run(platform: Platform, action: () => Promise<ShareSubmission>): Promise<void> {
    this.patch(platform, { busy: true, failureReason: null });
    try {
      this.applySubmission(await action());
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        // Stored token expired or was revoked — send them back to step 1.
        this.patch(platform, { connected: false });
        this.toast.show(`Your ${this.state(platform)!.meta.name} sign-in expired — connect again`, 'error', 6000);
      } else {
        this.toast.show(errorMessage(err, 'Something went wrong — please try again.'), 'error');
      }
    } finally {
      this.patch(platform, { busy: false });
    }
  }

  private applySubmission(sub: ShareSubmission): void {
    this.patch(sub.platform, {
      status: sub.status,
      sharedPostUrl: sub.sharedPostUrl,
      failureReason: sub.failureReason,
      ...(sub.handle ? { handle: sub.handle } : {}),
    });
  }

  private handleOAuthError(platform: Platform, err: unknown): void {
    if (err instanceof OAuthError) {
      if (err.code === 'cancelled') return;
      if (err.code === 'personal_account') {
        this.patch(platform, { needsProfessionalAccount: true });
        return;
      }
      this.toast.show(err.message, 'error', 6000);
      return;
    }
    this.toast.show(errorMessage(err, 'Sign-in failed — please try again.'), 'error');
  }

  private patch(platform: Platform, patch: Partial<PlatformState>): void {
    this.states.update((all) => {
      const current = all[platform];
      return current ? { ...all, [platform]: { ...current, ...patch } } : all;
    });
  }
}

/** Accepts "@name", "name", or a profile URL like https://x.com/name. */
export function normalizeHandle(input: string): string {
  let value = input.trim();
  const url = value.match(/^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)/i);
  if (url) value = url[1];
  return value.replace(/^@+/, '').trim();
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 429) return 'Too many attempts — please wait a minute and try again.';
    const detail = (err.error as { detail?: string; title?: string } | null)?.detail;
    return detail ?? fallback;
  }
  return fallback;
}
