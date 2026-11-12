(() => {
  const key = "matths-exchange-theme";
  const root = document.documentElement;
  try {
    if (localStorage.getItem(key) === "light") root.dataset.theme = "light";
  } catch {
    // Keep the default theme when browser storage is unavailable.
  }

  document.addEventListener("DOMContentLoaded", () => {
    const button = document.getElementById("exchange-theme-toggle");
    if (!button) return;

    function updateLabel() {
      const label = root.dataset.theme === "light" ? "다크 모드로 전환" : "라이트 모드로 전환";
      button.setAttribute("aria-label", label);
      button.title = label;
    }

    function applyTheme(theme) {
      root.dataset.theme = theme;
      updateLabel();
      document.dispatchEvent(new Event("exchange-theme-change"));
    }

    button.addEventListener("click", () => {
      const theme = root.dataset.theme === "light" ? "dark" : "light";
      applyTheme(theme);
      try {
        localStorage.setItem(key, theme);
      } catch {
        // The active page can still switch themes.
      }
    });

    window.addEventListener("storage", (event) => {
      if (event.key === key) applyTheme(event.newValue === "light" ? "light" : "dark");
    });
    updateLabel();
  }, { once: true });
})();
