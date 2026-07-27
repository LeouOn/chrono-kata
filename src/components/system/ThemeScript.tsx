export const THEME_INLINE_SCRIPT = `
(function() {
  try {
    var raw = localStorage.getItem('chrono-kata-theme');
    var parsed = raw ? JSON.parse(raw) : {};
    var theme = parsed.theme || 'system';
    var accent = parsed.accent || 'amber';
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    document.documentElement.setAttribute('data-accent', accent);
  } catch (e) {
  }
})();
`;
