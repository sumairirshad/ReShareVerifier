import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AdminCeremony, FacebookPage, Platform, ShareConfig, Submission, TikTokCreatorInfo } from './share.models';

/** Client for the share endpoints of the .NET API. */
@Injectable({ providedIn: 'root' })
export class ShareApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api`;

  getConfig(ceremonyId: string): Observable<ShareConfig> {
    return this.http.get<ShareConfig>(`${this.base}/ceremonies/${ceremonyId}/share-config`);
  }

  getSubmissions(ceremonyId: string): Observable<Submission[]> {
    return this.http.get<Submission[]>(`${this.base}/ceremonies/${ceremonyId}/shares`);
  }

  /** LinkedIn repost / X quote-post through Tisoro, as the connected user. */
  publish(ceremonyId: string, platform: 'linkedin' | 'x', caption: string): Observable<Submission> {
    return this.http.post<Submission>(`${this.base}/shares/${platform}/publish`, { ceremonyId, caption });
  }

  /** Looks for the user in the reposts and quotes of Tisoro's X post. */
  checkXRepost(ceremonyId: string, username: string): Observable<{ found: boolean; submission: Submission }> {
    return this.http.post<{ found: boolean; submission: Submission }>(`${this.base}/shares/x/check`, { ceremonyId, username });
  }

  /** Marks the Instagram share as waiting for the @tisoroglobal Story mention webhook. */
  expectInstagramMention(ceremonyId: string, username: string): Observable<Submission> {
    return this.http.post<Submission>(`${this.base}/shares/instagram/expect`, { ceremonyId, username });
  }

  getFacebookPages(): Observable<FacebookPage[]> {
    return this.http.get<FacebookPage[]>(`${this.base}/shares/facebook/pages`);
  }

  publishToFacebookPage(ceremonyId: string, pageId: string, caption: string): Observable<Submission> {
    return this.http.post<Submission>(`${this.base}/shares/facebook/publish`, { ceremonyId, pageId, caption });
  }

  getTikTokCreatorInfo(): Observable<TikTokCreatorInfo> {
    return this.http.get<TikTokCreatorInfo>(`${this.base}/shares/tiktok/creator-info`);
  }

  publishToTikTok(ceremonyId: string, caption: string, privacyLevel: string): Observable<Submission> {
    return this.http.post<Submission>(`${this.base}/shares/tiktok/publish`, { ceremonyId, caption, privacyLevel });
  }

  /** Facebook personal profile / TikTok app: the partner confirms it themselves. */
  selfConfirm(ceremonyId: string, platform: 'facebook' | 'tiktok', postUrl: string | null): Observable<Submission> {
    return this.http.post<Submission>(`${this.base}/shares/${platform}/self-confirm`, { ceremonyId, postUrl });
  }

  getAdminCeremony(ceremonyId: string, adminKey: string): Observable<AdminCeremony> {
    return this.http.get<AdminCeremony>(`${this.base}/admin/ceremonies/${ceremonyId}/shares`, {
      headers: new HttpHeaders({ 'X-Admin-Key': adminKey }),
    });
  }

  /** Provider authorize URL; `state` is bound to this session server-side. */
  getAuthorizeUrl(ceremonyId: string, platform: Platform): Observable<{ authorizeUrl: string }> {
    return this.http.get<{ authorizeUrl: string }>(`${this.base}/oauth/${platform}/start`, { params: { ceremonyId } });
  }
}
