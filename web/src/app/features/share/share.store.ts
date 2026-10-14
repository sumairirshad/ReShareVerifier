import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, forkJoin } from 'rxjs';
import { OAuthError, OAuthService } from '../../core/oauth.service';
import { PLATFORMS, PlatformMeta, platformMeta } from '../../core/platforms';
import { ShareApiService } from '../../core/share-api.service';
import { ShareRealtime } from '../../core/share-realtime';
import { Platform, PlatformConfig, ShareConfig, Submission } from '../../core/share.models';
import { ToastService } from '../../shared/toast.service';

export interface Row {
  meta: PlatformMeta;
  config: PlatformConfig;
  sub: Submission;
}

/** Page-scoped state for one ceremony's sharing. Provided by SharePage. */
@Injectable()
export class ShareStore {
  readonly api = inject(ShareApiService);
  private readonly oauth = inject(OAuthService);
  private readonly realtime = inject(ShareRealtime);
  private readonly toast = inject(ToastService);

  ceremonyId = '';
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly config = signal<ShareConfig | null>(null);
  private readonly subs = signal<Partial<Record<Platform, Submission>>>({});

  readonly rows = computed<Row[]>(() => {
    const cfg = this.config();
    if (!cfg) return [];
    return PLATFORMS.flatMap((meta) => {
      const config = cfg.platforms.find((p) => p.platform === meta.platform);
      if (!config || config.availability === 'hidden') return [];
      return [{ meta, config, sub: this.subs()[meta.platform] ?? emptySubmission(meta.platform) }];
    });
  });
  /** Shown once anything is shared and not just waiting on the platform. */
  readonly anyShared = computed(() => this.rows().some((r) => r.sub.status === 'Verified' || r.sub.status === 'SelfConfirmed'));

  constructor() {
    this.realtime.statusChanged$.pipe(takeUntilDestroyed()).subscribe(({ ceremonyId, submission }) => {
      if (ceremonyId !== this.ceremonyId) return;
      const before = this.subs()[submission.platform]?.status;
      this.apply(submission);
      const name = platformMeta(submission.platform).name;
      if (before === 'Waiting' && submission.status === 'Verified') this.toast.show(`✓ ${name} confirmed your share`, 'success');
      if (before === 'Waiting' && submission.status === 'NotStarted' && submission.failureReason) this.toast.show(submission.failureReason, 'error', 6000);
    });
    inject(DestroyRef).onDestroy(() => void this.realtime.disconnect());
  }

  submission(platform: Platform): Submission {
    return this.subs()[platform] ?? emptySubmission(platform);
  }

  platformConfig(platform: Platform): PlatformConfig {
    return this.config()!.platforms.find((p) => p.platform === platform)!;
  }

  async load(ceremonyId: string): Promise<void> {
    this.ceremonyId = ceremonyId;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const { config, subs } = await firstValueFrom(
        forkJoin({ config: this.api.getConfig(ceremonyId), subs: this.api.getSubmissions(ceremonyId) }),
      );
      this.config.set(config);
      this.subs.set(Object.fromEntries(subs.map((s) => [s.platform, s])));
    } catch (err) {
      this.loadError.set(describeError(err, 'We couldn’t load your ceremony. Please try again.'));
    } finally {
      this.loading.set(false);
    }
    this.realtime.connect(ceremonyId).catch(() => this.toast.show('Live updates are off. Refresh to see the latest status.', 'error', 6000));
  }

  apply(sub: Submission): void {
    this.subs.update((all) => ({ ...all, [sub.platform]: sub }));
  }

  /** OAuth popup. Must be called directly from a click handler (popup blockers). */
  async connect(platform: Platform): Promise<void> {
    const result = await this.oauth.connect(this.ceremonyId, platform);
    this.apply({ ...this.submission(platform), connected: true, handle: result.handle ?? null });
  }

  /** Marks a platform disconnected after the API says the stored sign-in expired. */
  handleUnauthorized(platform: Platform, err: unknown): boolean {
    if (err instanceof HttpErrorResponse && err.status === 401) {
      this.apply({ ...this.submission(platform), connected: false });
      return true;
    }
    return false;
  }
}

export function emptySubmission(platform: Platform): Submission {
  return { platform, status: 'NotStarted', path: null, connected: false, handle: null, username: null, postUrl: null, method: null, evidence: null, failureReason: null, updatedAt: null };
}

/** Human message for an API/OAuth failure; ProblemDetails `detail` is written for partners. */
export function describeError(err: unknown, fallback: string): string {
  if (err instanceof OAuthError) return err.message;
  if (err instanceof HttpErrorResponse) {
    if (err.status === 429) return 'Too many attempts. Please wait a minute and try again.';
    if (err.status === 0) return 'Can’t reach Tisoro right now. Check your connection and try again.';
    return (err.error as { detail?: string } | null)?.detail ?? fallback;
  }
  return fallback;
}
