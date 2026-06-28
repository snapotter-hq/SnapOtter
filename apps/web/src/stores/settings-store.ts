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
  loadError: boolean;
  fetch: () => Promise<void>;
}

const VALID_THEMES = new Set(["light", "dark", "system"]);

// De-duplicate concurrent fetches. Several components (AppLayout, the home grid,
// the connection monitor) call fetch() on mount; without this guard they would
// each fire a /v1/settings request before `loaded` flips, inflating the initial
// network load.
let inFlight: Promise<void> | null = null;

export const useSettingsStore = create<SettingsState>((set, get) => ({
  disabledTools: [],
  experimentalEnabled: false,
  defaultToolView: "sidebar",
  defaultTheme: "light",
  loaded: false,
  loadError: false,

  fetch: async () => {
    if (get().loaded && !get().loadError) return;
    if (inFlight) return inFlight;

    inFlight = (async () => {
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
          defaultToolView:
            data.settings.defaultToolView === "fullscreen" ? "fullscreen" : "sidebar",
          defaultTheme,
          loaded: true,
          loadError: false,
        });

        useThemeStore.getState().applyServerDefault(defaultTheme);
      } catch {
        set({ loaded: true, loadError: true });
      }
    })();

    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
  },
}));
