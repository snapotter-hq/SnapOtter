import type { FeatureBundleState } from "@snapotter/shared";
import { TOOL_BUNDLE_MAP } from "@snapotter/shared";
import { create } from "zustand";
import { apiGet, apiPost } from "@/lib/api";

interface BundleProgress {
  percent: number;
  stage: string;
}

interface FeaturesState {
  bundles: FeatureBundleState[];
  loaded: boolean;
  loadError: boolean;
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
        if (updated?.status !== "installing") {
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
          const current = get().installing[bundleId];
          const percent = Math.max(updated.progress.percent, current?.percent ?? 0);
          set({
            installing: {
              ...get().installing,
              [bundleId]: { percent, stage: updated.progress.stage },
            },
          });
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
        const current = get().installing[bundleId];
        const percent = Math.max(data.percent, current?.percent ?? 0);
        set({
          installing: {
            ...get().installing,
            [bundleId]: { percent, stage: data.stage },
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

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      const activeIds = Object.keys(get().installing);
      if (activeIds.length === 0) return;

      for (const bundleId of activeIds) {
        const es = esRefs[bundleId];
        if (es && es.readyState === EventSource.OPEN) continue;
        if (es) {
          es.close();
          delete esRefs[bundleId];
        }
        if (!pollRefs[bundleId]) {
          startPolling(bundleId);
        }
      }
    });
  }

  return {
    bundles: [],
    loaded: false,
    loadError: false,
    installing: {},
    errors: {},
    queued: [],
    installAllActive: false,
    startTimes: {},

    fetch: async () => {
      if (get().loaded && !get().loadError) {
        // Already loaded successfully before. Refresh in the background
        // so navigating between tool pages picks up status changes
        // (e.g. a bundle installed from the settings page).
        refreshBundles();
        return;
      }
      try {
        const data = await apiGet<{ bundles: FeatureBundleState[] }>("/v1/features");
        set({ bundles: data.bundles, loaded: true, loadError: false });
        recoverActiveInstalls();
      } catch {
        set({ loaded: true, loadError: true });
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
      const activeIds = Object.keys(get().installing);
      if (activeIds.length > 0 && !activeIds.includes(bundleId)) {
        const alreadyQueued = get().queued.includes(bundleId);
        if (!alreadyQueued) {
          set({ queued: [...get().queued, bundleId] });
        }
        const errors = { ...get().errors };
        delete errors[bundleId];
        set({ errors });

        await new Promise<void>((resolve) => {
          const check = () => {
            const current = get().installing;
            if (Object.keys(current).length === 0 || Object.keys(current).includes(bundleId)) {
              resolve();
            } else {
              setTimeout(check, 500);
            }
          };
          check();
        });

        set({ queued: get().queued.filter((id) => id !== bundleId) });
        const currentBundle = get().bundles.find((b) => b.id === bundleId);
        if (currentBundle?.status === "installed") {
          resolveCompletion(bundleId);
          return;
        }
      }

      const errors = { ...get().errors };
      delete errors[bundleId];
      set({
        errors,
        installing: { ...get().installing, [bundleId]: { percent: 5, stage: "Starting..." } },
        startTimes: { ...get().startTimes, [bundleId]: Date.now() },
      });

      try {
        const result = await apiPost<{ jobId: string }>(
          `/v1/admin/features/${bundleId}/install`,
          {},
        );
        listenToProgress(bundleId, result.jobId);
      } catch (err) {
        const installing = { ...get().installing };
        delete installing[bundleId];

        const message = err instanceof Error ? err.message : "Failed to start installation";
        const isAlreadyInstalled = /already installed/i.test(message);

        if (isAlreadyInstalled) {
          // 409 "already installed": clear the error and refresh status
          // so the UI transitions to the installed state silently.
          const errors = { ...get().errors };
          delete errors[bundleId];
          set({ installing, errors });
          await refreshBundles();
        } else {
          set({
            installing,
            errors: { ...get().errors, [bundleId]: message },
          });
        }
        resolveCompletion(bundleId);
      }
    },

    uninstallBundle: async (bundleId: string) => {
      try {
        await apiPost(`/v1/admin/features/${bundleId}/uninstall`, {});
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

      // Immediately mark every not-yet-installed bundle as queued so the UI
      // updates right away.  Exclude bundles that are already installing.
      const activeIds = new Set(Object.keys(get().installing));
      const pending = get().bundles.filter((b) => b.status !== "installed" && !activeIds.has(b.id));
      // Clear stale errors for these bundles
      const errors = { ...get().errors };
      for (const b of pending) delete errors[b.id];
      set({ queued: pending.map((b) => b.id), errors });

      // If an install is already in progress (user clicked an individual
      // install before Install All), wait for it to finish first.
      if (activeIds.size > 0) {
        const activeId = [...activeIds][0];
        await new Promise<void>((resolve) => {
          completionRefs[activeId] = resolve;
        });
        await refreshBundles();
      }

      // Process the queue sequentially. After each install, wait briefly
      // so the backend lock file is fully released before the next attempt.
      // If a bundle fails, re-enqueue it for one retry.
      const retried = new Set<string>();
      while (true) {
        const q = get().queued;
        if (q.length === 0) break;
        const nextId = q[0];
        set({ queued: q.slice(1) });

        const current = get().bundles.find((b) => b.id === nextId);
        if (current?.status === "installed") continue;

        await new Promise<void>((resolve) => {
          completionRefs[nextId] = resolve;
          get().installBundle(nextId);
        });
        await refreshBundles();

        const after = get().bundles.find((b) => b.id === nextId);
        if (after?.status !== "installed" && !retried.has(nextId)) {
          retried.add(nextId);
          const errors = { ...get().errors };
          delete errors[nextId];
          set({ queued: [...get().queued, nextId], errors });
        }

        // Brief pause to let the backend fully release the install lock
        await new Promise((r) => setTimeout(r, 2000));
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
