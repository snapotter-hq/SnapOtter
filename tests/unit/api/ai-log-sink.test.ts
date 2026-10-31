import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routeAiLogsToPino } from "../../../apps/api/src/lib/ai-log-sink.js";
import { logger } from "../../../apps/api/src/lib/logger.js";
import { aiLog, setAiLogger } from "../../../packages/ai/src/log.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

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

describe("API startup (#1500)", () => {
  it("installs the pino sink at top level, before the server is built", () => {
    // Without the call every test above still passes and AI logs quietly go
    // back to the console, so pin it in the entry point's source.
    const source = readFileSync(resolve(root, "apps/api/src/index.ts"), "utf8");
    const call = source.search(/^routeAiLogsToPino\(\);$/m);

    expect(call, "apps/api/src/index.ts no longer calls routeAiLogsToPino()").toBeGreaterThan(-1);
    expect(call).toBeLessThan(source.indexOf("const app = Fastify("));
  });
});
