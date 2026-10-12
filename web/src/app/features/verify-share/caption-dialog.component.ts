import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, linkedSignal, output, viewChild } from '@angular/core';
import { captionLength } from '../../core/platforms';
import { PlatformIconComponent } from '../../shared/platform-icon.component';
import { PlatformState } from './share.store';

/** Caption confirm step before we post on the user's behalf (spec §9: never auto-post). */
@Component({
  selector: 'app-caption-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlatformIconComponent],
  template: `
    <dialog #dialog (cancel)="cancelled.emit()" aria-labelledby="caption-dialog-title">
      <form method="dialog" (submit)="$event.preventDefault(); onConfirm()">
        <header>
          <app-platform-icon [platform]="state().meta.platform" />
          <div>
            <h2 id="caption-dialog-title">Post to {{ state().meta.name }}</h2>
            @if (state().handle) {
              <p class="muted">Posting as <strong>&#64;{{ state().handle }}</strong> · visible to everyone</p>
            }
          </div>
        </header>

        <label for="caption-dialog-text">Caption</label>
        <textarea id="caption-dialog-text" rows="6" [value]="caption()" (input)="caption.set($any($event.target).value)"></textarea>
        @if (limit(); as max) {
          <p class="counter" [class.over]="length() > max">{{ length() }} / {{ max }}</p>
        }

        <footer>
          <button type="button" class="btn btn--ghost" (click)="cancelled.emit()">Cancel</button>
          <button type="submit" class="btn btn--primary" [disabled]="invalid()">Post now</button>
        </footer>
      </form>
    </dialog>
  `,
  styles: `
    dialog {
      width: min(520px, calc(100vw - 32px));
      padding: 0;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--surface);
      color: var(--text);
      box-shadow: 0 20px 50px rgb(0 0 0 / 0.2);
    }
    dialog::backdrop { background: rgb(15 23 42 / 0.45); }
    form { display: grid; gap: 10px; padding: 20px; }
    header { display: flex; gap: 12px; align-items: center; margin-bottom: 6px; }
    h2 { margin: 0; font-size: 17px; }
    header p { margin: 2px 0 0; font-size: 13px; }
    label { font-size: 13px; font-weight: 600; }
    textarea {
      width: 100%;
      box-sizing: border-box;
      resize: vertical;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font: inherit;
      color: inherit;
      background: var(--surface);
    }
    textarea:focus { outline: 2px solid var(--primary); outline-offset: -1px; }
    .counter { margin: -4px 0 0; text-align: right; font-size: 12px; color: var(--muted); }
    .counter.over { color: var(--chip-red); font-weight: 600; }
    footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
  `,
})
export class CaptionDialogComponent {
  readonly state = input.required<PlatformState>();
  readonly confirmed = output<string>();
  readonly cancelled = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly caption = linkedSignal(() => this.state().caption);
  protected readonly limit = computed(() => this.state().meta.captionLimit);
  protected readonly length = computed(() => captionLength(this.caption()));
  protected readonly invalid = computed(() => {
    const max = this.limit();
    return !this.caption().trim() || (max !== undefined && this.length() > max);
  });

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (!el.open) el.showModal();
    });
  }

  protected onConfirm(): void {
    if (!this.invalid()) this.confirmed.emit(this.caption().trim());
  }
}
