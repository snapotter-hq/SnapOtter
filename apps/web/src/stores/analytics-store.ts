import type { AnalyticsConfig } from "@snapotter/shared";
import { create } from "zustand";
import { appUrl } from "@/lib/app-url";

interface AnalyticsState {
  config: AnalyticsConfig | null;
  configLoaded: boolean;
  fetchConfig: () => Promise<void>;
}

// Each fetch's number. A response that lands after a newer fetch was sent is
// stale: since a re-enable now resumes an opted-out tab, applying an old
// "enabled" over a newer opt-out would turn telemetry back on (#2197).
let latestFetch = 0;

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  config: null,
  configLoaded: false,
  // No one-shot guard: callers may refetch (e.g. on tab focus) so an
  // instance-wide opt-out converges in already-open tabs.
  fetchConfig: async () => {
    const mine = ++latestFetch;
    try {
      const res = await fetch(appUrl("/api/v1/config/analytics"));
      // An error body has no `enabled` and would read as an opt-out, which
      // the tab can't undo without a reload (#1115). Keep what we had.
      if (!res.ok) {
        if (mine === latestFetch) set({ configLoaded: true });
        return;
      }
      const config: AnalyticsConfig = await res.json();
      if (mine !== latestFetch) return;
      set({ config, configLoaded: true });
    } catch {
      if (mine === latestFetch) set({ configLoaded: true });
    }
  },
}));
