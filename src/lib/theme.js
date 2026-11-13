// Theme: light warm alabaster is the default. First load respects a saved
// choice; without one the light theme wins (dark is the manual toggle).
// The choice is persisted in localStorage.
const STORAGE_KEY = "grantflow-theme";

export function systemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function initialTheme() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage unavailable (private mode) — fall through to the default.
  }
  return "light";
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
