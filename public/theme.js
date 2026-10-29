// Set the theme before first paint so dark mode never flashes white.
(function () {
  var t = null;
  try { t = localStorage.getItem('stackr:theme'); } catch (e) {}
  if (t !== 'light' && t !== 'dark') t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  document.documentElement.style.colorScheme = t;
})();
