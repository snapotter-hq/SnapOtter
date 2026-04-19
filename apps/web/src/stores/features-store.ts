import type { FeatureBundleState } from "@ashim/shared";
import { TOOL_BUNDLE_MAP } from "@ashim/shared";
import { create } from "zustand";
import { apiGet, apiPost } from "@/lib/api";

interface BundleProgress {
  percent: number;
  stage: string;
}

interface FeaturesState {
  bundles: FeatureBundleState[];
  loaded: boolean;
  installing: Record<string, BundleProgress>;
  errors: Record<string, string>;
  queued: string[];
  installAllActive: boolean;
  startTimes: Record<string, number>;

  fetch: () => Promise<void>;
  refresh: () => Promise<void>;
  isToolInstalled: (toolId: string) => boolean;
  getBundleForTool: (toolId: string) => FeatureBundleState | null;
  installBundle: (bundleId: string) => Promise<void>;
  uninstallBundle: (bundleId: string) => Promise<void>;
  reinstallBundle: (bundleId: string) => Promise<void>;
  installAll: () => Promise<void>;
  clearError: (bundleId: string) => void;
}

export const useFeaturesStore = create<FeaturesState>((set, get) => {
  const esRefs: Record<string, EventSource> = {};
  const pollRefs: Record<string, ReturnType<typeof setInterval>> = {};
  const completionRefs: Record<string, () => void> = {};

  const resolveCompletion = (bundleId: string) => {
    if (completionRefs[bundleId]) {
      completionRefs[bundleId]();
      delete completionRefs[bundleId];
    }
  };

  const refreshBundles = async () => {
    try {
      const data = await apiGet<{ bundles: FeatureBundleState[] }>("/v1/features");
      set({ bundles: data.bundles, loaded: true });
    } catch {}
  };

  const startPolling = (bundleId: string) => {
    if (pollRefs[bundleId]) return;
    pollRefs[bundleId] = setInterval(async () => {
      try {
        await refreshBundles();
        const updated = get().bundles.find((b) => b.id === bundleId);
        if (!updated || updated.status !== "installing") {
          clearInterval(pollRefs[bundleId]);
          delete pollRefs[bundleId];

          const installing = { ...get().installing };
          delete installing[bundleId];
          set({ installing });

          if (updated?.status === "error") {
            set({
              errors: { ...get().errors, [bundleId]: updated.error ?? "Installation failed" },
            });
          }
          resolveCompletion(bundleId);
        } else if (updated.progress) {
          set({ installing: { ...get().installing, [bundleId]: updated.progress } });
        }
      } catch {}
    }, 3000);
  };

  const listenToProgress = (bundleId: string, jobId: string) => {
    const es = new EventSource(`/api/v1/jobs/${jobId}/progress`);
    esRefs[bundleId] = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          phase: string;
          percent: number;
          stage: string;
          error?: string;
        };
        if (data.phase === "complete") {
          es.close();
          delete esRefs[bundleId];
          const installing = { ...get().installing };
          delete installing[bundleId];
          set({ installing });
          refreshBundles();
          resolveCompletion(bundleId);
          return;
        }
        if (data.phase === "failed") {
          es.close();
          delete esRefs[bundleId];
          const installing = { ...get().installing };
          delete installing[bundleId];
          set({ installing });
          set({ errors: { ...get().errors, [bundleId]: data.error ?? "Installation failed" } });
          resolveCompletion(bundleId);
          return;
        }
        set({
          installing: {
            ...get().installing,
            [bundleId]: { percent: data.percent, stage: data.stage },
          },
        });
      } catch {}
    };

    es.onerror = () => {
      es.close();
      delete esRefs[bundleId];
      startPolling(bundleId);
    };
  };

  const recoverActiveInstalls = () => {
    for (const bundle of get().bundles) {
      if (bundle.status === "installing" && !get().installing[bundle.id]) {
        set({
          installing: {
            ...get().installing,
            [bundle.id]: bundle.progress ?? { percent: 0, stage: "Resuming..." },
          },
          startTimes: { ...get().startTimes, [bundle.id]: Date.now() },
        });
        startPolling(bundle.id);
      }
    }
  };

  return {
    bundles: [],
    loaded: false,
    installing: {},
    errors: {},
    queued: [],
    installAllActive: false,
    startTimes: {},

    fetch: async () => {
      if (get().loaded) return;
      try {
        const data = await apiGet<{ bundles: FeatureBundleState[] }>("/v1/features");
        set({ bundles: data.bundles, loaded: true });
        recoverActiveInstalls();
      } catch {
        set({ loaded: true });
      }
    },

    refresh: refreshBundles,

    isToolInstalled: (toolId: string) => {
      const bundleId = TOOL_BUNDLE_MAP[toolId];
      if (!bundleId) return true;
      const bundle = get().bundles.find((b) => b.id === bundleId);
      return bundle?.status === "installed";
    },

    getBundleForTool: (toolId: string) => {
      const bundleId = TOOL_BUNDLE_MAP[toolId];
      if (!bundleId) return null;
      return get().bundles.find((b) => b.id === bundleId) ?? null;
    },

    installBundle: async (bundleId: string) => {
      const errors = { ...get().errors };
      delete errors[bundleId];
      set({
        errors,
        installing: { ...get().installing, [bundleId]: { percent: 5, stage: "Starting..." } },
        startTimes: { ...get().startTimes, [bundleId]: Date.now() },
      });

      try {
        const result = await apiPost<{ jobId: string }>(`/v1/admin/features/${bundleId}/install`);
        listenToProgress(bundleId, result.jobId);
      } catch (err) {
        const installing = { ...get().installing };
        delete installing[bundleId];
        set({
          installing,
          errors: {
            ...get().errors,
            [bundleId]: err instanceof Error ? err.message : "Failed to start installation",
          },
        });
        resolveCompletion(bundleId);
      }
    },

    uninstallBundle: async (bundleId: string) => {
      try {
        await apiPost(`/v1/admin/features/${bundleId}/uninstall`);
        await refreshBundles();
      } catch (err) {
        set({
          errors: {
            ...get().errors,
            [bundleId]: err instanceof Error ? err.message : "Uninstall failed",
          },
        });
      }
    },

    reinstallBundle: async (bundleId: string) => {
      await get().uninstallBundle(bundleId);
      await get().installBundle(bundleId);
    },

    installAll: async () => {
      set({ installAllActive: true });
      const notInstalled = get().bundles.filter((b) => b.status === "not_installed");
      set({ queued: notInstalled.map((b) => b.id) });

      for (const bundle of notInstalled) {
        set({ queued: get().queued.filter((id) => id !== bundle.id) });
        await new Promise<void>((resolve) => {
          completionRefs[bundle.id] = resolve;
          get().installBundle(bundle.id);
        });
      }

      set({ queued: [], installAllActive: false });
    },

    clearError: (bundleId: string) => {
      const errors = { ...get().errors };
      delete errors[bundleId];
      set({ errors });
    },
  };
});
