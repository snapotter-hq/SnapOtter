import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// With an empty PATH `which` cannot run, so every resolver reports the binary missing.
describe("CLI runners with a missing binary (#4318)", () => {
  const saved = {
    PATH: process.env.PATH,
    QPDF_PATH: process.env.QPDF_PATH,
    GS_PATH: process.env.GS_PATH,
    PDFCPU_PATH: process.env.PDFCPU_PATH,
  };

  beforeEach(() => {
    process.env.PATH = "";
    delete process.env.QPDF_PATH;
    delete process.env.GS_PATH;
    delete process.env.PDFCPU_PATH;
    vi.resetModules();
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.resetModules();
  });

  it("runQpdf returns a rejected promise instead of throwing", async () => {
    const { runQpdf } = await import("../../../packages/doc-engine/src/qpdf.js");
    let promise: Promise<string> | undefined;
    expect(() => {
      promise = runQpdf(["--version"]);
    }).not.toThrow();
    await expect(promise).rejects.toThrow(/qpdf binary not found/);
  });

  it("the gs and pdfcpu wrappers reject with the missing-binary error", async () => {
    const { gsGrayscalePdf } = await import("../../../packages/doc-engine/src/ghostscript.js");
    const { pdfcpuNup } = await import("../../../packages/doc-engine/src/pdfcpu.js");
    await expect(gsGrayscalePdf("/nonexistent/in.pdf", "/nonexistent/out.pdf")).rejects.toThrow(
      /gs binary not found/,
    );
    await expect(pdfcpuNup("/nonexistent/in.pdf", 2, "/nonexistent/out.pdf")).rejects.toThrow(
      /pdfcpu binary not found/,
    );
  });
});
