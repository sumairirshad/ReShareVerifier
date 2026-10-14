import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Stand-in poster for the ceremony video in its platform shape (16:9 or 9:16). */
@Component({
  selector: 'app-video-thumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.width.px]': 'width()', '[style.height.px]': 'height()', role: 'img', '[attr.aria-label]': '"Ceremony video: Welcoming " + company()' },
  template: `
    <span class="dur">{{ shape() === 'tall' ? '0:45' : '3:12' }}</span>
    <div class="pl"><svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M8 5.5v13l10.5-6.5z" /></svg></div>
    <div class="tt" [style.font-size.px]="shape() === 'tall' ? 15 : 17">
      <small>TISORO NETWORK INDUCTION</small>Welcoming<br />{{ company() }}
    </div>
  `,
  styles: `
    :host {
      display: block; max-width: 100%; flex: 0 0 auto; position: relative; overflow: hidden; border-radius: 10px; color: #fff;
      background: radial-gradient(120% 90% at 70% 30%, #3a0d16 0%, #16080b 50%, #0b0b0e 100%);
    }
    .tt { position: absolute; left: 12px; bottom: 12px; right: 12px; font-weight: 800; line-height: 1.12; }
    .tt small { display: block; font-size: 9px; letter-spacing: 0.18em; color: #e9a3af; font-weight: 600; margin-bottom: 4px; }
    .pl { position: absolute; right: 10px; top: 10px; width: 28px; height: 28px; border-radius: 50%; background: var(--crimson); display: grid; place-items: center; }
    .dur { position: absolute; left: 10px; top: 10px; font-size: 11px; background: rgba(0, 0, 0, 0.55); border-radius: 4px; padding: 1px 6px; font-weight: 600; }
  `,
})
export class VideoThumbComponent {
  readonly shape = input<'wide' | 'tall'>('wide');
  readonly company = input('');
  /** Width in px; defaults match the prototype. */
  readonly size = input<number | null>(null);

  protected readonly width = computed(() => this.size() ?? (this.shape() === 'tall' ? 150 : 300));
  protected readonly height = computed(() => Math.round(this.shape() === 'tall' ? (this.width() * 16) / 9 : (this.width() * 9) / 16));
}
