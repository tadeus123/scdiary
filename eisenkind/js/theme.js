(function () {
  const toggle = document.getElementById("theme-toggle");
  const themeColorMeta = document.getElementById("theme-color");
  const stored = localStorage.getItem("theme");

  function applyTheme(dark) {
    if (dark) {
      document.documentElement.setAttribute("data-theme", "dark");
      if (themeColorMeta) themeColorMeta.content = "#000000";
    } else {
      document.documentElement.removeAttribute("data-theme");
      if (themeColorMeta) themeColorMeta.content = "#EFE8DC";
    }
  }

  applyTheme(stored === "dark");

  toggle?.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const nextDark = !isDark;
    applyTheme(nextDark);
    localStorage.setItem("theme", nextDark ? "dark" : "light");
  });
})();
