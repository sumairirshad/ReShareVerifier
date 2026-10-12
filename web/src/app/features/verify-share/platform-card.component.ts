import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { captionLength } from '../../core/platforms';
import { PublishPlatform } from '../../core/share-api.service';
import { PlatformIconComponent } from '../../shared/platform-icon.component';
import { StatusChipComponent } from '../../shared/status-chip.component';
import { PlatformState, ShareStore } from './share.store';

/**
 * One platform, three steps: Connect (OAuth, fills the handle) → Share → Submit.
 * LinkedIn/Instagram/TikTok fold Share+Submit into one: we post for them, so it verifies itself.
 */
@Component({
  selector: 'app-platform-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlatformIconComponent, StatusChipComponent],
  templateUrl: './platform-card.component.html',
  styleUrl: './platform-card.component.scss',
})
export class PlatformCardComponent {
  protected readonly store = inject(ShareStore);
  readonly state = input.required<PlatformState>();

  protected readonly captionOpen = signal(false);

  protected readonly platform = computed(() => this.state().meta.platform);
  protected readonly flow = computed(() => this.state().meta.flow);
  protected readonly comingSoon = computed(() => this.state().config.availability === 'comingSoon');
  protected readonly verified = computed(() => this.state().status === 'Verified');
  protected readonly pending = computed(() => this.state().status === 'Pending');
  protected readonly retry = computed(() => this.state().status === 'Failed');
  /** No further actions while a request is in flight, a check is running, or it's already done. */
  protected readonly locked = computed(() => this.state().busy || this.pending() || this.verified());
  /** Step 1 done. X may skip OAuth by typing a handle. */
  protected readonly ready = computed(
    () => this.state().connected || (this.flow() === 'intentHandle' && !!this.state().handle.trim()),
  );

  protected readonly primaryLabel = computed(() => {
    const s = this.state();
    if (!this.ready()) return s.busy ? 'Connecting…' : 'Connect';
    if (this.retry()) return 'Retry';
    return this.flow() === 'oauthPublish' ? 'Share' : 'Submit';
  });

  protected readonly primaryDisabled = computed(() => {
    if (this.locked()) return true;
    if (!this.ready()) return false;
    // X / Facebook: we can only find the post once they've actually shared it.
    return this.flow() !== 'oauthPublish' && !this.state().shareClicked;
  });

  protected readonly hint = computed(() => {
    const s = this.state();
    if (this.verified() || s.status === 'ManualReview') {
      return s.status === 'ManualReview' ? 'Our team is reviewing your screenshot. This usually takes less than a day.' : null;
    }
    if (!this.ready()) {
      return this.flow() === 'intentHandle'
        ? 'Connect your X account so we can fill in your handle — or type it yourself.'
        : `Connect your ${s.meta.name} account first. We'll fill in your handle.`;
    }
    switch (this.flow()) {
      case 'intentHandle':
        return s.shareClicked ? null : 'Tap Share on X and post the quote, then tap Submit.';
      case 'sharerOAuthVerify':
        return s.shareClicked
          ? 'Posted it publicly with the caption pasted in? Tap Submit.'
          : "Facebook won't prefill text — tap Share, paste the copied caption, set the post to Public, then tap Submit.";
      case 'oauthPublish':
        return this.pending() ? null : 'Tap Share to review the caption — we post it publicly for you.';
    }
  });

  protected readonly captionLength = computed(() => captionLength(this.state().caption));
  protected readonly captionTooLong = computed(() => {
    const max = this.state().meta.captionLimit;
    return max !== undefined && this.captionLength() > max;
  });
  protected readonly showScreenshotFallback = computed(
    () => !this.verified() && !this.pending() && (this.retry() || !!this.state().needsProfessionalAccount),
  );

  protected onPrimary(event: Event): void {
    event.preventDefault();
    if (!this.ready()) {
      void this.store.connect(this.platform());
      return;
    }
    switch (this.flow()) {
      case 'intentHandle':
        void this.store.verifyX();
        break;
      case 'sharerOAuthVerify':
        void this.store.verifyFacebook();
        break;
      case 'oauthPublish':
        this.store.openPublish(this.platform() as PublishPlatform);
        break;
    }
  }

  protected onCaptionInput(event: Event): void {
    this.store.setCaption(this.platform(), (event.target as HTMLTextAreaElement).value);
  }

  protected onHandleInput(event: Event): void {
    this.store.setHandle(this.platform(), (event.target as HTMLInputElement).value);
  }

  protected onScreenshotChosen(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (file) void this.store.uploadScreenshot(this.platform(), file);
  }
}
