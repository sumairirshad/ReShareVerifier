import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ShareStatus } from '../core/share.models';

@Component({
  selector: 'app-status-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '"chip chip--" + status()',
    role: 'status',
    'aria-live': 'polite',
  },
  template: `{{ label() }}`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    :host(.chip--NotStarted) { background: var(--chip-grey-bg); color: var(--chip-grey); }
    :host(.chip--Pending) { background: var(--chip-amber-bg); color: var(--chip-amber); }
    :host(.chip--Verified) { background: var(--chip-green-bg); color: var(--chip-green); }
    :host(.chip--Failed) { background: var(--chip-red-bg); color: var(--chip-red); }
    :host(.chip--ManualReview) { background: var(--chip-blue-bg); color: var(--chip-blue); }
  `,
})
export class StatusChipComponent {
  readonly status = input.required<ShareStatus>();
  /** Publish flows say "Posting…" while pending; verify flows say "Checking…". */
  readonly publishing = input(false);

  protected readonly label = computed(() => {
    switch (this.status()) {
      case 'NotStarted':
        return 'Not shared';
      case 'Pending':
        return this.publishing() ? 'Posting…' : 'Checking…';
      case 'Verified':
        return '✓ Verified';
      case 'Failed':
        return 'Not found — retry';
      case 'ManualReview':
        return 'Under review';
    }
  });
}
