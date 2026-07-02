import type { FeatureBundleState } from "@snapotter/shared";
import { TOOL_BUNDLE_MAP, TOOL_EXTRA_BUNDLES } from "@snapotter/shared";
import { create } from "zustand";
import { apiGet, apiPost } from "@/lib/api";

/**
 * Every bundle a tool needs: its primary bundle plus any extras. Computed from
 * the exported maps (not the shared helper) so unit tests that mock
 * TOOL_BUNDLE_MAP still drive this logic. A tool can need more than one bundle
 * (e.g. passport-photo needs background-removal AND face-detection).
 */
function requiredBundlesForTool(toolId: string): string[] {
  const primary = TOOL_BUNDLE_MAP[toolId];
  if (!primary) return [];
  return [...new Set([primary, ...(TOOL_EXTRA_BUNDLES[toolId] ?? [])])];
}

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

  // Bundles that already got one retry during the current Install All run.
  // Preserves the old one-shot retry-on-failure behavior now that the server
  // serializes installs and we no longer drive the queue from the client.
  const installAllRetried = new Set<string>();

  const refreshBundles = async () => {
    try {
      const data = await apiGet<{ bundles: FeatureBundleState[] }>("/v1/features");
      set({ bundles: data.bundles, loaded: true });
    } catch {}
  };

  /** Drop a bundle from both the installing map and the queued pill. */
  const stopTracking = (bundleId: string) => {
    const installing = { ...get().installing };
    delete installing[bundleId];
    set({ installing, queued: get().queued.filter((id) => id !== bundleId) });
  };

  /** Clear Install All once every bundle it kicked off has drained. */
  const maybeFinishInstallAll = () => {
    if (
      get().installAllActive &&
      Object.keys(get().installing).length === 0 &&
      get().queued.length === 0
    ) {
      installAllRetried.clear();
      set({ installAllActive: false });
    }
  };

  /**
   * A bundle install reached a terminal state. During Install All a failure is
   * retried once (re-POSTed); otherwise the error is recorded. Either way we
   * check whether the Install All run is done.
   */
  const onInstallSettled = (bundleId: string, errorMsg: string | null) => {
    if (errorMsg) {
      if (get().installAllActive && !installAllRetried.has(bundleId)) {
        installAllRetried.add(bundleId);
        const errors = { ...get().errors };
        delete errors[bundleId];
        set({ errors });
        get().installBundle(bundleId);
        return;
      }
      set({ errors: { ...get().errors, [bundleId]: errorMsg } });
    }
    maybeFinishInstallAll();
  };

  const startPolling = (bundleId: string) => {
    if (pollRefs[bundleId]) return;
    pollRefs[bundleId] = setInterval(async () => {
      try {
        await refreshBundles();
        const updated = get().bundles.find((b) => b.id === bundleId);

        if (updated?.status === "queued") {
          // Still waiting behind another install on the server; keep the pill.
          if (!get().queued.includes(bundleId)) {
            set({ queued: [...get().queued, bundleId] });
          }
          return;
        }

        if (updated?.status === "installing") {
          // Now the active install: move queued -> installing and track progress.
          const current = get().installing[bundleId];
          const percent = Math.max(updated.progress?.percent ?? 0, current?.percent ?? 0);
          set({
            installing: {
              ...get().installing,
              [bundleId]: { percent, stage: updated.progress?.stage ?? current?.stage ?? "" },
            },
            queued: get().queued.filter((id) => id !== bundleId),
          });
          return;
        }

        // Terminal: installed / error / not_installed.
        clearInterval(pollRefs[bundleId]);
        delete pollRefs[bundleId];
        stopTracking(bundleId);
        onInstallSettled(
          bundleId,
          updated?.status === "error" ? (updated.error ?? "Installation failed") : null,
        );
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
          stopTracking(bundleId);
          refreshBundles();
          onInstallSettled(bundleId, null);
          return;
        }
        if (data.phase === "failed") {
          es.close();
          delete esRefs[bundleId];
          stopTracking(bundleId);
          onInstallSettled(bundleId, data.error ?? "Installation failed");
          return;
        }
        // First progress frame means the server has started this install for
        // real: move it out of the queued pill and into the installing map.
        const current = get().installing[bundleId];
        const percent = Math.max(data.percent, current?.percent ?? 0);
        set({
          installing: {
            ...get().installing,
            [bundleId]: { percent, stage: data.stage },
          },
          queued: get().queued.filter((id) => id !== bundleId),
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
      } else if (bundle.status === "queued" && !get().queued.includes(bundle.id)) {
        set({
          queued: [...get().queued, bundle.id],
          startTimes: { ...get().startTimes, [bundle.id]: Date.now() },
        });
        startPolling(bundle.id);
      }
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      const activeIds = [...Object.keys(get().installing), ...get().queued];
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
      const required = requiredBundlesForTool(toolId);
      if (required.length === 0) return true;
      return required.every(
        (bundleId) => get().bundles.find((b) => b.id === bundleId)?.status === "installed",
      );
    },

    getBundleForTool: (toolId: string) => {
      const required = requiredBundlesForTool(toolId);
      if (required.length === 0) return null;
      const bundles = get().bundles;
      // Point the user at the first bundle they still need to install; fall
      // back to the primary bundle once everything required is installed.
      for (const bundleId of required) {
        const bundle = bundles.find((b) => b.id === bundleId);
        if (bundle && bundle.status !== "installed") return bundle;
      }
      return bundles.find((b) => b.id === required[0]) ?? null;
    },

    installBundle: async (bundleId: string) => {
      // Always POST immediately -- the server owns the queue now, so a POST is
      // durable even if this tab closes. Optimistically show "installing"; the
      // response tells us whether it actually started or got queued.
      const errors = { ...get().errors };
      delete errors[bundleId];
      set({
        errors,
        installing: { ...get().installing, [bundleId]: { percent: 5, stage: "Starting..." } },
        startTimes: { ...get().startTimes, [bundleId]: Date.now() },
      });

      try {
        const result = await apiPost<{ jobId: string; queued?: boolean }>(
          `/v1/admin/features/${bundleId}/install`,
          {},
        );
        if (result.queued) {
          // Server queued it behind an active install; show the pill instead of
          // a progress bar until the first progress frame arrives.
          const installing = { ...get().installing };
          delete installing[bundleId];
          set({
            installing,
            queued: get().queued.includes(bundleId) ? get().queued : [...get().queued, bundleId],
          });
        }
        listenToProgress(bundleId, result.jobId);
      } catch (err) {
        stopTracking(bundleId);

        const message = err instanceof Error ? err.message : "Failed to start installation";
        const isAlreadyInstalled = /already installed/i.test(message);

        if (isAlreadyInstalled) {
          // 409 "already installed": clear the error and refresh status so the
          // UI transitions to the installed state silently.
          const errors = { ...get().errors };
          delete errors[bundleId];
          set({ errors });
          await refreshBundles();
          onInstallSettled(bundleId, null);
        } else {
          onInstallSettled(bundleId, message);
        }
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
      const pending = get().bundles.filter((b) => b.status !== "installed");
      if (pending.length === 0) return;

      // Mark every pending bundle up front so the run never looks "drained"
      // between POST dispatches (which would clear installAllActive early).
      const errors = { ...get().errors };
      const installing = { ...get().installing };
      const startTimes = { ...get().startTimes };
      for (const b of pending) {
        delete errors[b.id];
        installing[b.id] = installing[b.id] ?? { percent: 5, stage: "Starting..." };
        startTimes[b.id] = startTimes[b.id] ?? Date.now();
      }
      set({ installAllActive: true, errors, installing, startTimes });

      // Fire one POST per pending bundle. The server serializes them behind its
      // queue; installBundle() reconciles installing vs queued from each
      // response and installAllActive clears once installing[] and queued[]
      // both drain (see maybeFinishInstallAll).
      for (const b of pending) {
        get().installBundle(b.id);
      }
    },

    clearError: (bundleId: string) => {
      const errors = { ...get().errors };
      delete errors[bundleId];
      set({ errors });
    },
  };
});
