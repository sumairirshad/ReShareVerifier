export const environment = {
  production: true,
  /** Base URL of the .NET API. Empty = same origin (served behind the API or via the dev proxy). */
  apiBaseUrl: '',
  /** SignalR hub path, relative to apiBaseUrl. */
  shareHubPath: '/hubs/share',
  /** When true, HTTP calls, OAuth and SignalR are served by an in-browser fake backend. */
  useMockApi: false,
};
