(function () {
  try {
    var saved = localStorage.getItem('stockmate-theme');
    var theme =
      saved === 'dark' || saved === 'light'
        ? saved
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_err) {
    // Ignore storage access errors in restricted browsing modes
  }
})();
