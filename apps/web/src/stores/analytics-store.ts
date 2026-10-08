import type { AnalyticsConfig } from "@snapotter/shared";
import { create } from "zustand";
import { appUrl } from "@/lib/app-url";

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
      const res = await fetch(appUrl("/api/v1/config/analytics"));
      // An error body has no `enabled` and would read as an opt-out, which
      // the tab can't undo without a reload (#1115). Keep what we had.
      if (!res.ok) {
        set({ configLoaded: true });
        return;
      }
      const config: AnalyticsConfig = await res.json();
      set({ config, configLoaded: true });
    } catch {
      set({ configLoaded: true });
    }
  },
}));
