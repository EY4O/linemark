// Publisher configuration for optional sync ("Sign in with Google").
//
// Fill these in once, after creating Linemark's Google Cloud project (docs/SYNC.md → "Publisher setup"):
//   - manifest.json → "oauth2.client_id": the Chrome Extension client, for one-click sign-in in Google Chrome
//   - GOOGLE_WEB_CLIENT_ID below: the Web application client, for Edge, Brave and Vivaldi
//
// While these are placeholders, sync still works: users choose "Use your own Google project" in Settings.

export const GOOGLE_WEB_CLIENT_ID = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';

export const isConfigured = (id) => typeof id === 'string' && /\.apps\.googleusercontent\.com$/.test(id) && !id.startsWith('YOUR_');
