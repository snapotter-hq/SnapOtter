// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bufferRenderError,
  discardEarlyErrors,
  flushEarlyErrors,
  resetEarlyErrorsForTests,
  startEarlyErrorCapture,
} from "../../../apps/web/src/lib/early-errors.js";

const h = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureReactException: vi.fn(),
  client: {} as object | undefined,
}));
vi.mock("@sentry/react", () => ({
  captureException: h.captureException,
  captureReactException: h.captureReactException,
  getClient: () => h.client,
}));

// Guard so jsdom does not surface these synthetic error events as "uncaught"
// (production code intentionally never preventDefaults real errors).
const guard = (e: Event) => e.preventDefault();
beforeEach(() => {
  resetEarlyErrorsForTests();
  vi.clearAllMocks();
  h.client = {};
  window.addEventListener("error", guard);
});
afterEach(() => window.removeEventListener("error", guard));

describe("early error buffer", () => {
  it("buffers a pre-init error and replays it to Sentry on flush", async () => {
    startEarlyErrorCapture();
    const boom = new Error("early boom");
    window.dispatchEvent(new ErrorEvent("error", { error: boom, cancelable: true }));

    await flushEarlyErrors();

    expect(h.captureException).toHaveBeenCalledTimes(1);
    expect(h.captureException).toHaveBeenCalledWith(boom);
  });

  it("does not replay when Sentry never initialized (opt-out safe)", async () => {
    startEarlyErrorCapture();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("x"), cancelable: true }));
    h.client = undefined; // no Sentry client -> analytics off

    await flushEarlyErrors();

    expect(h.captureException).not.toHaveBeenCalled();
  });

  it("stops buffering after flush so post-init errors are left to the SDK", async () => {
    startEarlyErrorCapture();
    await flushEarlyErrors();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("late"), cancelable: true }));
    await flushEarlyErrors();

    expect(h.captureException).not.toHaveBeenCalled();
  });

  it("replays a boundary-caught render crash with React's component stack", async () => {
    const error = new Error("first paint");
    const errorInfo = { componentStack: "\n    at ToolPage" };
    bufferRenderError(error, errorInfo);

    await flushEarlyErrors();

    expect(h.captureReactException).toHaveBeenCalledWith(error, errorInfo);
    expect(h.captureException).not.toHaveBeenCalled();
  });

  it("discards a buffered render crash when telemetry is off", async () => {
    bufferRenderError(new Error("opted out"), { componentStack: "\n    at ToolPage" });

    discardEarlyErrors();
    await flushEarlyErrors();

    expect(h.captureReactException).not.toHaveBeenCalled();
  });

  it("does not replay an in-flight flush after an opt-out", async () => {
    bufferRenderError(new Error("just before opt-out"), { componentStack: "\n    at ToolPage" });

    const flushing = flushEarlyErrors();
    discardEarlyErrors();
    await flushing;

    expect(h.captureReactException).not.toHaveBeenCalled();
  });
});
