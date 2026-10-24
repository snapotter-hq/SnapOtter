import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

type Theme = "light" | "dark" | "system";

const USER_THEME_KEY = "snapotter-theme-user-set";

// Remembers an explicit setTheme() call in memory when localStorage.setItem
// throws so a later applyServerDefault() does not overwrite the user's choice.
let userSetFallback = false;

const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // Storage blocked or full
    }
  },
  removeItem: (name) => {
    userSetFallback = false;
    try {
      localStorage.removeItem(name);
    } catch {
      // Storage blocked
    }
  },
};

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
        try {
          localStorage.setItem(USER_THEME_KEY, "1");
          userSetFallback = false;
        } catch {
          userSetFallback = true;
        }
        set({ theme, resolvedTheme: resolved });
      },
      applyServerDefault: (theme) => {
        if (userSetFallback) return;
        try {
          if (localStorage.getItem(USER_THEME_KEY)) return;
        } catch {
          // Storage blocked
        }
        const resolved = applyTheme(theme);
        set({ theme, resolvedTheme: resolved });
      },
    }),
    {
      name: "snapotter-theme",
      storage: createJSONStorage(() => safeLocalStorage),
    },
  ),
);
