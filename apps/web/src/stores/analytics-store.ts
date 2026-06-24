import type { AnalyticsConfig } from "@snapotter/shared";
import { create } from "zustand";

interface AnalyticsState {
  config: AnalyticsConfig | null;
  configLoaded: boolean;
  fetchConfig: () => Promise<void>;
}

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  config: null,
  configLoaded: false,
  fetchConfig: async () => {
    if (get().configLoaded) return;
    try {
      const res = await fetch("/api/v1/config/analytics");
      const config: AnalyticsConfig = await res.json();
      set({ config, configLoaded: true });
    } catch {
      set({ configLoaded: true });
    }
  },
}));
