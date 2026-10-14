import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PLATFORMS, platformMeta } from '../../core/platforms';
import { ShareApiService } from '../../core/share-api.service';
import { AdminCeremony, Platform, ShareStatus } from '../../core/share.models';
import { PlatformIconComponent } from '../../shared/platform-icon.component';
import { ShellComponent } from '../../shared/shell.component';

const KEY_STORAGE = 'tisoro-admin-key';
const STATUS: Record<ShareStatus, [string, string]> = {
  Verified: ['verified', '✓ Verified'],
  SelfConfirmed: ['self', 'Partner confirmed'],
  Waiting: ['waiting', 'Waiting for platform'],
  NotStarted: ['none', 'Not shared yet'],
};

/** Tisoro admin: the ceremony through its three stages — published, requested, shared and confirmed. */
@Component({
  selector: 'app-admin-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ShellComponent, PlatformIconComponent, DatePipe],
  templateUrl: './admin.page.html',
  styleUrl: './admin.page.scss',
})
export class AdminPage {
  private readonly api = inject(ShareApiService);

  readonly ceremonyId = input.required<string>();

  protected readonly key = signal(readKey());
  protected readonly data = signal<AdminCeremony | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);

  protected readonly platforms = PLATFORMS;
  protected readonly status = STATUS;
  protected readonly name = (p: Platform) => platformMeta(p).name;

  /** Every platform for every partner, including ones not shared yet. */
  protected readonly partners = computed(() =>
    (this.data()?.partners ?? []).map((p) => ({
      partner: p.partner,
      done: p.shares.filter((s) => s.status === 'Verified' || s.status === 'SelfConfirmed').length,
      verified: p.shares.filter((s) => s.status === 'Verified').length,
      rows: PLATFORMS.map((m) => p.shares.find((s) => s.platform === m.platform) ?? { platform: m.platform, status: 'NotStarted' as ShareStatus, method: null, evidence: null, postUrl: null, updatedAt: null, handle: null, path: null }),
    })),
  );

  constructor() {
    effect(() => {
      this.ceremonyId();
      if (this.key()) void this.refresh();
    });
    // Partners share while Tisoro watches; keep the table fresh.
    const timer = setInterval(() => this.key() && !this.loading() && void this.refresh(), 15000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      this.data.set(await firstValueFrom(this.api.getAdminCeremony(this.ceremonyId(), this.key())));
      this.error.set(null);
    } catch (err) {
      const status = err instanceof HttpErrorResponse ? err.status : 0;
      this.error.set(status === 401 ? 'That admin key isn’t right.' : status === 404 ? 'The admin view is switched off on the server (ADMIN_KEY is empty).' : 'Couldn’t load the ceremony.');
      if (status === 401) this.saveKey('');
    } finally {
      this.loading.set(false);
    }
  }

  protected submitKey(event: Event, value: string): void {
    event.preventDefault();
    this.saveKey(value.trim());
  }

  private saveKey(value: string): void {
    this.key.set(value);
    try {
      if (value) sessionStorage.setItem(KEY_STORAGE, value);
      else sessionStorage.removeItem(KEY_STORAGE);
    } catch {
      /* storage unavailable: key lives for this page only */
    }
  }
}

function readKey(): string {
  try {
    return sessionStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}
