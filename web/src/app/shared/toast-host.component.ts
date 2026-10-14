import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ToastService } from './toast.service';

/** Single dark toast at the bottom centre, as in the prototype. */
@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast" [class.on]="!!latest()" [class.error]="latest()?.kind === 'error'" role="status" aria-live="polite">
      {{ latest()?.message }}
    </div>
  `,
  styles: `
    .toast {
      position: fixed; left: 50%; bottom: 24px; z-index: 80; max-width: calc(100% - 32px);
      transform: translateX(-50%) translateY(16px); opacity: 0; pointer-events: none; transition: 0.25s;
      background: #2b2b2b; color: #fff; padding: 11px 16px; border-radius: 10px; font-size: 14px; font-weight: 600;
    }
    .toast.on { opacity: 1; transform: translateX(-50%); }
    .toast.error { background: var(--crimson); }
  `,
})
export class ToastHostComponent {
  private readonly toasts = inject(ToastService);
  protected readonly latest = computed(() => this.toasts.toasts().at(-1));
}
