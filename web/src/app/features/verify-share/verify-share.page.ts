import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { environment } from '../../../environments/environment';
import { PublishPlatform } from '../../core/share-api.service';
import { CaptionDialogComponent } from './caption-dialog.component';
import { PlatformCardComponent } from './platform-card.component';
import { ShareStore } from './share.store';

@Component({
  selector: 'app-verify-share-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlatformCardComponent, CaptionDialogComponent],
  providers: [ShareStore],
  templateUrl: './verify-share.page.html',
  styleUrl: './verify-share.page.scss',
})
export class VerifySharePage {
  protected readonly store = inject(ShareStore);
  protected readonly demoMode = environment.useMockApi;

  /** Bound from the route via withComponentInputBinding(). */
  readonly ceremonyId = input.required<string>();

  constructor() {
    effect(() => void this.store.load(this.ceremonyId()));
  }

  protected confirmPublish(platform: string, caption: string): void {
    void this.store.confirmPublish(platform as PublishPlatform, caption);
  }
}
