import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Tisoro onboarding layout: dark rail, B.O.L.D. panel, content column. */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="rail" aria-hidden="true"><span class="mark">T</span></aside>
    <div class="panel" aria-hidden="true">
      <div class="tagline">Your Business.<br />Your Expertise.<br />Our Recognition.</div>
    </div>
    <main class="content"><ng-content /></main>
  `,
  styles: `
    :host { display: grid; grid-template-columns: 80px minmax(320px, 38vw) minmax(0, 1fr); min-height: 100vh; }
    .rail { background: var(--dark); position: sticky; top: 0; height: 100vh; display: flex; align-items: center; justify-content: center; }
    .mark { width: 46px; height: 46px; border-radius: 10px; background: var(--crimson); color: #fff; font-family: Georgia, serif; font-size: 26px; display: grid; place-items: center; }
    .panel { position: sticky; top: 0; height: 100vh; border-radius: 0 48px 48px 0; overflow: hidden; background: linear-gradient(165deg, #d9d2cc 0%, #b9aea6 55%, #8f827a 100%); }
    .tagline { position: absolute; right: 0; bottom: 12%; background: rgba(58, 55, 55, 0.9); color: #fff; font-weight: 700; font-size: 19px; line-height: 1.42; padding: 14px 26px; border-radius: 10px 0 0 10px; }
    .content { max-width: 1000px; padding: 48px clamp(16px, 4vw, 72px) 80px; display: flex; flex-direction: column; gap: 22px; min-width: 0; }
    @media (max-width: 1100px) { :host { grid-template-columns: 80px minmax(0, 1fr); } .panel { display: none; } }
    @media (max-width: 720px) { :host { grid-template-columns: minmax(0, 1fr); } .rail { display: none; } }
  `,
})
export class ShellComponent {}
