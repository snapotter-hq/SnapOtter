import { useEffect } from "react";
import { useConnectionStore } from "@/stores/connection-store";

export function useConnectionMonitor() {
  useEffect(() => {
    const store = useConnectionStore;

    const handleOffline = () => store.getState().setOffline();
    const handleOnline = () => {
      const prev = store.getState().status;
      store.getState().setOnline();
      if (prev === "offline") {
        store.getState().startPolling();
      }
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    store.getState().checkHealth();

    const unsubscribe = store.subscribe((state, prev) => {
      if (state.status === prev.status) return;

      if (state.status === "disconnected") {
        store.getState().startPolling();
      }

      if (state.status === "reconnected") {
        store.getState().stopPolling();
        store
          .getState()
          .refreshStaleData()
          .finally(() => {
            setTimeout(() => {
              if (store.getState().status === "reconnected") {
                store.setState({ status: "connected" });
              }
            }, 2500);
          });
      }

      if (state.status === "offline") {
        store.getState().stopPolling();
      }
    });

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      store.getState().stopPolling();
      unsubscribe();
    };
  }, []);
}
