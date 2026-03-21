import { useEffect } from "react";
import { useThemeStore } from "../stores/theme-store";

export function useTheme() {
  const { theme, resolvedTheme, setTheme } = useThemeStore();

  useEffect(() => {
    const resolved =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [theme]);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return { theme, resolvedTheme, setTheme, toggleTheme };
}
