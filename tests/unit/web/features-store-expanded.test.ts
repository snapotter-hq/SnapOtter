// @vitest-environment jsdom
/**
 * Expanded tests for features-store covering edge cases not in the main test.
 *
 * Focuses on: queuing behavior during concurrent installs, recovery of
 * active installs, startTimes tracking, and installAllActive edge paths.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();

vi.mock("@/lib/api", () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
  apiPost: (...args: unknown[]) => apiPostMock(...args),
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  static reset() {
    FakeEventSource.instances = [];
  }
}

vi.stubGlobal("EventSource", FakeEventSource);

import type { FeatureBundleState } from "@snapotter/shared";
import { useFeaturesStore } from "@/stores/features-store";

function makeBundleState(
  overrides: Partial<FeatureBundleState> & { id: string },
): FeatureBundleState {
  return {
    name: overrides.id,
    description: "Test bundle",
    status: "not_installed",
    installedVersion: null,
    estimatedSize: "100 MB",
    enablesTools: [],
    progress: null,
    error: null,
    ...overrides,
  };
}

describe("useFeaturesStore (expanded)", () => {
  beforeEach(() => {
    useFeaturesStore.setState({
      bundles: [],
      loaded: false,
      loadError: false,
      installing: {},
      errors: {},
      queued: [],
      installAllActive: false,
      startTimes: {},
    });
    vi.clearAllMocks();
    FakeEventSource.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("startTimes tracking", () => {
    it("records startTime when install begins", async () => {
      apiPostMock.mockResolvedValueOnce({ jobId: "job-1" });

      const promise = useFeaturesStore.getState().installBundle("timing-bundle");

      await vi.waitFor(() => {
        const times = useFeaturesStore.getState().startTimes;
        expect(times["timing-bundle"]).toBeTypeOf("number");
      });

      const es = FakeEventSource.instances[0];
      es?.onmessage?.({ data: JSON.stringify({ phase: "complete" }) });

      await promise;
    });
  });

  describe("fetch edge cases", () => {
    it("sets loadError false on success after previous error", async () => {
      useFeaturesStore.setState({ loaded: true, loadError: true });
      apiGetMock.mockResolvedValueOnce({ bundles: [] });

      await useFeaturesStore.getState().fetch();

      expect(useFeaturesStore.getState().loadError).toBe(false);
    });

    it("recovers multiple active installs", async () => {
      const bundles = [
        makeBundleState({
          id: "bundle-a",
          status: "installing",
          progress: { percent: 20, stage: "Step A" },
        }),
        makeBundleState({
          id: "bundle-b",
          status: "installing",
          progress: { percent: 50, stage: "Step B" },
        }),
        makeBundleState({
          id: "bundle-c",
          status: "installed",
        }),
      ];
      apiGetMock.mockResolvedValueOnce({ bundles });

      await useFeaturesStore.getState().fetch();

      const state = useFeaturesStore.getState();
      expect(state.installing["bundle-a"]).toBeDefined();
      expect(state.installing["bundle-a"].percent).toBe(20);
      expect(state.installing["bundle-b"]).toBeDefined();
      expect(state.installing["bundle-b"].percent).toBe(50);
      expect(state.installing["bundle-c"]).toBeUndefined();
    });

    it("uses fallback progress for recovering installs without progress data", async () => {
      const bundles = [
        makeBundleState({
          id: "no-progress-bundle",
          status: "installing",
          progress: null,
        }),
      ];
      apiGetMock.mockResolvedValueOnce({ bundles });

      await useFeaturesStore.getState().fetch();

      const installing = useFeaturesStore.getState().installing["no-progress-bundle"];
      expect(installing).toBeDefined();
      expect(installing.percent).toBe(0);
      expect(installing.stage).toBe("Resuming...");
    });
  });

  describe("installBundle queuing (server-owned queue)", () => {
    it("adds a server-queued bundle to the queued pill exactly once across duplicate POSTs", async () => {
      useFeaturesStore.setState({
        bundles: [makeBundleState({ id: "waiting-bundle", status: "not_installed" })],
      });
      // Server reports it queued behind an active install both times.
      apiPostMock.mockResolvedValue({ jobId: "job-wait", queued: true });

      await Promise.all([
        useFeaturesStore.getState().installBundle("waiting-bundle"),
        useFeaturesStore.getState().installBundle("waiting-bundle"),
      ]);

      const q = useFeaturesStore.getState().queued;
      expect(q.filter((id) => id === "waiting-bundle").length).toBe(1);
      // A queued bundle is not shown as installing.
      expect(useFeaturesStore.getState().installing["waiting-bundle"]).toBeUndefined();
    });

    it("shows a not-queued install as installing (not in the queued pill)", async () => {
      useFeaturesStore.setState({
        bundles: [makeBundleState({ id: "go-bundle", status: "not_installed" })],
      });
      apiPostMock.mockResolvedValueOnce({ jobId: "job-go", queued: false });

      const promise = useFeaturesStore.getState().installBundle("go-bundle");

      await vi.waitFor(() => {
        expect(useFeaturesStore.getState().installing["go-bundle"]).toBeDefined();
      });
      expect(useFeaturesStore.getState().queued).not.toContain("go-bundle");

      FakeEventSource.instances[0]?.onmessage?.({ data: JSON.stringify({ phase: "complete" }) });
      await promise;
    });
  });

  describe("installBundle when the server reports the bundle already installed", () => {
    it("still POSTs, then clears state and refreshes on a 409 already-installed", async () => {
      useFeaturesStore.setState({
        bundles: [makeBundleState({ id: "done-bundle", status: "not_installed" })],
      });
      apiPostMock.mockRejectedValueOnce(new Error('Bundle "done-bundle" is already installed'));
      apiGetMock.mockResolvedValueOnce({
        bundles: [makeBundleState({ id: "done-bundle", status: "installed" })],
      });

      await useFeaturesStore.getState().installBundle("done-bundle");

      // The client always POSTs now; the server owns the queue/dedup decision.
      expect(apiPostMock).toHaveBeenCalledWith("/v1/admin/features/done-bundle/install", {});
      // A 409 already-installed clears installing + error and refreshes silently.
      const state = useFeaturesStore.getState();
      expect(state.installing["done-bundle"]).toBeUndefined();
      expect(state.errors["done-bundle"]).toBeUndefined();
      expect(apiGetMock).toHaveBeenCalledWith("/v1/features");
    });
  });

  describe("uninstallBundle edge cases", () => {
    it("refreshes bundles after successful uninstall", async () => {
      apiPostMock.mockResolvedValueOnce({});
      apiGetMock.mockResolvedValueOnce({ bundles: [] });

      await useFeaturesStore.getState().uninstallBundle("some-bundle");

      expect(apiGetMock).toHaveBeenCalledWith("/v1/features");
    });
  });

  describe("resetEnvironment", () => {
    it("posts to the reset endpoint and refreshes bundles on success", async () => {
      apiPostMock.mockResolvedValueOnce({});
      apiGetMock.mockResolvedValueOnce({ bundles: [] });

      await useFeaturesStore.getState().resetEnvironment();

      expect(apiPostMock).toHaveBeenCalledWith("/v1/admin/features/reset", {});
      expect(apiGetMock).toHaveBeenCalledWith("/v1/features");
      expect(useFeaturesStore.getState().resetError).toBeNull();
    });

    it("clears stale installing/errors/queued state on success", async () => {
      useFeaturesStore.setState({
        installing: { ocr: { percent: 40, stage: "downloading" } },
        errors: { ocr: "some old error" },
        queued: ["ocr"],
        startTimes: { ocr: Date.now() },
      });
      apiPostMock.mockResolvedValueOnce({});
      apiGetMock.mockResolvedValueOnce({ bundles: [] });

      await useFeaturesStore.getState().resetEnvironment();

      const state = useFeaturesStore.getState();
      expect(state.installing).toEqual({});
      expect(state.errors).toEqual({});
      expect(state.queued).toEqual([]);
      expect(state.startTimes).toEqual({});
    });

    it("sets resetError on failure and does not refresh bundles", async () => {
      apiPostMock.mockRejectedValueOnce(new Error("a bundle install is already in progress"));

      await useFeaturesStore.getState().resetEnvironment();

      expect(useFeaturesStore.getState().resetError).toBe(
        "a bundle install is already in progress",
      );
      expect(apiGetMock).not.toHaveBeenCalled();
    });
  });

  describe("clearError", () => {
    it("does not affect other errors when clearing one", () => {
      useFeaturesStore.setState({
        errors: { a: "Error A", b: "Error B", c: "Error C" },
      });

      useFeaturesStore.getState().clearError("b");

      const errors = useFeaturesStore.getState().errors;
      expect(errors.a).toBe("Error A");
      expect(errors.b).toBeUndefined();
      expect(errors.c).toBe("Error C");
    });
  });

  describe("isToolInstalled edge cases", () => {
    it("returns true for unknown tools (no bundle requirement)", () => {
      // A tool not in TOOL_BUNDLE_MAP has no bundle dependency
      expect(useFeaturesStore.getState().isToolInstalled("resize")).toBe(true);
      expect(useFeaturesStore.getState().isToolInstalled("compress")).toBe(true);
    });

    it("handles installing status as not installed", () => {
      useFeaturesStore.setState({
        bundles: [
          makeBundleState({
            id: "background-removal",
            status: "installing",
            enablesTools: ["remove-background"],
          }),
        ],
      });

      expect(useFeaturesStore.getState().isToolInstalled("remove-background")).toBe(false);
    });

    it("handles error status as not installed", () => {
      useFeaturesStore.setState({
        bundles: [
          makeBundleState({
            id: "background-removal",
            status: "error",
            enablesTools: ["remove-background"],
          }),
        ],
      });

      expect(useFeaturesStore.getState().isToolInstalled("remove-background")).toBe(false);
    });
  });

  describe("getBundleForTool edge cases", () => {
    it("returns null when bundles array is empty", () => {
      useFeaturesStore.setState({ bundles: [] });
      const result = useFeaturesStore.getState().getBundleForTool("remove-background");
      expect(result).toBeNull();
    });
  });

  describe("refresh", () => {
    it("updates bundles even when already loaded", async () => {
      useFeaturesStore.setState({
        loaded: true,
        bundles: [makeBundleState({ id: "old" })],
      });

      const newBundles = [makeBundleState({ id: "new-bundle" })];
      apiGetMock.mockResolvedValueOnce({ bundles: newBundles });

      await useFeaturesStore.getState().refresh();

      expect(useFeaturesStore.getState().bundles).toEqual(newBundles);
    });
  });
});
