import type { AnalyticsConfig, ConsentState } from "@snapotter/shared";
import { create } from "zustand";
import { setAnalyticsConsent } from "@/lib/analytics";
import { apiPut } from "@/lib/api";

interface AnalyticsState {
  config: AnalyticsConfig | null;
  consent: ConsentState;
  configLoaded: boolean;
  fetchConfig: () => Promise<void>;
  setConsent: (consent: ConsentState) => void;
  acceptAnalytics: () => Promise<void>;
  declineAnalytics: () => Promise<void>;
  remindLater: () => Promise<void>;
  toggleAnalytics: (enabled: boolean) => Promise<void>;
}

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  config: null,
  consent: {
    analyticsEnabled: null,
    analyticsConsentShownAt: null,
    analyticsConsentRemindAt: null,
  },
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

  setConsent: (consent: ConsentState) => {
    set({ consent });
    setAnalyticsConsent(consent.analyticsEnabled === true);
  },

  acceptAnalytics: async () => {
    try {
      await apiPut("/v1/user/analytics", { enabled: true });
    } catch {
      localStorage.setItem("snapotter-analytics-consent", "true");
    }
    const now = Date.now();
    const consent: ConsentState = {
      analyticsEnabled: true,
      analyticsConsentShownAt: now,
      analyticsConsentRemindAt: null,
    };
    set({ consent });
    setAnalyticsConsent(true);
  },

  declineAnalytics: async () => {
    try {
      await apiPut("/v1/user/analytics", { enabled: false });
    } catch {
      localStorage.setItem("snapotter-analytics-consent", "false");
    }
    const now = Date.now();
    const consent: ConsentState = {
      analyticsEnabled: false,
      analyticsConsentShownAt: now,
      analyticsConsentRemindAt: null,
    };
    set({ consent });
    setAnalyticsConsent(false);
  },

  remindLater: async () => {
    try {
      await apiPut("/v1/user/analytics", { remindLater: true });
    } catch {
      localStorage.setItem("snapotter-analytics-consent", "remind");
    }
    const now = Date.now();
    const consent: ConsentState = {
      analyticsEnabled: null,
      analyticsConsentShownAt: now,
      analyticsConsentRemindAt: now + 7 * 24 * 60 * 60 * 1000,
    };
    set({ consent });
    setAnalyticsConsent(false);
  },

  toggleAnalytics: async (enabled: boolean) => {
    try {
      await apiPut("/v1/user/analytics", { enabled });
    } catch {
      localStorage.setItem("snapotter-analytics-consent", enabled ? "true" : "false");
    }
    set((state) => ({
      consent: { ...state.consent, analyticsEnabled: enabled },
    }));
    setAnalyticsConsent(enabled);
  },
}));
