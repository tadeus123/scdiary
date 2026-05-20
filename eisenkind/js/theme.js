(function () {
  const toggle = document.getElementById("theme-toggle");
  const themeColorMeta = document.getElementById("theme-color");
  const STORAGE_KEY = "theme";

  function getTheme() {
    return localStorage.getItem(STORAGE_KEY) || "light";
  }

  function applyTheme(theme) {
    const dark = theme === "dark";
    if (dark) {
      document.documentElement.setAttribute("data-theme", "dark");
      if (themeColorMeta) themeColorMeta.content = "#000000";
    } else {
      document.documentElement.removeAttribute("data-theme");
      if (themeColorMeta) themeColorMeta.content = "#EFE8DC";
    }
  }

  applyTheme(getTheme());

  toggle?.addEventListener("click", () => {
    const next = getTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
  });

  // Keep in sync when theme changes on another tademehl page (same origin)
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      applyTheme(e.newValue);
    }
  });
})();
