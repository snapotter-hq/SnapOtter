import { afterEach, describe, expect, it, vi } from "vitest";
import { routeAiLogsToPino } from "../../../apps/api/src/lib/ai-log-sink.js";
import { logger } from "../../../apps/api/src/lib/logger.js";
import { aiLog, setAiLogger } from "../../../packages/ai/src/log.js";

afterEach(() => {
  setAiLogger(null);
  vi.restoreAllMocks();
});

describe("routeAiLogsToPino (#1500)", () => {
  it("sends packages/ai messages to the API's pino logger, errors as its err field", () => {
    // Spies replace the methods, so no real pino transport is built.
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const error = vi.spyOn(logger, "error").mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cause = new Error("dispatcher exited");

    routeAiLogsToPino();
    aiLog.info("[bridge] Python dispatcher ready (GPU: false)");
    aiLog.warn("[ocr-runtime] Accurate OCR runtime at /data/ai/v3 is unavailable: x");
    aiLog.warn("[bridge] crash", cause);
    aiLog.error("[bridge] Dispatcher error", cause);
    aiLog.error("[bridge] disabled");

    expect(info).toHaveBeenCalledWith("[bridge] Python dispatcher ready (GPU: false)");
    expect(warn).toHaveBeenNthCalledWith(
      1,
      "[ocr-runtime] Accurate OCR runtime at /data/ai/v3 is unavailable: x",
    );
    expect(warn).toHaveBeenNthCalledWith(2, { err: cause }, "[bridge] crash");
    expect(error).toHaveBeenNthCalledWith(1, { err: cause }, "[bridge] Dispatcher error");
    expect(error).toHaveBeenNthCalledWith(2, "[bridge] disabled");
    expect(consoleWarn).not.toHaveBeenCalled();
  });
});
