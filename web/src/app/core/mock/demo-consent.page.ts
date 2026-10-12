import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { platformMeta } from '../platforms';
import { Platform } from '../share.models';
import { PlatformIconComponent } from '../../shared/platform-icon.component';

/**
 * Mock-mode stand-in for the provider's login + consent screen (shown in the OAuth popup).
 * Redirects to /oauth/callback exactly like the API's callback would.
 */
@Component({
  selector: 'app-demo-consent-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlatformIconComponent],
  template: `
    <form class="box" (submit)="allow($event)">
      <app-platform-icon [platform]="platform" />
      <h1>Sign in with {{ name }}</h1>
      <p class="demo">Demo mode — in production this is {{ name }}'s real sign-in and permission screen.</p>
      <label for="demo-handle">Account to connect</label>
      <div class="field">
        <span aria-hidden="true">&#64;</span>
        <input id="demo-handle" placeholder="yourhandle" [value]="handle()" (input)="handle.set($any($event.target).value)" autocomplete="off" />
      </div>
      @if (platform === 'instagram') {
        <p class="tip">Enter <code>personal</code> to simulate a personal (non-Creator) Instagram account.</p>
      }
      <div class="buttons">
        <button type="button" class="btn btn--ghost" (click)="cancel()">Cancel</button>
        <button type="submit" class="btn btn--primary" [disabled]="!handle().trim()">Allow</button>
      </div>
    </form>
  `,
  styles: `
    :host { display: grid; place-items: center; min-height: 100vh; padding: 16px; box-sizing: border-box; }
    .box { display: grid; gap: 10px; width: min(380px, 100%); padding: 24px; border: 1px solid var(--border); border-radius: 12px; }
    h1 { margin: 4px 0 0; font-size: 18px; }
    .demo { margin: 0; padding: 8px 10px; border-radius: 6px; background: var(--chip-amber-bg); font-size: 13px; }
    label { font-size: 13px; font-weight: 600; }
    .field { display: flex; align-items: center; gap: 2px; height: 36px; padding: 0 12px; border: 1px solid var(--border); border-radius: 6px; color: var(--muted); }
    input { flex: 1; border: 0; outline: 0; font: inherit; color: var(--text); background: transparent; }
    .tip { margin: 0; font-size: 12px; color: var(--muted); }
    .buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
  `,
})
export class DemoConsentPage {
  protected readonly platform = new URLSearchParams(window.location.search).get('platform') as Platform;
  protected readonly name = platformMeta(this.platform).name;
  protected readonly handle = signal('');

  protected allow(event: Event): void {
    event.preventDefault();
    const handle = this.handle().trim().replace(/^@+/, '');
    const params: Record<string, string> =
      this.platform === 'instagram' && handle === 'personal'
        ? { platform: this.platform, status: 'error', error: 'personal_account' }
        : { platform: this.platform, status: 'success', handle };
    window.location.href = `/oauth/callback?${new URLSearchParams(params)}`;
  }

  protected cancel(): void {
    window.close();
  }
}
