import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { OAUTH_MESSAGE_TYPE } from '../../core/oauth.service';
import { OAuthResult, Platform } from '../../core/share.models';

/**
 * Landing page inside the OAuth popup. The API's /api/oauth/{platform}/callback stores the token,
 * then redirects here with:
 *   ?platform=linkedin&status=success&handle=acme
 *   ?platform=instagram&status=error&error=personal_account&error_description=...
 * Only non-secret, display-level data may appear in this URL — never tokens.
 */
@Component({
  selector: 'app-oauth-callback-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>{{ message() }}</p>`,
  styles: `
    :host { display: grid; place-items: center; min-height: 100vh; padding: 16px; text-align: center; color: var(--muted); }
  `,
})
export class OAuthCallbackPage implements OnInit {
  protected readonly message = signal('Finishing sign-in…');

  ngOnInit(): void {
    const q = new URLSearchParams(window.location.search);
    const result: OAuthResult = {
      type: OAUTH_MESSAGE_TYPE,
      platform: q.get('platform') as Platform,
      success: q.get('status') === 'success',
      handle: q.get('handle') ?? undefined,
      error: q.get('error') ?? undefined,
      errorDescription: q.get('error_description') ?? undefined,
    };

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(result, window.location.origin);
      window.close();
      return;
    }
    this.message.set(result.success ? 'Signed in. You can close this window.' : 'Sign-in did not complete. You can close this window and try again.');
  }
}
