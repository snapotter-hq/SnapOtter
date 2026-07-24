import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSpawnHelpers } from "./helpers/spawn-capture.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const mockSpawn = vi.mocked(spawn);
const h = makeSpawnHelpers(mockSpawn);

const validStamp = { text: "DRAFT", position: "c", fontSize: 24, opacity: 0.5, rotation: 45 };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PDFCPU_PATH = "/usr/bin/pdfcpu";
  delete process.env.SUBPROCESS_MEMORY_LIMIT_MB;
});

afterEach(() => {
  delete process.env.PDFCPU_PATH;
});

describe("runPdfcpu (shared runner via pdfcpuCropMargin)", () => {
  it("prepends -c disable to every invocation", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf"));
    const args = h.lastArgs();
    expect(args[0]).toBe("-c");
    expect(args[1]).toBe("disable");
  });

  it("resolves on exit 0", async () => {
    h.nextClose({ stdout: "done", code: 0 });
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf")),
    ).resolves.toBeUndefined();
  });

  it("rejects on non-zero exit with the stderr tail", async () => {
    h.nextClose({ stderr: "pdfcpu: cannot read file", code: 1 });
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf")),
    ).rejects.toThrow("pdfcpu exited 1: pdfcpu: cannot read file");
  });

  it("falls back to stdout in the error when stderr is empty", async () => {
    h.nextClose({ stdout: "problem on stdout", code: 2 });
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf")),
    ).rejects.toThrow("pdfcpu exited 2: problem on stdout");
  });

  it("reports the signal when code is null", async () => {
    h.nextClose({ stderr: "killed", code: null, signal: "SIGKILL" });
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf")),
    ).rejects.toThrow("pdfcpu exited SIGKILL: killed");
  });

  it("rejects on an error event", async () => {
    h.nextError(new Error("spawn pdfcpu ENOENT"));
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf")),
    ).rejects.toThrow("spawn pdfcpu ENOENT");
  });

  it("throws when the binary is unavailable", async () => {
    vi.resetModules();
    vi.doMock("../src/binaries.js", () => ({ resolvePdfcpu: () => null }));
    const mod = await import("../src/pdfcpu.js");
    await expect(mod.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf")).rejects.toThrow(
      "pdfcpu binary not found (set PDFCPU_PATH or install pdfcpu)",
    );
    vi.doUnmock("../src/binaries.js");
    vi.resetModules();
  });

  it("kills with SIGKILL and rejects after the 60s deadline", async () => {
    const mod = await import("../src/pdfcpu.js");
    vi.useFakeTimers();
    try {
      const child = h.nextManual();
      const settled = expect(mod.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf")).rejects.toThrow(
        "pdfcpu timed out after 60s",
      );
      await vi.advanceTimersByTimeAsync(60_000);
      await settled;
      expect(child.killSignals).toContain("SIGKILL");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("pdfcpuCropMargin", () => {
  it("builds crop <margin> <in> <out> after the -c disable prefix", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 20, "/out.pdf"));
    expect(h.lastArgs()).toEqual(["-c", "disable", "crop", "20", "/in.pdf", "/out.pdf"]);
  });

  it("stringifies the numeric margin", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 0, "/out.pdf"));
    expect(h.lastArgs()[3]).toBe("0");
  });

  it("rejects a negative margin before spawning", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", -1, "/out.pdf")),
    ).rejects.toThrow("Crop margin must be 0-2000 points");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("rejects a margin above 2000", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 2001, "/out.pdf")),
    ).rejects.toThrow("Crop margin must be 0-2000 points");
  });

  it("rejects a non-finite margin (NaN)", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", Number.NaN, "/out.pdf")),
    ).rejects.toThrow("Crop margin must be 0-2000 points");
  });

  it("accepts the boundary values 0 and 2000", async () => {
    h.nextClose({ code: 0 });
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 2000, "/out.pdf")),
    ).resolves.toBeUndefined();
  });
});

describe("pdfcpuNup", () => {
  it("builds nup <out> <n> <in> (out before n and in)", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdfcpu.js").then((m) => m.pdfcpuNup("/in.pdf", 4, "/out.pdf"));
    expect(h.lastArgs()).toEqual(["-c", "disable", "nup", "/out.pdf", "4", "/in.pdf"]);
  });

  it("accepts each valid n-up value", async () => {
    for (const n of [2, 3, 4, 8, 9, 12, 16] as const) {
      h.nextClose({ code: 0 });
      await import("../src/pdfcpu.js").then((m) => m.pdfcpuNup("/in.pdf", n, "/out.pdf"));
      expect(h.lastArgs()[4]).toBe(String(n));
    }
  });

  it("rejects an invalid n-up value before spawning", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuNup("/in.pdf", 5 as never, "/out.pdf")),
    ).rejects.toThrow("Invalid n-up value: 5. Must be one of: 2, 3, 4, 8, 9, 12, 16");
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

