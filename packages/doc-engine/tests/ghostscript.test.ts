import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSpawnHelpers } from "./helpers/spawn-capture.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const mockSpawn = vi.mocked(spawn);
const h = makeSpawnHelpers(mockSpawn);

/** Pull a `-dKey=value` flag's value out of an argv array. */
function flagValue(args: string[], key: string): string | undefined {
  const prefix = `${key}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GS_PATH = "/usr/bin/gs";
  delete process.env.SUBPROCESS_MEMORY_LIMIT_MB;
});

afterEach(() => {
  delete process.env.GS_PATH;
});

describe("runGs error handling (via gsGrayscalePdf)", () => {
  it("resolves on exit 0", async () => {
    h.nextClose({ code: 0 });
    await expect(
      import("../src/ghostscript.js").then((m) => m.gsGrayscalePdf("/in.pdf", "/out.pdf")),
    ).resolves.toBeUndefined();
  });

  it("rejects on non-zero exit with the stderr tail", async () => {
    h.nextClose({ stderr: "Ghostscript could not open input", code: 1 });
    await expect(
      import("../src/ghostscript.js").then((m) => m.gsGrayscalePdf("/in.pdf", "/out.pdf")),
    ).rejects.toThrow("gs exited 1: Ghostscript could not open input");
  });

  it("reports the signal when code is null", async () => {
    h.nextClose({ stderr: "boom", code: null, signal: "SIGSEGV" });
    await expect(
      import("../src/ghostscript.js").then((m) => m.gsGrayscalePdf("/in.pdf", "/out.pdf")),
    ).rejects.toThrow("gs exited SIGSEGV: boom");
  });

  it("rejects on an error event", async () => {
    h.nextError(new Error("spawn gs ENOENT"));
    await expect(
      import("../src/ghostscript.js").then((m) => m.gsGrayscalePdf("/in.pdf", "/out.pdf")),
    ).rejects.toThrow("spawn gs ENOENT");
  });

  it("throws when the gs binary is unavailable", async () => {
    vi.resetModules();
    vi.doMock("../src/binaries.js", () => ({ resolveGs: () => null }));
    const mod = await import("../src/ghostscript.js");
    await expect(mod.gsGrayscalePdf("/in.pdf", "/out.pdf")).rejects.toThrow(
      "gs binary not found (set GS_PATH or install ghostscript)",
    );
    vi.doUnmock("../src/binaries.js");
    vi.resetModules();
  });

  it("kills with SIGKILL and rejects after the 120s deadline", async () => {
    const mod = await import("../src/ghostscript.js");
    vi.useFakeTimers();
    try {
      const child = h.nextManual();
      const settled = expect(mod.gsGrayscalePdf("/in.pdf", "/out.pdf")).rejects.toThrow(
        "ghostscript timed out after 120s",
      );
      await vi.advanceTimersByTimeAsync(120_000);
      await settled;
      expect(child.killSignals).toContain("SIGKILL");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("gsCompressPdf (preset re-distillation)", () => {
  it("builds the exact argv for the ebook preset", async () => {
    h.nextClose({ code: 0 });
    await import("../src/ghostscript.js").then((m) =>
      m.gsCompressPdf("/in.pdf", "/out.pdf", "ebook"),
    );
    expect(h.lastBin()).toBe("/usr/bin/gs");
    expect(h.lastArgs()).toEqual([
      "-dSAFER",
      "-dBATCH",
      "-dNOPAUSE",
      "-dQUIET",
      "-sDEVICE=pdfwrite",
      "-dPDFSETTINGS=/ebook",
      "-dCompatibilityLevel=1.6",
      "-sOutputFile=/out.pdf",
      "/in.pdf",
    ]);
  });

  it("interpolates the preset name into -dPDFSETTINGS for each preset", async () => {
    for (const preset of ["screen", "ebook", "printer"] as const) {
      h.nextClose({ code: 0 });
      await import("../src/ghostscript.js").then((m) =>
        m.gsCompressPdf("/in.pdf", "/out.pdf", preset),
      );
      expect(flagValue(h.lastArgs(), "-dPDFSETTINGS")).toBe(`/${preset}`);
    }
  });

  it("places the input path last and the output path in -sOutputFile", async () => {
    h.nextClose({ code: 0 });
    await import("../src/ghostscript.js").then((m) =>
      m.gsCompressPdf("/tmp/src.pdf", "/tmp/dst.pdf", "screen"),
    );
    const args = h.lastArgs();
    expect(args[args.length - 1]).toBe("/tmp/src.pdf");
    expect(flagValue(args, "-sOutputFile")).toBe("/tmp/dst.pdf");
  });
});

describe("gsGrayscalePdf", () => {
  it("builds the exact DeviceGray argv", async () => {
    h.nextClose({ code: 0 });
    await import("../src/ghostscript.js").then((m) => m.gsGrayscalePdf("/in.pdf", "/out.pdf"));
    expect(h.lastArgs()).toEqual([
      "-dSAFER",
      "-dBATCH",
      "-dNOPAUSE",
      "-dQUIET",
      "-sDEVICE=pdfwrite",
      "-sColorConversionStrategy=Gray",
      "-dProcessColorModel=/DeviceGray",
      "-sOutputFile=/out.pdf",
      "/in.pdf",
    ]);
  });
});

describe("gsPdfaConvert", () => {
  it("builds the exact PDF/A argv", async () => {
    h.nextClose({ code: 0 });
    await import("../src/ghostscript.js").then((m) => m.gsPdfaConvert("/in.pdf", "/out.pdf"));
    expect(h.lastArgs()).toEqual([
      "-dSAFER",
      "-dBATCH",
      "-dNOPAUSE",
      "-dQUIET",
      "-dPDFA=2",
      "-dPDFACompatibilityPolicy=1",
      "-sColorConversionStrategy=RGB",
      "-sDEVICE=pdfwrite",
      "-sOutputFile=/out.pdf",
      "/in.pdf",
    ]);
  });

  it("uses RGB (not Gray) color conversion for PDF/A", async () => {
    h.nextClose({ code: 0 });
    await import("../src/ghostscript.js").then((m) => m.gsPdfaConvert("/in.pdf", "/out.pdf"));
    expect(h.lastArgs()).toContain("-sColorConversionStrategy=RGB");
    expect(h.lastArgs()).not.toContain("-sColorConversionStrategy=Gray");
  });
});

describe("gsCompressPdfTuned (DPI + QFactor levers)", () => {
  async function run(dpi: number, qf: number): Promise<string[]> {
    h.nextClose({ code: 0 });
    await import("../src/ghostscript.js").then((m) =>
      m.gsCompressPdfTuned("/in.pdf", "/out.pdf", dpi, qf),
    );
    return h.lastArgs();
  }

  it("passes the rounded DPI to both color and gray resolution", async () => {
    const args = await run(150, 1);
    expect(flagValue(args, "-dColorImageResolution")).toBe("150");
    expect(flagValue(args, "-dGrayImageResolution")).toBe("150");
  });

  it("sets mono resolution to res*4 when that is under 600", async () => {
    const args = await run(100, 1);
    expect(flagValue(args, "-dMonoImageResolution")).toBe("400");
  });

  it("caps mono resolution at 600 (res*4 would exceed it)", async () => {
    const args = await run(150, 1);
    expect(flagValue(args, "-dMonoImageResolution")).toBe("600");
  });

  it("mono resolution just below the cap is res*4, not 600", async () => {
    const args = await run(149, 1);
    expect(flagValue(args, "-dMonoImageResolution")).toBe("596");
  });

  it("clamps DPI up to the floor of 9", async () => {
    const args = await run(5, 1);
    expect(flagValue(args, "-dColorImageResolution")).toBe("9");
    expect(flagValue(args, "-dMonoImageResolution")).toBe("36");
  });

  it("clamps DPI down to the ceiling of 600", async () => {
    const args = await run(9000, 1);
    expect(flagValue(args, "-dColorImageResolution")).toBe("600");
  });

  it("rounds a fractional DPI to the nearest integer (9.4 -> 9)", async () => {
    const args = await run(9.4, 1);
    expect(flagValue(args, "-dColorImageResolution")).toBe("9");
  });

  it("rounds a fractional DPI up when >= .5 (9.6 -> 10)", async () => {
    const args = await run(9.6, 1);
    expect(flagValue(args, "-dColorImageResolution")).toBe("10");
    expect(flagValue(args, "-dMonoImageResolution")).toBe("40");
  });

  it("embeds the clamped QFactor in the distiller dict for color and gray", async () => {
    const args = await run(100, 2);
    const dict = args[args.indexOf("-c") + 1];
    expect(dict).toContain(
      "/ColorImageDict << /QFactor 2 /Blend 1 /HSamples [2 1 1 2] /VSamples [2 1 1 2] >>",
    );
    expect(dict).toContain("/GrayImageDict << /QFactor 2 /Blend 1 >>");
    expect(dict).toContain("setdistillerparams");
  });

  it("clamps QFactor up to the floor of 0.05", async () => {
    const args = await run(100, 0.001);
    const dict = args[args.indexOf("-c") + 1];
    expect(dict).toContain("/QFactor 0.05 ");
  });

  it("clamps QFactor down to the ceiling of 4", async () => {
    const args = await run(100, 99);
    const dict = args[args.indexOf("-c") + 1];
    expect(dict).toContain("/QFactor 4 ");
  });

  it("forces DCT re-encode and disables JPEG passthrough so QFactor applies", async () => {
    const args = await run(100, 1);
    expect(args).toContain("-dAutoFilterColorImages=false");
    expect(args).toContain("-dColorImageFilter=/DCTEncode");
    expect(args).toContain("-dAutoFilterGrayImages=false");
    expect(args).toContain("-dGrayImageFilter=/DCTEncode");
    expect(args).toContain("-dPassThroughJPEGImages=false");
  });

  it("passes the -c dict before -f and the input path", async () => {
    const args = await run(100, 1);
    const cIdx = args.indexOf("-c");
    const fIdx = args.indexOf("-f");
    expect(cIdx).toBeGreaterThan(-1);
    expect(fIdx).toBe(cIdx + 2); // -c, <dict>, -f
    expect(args[fIdx + 1]).toBe("/in.pdf");
  });

  it("enables downsampling with Average for color/gray and Subsample for mono", async () => {
    const args = await run(100, 1);
    expect(args).toContain("-dDownsampleColorImages=true");
    expect(args).toContain("-dColorImageDownsampleType=/Average");
    expect(args).toContain("-dDownsampleGrayImages=true");
    expect(args).toContain("-dGrayImageDownsampleType=/Average");
    expect(args).toContain("-dDownsampleMonoImages=true");
    expect(args).toContain("-dMonoImageDownsampleType=/Subsample");
  });
});
