// Applies the saved theme before first paint to avoid a light/dark flash.
(function () {
  var pref = 'system';
  try { pref = localStorage.getItem('ember-theme') || 'system'; } catch (e) {}
  var dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
