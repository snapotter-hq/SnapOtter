import type { AnalyticsConfig } from "@snapotter/shared";
import { create } from "zustand";

interface AnalyticsState {
  config: AnalyticsConfig | null;
  configLoaded: boolean;
  fetchConfig: () => Promise<void>;
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  config: null,
  configLoaded: false,
  // No one-shot guard: callers may refetch (e.g. on tab focus) so an
  // instance-wide opt-out converges in already-open tabs.
  fetchConfig: async () => {
    try {
      const res = await fetch("/api/v1/config/analytics");
      const config: AnalyticsConfig = await res.json();
      set({ config, configLoaded: true });
    } catch {
      set({ configLoaded: true });
    }
  },
}));
