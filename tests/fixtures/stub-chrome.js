// Test-only stand-in for the chrome.* APIs, so app.html can run as a plain page under test.
window.chrome = {
  runtime: { id: 'test', getURL: () => '/icons/icon32.png', sendMessage: async () => ({}) },
  permissions: { request: async () => true, contains: async () => true, remove: async () => true },
  tabs: { create: () => {} },
};
