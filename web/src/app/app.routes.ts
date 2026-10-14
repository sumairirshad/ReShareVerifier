import { Routes } from '@angular/router';
import { environment } from '../environments/environment';

export const routes: Routes = [
  {
    path: 'ceremonies/:ceremonyId/verify-share',
    title: 'Verify Your Share · Tisoro',
    loadComponent: () => import('./features/verify-share/verify-share.page').then((m) => m.VerifySharePage),
  },
  {
    path: 'oauth/callback',
    title: 'Signing in…',
    loadComponent: () => import('./features/oauth-callback/oauth-callback.page').then((m) => m.OAuthCallbackPage),
  },
  ...(environment.useMockApi
    ? [
        {
          path: 'oauth/demo-consent',
          title: 'Demo sign-in',
          loadComponent: () => import('./core/mock/demo-consent.page').then((m) => m.DemoConsentPage),
        },
      ]
    : []),
  // Outside production there's no host app linking here with a real ceremony, so land on a demo one.
  ...(!environment.production ? [{ path: '', pathMatch: 'full' as const, redirectTo: 'ceremonies/demo/verify-share' }] : []),
];
