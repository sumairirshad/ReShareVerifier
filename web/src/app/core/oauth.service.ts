import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { ShareApiService } from './share-api.service';
import { OAuthResult, Platform } from './share.models';

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const OAUTH_MESSAGE_TYPE = 'tisoro-oauth';
const POPUP_FEATURES = 'popup=yes,width=600,height=720';

/**
 * Runs a provider login in a popup so the user never leaves the page.
 *
 * 1. Open a blank popup synchronously (must happen inside the click handler or browsers block it).
 * 2. Ask the API for the authorize URL and point the popup at it.
 * 3. Provider → API callback (stores the encrypted token) → API redirects to /oauth/callback in this app.
 * 4. That page posts an OAuthResult back here and closes itself.
 */
@Injectable({ providedIn: 'root' })
export class OAuthService {
  private readonly api = inject(ShareApiService);

  connect(ceremonyId: string, platform: Platform): Promise<OAuthResult> {
    const popup = window.open('', `tisoro-oauth-${platform}`, POPUP_FEATURES);
    if (!popup) {
      return Promise.reject(
        new OAuthError('popup_blocked', 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.'),
      );
    }

    const { result, fail } = this.waitForResult(popup, platform);
    this.navigatePopup(popup, ceremonyId, platform).catch((err: unknown) => {
      popup.close();
      // e.g. 503 "LinkedIn sign-in isn't set up yet" — surface the API's message.
      const detail = err instanceof HttpErrorResponse ? (err.error as { detail?: string } | null)?.detail : undefined;
      fail(new OAuthError('start_failed', detail ?? 'Could not start sign-in. Please try again.'));
    });
    return result;
  }

  private async navigatePopup(popup: Window, ceremonyId: string, platform: Platform): Promise<void> {
    if (environment.useMockApi) {
      popup.location.href = `/oauth/demo-consent?${new URLSearchParams({ platform })}`;
      return;
    }
    const { authorizeUrl } = await firstValueFrom(this.api.getAuthorizeUrl(ceremonyId, platform));
    popup.location.href = authorizeUrl;
  }

  private waitForResult(popup: Window, platform: Platform): { result: Promise<OAuthResult>; fail: (err: OAuthError) => void } {
    let fail!: (err: OAuthError) => void;
    const result = new Promise<OAuthResult>((resolve, reject) => {
      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        clearInterval(closedPoll);
      };

      const onMessage = (event: MessageEvent) => {
        // Only trust messages from our own origin (the /oauth/callback route).
        if (event.origin !== window.location.origin) return;
        const data = event.data as OAuthResult;
        if (data?.type !== OAUTH_MESSAGE_TYPE || data.platform !== platform) return;
        cleanup();
        if (data.success) {
          resolve(data);
        } else {
          reject(new OAuthError(data.error ?? 'unknown', data.errorDescription ?? 'Sign-in did not complete.'));
        }
      };

      const closedPoll = setInterval(() => {
        if (popup.closed) {
          cleanup();
          reject(new OAuthError('cancelled', 'Sign-in window was closed.'));
        }
      }, 500);

      fail = (err) => {
        cleanup();
        reject(err);
      };

      window.addEventListener('message', onMessage);
    });
    return { result, fail };
  }
}
