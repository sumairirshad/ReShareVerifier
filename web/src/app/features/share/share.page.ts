import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { PlatformIconComponent } from '../../shared/platform-icon.component';
import { ShellComponent } from '../../shared/shell.component';
import { ToastService } from '../../shared/toast.service';
import { DialogRequest, ShareDialogComponent } from './share-dialog.component';
import { Row, ShareStore } from './share.store';

/** Tisoro screen 09 — "Your Tisoro Network Induction Ceremony Is Live" with the share card. */
@Component({
  selector: 'app-share-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ShellComponent, PlatformIconComponent, ShareDialogComponent],
  providers: [ShareStore],
  templateUrl: './share.page.html',
  styleUrl: './share.page.scss',
})
export class SharePage {
  protected readonly store = inject(ShareStore);
  private readonly toast = inject(ToastService);

  /** Bound from the route via withComponentInputBinding(). */
  readonly ceremonyId = input.required<string>();

  protected readonly dialog = signal<DialogRequest | null>(null);

  constructor() {
    effect(() => void this.store.load(this.ceremonyId()));
  }

  protected share(row: Row): void {
    const paths = row.config.paths.filter((p) => row.meta.paths[p]);
    this.dialog.set(paths.length > 1 ? { mode: 'chooser', platform: row.meta.platform } : { mode: 'flow', platform: row.meta.platform, path: paths[0] });
  }

  /** Row subtitle: how it works before sharing, how it was confirmed after. */
  protected how(row: Row): string {
    const { meta, sub } = row;
    switch (sub.status) {
      case 'Verified':
        return `Confirmed by ${meta.name}. ${sub.path ? meta.paths[sub.path]?.label : ''}.`;
      case 'SelfConfirmed':
        return `You confirmed this share. ${meta.name} doesn’t report it to us.`;
      case 'Waiting':
        return meta.platform === 'instagram'
          ? 'Waiting for Instagram to tell us about your @tisoroglobal mention. You can leave this page.'
          : 'TikTok is processing your video. You can leave this page.';
      default:
        return sub.failureReason ?? meta.how;
    }
  }

  protected doneLabel(row: Row): string {
    return (row.sub.path && row.meta.paths[row.sub.path]?.done) || 'Shared';
  }

  protected continue(): void {
    if (environment.continueUrl) window.location.href = environment.continueUrl;
    else this.toast.show('Continues to screen 10: Activate Your Office');
  }
}
