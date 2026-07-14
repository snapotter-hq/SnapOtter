// @vitest-environment jsdom
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

describe("useFeaturesStore", () => {
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

  describe("initial state", () => {
    it("loaded is false", () => {
      expect(useFeaturesStore.getState().loaded).toBe(false);
    });

    it("loadError is false", () => {
      expect(useFeaturesStore.getState().loadError).toBe(false);
    });

    it("bundles is empty array", () => {
      expect(useFeaturesStore.getState().bundles).toEqual([]);
    });

    it("installing is empty object", () => {
      expect(useFeaturesStore.getState().installing).toEqual({});
    });

    it("errors is empty object", () => {
      expect(useFeaturesStore.getState().errors).toEqual({});
    });

    it("queued is empty array", () => {
      expect(useFeaturesStore.getState().queued).toEqual([]);
    });

    it("installAllActive is false", () => {
      expect(useFeaturesStore.getState().installAllActive).toBe(false);
    });
  });

  describe("fetch()", () => {
    it("sets bundles from response and loaded = true on success", async () => {
      const bundles = [makeBundleState({ id: "bundle-a", status: "installed" })];
      apiGetMock.mockResolvedValueOnce({ bundles });

      await useFeaturesStore.getState().fetch();

      expect(apiGetMock).toHaveBeenCalledWith("/v1/features");
      expect(useFeaturesStore.getState().bundles).toEqual(bundles);
      expect(useFeaturesStore.getState().loaded).toBe(true);
      expect(useFeaturesStore.getState().loadError).toBe(false);
    });

    it("sets loadError = true on failure", async () => {
      apiGetMock.mockRejectedValueOnce(new Error("Network error"));

      await useFeaturesStore.getState().fetch();

      expect(useFeaturesStore.getState().loaded).toBe(true);
      expect(useFeaturesStore.getState().loadError).toBe(true);
    });

    it("does a background refresh if already loaded without error", async () => {
      const bundles = [makeBundleState({ id: "bundle-a" })];
      useFeaturesStore.setState({ loaded: true, loadError: false, bundles });
      apiGetMock.mockResolvedValueOnce({ bundles });

      await useFeaturesStore.getState().fetch();

      // Should call apiGet for a background refresh (not short-circuit)
      expect(apiGetMock).toHaveBeenCalledWith("/v1/features");
    });

    it("retries fetch if previously loaded with error", async () => {
      useFeaturesStore.setState({ loaded: true, loadError: true });
      const bundles = [makeBundleState({ id: "bundle-b" })];
      apiGetMock.mockResolvedValueOnce({ bundles });

      await useFeaturesStore.getState().fetch();

      expect(apiGetMock).toHaveBeenCalled();
      expect(useFeaturesStore.getState().bundles).toEqual(bundles);
      expect(useFeaturesStore.getState().loadError).toBe(false);
    });

    it("recovers active installs after successful fetch", async () => {
      const bundles = [
        makeBundleState({
          id: "active-bundle",
          status: "installing",
          progress: { percent: 42, stage: "Downloading..." },
        }),
      ];
      apiGetMock.mockResolvedValueOnce({ bundles });

      await useFeaturesStore.getState().fetch();

      const state = useFeaturesStore.getState();
      expect(state.installing["active-bundle"]).toBeDefined();
      expect(state.installing["active-bundle"].percent).toBe(42);
      expect(state.installing["active-bundle"].stage).toBe("Downloading...");
    });
  });

  describe("isToolInstalled()", () => {
    it("returns true when tool has no bundle requirement", () => {
      expect(useFeaturesStore.getState().isToolInstalled("resize")).toBe(true);
    });

    it("returns true when tool bundle is installed", () => {
      useFeaturesStore.setState({
        bundles: [
          makeBundleState({
            id: "background-removal",
            status: "installed",
            enablesTools: ["remove-background"],
          }),
        ],
      });

      expect(useFeaturesStore.getState().isToolInstalled("remove-background")).toBe(true);
    });

    it("returns false when bundle exists but not installed", () => {
      useFeaturesStore.setState({
        bundles: [
          makeBundleState({
            id: "background-removal",
            status: "not_installed",
            enablesTools: ["remove-background"],
          }),
        ],
      });

      expect(useFeaturesStore.getState().isToolInstalled("remove-background")).toBe(false);
    });

    // passport-photo needs background-removal AND face-detection (issue #327).
    it("returns false for passport-photo when only background-removal is installed", () => {
      useFeaturesStore.setState({
        bundles: [
          makeBundleState({ id: "background-removal", status: "installed" }),
          makeBundleState({ id: "face-detection", status: "not_installed" }),
        ],
      });

      expect(useFeaturesStore.getState().isToolInstalled("passport-photo")).toBe(false);
    });

    it("returns true for passport-photo only when both required bundles are installed", () => {
      useFeaturesStore.setState({
        bundles: [
          makeBundleState({ id: "background-removal", status: "installed" }),
          makeBundleState({ id: "face-detection", status: "installed" }),
        ],
      });

      expect(useFeaturesStore.getState().isToolInstalled("passport-photo")).toBe(true);
    });
  });

  describe("getBundleForTool()", () => {
    it("returns matching bundle state", () => {
      const bundle = makeBundleState({
        id: "background-removal",
        status: "installed",
      });
      useFeaturesStore.setState({ bundles: [bundle] });

      const result = useFeaturesStore.getState().getBundleForTool("remove-background");
      expect(result).toEqual(bundle);
    });

    it("returns null when no bundle for tool", () => {
      const result = useFeaturesStore.getState().getBundleForTool("resize");
      expect(result).toBeNull();
    });

    it("returns null when bundle id has no matching state", () => {
      useFeaturesStore.setState({ bundles: [] });
      const result = useFeaturesStore.getState().getBundleForTool("remove-background");
      expect(result).toBeNull();
    });

    it("points at the first missing required bundle for a multi-bundle tool", () => {
      const bg = makeBundleState({ id: "background-removal", status: "installed" });
      const face = makeBundleState({ id: "face-detection", status: "not_installed" });
      useFeaturesStore.setState({ bundles: [bg, face] });

      // passport-photo needs both; background-removal is installed, so the
      // prompt should ask for face-detection.
      expect(useFeaturesStore.getState().getBundleForTool("passport-photo")).toEqual(face);
    });
  });

  describe("clearError()", () => {
    it("removes error for specified bundleId", () => {
      useFeaturesStore.setState({
        errors: { "bundle-a": "Something went wrong", "bundle-b": "Another error" },
      });

      useFeaturesStore.getState().clearError("bundle-a");

      const errors = useFeaturesStore.getState().errors;
      expect(errors["bundle-a"]).toBeUndefined();
      expect(errors["bundle-b"]).toBe("Another error");
    });

    it("does nothing if error does not exist for bundleId", () => {
      useFeaturesStore.setState({ errors: { "bundle-a": "Error" } });

      useFeaturesStore.getState().clearError("bundle-nonexistent");

      expect(useFeaturesStore.getState().errors).toEqual({ "bundle-a": "Error" });
    });
  });

  describe("installBundle()", () => {
    it("sets installing state and calls API", async () => {
      apiPostMock.mockResolvedValueOnce({ jobId: "job-123" });

      const promise = useFeaturesStore.getState().installBundle("test-bundle");

      await vi.waitFor(() => {
        expect(useFeaturesStore.getState().installing["test-bundle"]).toBeDefined();
      });

      expect(useFeaturesStore.getState().installing["test-bundle"].percent).toBe(5);
      expect(useFeaturesStore.getState().installing["test-bundle"].stage).toBe("Starting...");

      await vi.waitFor(() => {
        expect(apiPostMock).toHaveBeenCalledWith("/v1/admin/features/test-bundle/install", {});
      });

      expect(FakeEventSource.instances.length).toBe(1);
      expect(FakeEventSource.instances[0].url).toBe("/api/v1/jobs/job-123/progress");

      const es = FakeEventSource.instances[0];
      es.onmessage?.({ data: JSON.stringify({ phase: "complete" }) });

      await promise;
    });

    it("ignores SSE heartbeats without mutating install progress", async () => {
      apiPostMock.mockResolvedValueOnce({ jobId: "job-heartbeat" });

      const promise = useFeaturesStore.getState().installBundle("test-bundle");

      await vi.waitFor(() => {
        expect(FakeEventSource.instances).toHaveLength(1);
      });

      const es = FakeEventSource.instances[0];
      es.onmessage?.({ data: JSON.stringify({ type: "heartbeat" }) });

      expect(useFeaturesStore.getState().installing["test-bundle"]).toEqual({
        percent: 5,
        stage: "Starting...",
      });

      es.onmessage?.({ data: JSON.stringify({ phase: "complete" }) });
      await promise;
    });

    it("on API failure: sets error and clears installing", async () => {
      apiPostMock.mockRejectedValueOnce(new Error("Server error"));

      await useFeaturesStore.getState().installBundle("fail-bundle");

      const state = useFeaturesStore.getState();
      expect(state.installing["fail-bundle"]).toBeUndefined();
      expect(state.errors["fail-bundle"]).toBe("Server error");
    });

    it("on API failure with non-Error: uses fallback message", async () => {
      apiPostMock.mockRejectedValueOnce("some string error");

      await useFeaturesStore.getState().installBundle("fail-bundle2");

      const state = useFeaturesStore.getState();
      expect(state.installing["fail-bundle2"]).toBeUndefined();
      expect(state.errors["fail-bundle2"]).toBe("Failed to start installation");
    });

    it("clears previous error for the bundle before installing", async () => {
      useFeaturesStore.setState({ errors: { "retry-bundle": "Old error" } });
      apiPostMock.mockResolvedValueOnce({ jobId: "job-retry" });

      const promise = useFeaturesStore.getState().installBundle("retry-bundle");

      await vi.waitFor(() => {
        expect(useFeaturesStore.getState().errors["retry-bundle"]).toBeUndefined();
      });

      const es = FakeEventSource.instances[0];
      es.onmessage?.({ data: JSON.stringify({ phase: "complete" }) });

      await promise;
    });
  });

  describe("installTool()", () => {
    it("starts every missing hard dependency for a multi-bundle AI tool from one server request", async () => {
      const bundles = [
        makeBundleState({ id: "background-removal", status: "not_installed" }),
        makeBundleState({ id: "face-detection", status: "not_installed" }),
      ];
      useFeaturesStore.setState({ bundles, loaded: true });
      apiPostMock.mockResolvedValueOnce({
        bundles: [
          { bundleId: "background-removal", jobId: "job-bg", queued: false },
          { bundleId: "face-detection", jobId: "job-face", queued: true },
        ],
      });

      await useFeaturesStore.getState().installTool("passport-photo");

      expect(apiPostMock).toHaveBeenCalledWith(
        "/v1/admin/tools/passport-photo/features/install",
        {},
      );
      expect(FakeEventSource.instances).toHaveLength(1);
      expect(FakeEventSource.instances[0].url).toBe("/api/v1/jobs/job-bg/progress");
      expect(useFeaturesStore.getState().installing["background-removal"]).toBeDefined();
      expect(useFeaturesStore.getState().installing["face-detection"]).toBeUndefined();
      expect(useFeaturesStore.getState().queued).toContain("face-detection");
    });

    it("only tracks missing dependencies when a multi-bundle AI tool is partially installed", async () => {
      const bundles = [
        makeBundleState({ id: "background-removal", status: "installed" }),
        makeBundleState({ id: "face-detection", status: "not_installed" }),
      ];
      useFeaturesStore.setState({ bundles, loaded: true });
      apiPostMock.mockResolvedValueOnce({
        bundles: [
          { bundleId: "background-removal", skipped: true },
          { bundleId: "face-detection", jobId: "job-face", queued: false },
        ],
      });

      await useFeaturesStore.getState().installTool("passport-photo");

      expect(apiPostMock).toHaveBeenCalledWith(
        "/v1/admin/tools/passport-photo/features/install",
        {},
      );
      expect(useFeaturesStore.getState().installing["background-removal"]).toBeUndefined();
      expect(useFeaturesStore.getState().installing["face-detection"]).toBeDefined();
      expect(FakeEventSource.instances[0].url).toBe("/api/v1/jobs/job-face/progress");
    });
  });

  describe("uninstallBundle()", () => {
    it("calls API and refreshes", async () => {
      apiPostMock.mockResolvedValueOnce({});
      apiGetMock.mockResolvedValueOnce({ bundles: [] });

      await useFeaturesStore.getState().uninstallBundle("remove-bundle");

      expect(apiPostMock).toHaveBeenCalledWith("/v1/admin/features/remove-bundle/uninstall", {});
      expect(apiGetMock).toHaveBeenCalledWith("/v1/features");
    });

    it("sets error on failure with Error instance", async () => {
      apiPostMock.mockRejectedValueOnce(new Error("Uninstall failed hard"));

      await useFeaturesStore.getState().uninstallBundle("fail-uninstall");

      expect(useFeaturesStore.getState().errors["fail-uninstall"]).toBe("Uninstall failed hard");
    });

    it("sets fallback error on failure with non-Error", async () => {
      apiPostMock.mockRejectedValueOnce(42);

      await useFeaturesStore.getState().uninstallBundle("fail-uninstall2");

      expect(useFeaturesStore.getState().errors["fail-uninstall2"]).toBe("Uninstall failed");
    });
  });

  describe("reinstallBundle()", () => {
    it("calls uninstall then install in sequence", async () => {
      apiPostMock.mockResolvedValueOnce({}).mockResolvedValueOnce({ jobId: "job-reinstall" });
      apiGetMock.mockResolvedValueOnce({ bundles: [] });

      const promise = useFeaturesStore.getState().reinstallBundle("re-bundle");

      await vi.waitFor(() => {
        expect(apiPostMock).toHaveBeenCalledWith("/v1/admin/features/re-bundle/uninstall", {});
      });

      await vi.waitFor(() => {
        expect(apiPostMock).toHaveBeenCalledWith("/v1/admin/features/re-bundle/install", {});
      });

      await vi.waitFor(() => {
        expect(FakeEventSource.instances.length).toBeGreaterThan(0);
      });

      const es = FakeEventSource.instances[0];
      es.onmessage?.({ data: JSON.stringify({ phase: "complete" }) });

      await promise;
    });
  });

  describe("installAll()", () => {
    // The server serializes installs now, so installAll just fires one POST per
    // not-installed bundle and lets the backend queue them.
    it("POSTs an install for every not-installed bundle and sets installAllActive", async () => {
      const bundles = [
        makeBundleState({ id: "bundle-1", status: "not_installed" }),
        makeBundleState({ id: "bundle-2", status: "installed" }),
        makeBundleState({ id: "bundle-3", status: "not_installed" }),
      ];
      useFeaturesStore.setState({ bundles, loaded: true });

      apiPostMock.mockImplementation((path: string) => Promise.resolve({ jobId: `job-${path}` }));

      await useFeaturesStore.getState().installAll();

      expect(useFeaturesStore.getState().installAllActive).toBe(true);

      await vi.waitFor(() => {
        expect(apiPostMock).toHaveBeenCalledWith("/v1/admin/features/bundle-1/install", {});
        expect(apiPostMock).toHaveBeenCalledWith("/v1/admin/features/bundle-3/install", {});
      });
      // The already-installed bundle is not POSTed.
      expect(apiPostMock).not.toHaveBeenCalledWith("/v1/admin/features/bundle-2/install", {});

      // Complete both installs; installAllActive clears once installing + queued drain.
      await vi.waitFor(() => {
        expect(FakeEventSource.instances.length).toBe(2);
      });
      for (const es of FakeEventSource.instances) {
        es.onmessage?.({ data: JSON.stringify({ phase: "complete" }) });
      }

      await vi.waitFor(() => {
        expect(useFeaturesStore.getState().installAllActive).toBe(false);
      });
      expect(useFeaturesStore.getState().queued).toEqual([]);
    }, 15000);

    it("skips bundles that are incompatible with the current host", async () => {
      const bundles = [
        makeBundleState({
          id: "unsupported-ocr",
          status: "error",
          compatibility: "incompatible",
          compatibilityReason: "unsupported-host",
        }),
        makeBundleState({
          id: "low-memory-ocr",
          status: "not_installed",
          compatibility: "incompatible",
          compatibilityReason: "insufficient-memory",
        }),
        makeBundleState({ id: "supported-bundle", status: "not_installed" }),
      ];
      useFeaturesStore.setState({ bundles, loaded: true });
      apiPostMock.mockResolvedValue({ jobId: "supported-job" });

      await useFeaturesStore.getState().installAll();

      await vi.waitFor(() => {
        expect(apiPostMock).toHaveBeenCalledWith("/v1/admin/features/supported-bundle/install", {});
      });
      expect(apiPostMock).not.toHaveBeenCalledWith(
        "/v1/admin/features/unsupported-ocr/install",
        {},
      );
      expect(apiPostMock).not.toHaveBeenCalledWith("/v1/admin/features/low-memory-ocr/install", {});
    });

    it("reflects server-queued bundles in the queued pill during Install All", async () => {
      const bundles = [
        makeBundleState({ id: "bundle-a", status: "not_installed" }),
        makeBundleState({ id: "bundle-b", status: "not_installed" }),
      ];
      useFeaturesStore.setState({ bundles, loaded: true });

      // Server starts bundle-a immediately and queues bundle-b.
      apiPostMock.mockImplementation((path: string) =>
        Promise.resolve({
          jobId: `job-${path}`,
          queued: path.includes("bundle-b"),
        }),
      );

      // The poll for the queued bundle reads server state from GET /v1/features.
      let bundleBStatus: FeatureBundleState["status"] = "queued";
      apiGetMock.mockImplementation(() =>
        Promise.resolve({
          bundles: [
            makeBundleState({ id: "bundle-a", status: "installing" }),
            makeBundleState({ id: "bundle-b", status: bundleBStatus }),
          ],
        }),
      );

      await useFeaturesStore.getState().installAll();

      await vi.waitFor(() => {
        expect(useFeaturesStore.getState().queued).toContain("bundle-b");
        expect(useFeaturesStore.getState().installing["bundle-a"]).toBeDefined();
      });
      expect(useFeaturesStore.getState().installing["bundle-b"]).toBeUndefined();

      // A queued bundle must NOT hold an SSE connection open (it polls
      // instead): only the actively-installing bundle has an EventSource.
      expect(FakeEventSource.instances).toHaveLength(1);
      expect(FakeEventSource.instances[0].url).toContain("bundle-a");

      // The server starts bundle-b; its poll moves it queued -> installing.
      bundleBStatus = "installing";
      await vi.waitFor(
        () => {
          expect(useFeaturesStore.getState().queued).not.toContain("bundle-b");
          expect(useFeaturesStore.getState().installing["bundle-b"]).toBeDefined();
        },
        { timeout: 8000 },
      );

      // Finish both: bundle-a via its SSE stream, bundle-b via its poll
      // observing the terminal server status.
      bundleBStatus = "installed";
      FakeEventSource.instances[0].onmessage?.({ data: JSON.stringify({ phase: "complete" }) });
      await vi.waitFor(
        () => {
          expect(useFeaturesStore.getState().installAllActive).toBe(false);
        },
        { timeout: 8000 },
      );
    }, 25000);

    it("retries a bundle once if it fails during Install All, then stops", async () => {
      const bundles = [makeBundleState({ id: "flaky", status: "not_installed" })];
      useFeaturesStore.setState({ bundles, loaded: true });

      apiPostMock.mockImplementation((path: string) => Promise.resolve({ jobId: `job-${path}` }));

      await useFeaturesStore.getState().installAll();

      // First attempt fails -> one retry (a second install POST + EventSource).
      await vi.waitFor(() => {
        expect(FakeEventSource.instances.length).toBe(1);
      });
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ phase: "failed", error: "boom" }),
      });

      await vi.waitFor(() => {
        expect(FakeEventSource.instances.length).toBe(2);
      });
      // Still active (retrying), no error surfaced yet.
      expect(useFeaturesStore.getState().installAllActive).toBe(true);
      expect(useFeaturesStore.getState().errors.flaky).toBeUndefined();

      // Second attempt fails too -> no further retry; error recorded, run ends.
      FakeEventSource.instances[1].onmessage?.({
        data: JSON.stringify({ phase: "failed", error: "boom again" }),
      });

      await vi.waitFor(() => {
        expect(useFeaturesStore.getState().installAllActive).toBe(false);
      });
      expect(FakeEventSource.instances.length).toBe(2);
      expect(useFeaturesStore.getState().errors.flaky).toBe("boom again");
    }, 15000);

    it("clears stale errors for pending bundles", async () => {
      const bundles = [makeBundleState({ id: "err-bundle", status: "error" })];
      useFeaturesStore.setState({
        bundles,
        loaded: true,
        errors: { "err-bundle": "Old failure" },
      });

      apiPostMock.mockResolvedValue({ jobId: "job-err" });
      apiGetMock.mockResolvedValue({
        bundles: bundles.map((b) => ({ ...b, status: "installed" })),
      });

      await useFeaturesStore.getState().installAll();

      await vi.waitFor(() => {
        expect(useFeaturesStore.getState().errors["err-bundle"]).toBeUndefined();
      });

      await vi.waitFor(() => {
        expect(FakeEventSource.instances.length).toBeGreaterThan(0);
      });

      for (const es of FakeEventSource.instances) {
        es.onmessage?.({ data: JSON.stringify({ phase: "complete" }) });
      }

      await vi.waitFor(() => {
        expect(useFeaturesStore.getState().installAllActive).toBe(false);
      });
    }, 15000);
  });

  describe("EventSource progress handling", () => {
    it("updates progress on message", async () => {
      apiPostMock.mockResolvedValueOnce({ jobId: "job-progress" });

      const promise = useFeaturesStore.getState().installBundle("progress-bundle");

      await vi.waitFor(() => {
        expect(FakeEventSource.instances.length).toBe(1);
      });

      const es = FakeEventSource.instances[0];
      es.onmessage?.({
        data: JSON.stringify({ phase: "downloading", percent: 50, stage: "Downloading models..." }),
      });

      await vi.waitFor(() => {
        const installing = useFeaturesStore.getState().installing["progress-bundle"];
        expect(installing).toBeDefined();
        expect(installing.percent).toBe(50);
        expect(installing.stage).toBe("Downloading models...");
      });

      es.onmessage?.({ data: JSON.stringify({ phase: "complete" }) });
      await promise;
    });

    it("handles failed phase from EventSource", async () => {
      apiPostMock.mockResolvedValueOnce({ jobId: "job-fail" });

      const promise = useFeaturesStore.getState().installBundle("fail-es-bundle");

      await vi.waitFor(() => {
        expect(FakeEventSource.instances.length).toBe(1);
      });

      const es = FakeEventSource.instances[0];
      es.onmessage?.({
        data: JSON.stringify({ phase: "failed", error: "Download failed" }),
      });

      await promise;

      const state = useFeaturesStore.getState();
      expect(state.installing["fail-es-bundle"]).toBeUndefined();
      expect(state.errors["fail-es-bundle"]).toBe("Download failed");
    });

    it("handles failed phase with no error message", async () => {
      apiPostMock.mockResolvedValueOnce({ jobId: "job-fail-noerr" });

      const promise = useFeaturesStore.getState().installBundle("fail-noerr-bundle");

      await vi.waitFor(() => {
        expect(FakeEventSource.instances.length).toBe(1);
      });

      const es = FakeEventSource.instances[0];
      es.onmessage?.({ data: JSON.stringify({ phase: "failed" }) });

      await promise;

      expect(useFeaturesStore.getState().errors["fail-noerr-bundle"]).toBe("Installation failed");
    });

    it("falls back to polling on EventSource error", async () => {
      apiPostMock.mockResolvedValueOnce({ jobId: "job-es-err" });

      useFeaturesStore.getState().installBundle("poll-bundle");

      await vi.waitFor(() => {
        expect(FakeEventSource.instances.length).toBe(1);
      });

      const es = FakeEventSource.instances[0];
      es.onerror?.();

      expect(es.closed).toBe(true);
    });

    it("progress percent never decreases", async () => {
      apiPostMock.mockResolvedValueOnce({ jobId: "job-monotonic" });

      const promise = useFeaturesStore.getState().installBundle("mono-bundle");

      await vi.waitFor(() => {
        expect(FakeEventSource.instances.length).toBe(1);
      });

      const es = FakeEventSource.instances[0];

      es.onmessage?.({
        data: JSON.stringify({ phase: "downloading", percent: 60, stage: "Stage A" }),
      });

      await vi.waitFor(() => {
        expect(useFeaturesStore.getState().installing["mono-bundle"]?.percent).toBe(60);
      });

      es.onmessage?.({
        data: JSON.stringify({ phase: "downloading", percent: 30, stage: "Stage B" }),
      });

      await vi.waitFor(() => {
        const installing = useFeaturesStore.getState().installing["mono-bundle"];
        expect(installing?.percent).toBe(60);
        expect(installing?.stage).toBe("Stage B");
      });

      es.onmessage?.({ data: JSON.stringify({ phase: "complete" }) });
      await promise;
    });
  });

  describe("refresh()", () => {
    it("refreshes bundles from API", async () => {
      const bundles = [makeBundleState({ id: "refreshed" })];
      apiGetMock.mockResolvedValueOnce({ bundles });

      await useFeaturesStore.getState().refresh();

      expect(apiGetMock).toHaveBeenCalledWith("/v1/features");
      expect(useFeaturesStore.getState().bundles).toEqual(bundles);
      expect(useFeaturesStore.getState().loaded).toBe(true);
    });

    it("silently handles refresh failure", async () => {
      useFeaturesStore.setState({ bundles: [makeBundleState({ id: "existing" })], loaded: true });
      apiGetMock.mockRejectedValueOnce(new Error("fail"));

      await useFeaturesStore.getState().refresh();

      expect(useFeaturesStore.getState().bundles).toEqual([makeBundleState({ id: "existing" })]);
    });
  });
});
