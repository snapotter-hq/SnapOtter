import { create } from "zustand";
import { apiGet } from "@/lib/api";

interface SettingsState {
  variant: "full" | "lite";
  variantUnavailableTools: string[];
  disabledTools: string[];
  experimentalEnabled: boolean;
  loaded: boolean;
  fetch: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  variant: "full",
  variantUnavailableTools: [],
  disabledTools: [],
  experimentalEnabled: false,
  loaded: false,

  fetch: async () => {
    if (get().loaded) return;
    try {
      const data = await apiGet<{
        settings: Record<string, string>;
        variant: "full" | "lite";
        variantUnavailableTools: string[];
      }>("/v1/settings");

      set({
        variant: data.variant ?? "full",
        variantUnavailableTools: data.variantUnavailableTools ?? [],
        disabledTools: data.settings.disabledTools ? JSON.parse(data.settings.disabledTools) : [],
        experimentalEnabled: data.settings.enableExperimentalTools === "true",
        loaded: true,
      });
    } catch {
      // Settings fetch failed - default to full with no disabled tools
      set({ loaded: true });
    }
  },
}));
