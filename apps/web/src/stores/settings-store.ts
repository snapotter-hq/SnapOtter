import { create } from "zustand";
import { apiGet } from "@/lib/api";
import { useThemeStore } from "./theme-store";

type Theme = "light" | "dark" | "system";

interface SettingsState {
  disabledTools: string[];
  experimentalEnabled: boolean;
  defaultToolView: "sidebar" | "fullscreen";
  defaultTheme: Theme;
  loaded: boolean;
  fetch: () => Promise<void>;
}

const VALID_THEMES = new Set(["light", "dark", "system"]);

export const useSettingsStore = create<SettingsState>((set, get) => ({
  disabledTools: [],
  experimentalEnabled: false,
  defaultToolView: "sidebar",
  defaultTheme: "light",
  loaded: false,

  fetch: async () => {
    if (get().loaded) return;
    try {
      const data = await apiGet<{
        settings: Record<string, string>;
      }>("/v1/settings");

      const defaultTheme = VALID_THEMES.has(data.settings.defaultTheme)
        ? (data.settings.defaultTheme as Theme)
        : "light";

      set({
        disabledTools: data.settings.disabledTools ? JSON.parse(data.settings.disabledTools) : [],
        experimentalEnabled: data.settings.enableExperimentalTools === "true",
        defaultToolView: data.settings.defaultToolView === "fullscreen" ? "fullscreen" : "sidebar",
        defaultTheme,
        loaded: true,
      });

      useThemeStore.getState().applyServerDefault(defaultTheme);
    } catch {
      set({ loaded: true });
    }
  },
}));
