import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (t of toasts.toasts(); track t.id) {
      <div class="toast" [class]="'toast toast--' + t.kind" role="status">
        <span>{{ t.message }}</span>
        <button type="button" aria-label="Dismiss" (click)="toasts.dismiss(t.id)">×</button>
      </div>
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: auto 16px 16px auto;
      z-index: 1000;
      display: grid;
      gap: 8px;
      max-width: min(360px, calc(100vw - 32px));
    }
    .toast {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 14px;
      color: #fff;
      background: #111827;
      box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
    }
    .toast--success { background: #15803d; }
    .toast--error { background: #b91c1c; }
    span { flex: 1; }
    button { border: 0; background: none; color: inherit; font-size: 18px; line-height: 1; cursor: pointer; }
  `,
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);
}
