// Test-only stand-in for the chrome.* APIs, so app.html can run as a plain page under test.
// Sync talks to the suite's local stand-in for Google Drive instead of googleapis.com.
//
// ?sso=chrome  this "browser" has Chrome's one-click Google sign-in (manifest oauth2 configured)
// ?sso=edge    oauth2 is configured but getAuthToken fails, as in Edge/Brave; a built-in web client exists
// (none)       no built-in sign-in: the user brings their own Google project
const sso = new URLSearchParams(location.search).get('sso');
window.__LINEMARK_TEST_DRIVE__ = location.origin + '/__drive';
window.__LINEMARK_TEST_ARCHIVE__ = location.origin + '/__archive';
// Chrome's built-in AI, answering with a fixed suggestion
window.LanguageModel = {
  availability: async () => 'available',
  create: async () => ({ prompt: async () => JSON.stringify({ line: 'Design/Interfaces', tags: ['ui', 'Layout', 'colour'], summary: 'A practical guide to designing interfaces.' }), destroy() {} }),
};
// tab groups: tabs made, groups formed and their titles and colours, so tests can check them
window.__tabCalls = { created: [], groups: [] };
let __tabId = 100;
if (sso === 'edge') window.__LINEMARK_TEST_WEB_CLIENT__ = 'built-in-web.apps.googleusercontent.com';
window.__authCalls = { getAuthToken: 0, launchWebAuthFlow: 0 };
window.chrome = {
  runtime: {
    id: 'test',
    getURL: () => '/icons/icon32.png',
    sendMessage: async () => ({}),
    getManifest: () => ({ oauth2: { client_id: sso ? 'chrome-ext.apps.googleusercontent.com' : 'YOUR_CHROME_EXTENSION_CLIENT_ID.apps.googleusercontent.com' } }),
  },
  permissions: { request: async () => true, contains: async () => true, remove: async () => true },
  tabs: {
    create: async ({ url }) => { const t = { id: ++__tabId, url }; window.__tabCalls.created.push(t); return t; },
    group: async ({ tabIds }) => { const g = { id: 900 + window.__tabCalls.groups.length, tabIds }; window.__tabCalls.groups.push(g); return g.id; },
    query: async ({ groupId }) => (groupId === 1 ? [{ url: 'https://example.com/a', title: 'Tab A' }, { url: 'https://example.com/b', title: 'Tab B' }, { url: 'chrome://settings', title: 'Settings' }] : []),
  },
  tabGroups: {
    update: async (id, props) => { Object.assign(window.__tabCalls.groups.find((g) => g.id === id), props); },
    query: async () => [{ id: 1, title: 'Research trip', color: 'cyan' }],
  },
  identity: {
    getRedirectURL: (path = '') => 'https://test-extension.chromiumapp.org/' + path,
    getAuthToken: async () => {
      window.__authCalls.getAuthToken++;
      if (sso !== 'chrome') throw new Error('This API is not supported on Microsoft Edge.');
      return { token: 'test-token', grantedScopes: ['https://www.googleapis.com/auth/drive.appdata'] };
    },
    removeCachedAuthToken: async () => {},
    launchWebAuthFlow: async ({ url }) => {
      window.__authCalls.launchWebAuthFlow++;
      const redirect = new URL(url).searchParams.get('redirect_uri');
      return `${redirect}#access_token=test-token&expires_in=3600&token_type=Bearer`;
    },
  },
};
