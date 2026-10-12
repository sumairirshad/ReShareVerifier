import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Platform, ShareConfig, ShareSubmission } from './share.models';

export type PublishPlatform = 'linkedin' | 'instagram' | 'tiktok';

/** Thin client for the share endpoints in spec §5. */
@Injectable({ providedIn: 'root' })
export class ShareApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api`;

  getConfig(ceremonyId: string): Observable<ShareConfig> {
    return this.http.get<ShareConfig>(`${this.base}/ceremonies/${ceremonyId}/share-config`);
  }

  getSubmissions(ceremonyId: string): Observable<ShareSubmission[]> {
    return this.http.get<ShareSubmission[]>(`${this.base}/ceremonies/${ceremonyId}/shares`);
  }

  /** Marks the start of the verification window (only posts after this time count). */
  recordClick(ceremonyId: string, platform: Platform): Observable<ShareSubmission> {
    return this.http.post<ShareSubmission>(`${this.base}/shares/${platform}/clicked`, { ceremonyId });
  }

  /** Checks the account's recent posts for a quote of Tisoro's post. Handle comes from Connect or is typed. */
  verifyX(ceremonyId: string, handle: string): Observable<ShareSubmission> {
    return this.http.post<ShareSubmission>(`${this.base}/shares/x/verify`, { ceremonyId, handle });
  }

  /** Runs the /me/posts check with the token stored by the Facebook OAuth callback. */
  verifyFacebook(ceremonyId: string): Observable<ShareSubmission> {
    return this.http.post<ShareSubmission>(`${this.base}/shares/facebook/verify`, { ceremonyId });
  }

  /** LinkedIn reshare, Instagram Reel, or TikTok video, using the stored OAuth token. */
  publish(ceremonyId: string, platform: PublishPlatform, caption: string): Observable<ShareSubmission> {
    return this.http.post<ShareSubmission>(`${this.base}/shares/${platform}/publish`, { ceremonyId, caption });
  }

  uploadScreenshot(ceremonyId: string, platform: Platform, file: File): Observable<ShareSubmission> {
    const form = new FormData();
    form.append('ceremonyId', ceremonyId);
    form.append('file', file, file.name);
    return this.http.post<ShareSubmission>(`${this.base}/shares/${platform}/screenshot`, form);
  }

  /**
   * Returns the provider authorize URL. The backend builds it with a `state` bound to the
   * signed-in user and ceremony, so this goes through HttpClient (and any auth interceptor)
   * rather than being a bare popup navigation that would carry no bearer token.
   */
  getAuthorizeUrl(ceremonyId: string, platform: Platform): Observable<{ authorizeUrl: string }> {
    return this.http.get<{ authorizeUrl: string }>(`${this.base}/oauth/${platform}/start`, {
      params: { ceremonyId },
    });
  }
}