describe("pdfcpuBooklet", () => {
  it("builds booklet <out> <n> <in>", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdfcpu.js").then((m) => m.pdfcpuBooklet("/in.pdf", 2, "/out.pdf"));
    expect(h.lastArgs()).toEqual(["-c", "disable", "booklet", "/out.pdf", "2", "/in.pdf"]);
  });

  it("accepts each valid booklet value", async () => {
    for (const n of [2, 4, 6, 8] as const) {
      h.nextClose({ code: 0 });
      await import("../src/pdfcpu.js").then((m) => m.pdfcpuBooklet("/in.pdf", n, "/out.pdf"));
      expect(h.lastArgs()[4]).toBe(String(n));
    }
  });

  it("rejects an invalid booklet value (rejects an n-up-only value)", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuBooklet("/in.pdf", 3 as never, "/out.pdf")),
    ).rejects.toThrow("Invalid booklet value: 3. Must be one of: 2, 4, 6, 8");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("rejects 16 (valid for n-up but not booklet)", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuBooklet("/in.pdf", 16 as never, "/out.pdf")),
    ).rejects.toThrow("Invalid booklet value: 16");
  });
});

describe("pdfcpuTextStamp", () => {
  it("builds stamp add -- <text> <desc> <in> <out>", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdfcpu.js").then((m) =>
      m.pdfcpuTextStamp("/in.pdf", validStamp, "/out.pdf"),
    );
    expect(h.lastArgs()).toEqual([
      "-c",
      "disable",
      "stamp",
      "add",
      "--",
      "DRAFT",
      "pos:c, points:24, op:0.5, rotation:45",
      "/in.pdf",
      "/out.pdf",
    ]);
  });

  it("formats the description with pos/points/op/rotation keys in order", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdfcpu.js").then((m) =>
      m.pdfcpuTextStamp(
        "/in.pdf",
        { text: "Page %p of %P", position: "br", fontSize: 12, opacity: 1, rotation: -90 },
        "/out.pdf",
      ),
    );
    const args = h.lastArgs();
    expect(args[5]).toBe("Page %p of %P");
    expect(args[6]).toBe("pos:br, points:12, op:1, rotation:-90");
  });

  it.each([
    ["%", "%%"],
    ["100%", "100%%"],
    ["%x", "%%x"],
    ["already %% literal", "already %%%% literal"],
  ])("escapes literal pdfcpu percent markers in %j", async (text, expected) => {
    h.nextClose({ code: 0 });
    await import("../src/pdfcpu.js").then((m) =>
      m.pdfcpuTextStamp("/in.pdf", { ...validStamp, text }, "/out.pdf"),
    );
    expect(h.lastArgs()[5]).toBe(expected);
  });

  it("rejects empty text before spawning", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, text: "" }, "/out.pdf"),
      ),
    ).rejects.toThrow("Stamp text must be 1-200 characters");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("rejects text longer than 200 characters", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, text: "x".repeat(201) }, "/out.pdf"),
      ),
    ).rejects.toThrow("Stamp text must be 1-200 characters");
  });

  it("rejects an unknown position anchor", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, position: "middle" }, "/out.pdf"),
      ),
    ).rejects.toThrow(
      "Invalid stamp position: middle. Must be one of: tl, tc, tr, l, c, r, bl, bc, br",
    );
  });

  it("accepts each valid position anchor", async () => {
    for (const position of ["tl", "tc", "tr", "l", "c", "r", "bl", "bc", "br"]) {
      h.nextClose({ code: 0 });
      await import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, position }, "/out.pdf"),
      );
      expect(h.lastArgs()[6]).toContain(`pos:${position},`);
    }
  });

  it("rejects a font size below 6", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, fontSize: 5 }, "/out.pdf"),
      ),
    ).rejects.toThrow("Font size must be 6-72");
  });

  it("rejects a font size above 72", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, fontSize: 73 }, "/out.pdf"),
      ),
    ).rejects.toThrow("Font size must be 6-72");
  });

  it("accepts font sizes at the 6 and 72 boundaries", async () => {
    h.nextClose({ code: 0 });
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, fontSize: 6 }, "/out.pdf"),
      ),
    ).resolves.toBeUndefined();
    h.nextClose({ code: 0 });
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, fontSize: 72 }, "/out.pdf"),
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects opacity below 0.05", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, opacity: 0.04 }, "/out.pdf"),
      ),
    ).rejects.toThrow("Opacity must be 0.05-1");
  });

  it("rejects opacity above 1", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, opacity: 1.01 }, "/out.pdf"),
      ),
    ).rejects.toThrow("Opacity must be 0.05-1");
  });

  it("rejects rotation below -180", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, rotation: -181 }, "/out.pdf"),
      ),
    ).rejects.toThrow("Rotation must be -180..180");
  });

  it("rejects rotation above 180", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, rotation: 181 }, "/out.pdf"),
      ),
    ).rejects.toThrow("Rotation must be -180..180");
  });

  it("accepts rotation at the -180 and 180 boundaries", async () => {
    h.nextClose({ code: 0 });
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, rotation: -180 }, "/out.pdf"),
      ),
    ).resolves.toBeUndefined();
    h.nextClose({ code: 0 });
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, rotation: 180 }, "/out.pdf"),
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects a non-finite font size (NaN)", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, fontSize: Number.NaN }, "/out.pdf"),
      ),
    ).rejects.toThrow("Font size must be 6-72");
  });
});
