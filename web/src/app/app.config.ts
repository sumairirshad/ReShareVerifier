import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { environment } from '../environments/environment';
import { MockShareBackend, mockShareBackendInterceptor } from './core/mock/mock-share-backend';
import { ShareRealtime, SignalRShareRealtime } from './core/share-realtime';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // Add the host app's auth interceptor here so share/OAuth-start calls carry the user's identity.
    provideHttpClient(withFetch(), withInterceptors(environment.useMockApi ? [mockShareBackendInterceptor] : [])),
    environment.useMockApi
      ? { provide: ShareRealtime, useExisting: MockShareBackend }
      : { provide: ShareRealtime, useClass: SignalRShareRealtime },
  ],
};
