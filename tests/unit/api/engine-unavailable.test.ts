import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";

const reportError = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/api/src/lib/error-report.js", () => ({ reportError }));

const log = { warn: vi.fn() };

function engineDown(code = "ENGINE_UNAVAILABLE") {
  return new InputValidationError("engine down", 503, "set FFPROBE_PATH", code);
}

// The dedupe map is module state, so every case starts from a fresh module.
async function freshHelper() {
  vi.resetModules();
  const mod = await import("../../../apps/api/src/lib/engine-unavailable.js");
  return mod.reportEngineUnavailable;
}

beforeEach(() => {
  reportError.mockReset();
  log.warn.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reportEngineUnavailable (#1403)", () => {
  it("ignores a 4xx, which is the caller's fault", async () => {
    const report = await freshHelper();
    report(new InputValidationError("bad file"), "mute-video", log);
    expect(log.warn).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("logs and reports a 5xx once per code and tool within the window", async () => {
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

  describe("an intermittent fault (#1628)", () => {
    // Once per process suited a missing binary and hid every out-of-memory
    // decode after the first: the same code and tool, but it comes and goes.
    function withCause(name: string) {
      const err = engineDown();
      const cause = new Error("decoder failed");
      cause.name = name;
      err.cause = cause;
      return err;
    }

    it("reports again once the window has passed, and not before", async () => {
      const report = await freshHelper();
      const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
      report(engineDown(), "resize", log);
      now.mockReturnValue(1_000_000 + 9 * 60_000);
      report(engineDown(), "resize", log);
      expect(reportError).toHaveBeenCalledTimes(1);

      now.mockReturnValue(1_000_000 + 11 * 60_000);
      report(engineDown(), "resize", log);
      expect(reportError).toHaveBeenCalledTimes(2);
      expect(log.warn).toHaveBeenCalledTimes(2);
    });

    it("opens the next window at exactly ten minutes", async () => {
      const report = await freshHelper();
      const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
      report(engineDown(), "resize", log);
      now.mockReturnValue(1_000_000 + 10 * 60_000 - 1);
      report(engineDown(), "resize", log);
      expect(reportError).toHaveBeenCalledTimes(1);
      now.mockReturnValue(1_000_000 + 10 * 60_000);
      report(engineDown(), "resize", log);
      expect(reportError).toHaveBeenCalledTimes(2);
    });

    it("doesn't stay muted when the clock steps backwards", async () => {
      const report = await freshHelper();
      const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
      report(engineDown(), "resize", log);
      now.mockReturnValue(1_000_000 - 60 * 60_000);
      report(engineDown(), "resize", log);
      expect(reportError).toHaveBeenCalledTimes(2);
    });

    it("keeps a decoder running out of memory from hiding behind a missing one", async () => {
      const report = await freshHelper();
      report(withCause("DecoderUnavailableError"), "resize", log);
      report(withCause("DecoderOutOfMemoryError"), "resize", log);
      report(withCause("DecoderOutOfMemoryError"), "resize", log);
      expect(reportError).toHaveBeenCalledTimes(2);
      expect(log.warn.mock.calls.map((call) => call[0].cause)).toEqual([
        "DecoderUnavailableError",
        "DecoderOutOfMemoryError",
      ]);
    });
  });
});

describe("sharedServerFault (#1432)", () => {
  async function helpers() {
    return await import("../../../apps/api/src/lib/engine-unavailable.js");
  }
  const down = {
    error: "engine down",
    statusCode: 503,
    code: "ENGINE_UNAVAILABLE",
    details: "set FFPROBE_PATH",
  };

  it("returns the fault when every file failed with the same 5xx code", async () => {
    const { sharedServerFault } = await helpers();
    expect(sharedServerFault([down, down])).toEqual({
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      error: "engine down",
      details: "set FFPROBE_PATH",
    });
  });

  it("returns null when the files failed for different reasons", async () => {
    const { sharedServerFault } = await helpers();
    expect(sharedServerFault([down, { error: "corrupt", statusCode: 400 }])).toBeNull();
    expect(sharedServerFault([down, { ...down, code: "OTHER" }])).toBeNull();
  });

  it("returns null for a shared 4xx, which is still the files' fault", async () => {
    const { sharedServerFault } = await helpers();
    const bad = { error: "corrupt", statusCode: 400, code: "BAD_INPUT" };
    expect(sharedServerFault([bad, bad])).toBeNull();
  });

  it("returns null for no failures or failures without a code", async () => {
    const { sharedServerFault } = await helpers();
    expect(sharedServerFault([])).toBeNull();
    expect(sharedServerFault([{ error: "x", statusCode: 503 }])).toBeNull();
  });

  it("preFailureFaultFields keeps status, code, and details", async () => {
    const { preFailureFaultFields } = await helpers();
    expect(preFailureFaultFields(engineDown())).toEqual({
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      details: "set FFPROBE_PATH",
    });
    expect(preFailureFaultFields(new InputValidationError("bad"))).toEqual({ statusCode: 400 });
  });
});

describe("allFailedFault (#1627)", () => {
  async function helpers() {
    return await import("../../../apps/api/src/lib/engine-unavailable.js");
  }
  const down = {
    error: "engine down",
    statusCode: 503,
    code: "ENGINE_UNAVAILABLE",
    details: "check the engine",
  };

  it("finds one fault across pre-failures and worker failures", async () => {
    const { allFailedFault } = await helpers();
    expect(allFailedFault([down], 1, [down], 1)).toMatchObject({
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
    });
  });

  it("judges worker failures alone when nothing failed before the flow", async () => {
    const { allFailedFault } = await helpers();
    expect(allFailedFault([], 0, [down, down], 2)).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
    // A job queued before the field existed carries none at all.
    expect(allFailedFault(undefined, 0, [down, down], 2)).toMatchObject({
      code: "ENGINE_UNAVAILABLE",
    });
  });

  it("gives no verdict when the pre-failures don't account for every file", async () => {
    const { allFailedFault } = await helpers();
    // An older build sent none, though one file failed before the flow.
    expect(allFailedFault(undefined, 1, [down], 1)).toBeNull();
    expect(allFailedFault([down], 2, [down], 1)).toBeNull();
    // A flow child with no fault recorded is a file nobody judged.
    expect(allFailedFault([], 0, [down], 2)).toBeNull();
    expect(allFailedFault("not a list", 0, [down], 1)).toMatchObject({
      code: "ENGINE_UNAVAILABLE",
    });
  });

  it("keeps the generic answer when one file failed differently", async () => {
    const { allFailedFault } = await helpers();
    expect(allFailedFault([], 0, [down, { error: "Child job row not found" }], 2)).toBeNull();
    expect(allFailedFault([{ error: "corrupt", statusCode: 400 }], 1, [down], 1)).toBeNull();
  });

  it("carries a fault without a hint", async () => {
    const { allFailedFault } = await helpers();
    const bare = { error: "engine down", statusCode: 503, code: "ENGINE_UNAVAILABLE" };
    expect(allFailedFault([], 0, [bare, bare], 2)).toEqual({
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      error: "engine down",
    });
  });
});
