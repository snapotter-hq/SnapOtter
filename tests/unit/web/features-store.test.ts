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
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  readyState = FakeEventSource.OPEN;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
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

  afterEach(async () => {
    // The store is a singleton, so pollers and streams started by one test
    // would keep ticking into the next. resetEnvironment stops all of them.
    apiPostMock.mockResolvedValueOnce({ ok: true });
    await useFeaturesStore.getState().resetEnvironment();
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

    it("ignores a malformed progress frame and keeps listening", async () => {
      apiPostMock.mockResolvedValueOnce({ jobId: "job-malformed" });

      const promise = useFeaturesStore.getState().installBundle("test-bundle");
      await vi.waitFor(() => {
        expect(FakeEventSource.instances).toHaveLength(1);
      });

      const es = FakeEventSource.instances[0];
      expect(() => es.onmessage?.({ data: "not json" })).not.toThrow();
      expect(es.closed).toBe(false);
      expect(useFeaturesStore.getState().installing["test-bundle"]).toBeDefined();

      es.onmessage?.({ data: JSON.stringify({ phase: "complete" }) });
      await promise;
      expect(useFeaturesStore.getState().installing["test-bundle"]).toBeUndefined();
    });

    it("logs a malformed progress frame with its raw payload", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      apiPostMock.mockResolvedValueOnce({ jobId: "job-log-malformed" });

      const promise = useFeaturesStore.getState().installBundle("test-bundle");
      await vi.waitFor(() => {
        expect(FakeEventSource.instances).toHaveLength(1);
      });

      const es = FakeEventSource.instances[0];
      es.onmessage?.({ data: "not json" });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("progress frame"),
        expect.objectContaining({ bundleId: "test-bundle", raw: "not json" }),
      );

      es.onmessage?.({ data: JSON.stringify({ phase: "complete" }) });
      await promise;
    });

    // #1287: the onmessage catch used to wrap the whole handler, so a throw
    // while handling a frame was swallowed. A terminal frame closes the stream
    // before it settles, so a throw there left nothing to settle the pill.
    // Any handling throw now hands the bundle to the status poller; a frame
    // that parses to null is the simplest way to throw inside the handler.
    it("falls back to polling and rethrows when frame handling throws", async () => {
      apiPostMock.mockResolvedValueOnce({ jobId: "job-throw" });

      const promise = useFeaturesStore.getState().installBundle("test-bundle");
      await vi.waitFor(() => {
        expect(FakeEventSource.instances).toHaveLength(1);
      });
      await promise;

      vi.useFakeTimers();
      try {
        apiGetMock.mockResolvedValue({
          bundles: [makeBundleState({ id: "test-bundle", status: "installed" })],
        });
        const es = FakeEventSource.instances[0];
        // A frame that parses but is not an object: reading .type throws.
        expect(() => es.onmessage?.({ data: "null" })).toThrow(TypeError);
        expect(es.closed).toBe(true);

        await vi.advanceTimersByTimeAsync(3_000);
        expect(apiGetMock).toHaveBeenCalledWith("/v1/features");
        expect(useFeaturesStore.getState().installing["test-bundle"]).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
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

    it("ignores queued SSE frames and errors arriving after a terminal complete or failed frame (#3340)", async () => {
      apiPostMock
        .mockResolvedValueOnce({ jobId: "job-after-complete" })
        .mockResolvedValueOnce({ jobId: "job-after-failed" });
      apiGetMock.mockResolvedValue({
        bundles: [makeBundleState({ id: "background-removal", status: "installed" })],
      });

      await useFeaturesStore.getState().installBundle("background-removal");
      expect(FakeEventSource.instances).toHaveLength(1);
      const esComplete = FakeEventSource.instances[0];

      esComplete.onmessage?.({
        data: JSON.stringify({ phase: "complete", percent: 100, stage: "Done" }),
      });
      expect(esComplete.closed).toBe(true);
      expect(useFeaturesStore.getState().installing["background-removal"]).toBeUndefined();

      await useFeaturesStore.getState().installBundle("upscaling");
      expect(FakeEventSource.instances).toHaveLength(2);
      const esFailed = FakeEventSource.instances[1];

      esFailed.onmessage?.({
        data: JSON.stringify({ phase: "failed", error: "Checksum mismatch" }),
      });
      expect(esFailed.closed).toBe(true);
      expect(useFeaturesStore.getState().installing.upscaling).toBeUndefined();
      expect(useFeaturesStore.getState().errors.upscaling).toBe("Checksum mismatch");

      vi.useFakeTimers();
      try {
        apiGetMock.mockClear();
        esComplete.onmessage?.({
          data: JSON.stringify({ phase: "installing", percent: 80, stage: "Extracting" }),
        });
        expect(useFeaturesStore.getState().installing["background-removal"]).toBeUndefined();

        esComplete.onmessage?.({
          data: JSON.stringify({ phase: "failed", error: "Late failure" }),
        });
        esComplete.onerror?.();

        esFailed.onmessage?.({
          data: JSON.stringify({ phase: "downloading", percent: 90, stage: "Late progress" }),
        });
        esFailed.onmessage?.({
          data: JSON.stringify({ phase: "complete", percent: 100, stage: "Late complete" }),
        });
        esFailed.onerror?.();

        expect(useFeaturesStore.getState().installing["background-removal"]).toBeUndefined();
        expect(useFeaturesStore.getState().errors["background-removal"]).toBeUndefined();
        expect(useFeaturesStore.getState().installing.upscaling).toBeUndefined();
        expect(useFeaturesStore.getState().errors.upscaling).toBe("Checksum mismatch");

        await vi.advanceTimersByTimeAsync(3_500);
        expect(apiGetMock).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("ignores queued SSE events on a superseded EventSource without disrupting the replacement (#3340)", async () => {
      apiPostMock
        .mockResolvedValueOnce({ jobId: "job-first" })
        .mockResolvedValueOnce({ jobId: "job-second" });

      await useFeaturesStore.getState().installBundle("background-removal");
      await useFeaturesStore.getState().installBundle("background-removal");

      expect(FakeEventSource.instances).toHaveLength(2);
      const [firstEs, secondEs] = FakeEventSource.instances;
      expect(firstEs.closed).toBe(true);
      expect(secondEs.closed).toBe(false);

      vi.useFakeTimers();
      try {
        apiGetMock.mockClear();
        // Queued error or terminal frame on the superseded first EventSource must not
        // delete esRefs["background-removal"] or start a redundant poller.
        firstEs.onerror?.();
        firstEs.onmessage?.({
          data: JSON.stringify({ phase: "failed", error: "Stale stream error" }),
        });

        await vi.advanceTimersByTimeAsync(3_500);
        expect(apiGetMock).not.toHaveBeenCalled();
        expect(useFeaturesStore.getState().errors["background-removal"]).toBeUndefined();

        // The replacement stream still drives progress and completion normally.
        secondEs.onmessage?.({
          data: JSON.stringify({ phase: "downloading", percent: 55, stage: "Halfway" }),
        });
        expect(useFeaturesStore.getState().installing["background-removal"]).toEqual({
          percent: 55,
          stage: "Halfway",
        });

        secondEs.onmessage?.({
          data: JSON.stringify({ phase: "complete", percent: 100, stage: "Done" }),
        });
        expect(secondEs.closed).toBe(true);
        expect(useFeaturesStore.getState().installing["background-removal"]).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it("ignores queued SSE events after visibilitychange closes a non-open EventSource (#3340)", async () => {
      vi.useFakeTimers();
      try {
        apiPostMock.mockResolvedValueOnce({ jobId: "job-vis" });
        apiGetMock.mockResolvedValue({
          bundles: [makeBundleState({ id: "vis-bundle", status: "installed" })],
        });

        await useFeaturesStore.getState().installBundle("vis-bundle");
        expect(FakeEventSource.instances).toHaveLength(1);
        const es = FakeEventSource.instances[0];

        // Simulate a stream that dropped out of OPEN while the tab was hidden.
        es.readyState = FakeEventSource.CLOSED;
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
        expect(es.closed).toBe(true);

        // Let the fallback poller settle the bundle, then fire late queued SSE frames.
        await vi.advanceTimersByTimeAsync(3_000);
        expect(useFeaturesStore.getState().installing["vis-bundle"]).toBeUndefined();

        apiGetMock.mockClear();
        es.onmessage?.({
          data: JSON.stringify({ phase: "downloading", percent: 45, stage: "Stale frame" }),
        });
        es.onerror?.();

        expect(useFeaturesStore.getState().installing["vis-bundle"]).toBeUndefined();
        await vi.advanceTimersByTimeAsync(3_500);
        expect(apiGetMock).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("resetEnvironment() cleanup (#3340)", () => {
    it("closes active EventSource streams, clears pollers, and resets installAllActive (#3340)", async () => {
      vi.useFakeTimers();
      try {
        useFeaturesStore.setState({
          bundles: [
            makeBundleState({ id: "reset-stream-bundle", status: "not_installed" }),
            makeBundleState({ id: "reset-poll-bundle", status: "not_installed" }),
          ],
          loaded: true,
        });
        apiPostMock
          .mockResolvedValueOnce({ jobId: "job-stream", queued: false })
          .mockResolvedValueOnce({ jobId: "job-poll", queued: true })
          .mockResolvedValueOnce({ ok: true, venvReseeded: true });
        apiGetMock.mockResolvedValue({
          bundles: [
            makeBundleState({
              id: "reset-stream-bundle",
              status: "not_installed",
            }),
            makeBundleState({
              id: "reset-poll-bundle",
              status: "not_installed",
            }),
          ],
        });

        await useFeaturesStore.getState().installAll();
        await vi.waitFor(() => {
          expect(FakeEventSource.instances).toHaveLength(1);
          expect(useFeaturesStore.getState().queued).toContain("reset-poll-bundle");
        });

        const es = FakeEventSource.instances[0];
        expect(es.closed).toBe(false);
        expect(useFeaturesStore.getState().installAllActive).toBe(true);
        expect(vi.getTimerCount()).toBe(1);

        await useFeaturesStore.getState().resetEnvironment();

        expect(es.closed).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
        expect(useFeaturesStore.getState().installing).toEqual({});
        expect(useFeaturesStore.getState().queued).toEqual([]);
        expect(useFeaturesStore.getState().installAllActive).toBe(false);

        apiGetMock.mockClear();
        es.onmessage?.({
          data: JSON.stringify({ phase: "downloading", percent: 70, stage: "Late frame" }),
        });
        await vi.advanceTimersByTimeAsync(6_000);

        expect(useFeaturesStore.getState().installing).toEqual({});
        expect(useFeaturesStore.getState().queued).toEqual([]);
        expect(apiGetMock).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("ignores an in-flight poll tick or install POST that resolves after resetEnvironment (#3340)", async () => {
      vi.useFakeTimers();
      try {
        let resolvePollRefresh: ((value: { bundles: FeatureBundleState[] }) => void) | undefined;
        let resolveLateInstall: ((value: { jobId: string; queued?: boolean }) => void) | undefined;
        apiPostMock
          .mockResolvedValueOnce({ jobId: "job-poll-inflight", queued: true })
          .mockImplementationOnce(
            () =>
              new Promise<{ jobId: string; queued?: boolean }>((resolve) => {
                resolveLateInstall = resolve;
              }),
          )
          .mockResolvedValueOnce({ ok: true, venvReseeded: true });
        apiGetMock
          .mockImplementationOnce(
            () =>
              new Promise<{ bundles: FeatureBundleState[] }>((resolve) => {
                resolvePollRefresh = resolve;
              }),
          )
          .mockResolvedValueOnce({
            bundles: [
              makeBundleState({ id: "poll-inflight-bundle", status: "not_installed" }),
              makeBundleState({ id: "post-inflight-bundle", status: "not_installed" }),
            ],
          });

        await useFeaturesStore.getState().installBundle("poll-inflight-bundle");
        expect(useFeaturesStore.getState().queued).toContain("poll-inflight-bundle");

        const lateInstallPromise = useFeaturesStore
          .getState()
          .installBundle("post-inflight-bundle");
        expect(resolveLateInstall).toBeDefined();

        // Trigger the 3s poll tick; its refreshBundles() call stays in flight.
        vi.advanceTimersByTime(3_000);
        expect(resolvePollRefresh).toBeDefined();

        // While both requests are in flight, resetEnvironment runs and finishes.
        await useFeaturesStore.getState().resetEnvironment();
        expect(useFeaturesStore.getState().installing).toEqual({});
        expect(useFeaturesStore.getState().queued).toEqual([]);
        expect(useFeaturesStore.getState().bundles.every((b) => b.status === "not_installed")).toBe(
          true,
        );

        // Now the stale poll's GET /v1/features and the stale install POST resolve.
        resolvePollRefresh?.({
          bundles: [
            makeBundleState({
              id: "poll-inflight-bundle",
              status: "installing",
              progress: { percent: 50, stage: "Stale poll" },
            }),
          ],
        });
        resolveLateInstall?.({ jobId: "job-late-post", queued: false });
        await lateInstallPromise;
        await Promise.resolve();
        await Promise.resolve();

        expect(useFeaturesStore.getState().installing).toEqual({});
        expect(useFeaturesStore.getState().queued).toEqual([]);
        expect(FakeEventSource.instances).toHaveLength(0);
        expect(useFeaturesStore.getState().bundles.every((b) => b.status === "not_installed")).toBe(
          true,
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("refresh()", () => {
    // The failure streak lives in the store closure, which setState does not
    // reset. A successful refresh clears it, so each test starts from zero.
    const resetFailureStreak = async (bundles: FeatureBundleState[]) => {
      apiGetMock.mockResolvedValueOnce({ bundles });
      await useFeaturesStore.getState().refresh();
    };

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

    // #1138: one failed refresh is often a blip, so the notice waits for a
    // second consecutive failure. The poller ticks every 3s, so a single
    // failure flapping the notice on and off would read as noise.
    it("marks the list stale after two consecutive failed refreshes and clears it on success", async () => {
      const known = [makeBundleState({ id: "known", status: "installed" })];
      await resetFailureStreak(known);
      useFeaturesStore.setState({ bundles: known, loaded: true });
      apiGetMock.mockRejectedValue(new Error("down"));

      await useFeaturesStore.getState().refresh();
      expect(useFeaturesStore.getState().bundlesStale).toBe(false);

      await useFeaturesStore.getState().refresh();
      expect(useFeaturesStore.getState().bundlesStale).toBe(true);
      expect(useFeaturesStore.getState().bundles).toEqual(known);

      apiGetMock.mockResolvedValue({ bundles: known });
      await useFeaturesStore.getState().refresh();
      expect(useFeaturesStore.getState().bundlesStale).toBe(false);
    });

    it("counts only consecutive failures toward the stale notice", async () => {
      await resetFailureStreak([]);
      useFeaturesStore.setState({ loaded: true });
      apiGetMock
        .mockRejectedValueOnce(new Error("blip"))
        .mockResolvedValueOnce({ bundles: [] })
        .mockRejectedValueOnce(new Error("blip again"));

      await useFeaturesStore.getState().refresh();
      await useFeaturesStore.getState().refresh();
      await useFeaturesStore.getState().refresh();

      expect(useFeaturesStore.getState().bundlesStale).toBe(false);
    });

    // #4174: a poll tick that finds the bundle missing or not_installed means
    // the install did not finish. Settling it as success clears the pill with
    // no error, so the user sees neither installed nor failed.
    it.each([
      ["missing from the list", []],
      ["reported not_installed", [makeBundleState({ id: "test-bundle", status: "not_installed" })]],
    ])(
      "records an error when the install's bundle is %s on a poll tick",
      async (_label, bundles) => {
        apiPostMock.mockResolvedValueOnce({ jobId: "job-vanished" });
        const promise = useFeaturesStore.getState().installBundle("test-bundle");
        await vi.waitFor(() => {
          expect(FakeEventSource.instances).toHaveLength(1);
        });
        await promise;
        const es = FakeEventSource.instances[0];

        vi.useFakeTimers();
        try {
          apiGetMock.mockResolvedValue({ bundles });
          es.onerror?.();
          await vi.advanceTimersByTimeAsync(3_000);

          expect(useFeaturesStore.getState().errors["test-bundle"]).toBeTruthy();
          expect(useFeaturesStore.getState().installing["test-bundle"]).toBeUndefined();
        } finally {
          vi.useRealTimers();
        }
      },
    );

    it("keeps the status poller running after a failed refresh tick", async () => {
      apiPostMock.mockResolvedValueOnce({ jobId: "job-poll-refresh-fail" });
      const promise = useFeaturesStore.getState().installBundle("test-bundle");
      await vi.waitFor(() => {
        expect(FakeEventSource.instances).toHaveLength(1);
      });
      await promise;
      const es = FakeEventSource.instances[0];

      vi.useFakeTimers();
      try {
        apiGetMock.mockRejectedValue(new Error("down"));
        es.onerror?.();
        await vi.advanceTimersByTimeAsync(3_000);
        await vi.advanceTimersByTimeAsync(3_000);

        const featureCalls = apiGetMock.mock.calls.filter((call) => call[0] === "/v1/features");
        expect(featureCalls.length).toBeGreaterThanOrEqual(2);
        expect(useFeaturesStore.getState().installing["test-bundle"]).toBeDefined();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("ETA clock for queued installs (#871)", () => {
    it("restarts the bundle's start time when the server actually begins installing it", async () => {
      // The ETA in the AI Features panel is a linear extrapolation from
      // startTimes[bundleId]. A bundle queued behind other installs kept the
      // time it was clicked, so once it finally started, its first real
      // percent was divided by the whole queue wait and the ETA read as
      // hundreds of minutes.
      const clickedAt = 1_000;
      const startedAt = clickedAt + 40 * 60_000;
      const nowSpy = vi.spyOn(Date, "now").mockReturnValue(clickedAt);
      useFeaturesStore.setState({
        bundles: [makeBundleState({ id: "eta-bundle" })],
        loaded: true,
        startTimes: {},
      });
      apiPostMock.mockResolvedValueOnce({ jobId: "job-eta", queued: true });

      let status: FeatureBundleState["status"] = "queued";
      let percent = 3;
      apiGetMock.mockImplementation(() =>
        Promise.resolve({
          bundles: [
            makeBundleState({
              id: "eta-bundle",
              status,
              progress: status === "installing" ? { percent, stage: "Downloading..." } : null,
            }),
          ],
        }),
      );

      await useFeaturesStore.getState().installBundle("eta-bundle");
      expect(useFeaturesStore.getState().queued).toContain("eta-bundle");
      expect(useFeaturesStore.getState().startTimes["eta-bundle"]).toBe(clickedAt);

      // Forty minutes later the queue reaches this bundle; the next poll
      // moves it queued -> installing and must reset its clock.
      nowSpy.mockReturnValue(startedAt);
      status = "installing";
      await vi.waitFor(
        () => {
          expect(useFeaturesStore.getState().installing["eta-bundle"]).toBeDefined();
        },
        { timeout: 8000 },
      );
      expect(useFeaturesStore.getState().queued).not.toContain("eta-bundle");
      expect(useFeaturesStore.getState().startTimes["eta-bundle"]).toBe(startedAt);

      // Later polls of the same install must leave the clock alone, or the
      // ETA would read "less than a minute" for the whole install.
      nowSpy.mockReturnValue(startedAt + 3 * 60_000);
      percent = 10;
      await vi.waitFor(
        () => {
          expect(useFeaturesStore.getState().installing["eta-bundle"]?.percent).toBe(10);
        },
        { timeout: 8000 },
      );
      expect(useFeaturesStore.getState().startTimes["eta-bundle"]).toBe(startedAt);

      // Let the poll observe the terminal state so it stops.
      status = "installed";
      await vi.waitFor(
        () => {
          expect(useFeaturesStore.getState().installing["eta-bundle"]).toBeUndefined();
        },
        { timeout: 8000 },
      );
    }, 30000);
  });
});
