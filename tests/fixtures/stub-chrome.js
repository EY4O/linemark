// Test-only stand-in for the chrome.* APIs, so app.html can run as a plain page under test.
// Sync talks to the suite's local stand-in for Google Drive instead of googleapis.com.
window.__EMBER_TEST_DRIVE__ = location.origin + '/__drive';
window.chrome = {
  runtime: { id: 'test', getURL: () => '/icons/icon32.png', sendMessage: async () => ({}) },
  permissions: { request: async () => true, contains: async () => true, remove: async () => true },
  tabs: { create: () => {} },
  identity: {
    getRedirectURL: (path = '') => 'https://test-extension.chromiumapp.org/' + path,
    launchWebAuthFlow: async ({ url }) => {
      const redirect = new URL(url).searchParams.get('redirect_uri');
      return `${redirect}#access_token=test-token&expires_in=3600&token_type=Bearer`;
    },
  },
};
