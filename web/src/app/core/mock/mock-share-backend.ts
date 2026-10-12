import { HttpEvent, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, Subject, delay, of, throwError } from 'rxjs';
import { ShareRealtime } from '../share-realtime';
import { Platform, ShareConfig, ShareStatusChanged, ShareSubmission } from '../share.models';

/**
 * Dev-only fake of the share API + SignalR hub, enabled by `environment.useMockApi`.
 * Lets the page be built and demoed before the .NET backend exists.
 *
 * Nothing is posted anywhere and no post URLs are invented — verified cards just show the status.
 * Tips: an X handle containing "fail" ends in Failed; screenshots end in ManualReview.
 * Instagram handle "personal" simulates a personal (non-Creator) account.
 */
@Injectable({ providedIn: 'root' })
export class MockShareBackend extends ShareRealtime {
  private readonly changes = new Subject<ShareStatusChanged>();
  readonly statusChanged$ = this.changes.asObservable();
  private readonly submissions = new Map<Platform, ShareSubmission>();

  connect(): Promise<void> {
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  handle(req: HttpRequest<unknown>): Observable<HttpEvent<unknown>> | null {
    const url = new URL(req.urlWithParams, window.location.origin);
    const path = url.pathname;
    const body = (req.body ?? {}) as { ceremonyId?: string; handle?: string; caption?: string };
    let m: RegExpMatchArray | null;

    if ((m = path.match(/^\/api\/ceremonies\/([^/]+)\/share-config$/))) {
      return ok(demoConfig(m[1]));
    }
    if (path.match(/^\/api\/ceremonies\/[^/]+\/shares$/)) {
      return ok([...this.submissions.values()]);
    }
    if ((m = path.match(/^\/api\/shares\/(\w+)\/clicked$/))) {
      return ok(this.upsert(m[1] as Platform, { shareClickedAt: new Date().toISOString() }));
    }
    if (path === '/api/shares/x/verify') {
      const handle = body.handle ?? '';
      const found = !handle.toLowerCase().includes('fail');
      this.later(body.ceremonyId!, 'x', found ? 'Verified' : 'Failed', 3500, {
        handle,
        failureReason: found ? null : 'No quote of the Tisoro post found on this account yet.',
      });
      return ok(this.upsert('x', { status: 'Pending', handle, failureReason: null }));
    }
    if (path === '/api/shares/facebook/verify') {
      this.later(body.ceremonyId!, 'facebook', 'Verified', 3000, {});
      return ok(this.upsert('facebook', { status: 'Pending', failureReason: null }));
    }
    if ((m = path.match(/^\/api\/shares\/(linkedin|instagram|tiktok)\/publish$/))) {
      const platform = m[1] as Platform;
      this.later(body.ceremonyId!, platform, 'Verified', 3000, {});
      return ok(this.upsert(platform, { status: 'Pending', failureReason: null }));
    }
    if ((m = path.match(/^\/api\/shares\/(\w+)\/screenshot$/))) {
      const platform = m[1] as Platform;
      const ceremonyId = (req.body as FormData).get('ceremonyId') as string;
      this.later(ceremonyId, platform, 'ManualReview', 2500, {});
      return ok(this.upsert(platform, { status: 'Pending', failureReason: null }));
    }
    if (path.startsWith('/api/')) {
      return throwError(() => new Error(`Mock backend has no handler for ${req.method} ${path}`));
    }
    return null;
  }

  private upsert(platform: Platform, patch: Partial<ShareSubmission>): ShareSubmission {
    const next = { platform, status: 'NotStarted' as const, ...this.submissions.get(platform), ...patch };
    this.submissions.set(platform, next);
    return next;
  }

  /** Simulates a background job finishing and pushing over SignalR. */
  private later(
    ceremonyId: string,
    platform: Platform,
    status: ShareStatusChanged['status'],
    ms: number,
    extra: Partial<ShareStatusChanged>,
  ): void {
    setTimeout(() => {
      this.upsert(platform, { status, handle: extra.handle, sharedPostUrl: extra.postUrl, failureReason: extra.failureReason });
      this.changes.next({ ceremonyId, platform, status, ...extra });
    }, ms);
  }
}

export const mockShareBackendInterceptor: HttpInterceptorFn = (req, next) =>
  inject(MockShareBackend).handle(req) ?? next(req);

function ok<T>(body: T): Observable<HttpEvent<T>> {
  return of(new HttpResponse({ status: 200, body })).pipe(delay(400));
}

/** Tisoro's live ceremony posts — used until the API serves CeremonySocialPost rows. */
const TISORO_POSTS: Record<Platform, string> = {
  linkedin: 'https://www.linkedin.com/posts/aihiring-airecruitment-latamtalent-ugcPost-7515417373886111745-uXCk/',
  instagram: 'https://www.instagram.com/reel/DUyDMqLCNDe/',
  x: 'https://x.com/Tisoro_Global/status/1962635946102345887',
  tiktok: 'https://www.tiktok.com/@tisoro.global/video/7532546612170657042',
  facebook: 'https://www.facebook.com/reel/1187940926354281',
};

function demoConfig(ceremonyId: string): ShareConfig {
  const caption =
    'Proud to be recognised at the Tisoro Global ceremony! Thank you to our team and partners. #TisoroNetwork';
  return {
    ceremonyId,
    ceremonyTitle: 'Tisoro Global Excellence Awards 2026',
    platforms: [
      { platform: 'linkedin', availability: 'enabled', postId: 'urn:li:ugcPost:7515417373886111745', postUrl: TISORO_POSTS.linkedin, defaultCaption: caption },
      { platform: 'instagram', availability: 'enabled', postId: 'DUyDMqLCNDe', postUrl: TISORO_POSTS.instagram, defaultCaption: caption },
      { platform: 'x', availability: 'enabled', postId: '1962635946102345887', postUrl: TISORO_POSTS.x, defaultCaption: 'Proud to be recognised at the @Tisoro_Global ceremony! #TisoroNetwork' },
      { platform: 'tiktok', availability: 'enabled', postId: '7532546612170657042', postUrl: TISORO_POSTS.tiktok, defaultCaption: caption },
      { platform: 'facebook', availability: 'enabled', postId: '1187940926354281', postUrl: TISORO_POSTS.facebook, defaultCaption: caption },
    ],
  };
}
