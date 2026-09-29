// @vitest-environment jsdom

/**
 * #1480 relies on identity: the error Vite hands to "vite:preloadError" must
 * be the same object React's error boundary receives after lazy() rejects,
 * or isAbortedByLeaving never matches and the telemetry still goes out.
 */

import { act, Component, type ErrorInfo, lazy, type ReactNode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const captureReactException = vi.fn();

vi.mock("@/lib/analytics", () => ({
  isAnalyticsActive: () => true,
  track: vi.fn(),
}));
vi.mock("@sentry/react", () => ({
  captureReactException: (...args: unknown[]) => captureReactException(...args),
  captureException: vi.fn(),
}));

const { reportRenderError } = await import("@/lib/report-render-error");
const { installChunkReloadHandler } = await import("@/lib/chunk-reload");

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    reportRenderError(error, info);
  }
  render() {
    return this.state.failed ? <p>crashed</p> : this.props.children;
  }
}

/** What Vite's preload helper does when nobody handles the event: announce, then rethrow. */
function viteRejection(error: Error): Promise<never> {
  const event = Object.assign(new Event("vite:preloadError", { cancelable: true }), {
    payload: error,
  });
  window.dispatchEvent(event);
  return Promise.reject(error);
}

describe("a lazy page aborted while leaving", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    captureReactException.mockReset();
    document.body.innerHTML = "";
  });

  it("reaches the boundary as the same error, so it is not reported straight away", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const uninstall = installChunkReloadHandler(vi.fn());
    window.dispatchEvent(new Event("beforeunload", { cancelable: true }));

    const aborted = new TypeError("Importing a module script failed.");
    const Page = lazy(() =>
      viteRejection(aborted).then((m: { Page: () => ReactNode }) => ({ default: m.Page })),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Boundary>
          <Suspense fallback={null}>
            <Page />
          </Suspense>
        </Boundary>,
      );
    });
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(container.textContent).toBe("crashed");
    expect(captureReactException).not.toHaveBeenCalled();

    act(() => root.unmount());
    uninstall();
  });
});
