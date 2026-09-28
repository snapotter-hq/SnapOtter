import { beforeEach, describe, expect, it, vi } from "vitest";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";

const reportError = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/api/src/lib/error-report.js", () => ({ reportError }));

const log = { warn: vi.fn() };

function engineDown(code = "ENGINE_UNAVAILABLE") {
  return new InputValidationError("engine down", 503, "set FFPROBE_PATH", code);
}

// The dedupe set is module state, so every case starts from a fresh module.
async function freshHelper() {
  vi.resetModules();
  const mod = await import("../../../apps/api/src/lib/engine-unavailable.js");
  return mod.reportEngineUnavailable;
}

beforeEach(() => {
  reportError.mockReset();
  log.warn.mockReset();
});

describe("reportEngineUnavailable (#1403)", () => {
  it("ignores a 4xx, which is the caller's fault", async () => {
    const report = await freshHelper();
    report(new InputValidationError("bad file"), "mute-video", log);
    expect(log.warn).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("logs and reports a 5xx once per code and tool", async () => {
    const report = await freshHelper();
    const err = engineDown();
    report(err, "mute-video", log);
    report(engineDown(), "mute-video", log);

    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0]?.[0]).toMatchObject({
      code: "ENGINE_UNAVAILABLE",
      toolId: "mute-video",
    });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(err, {
      source: "http",
      toolId: "mute-video",
      statusCode: 503,
    });
  });

  it("reports again for a different tool or a different code", async () => {
    const report = await freshHelper();
    report(engineDown(), "mute-video", log);
    report(engineDown(), "trim-video", log);
    report(engineDown("OTHER_ENGINE"), "mute-video", log);
    expect(reportError).toHaveBeenCalledTimes(3);
  });
});
