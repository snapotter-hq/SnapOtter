import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AiLogger, aiLog, setAiLogger } from "../../../packages/ai/src/log.js";

afterEach(() => {
  setAiLogger(null);
  vi.restoreAllMocks();
});

function recordingLogger(): AiLogger & {
  calls: Array<[string, string, unknown]>;
} {
  const calls: Array<[string, string, unknown]> = [];
  return {
    calls,
    info: (message) => calls.push(["info", message, undefined]),
    warn: (message, error) => calls.push(["warn", message, error]),
    error: (message, error) => calls.push(["error", message, error]),
  };
}

describe("packages/ai log sink (#1500)", () => {
  it("writes to the console by default, with exactly the arguments given", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("boom");

    aiLog.info("[bridge] ready");
    aiLog.warn("[bridge] backing off");
    aiLog.error("[bridge] failed", cause);

    expect(log).toHaveBeenCalledWith("[bridge] ready");
    expect(warn).toHaveBeenCalledWith("[bridge] backing off");
    expect(warn.mock.calls[0]).toHaveLength(1);
    expect(error).toHaveBeenCalledWith("[bridge] failed", cause);
  });

  it("routes every level to an installed logger instead of the console", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sink = recordingLogger();
    const cause = new Error("boom");

    setAiLogger(sink);
    aiLog.info("one");
    aiLog.warn("two");
    aiLog.error("three", cause);

    expect(sink.calls).toEqual([
      ["info", "one", undefined],
      ["warn", "two", undefined],
      ["error", "three", cause],
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("goes back to the console when the logger is cleared", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setAiLogger(recordingLogger());
    setAiLogger(null);

    aiLog.warn("back on the console");

    expect(warn).toHaveBeenCalledWith("back on the console");
  });

  it("is the only thing in packages/ai/src that writes to the console", () => {
    // A direct console call skips the sink, so its line misses LOG_DIR again.
    const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/ai/src");
    const direct = /\bconsole\.(log|info|warn|error|debug|trace)\(|process\.std(out|err)\.write\(/;
    const offenders = readdirSync(srcDir, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".ts") && file !== "log.ts")
      .filter((file) => direct.test(readFileSync(join(srcDir, file), "utf8")));

    expect(offenders).toEqual([]);
  });
});
