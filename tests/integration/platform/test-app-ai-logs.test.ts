/**
 * buildTestApp() must log packages/ai diagnostics the way the real server does
 * (#5186). On the console default, a dispatcher line that arrives after a
 * file's last test fails the whole shard with "Closing rpc while
 * onUserConsoleLog was pending" (#5093).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../../apps/api/src/lib/logger.js";
import { aiLog } from "../../../packages/ai/src/log.js";
import { buildTestApp } from "../test-server.js";

const hoisted = vi.hoisted(() => ({ shutdownDispatcher: vi.fn() }));

vi.mock("@snapotter/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@snapotter/ai")>();
  hoisted.shutdownDispatcher.mockImplementation(actual.shutdownDispatcher);
  return { ...actual, shutdownDispatcher: hoisted.shutdownDispatcher };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildTestApp AI logging (#5186)", () => {
  it("sends AI diagnostics to pino instead of the console", async () => {
    const { cleanup } = await buildTestApp();
    try {
      const info = vi.spyOn(logger, "info").mockImplementation(() => {});
      const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
      const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

      aiLog.info("[bridge] Python dispatcher ready (GPU: false)");
      aiLog.warn("[python] [dispatcher] model cache miss");

      expect(info).toHaveBeenCalledWith("[bridge] Python dispatcher ready (GPU: false)");
      expect(warn).toHaveBeenCalledWith("[python] [dispatcher] model cache miss");
      expect(consoleLog).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
    } finally {
      await cleanup();
    }
  });

  it("shuts the Python dispatcher down when the last app closes", async () => {
    const first = await buildTestApp();
    const second = await buildTestApp();
    hoisted.shutdownDispatcher.mockClear();

    await first.cleanup();
    expect(hoisted.shutdownDispatcher).not.toHaveBeenCalled();

    await second.cleanup();
    expect(hoisted.shutdownDispatcher).toHaveBeenCalledTimes(1);
  });
});
