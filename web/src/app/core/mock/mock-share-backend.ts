import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, Subject, delay, of, throwError } from 'rxjs';
import { ShareRealtime } from '../share-realtime';
import { AdminCeremony, Platform, ShareConfig, ShareStatusChanged, SharePath, Submission } from '../share.models';

/**
 * Dev-only fake of the share API + SignalR hub (`npm run start:demo`). Nothing is posted anywhere.
 * Tips: an X username containing "fail" isn't found; the Instagram mention and TikTok upload confirm after a few seconds.
 */
@Injectable({ providedIn: 'root' })
export class MockShareBackend extends ShareRealtime {
  private readonly changes = new Subject<ShareStatusChanged>();
  readonly statusChanged$ = this.changes.asObservable();
  private readonly subs = new Map<Platform, Submission>();

  connect(): Promise<void> {
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  handle(req: HttpRequest<unknown>): Observable<HttpEvent<unknown>> | null {
    const path = new URL(req.urlWithParams, window.location.origin).pathname;
    const body = (req.body ?? {}) as { ceremonyId?: string; caption?: string; username?: string; pageId?: string; postUrl?: string | null };
    const ceremonyId = body.ceremonyId ?? 'demo';
    let m: RegExpMatchArray | null;

    if ((m = path.match(/^\/api\/ceremonies\/([^/]+)\/share-config$/))) return ok(demoConfig(m[1]));
    if (path.match(/^\/api\/ceremonies\/[^/]+\/shares$/)) return ok(PLATFORMS.map((p) => this.get(p)));
    if (path.match(/^\/api\/admin\/ceremonies\/[^/]+\/shares$/)) return ok(this.admin());

    if ((m = path.match(/^\/api\/shares\/(linkedin|x)\/publish$/))) {
      const p = m[1] as Platform;
      return ok(this.set(p, 'Verified', 'api', p === 'x' ? `X returned post ID 19${digits(17)}` : `LinkedIn returned post ID urn:li:share:7${digits(18)}`), 1500);
    }
    if (path === '/api/shares/x/check') {
      const found = !(body.username ?? '').toLowerCase().includes('fail');
      const sub = found
        ? this.set('x', 'Verified', 'self', `@${body.username} found in the reposts of Tisoro's post`, { username: body.username })
        : this.patch('x', { username: body.username ?? null });
      return ok({ found, submission: sub }, 1700);
    }
    if (path === '/api/shares/instagram/expect') {
      const sub = this.set('instagram', 'Waiting', 'story', 'Waiting for the mention from Instagram', { username: body.username });
      this.later(ceremonyId, 'instagram', 6000, `Instagram sent a Story mention from @${body.username}`);
      return ok(sub);
    }
    if (path === '/api/shares/facebook/pages') {
      return ok([
        { id: '101', name: 'Harrington Wells Private Bank', followers: 12400, canPost: true },
        { id: '102', name: 'Harrington Wells Careers', followers: 2100, canPost: true },
      ]);
    }
    if (path === '/api/shares/facebook/publish') {
      const name = body.pageId === '102' ? 'Harrington Wells Careers' : 'Harrington Wells Private Bank';
      return ok(this.set('facebook', 'Verified', 'page', `Facebook returned post ID ${digits(15)}_${digits(16)} on ${name}`), 1500);
    }
    if (path === '/api/shares/tiktok/creator-info') {
      return ok({ nickname: 'yourcompany', privacyOptions: ['PUBLIC_TO_EVERYONE', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'] });
    }
    if (path === '/api/shares/tiktok/publish') {
      const sub = this.set('tiktok', 'Waiting', 'api', 'Uploading to TikTok');
      this.later(ceremonyId, 'tiktok', 4000, `TikTok confirmed publish, video ID 75${digits(17)}`);
      return ok(sub, 1900);
    }
    if ((m = path.match(/^\/api\/shares\/(facebook|tiktok)\/self-confirm$/))) {
      const p = m[1] as Platform;
      const evidence = body.postUrl ? `Post link added: ${body.postUrl}` : p === 'tiktok' ? "TikTok doesn't report reposts" : 'No post link added';
      return ok(this.set(p, 'SelfConfirmed', p === 'facebook' ? 'profile' : 'app', evidence, { postUrl: body.postUrl ?? null }));
    }
    if ((m = path.match(/^\/api\/oauth\/(\w+)\/start$/))) {
      return throwError(() => new HttpErrorResponse({ status: 503, error: { detail: 'The demo signs in through its own screen.' } }));
    }
    if (path.startsWith('/api/')) return throwError(() => new HttpErrorResponse({ status: 404, error: { detail: `Demo has no ${req.method} ${path}` } }));
    return null;
  }

  private get(p: Platform): Submission {
    return this.subs.get(p) ?? { platform: p, status: 'NotStarted', path: null, connected: false, handle: null, username: null, postUrl: null, method: null, evidence: null, failureReason: null, updatedAt: null };
  }

  private patch(p: Platform, change: Partial<Submission>): Submission {
    const next = { ...this.get(p), ...change, updatedAt: new Date().toISOString() };
    this.subs.set(p, next);
    return next;
  }

  private set(p: Platform, status: Submission['status'], path: SharePath, evidence: string, extra: Partial<Submission> = {}): Submission {
    return this.patch(p, { status, path, evidence, method: METHODS[`${p}/${path}`], failureReason: null, ...extra });
  }

  /** A background job finishing and pushing over SignalR. */
  private later(ceremonyId: string, p: Platform, ms: number, evidence: string): void {
    setTimeout(() => this.changes.next({ ceremonyId, submission: this.patch(p, { status: 'Verified', evidence }) }), ms);
  }

  private admin(): AdminCeremony {
    const cfg = demoConfig('demo');
    const shares = PLATFORMS.map((p) => this.get(p)).filter((s) => s.status !== 'NotStarted');
    return {
      ceremonyId: 'demo',
      companyName: cfg.companyName,
      official: cfg.platforms.map((p) => ({ platform: p.platform, postUrl: p.postUrl, format: p.format })),
      partners: shares.length ? [{ partner: 'Partner (this browser)', shares: shares.map((s) => ({ ...s, handle: s.handle ?? s.username })) }] : [],
    };
  }
}

export const mockShareBackendInterceptor: HttpInterceptorFn = (req, next) => inject(MockShareBackend).handle(req) ?? next(req);

const PLATFORMS: Platform[] = ['linkedin', 'instagram', 'x', 'facebook', 'tiktok'];

const METHODS: Record<string, string> = {
  'linkedin/api': "Posted by Tisoro through LinkedIn's API",
  'x/api': "Posted by Tisoro through X's API",
  'x/self': "Found in the reposts of Tisoro's post",
  'instagram/story': 'Instagram told Tisoro about the mention',
  'facebook/page': "Posted by Tisoro through Facebook's Pages API",
  'facebook/profile': 'Partner tapped “Yes, I shared”',
  'tiktok/api': "Posted by Tisoro through TikTok's posting API",
  'tiktok/app': 'Partner tapped “Yes, I reposted”',
};

function ok<T>(body: T, ms = 400): Observable<HttpEvent<T>> {
  return of(new HttpResponse({ status: 200, body })).pipe(delay(ms));
}

function digits(n: number): string {
  return Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
}

function demoConfig(ceremonyId: string): ShareConfig {
  const caption = 'Welcoming Harrington Wells Private Bank to the Tisoro Network as an official B.O.L.D. Partner in London. #TisoroNetwork #BOLDPartner #PrivateBanking';
  return {
    ceremonyId,
    title: 'Tisoro Network Induction Ceremony',
    companyName: 'Harrington Wells Private Bank',
    platforms: [
      { platform: 'linkedin', availability: 'enabled', paths: ['api'], format: 'Full video · 16:9 · 3:12', postId: 'urn:li:ugcPost:7515417373886111745', postUrl: 'https://www.linkedin.com/posts/aihiring-airecruitment-latamtalent-ugcPost-7515417373886111745-uXCk/', caption },
      { platform: 'instagram', availability: 'enabled', paths: ['story'], format: 'Reel · 9:16 · 45s', postId: 'DUyDMqLCNDe', postUrl: 'https://www.instagram.com/reel/DUyDMqLCNDe/', caption },
      { platform: 'x', availability: 'enabled', paths: ['api', 'self'], format: 'Short clip · 16:9 · 1:30', postId: '1962635946102345887', postUrl: 'https://x.com/Tisoro_Global/status/1962635946102345887', caption: 'Welcoming Harrington Wells Private Bank to the @Tisoro_Global Network as an official B.O.L.D. Partner. #TisoroNetwork' },
      { platform: 'facebook', availability: 'enabled', paths: ['page', 'profile'], format: 'Full video · 16:9 · 3:12', postId: '1187940926354281', postUrl: 'https://www.facebook.com/reel/1187940926354281', caption },
      { platform: 'tiktok', availability: 'enabled', paths: ['api', 'app'], format: 'Short video · 9:16 · 30s', postId: '7532546612170657042', postUrl: 'https://www.tiktok.com/@tisoro.global/video/7532546612170657042', caption },
    ],
  };
}
