import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark" | "system";

const USER_THEME_KEY = "snapotter-theme-user-set";

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";
  applyServerDefault: (theme: Theme) => void;
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme): "light" | "dark" {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  return resolved;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: "light" as Theme,
      resolvedTheme: "light" as const,
      setTheme: (theme) => {
        const resolved = applyTheme(theme);
        localStorage.setItem(USER_THEME_KEY, "1");
        set({ theme, resolvedTheme: resolved });
      },
      applyServerDefault: (theme) => {
        if (localStorage.getItem(USER_THEME_KEY)) return;
        const resolved = applyTheme(theme);
        set({ theme, resolvedTheme: resolved });
      },
    }),
    { name: "snapotter-theme" },
  ),
);
