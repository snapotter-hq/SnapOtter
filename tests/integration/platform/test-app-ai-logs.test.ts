/**
 * buildTestApp() must log packages/ai diagnostics the way the real server does
 * (#5186). On the console default, a dispatcher line that arrives after a
 * file's last test fails the whole shard with "Closing rpc while
 * onUserConsoleLog was pending" (#5093).
 */

import { runOcrRuntime } from "@snapotter/ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../../apps/api/src/lib/logger.js";
import { aiLog } from "../../../packages/ai/src/log.js";
import { buildTestApp } from "../test-server.js";

const hoisted = vi.hoisted(() => ({
  shutdownDispatcher: vi.fn(),
  shutdownDocsDispatcher: vi.fn(),
  shutdownOcrDispatcher: vi.fn(),
}));

vi.mock("@snapotter/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@snapotter/ai")>();
  hoisted.shutdownDispatcher.mockImplementation(actual.shutdownDispatcher);
  hoisted.shutdownDocsDispatcher.mockImplementation(actual.shutdownDocsDispatcher);
  hoisted.shutdownOcrDispatcher.mockImplementation(actual.shutdownOcrDispatcher);
  return {
    ...actual,
    shutdownDispatcher: hoisted.shutdownDispatcher,
    shutdownDocsDispatcher: hoisted.shutdownDocsDispatcher,
    shutdownOcrDispatcher: hoisted.shutdownOcrDispatcher,
  };
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

  it("shuts the docs and OCR dispatchers down when the last app closes (#5200)", async () => {
    const first = await buildTestApp();
    const second = await buildTestApp();
    hoisted.shutdownDocsDispatcher.mockClear();
    hoisted.shutdownOcrDispatcher.mockClear();

    await first.cleanup();
    expect(hoisted.shutdownDocsDispatcher).not.toHaveBeenCalled();
    expect(hoisted.shutdownOcrDispatcher).not.toHaveBeenCalled();

    await second.cleanup();
    expect(hoisted.shutdownDocsDispatcher).toHaveBeenCalledTimes(1);
    expect(hoisted.shutdownOcrDispatcher).toHaveBeenCalledTimes(1);
  });

  it("reopens OCR admission for an app built after the last one closed (#5200)", async () => {
    const first = await buildTestApp();
    await first.cleanup();

    const { cleanup } = await buildTestApp();
    try {
      // The call fails either way (no runtime installed, or bad args and a
      // short timeout where one is), but never because the dispatcher was
      // left in shutdown.
      await expect(runOcrRuntime("ocr", [], { timeoutMs: 2_000 })).rejects.not.toThrow(
        /dispatcher is shutdown/,
      );
    } finally {
      await cleanup();
    }
  });
});
