import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Platform } from '../core/share.models';

/** Brand-coloured rounded square with a white glyph, as on Tisoro screen 09. */
@Component({
  selector: 'app-platform-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[class]': '"ic ic--" + platform()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
  template: `
    @switch (platform()) {
      @case ('linkedin') {
        <svg viewBox="0 0 24 24" fill="#fff"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45z" /></svg>
      }
      @case ('instagram') {
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="#fff" /></svg>
      }
      @case ('x') {
        <svg viewBox="0 0 24 24" fill="#fff"><path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.59-6.64 7.59H.47l8.6-9.83L0 1.15h7.59l5.24 6.93zM17.61 20.64h2.04L6.49 3.24H4.3z" /></svg>
      }
      @case ('facebook') {
        <svg viewBox="0 0 24 24" fill="#fff"><path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.5 1.6-1.5h1.7V4.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.4H7.7V14h2.7v8z" /></svg>
      }
      @case ('tiktok') {
        <svg viewBox="0 0 24 24" fill="#fff"><path d="M16 3c.4 2.3 1.9 3.8 4 4v3.2c-1.5 0-2.9-.4-4-1.2v6.5A5.5 5.5 0 1 1 10.5 10v3.3a2.3 2.3 0 1 0 2 2.2V3z" /></svg>
      }
    }
  `,
  styles: `
    :host { display: grid; place-items: center; flex: 0 0 auto; border-radius: 9px; }
    svg { width: 50%; height: 50%; }
    :host(.ic--linkedin) { background: #0a66c2; }
    :host(.ic--instagram) { background: linear-gradient(45deg, #f58529, #dd2a7b 50%, #8134af); }
    :host(.ic--x), :host(.ic--tiktok) { background: #111; }
    :host(.ic--facebook) { background: #1877f2; }
  `,
})
export class PlatformIconComponent {
  readonly platform = input.required<Platform>();
  readonly size = input(36);
}
