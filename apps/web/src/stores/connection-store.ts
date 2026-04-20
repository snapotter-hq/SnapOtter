import { create } from "zustand";

type ConnectionStatus = "connected" | "disconnected" | "reconnected" | "offline";

interface ConnectionState {
  status: ConnectionStatus;
  failedSince: number | null;
  lastHealthCheck: number | null;

  setDisconnected: () => void;
  setOffline: () => void;
  setOnline: () => void;
  checkHealth: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  refreshStaleData: () => Promise<void>;
}

let pollingInterval: ReturnType<typeof setInterval> | null = null;

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  status: "connected",
  failedSince: null,
  lastHealthCheck: null,

  setDisconnected: () => {
    const current = get();
    if (current.status === "disconnected") return;
    set({
      status: "disconnected",
      failedSince: current.failedSince ?? Date.now(),
    });
  },

  setOffline: () => {
    set({ status: "offline", failedSince: get().failedSince ?? Date.now() });
  },

  setOnline: () => {
    if (get().status !== "offline") return;
    set({ status: "disconnected" });
  },

  checkHealth: async () => {
    try {
      const res = await fetch("/api/v1/health");
      if (res.ok) {
        const current = get().status;
        if (current === "disconnected" || current === "offline") {
          set({ status: "reconnected", lastHealthCheck: Date.now(), failedSince: null });
        } else {
          set({ lastHealthCheck: Date.now() });
        }
      } else {
        if (get().status === "connected") {
          get().setDisconnected();
        }
      }
    } catch {
      if (get().status === "connected") {
        get().setDisconnected();
      }
    }
  },

  startPolling: () => {
    if (pollingInterval) return;
    pollingInterval = setInterval(() => {
      get().checkHealth();
    }, 3000);
  },

  stopPolling: () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  },

  refreshStaleData: async () => {
    const { useSettingsStore } = await import("@/stores/settings-store");
    const { useFeaturesStore } = await import("@/stores/features-store");

    useSettingsStore.setState({ loaded: false });
    await Promise.allSettled([
      useSettingsStore.getState().fetch(),
      useFeaturesStore.getState().refresh(),
    ]);
  },
}));
