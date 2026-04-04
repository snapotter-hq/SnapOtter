import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark" | "system";

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: "light" as Theme,
      resolvedTheme: "light" as const,
      setTheme: (theme) => {
        const resolved = theme === "system" ? getSystemTheme() : theme;
        document.documentElement.classList.toggle("dark", resolved === "dark");
        set({ theme, resolvedTheme: resolved });
      },
    }),
    { name: "stirling-image-theme" },
  ),
);
