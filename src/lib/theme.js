// Theme: dark "Aurora Deep Dark" is the default. First load respects the
// system preference; the manual toggle wins after that and is persisted
// in localStorage (2026 guidance — detect first, toggle persisted).
const STORAGE_KEY = "grantflow-theme";

export function systemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function initialTheme() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage unavailable (private mode) — fall through to the system.
  }
  return systemTheme();
}

export function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  try {
    window.localStorage.setItem(STORAGE_KEY, t);
  } catch {
    // Non-fatal: the choice just won't persist.
  }
  return t;
}

export function toggleTheme(current) {
  return applyTheme(current === "light" ? "dark" : "light");
}
