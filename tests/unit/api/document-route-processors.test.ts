import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ get: () => null }),
        all: () => [],
      }),
    }),
    insert: () => ({ values: () => ({ run: vi.fn() }) }),
  },
  pool: {},
  closeDb: async () => {},
  schema: { settings: {}, userFiles: { id: {} }, jobs: { id: {}, status: {} } },
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: {
    WORKSPACE_PATH: "/tmp/test",
    MAX_MEGAPIXELS: 100,
    MAX_SVG_SIZE_MB: 10,
    MAX_UPLOAD_SIZE_MB: 50,
    RATE_LIMIT_PER_MIN: 0,
  },
}));

vi.mock("@snapotter/doc-engine", () => ({
  htmlToPdfPy: vi.fn(),
  pdfFlattenPy: vi.fn(),
  pdfRedactPy: vi.fn(async () => ({ found: 3 })),
  pdfTextPy: vi.fn(async () => ({ chars: 12, hasText: true })),
  qpdfAvailable: vi.fn(() => false),
  qpdfCheck: vi.fn(),
  qpdfPageCount: vi.fn(),
  resolveGs: vi.fn(() => null),
  resolveQpdf: vi.fn(() => null),
  resolveSoffice: vi.fn(() => null),
  sofficeAvailable: vi.fn(() => false),
}));

import { htmlToPdfPy, pdfFlattenPy, pdfRedactPy, pdfTextPy } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerFlattenPdf } from "../../../apps/api/src/routes/tools/flatten-pdf.js";
import { registerHtmlToPdf } from "../../../apps/api/src/routes/tools/html-to-pdf.js";
import { registerMarkdownToPdf } from "../../../apps/api/src/routes/tools/markdown-to-pdf.js";
import { registerPdfToText } from "../../../apps/api/src/routes/tools/pdf-to-text.js";
import { registerRedactPdf } from "../../../apps/api/src/routes/tools/redact-pdf.js";

function createMockApp(): FastifyInstance {
  return {
    post: vi.fn(),
  } as unknown as FastifyInstance;
}

async function withScratch<T>(fn: (scratchDir: string) => Promise<T>): Promise<T> {
  const scratchDir = await mkdtemp(join(tmpdir(), "snapotter-doc-route-"));
  try {
    return await fn(scratchDir);
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}

function createCtx(scratchDir: string, filename: string) {
  return {
    inputs: [{ buffer: Buffer.from("input"), filename, ref: "uploads/job/input" }],
    settings: {},
    scratchDir,
    signal: new AbortController().signal,
    report: vi.fn(),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("document route processors", () => {
  it("extracts PDF text through pdfTextPy and returns text metadata", async () => {
    registerPdfToText(createMockApp());
    const config = getToolConfig("pdf-to-text");

    await withScratch(async (scratchDir) => {
      const ctx = createCtx(scratchDir, "Quarterly Report.pdf");
      const result = await config?.processV2?.(ctx);

      expect(pdfTextPy).toHaveBeenCalledWith(
        join(scratchDir, "in-Quarterly_Report.pdf"),
        join(scratchDir, "Quarterly Report.txt"),
      );
      expect(await readFile(join(scratchDir, "in-Quarterly_Report.pdf"))).toEqual(
        Buffer.from("input"),
      );
      expect(ctx.report).toHaveBeenNthCalledWith(1, 10, "Extracting text");
      expect(ctx.report).toHaveBeenNthCalledWith(2, 90, "Done");
      expect(result).toEqual({
        scratchPath: join(scratchDir, "Quarterly Report.txt"),
        filename: "Quarterly Report.txt",
        contentType: "text/plain",
        resultPayload: { chars: 12 },
      });
    });
  });

  it("rejects a PDF with no text layer and points the user to OCR", async () => {
    // A scanned/image-only PDF yields hasText=false; the route must reject with
    // an OCR handoff instead of returning a silent empty .txt (#589).
    vi.mocked(pdfTextPy).mockResolvedValueOnce({ chars: 0, hasText: false });
    registerPdfToText(createMockApp());
    const config = getToolConfig("pdf-to-text");

    await withScratch(async (scratchDir) => {
      const ctx = createCtx(scratchDir, "scanned.pdf");
      await expect(config?.processV2?.(ctx)).rejects.toThrow(/text layer/i);
    });
  });

  it("flattens PDFs through pdfFlattenPy", async () => {
    registerFlattenPdf(createMockApp());
    const config = getToolConfig("flatten-pdf");

    await withScratch(async (scratchDir) => {
      const ctx = createCtx(scratchDir, "form.v2.pdf");
      const result = await config?.processV2?.(ctx);

      expect(pdfFlattenPy).toHaveBeenCalledWith(
        join(scratchDir, "in-form.v2.pdf"),
        join(scratchDir, "form.v2_flattened.pdf"),
      );
      expect(ctx.report).toHaveBeenNthCalledWith(1, 10, "Flattening");
      expect(ctx.report).toHaveBeenNthCalledWith(2, 90, "Done");
      expect(result).toEqual({
        scratchPath: join(scratchDir, "form.v2_flattened.pdf"),
        filename: "form.v2_flattened.pdf",
        contentType: "application/pdf",
      });
    });
  });

  it("converts HTML input through htmlToPdfPy in html mode", async () => {
    registerHtmlToPdf(createMockApp());
    const config = getToolConfig("html-to-pdf");

    await withScratch(async (scratchDir) => {
      const ctx = createCtx(scratchDir, "landing page.html");
      const result = await config?.processV2?.(ctx);

      expect(htmlToPdfPy).toHaveBeenCalledWith(
        join(scratchDir, "in-landing_page.html"),
        join(scratchDir, "landing page.pdf"),
        "html",
      );
      expect(ctx.report).toHaveBeenNthCalledWith(1, 10, "Converting");
      expect(ctx.report).toHaveBeenNthCalledWith(2, 90, "Done");
      expect(result).toEqual({
        scratchPath: join(scratchDir, "landing page.pdf"),
        filename: "landing page.pdf",
        contentType: "application/pdf",
      });
    });
  });

  it("converts Markdown input through htmlToPdfPy in markdown mode", async () => {
    registerMarkdownToPdf(createMockApp());
    const config = getToolConfig("markdown-to-pdf");

    await withScratch(async (scratchDir) => {
      const ctx = createCtx(scratchDir, "release-notes.md");
      const result = await config?.processV2?.(ctx);

      expect(htmlToPdfPy).toHaveBeenCalledWith(
        join(scratchDir, "in-release-notes.md"),
        join(scratchDir, "release-notes.pdf"),
        "markdown",
      );
      expect(ctx.report).toHaveBeenNthCalledWith(1, 10, "Converting");
      expect(ctx.report).toHaveBeenNthCalledWith(2, 90, "Done");
      expect(result).toEqual({
        scratchPath: join(scratchDir, "release-notes.pdf"),
        filename: "release-notes.pdf",
        contentType: "application/pdf",
      });
    });
  });
});

describe("redact-pdf route processor (no PyMuPDF)", () => {
  function createRedactCtx(
    scratchDir: string,
    filename: string,
    settings: Record<string, unknown>,
  ) {
    return {
      inputs: [{ buffer: Buffer.from("secret pdf bytes"), filename, ref: "uploads/job/input" }],
      settings,
      scratchDir,
      signal: new AbortController().signal,
      report: vi.fn(),
    };
  }

  it("redacts terms, forwards case sensitivity, and returns the found count", async () => {
    registerRedactPdf(createMockApp());
    const config = getToolConfig("redact-pdf");

    await withScratch(async (scratchDir) => {
      const ctx = createRedactCtx(scratchDir, "annual report.pdf", {
        terms: ["Alice", "SSN"],
        caseSensitive: true,
      });
      const result = await config?.processV2?.(ctx);

      // Input written under a sanitized "in-" name; spaces become underscores.
      expect(pdfRedactPy).toHaveBeenCalledWith(
        join(scratchDir, "in-annual_report.pdf"),
        join(scratchDir, "annual report_redacted.pdf"),
        ["Alice", "SSN"],
        true,
      );
      // The buffer actually landed on disk at the sanitized path.
      expect(await readFile(join(scratchDir, "in-annual_report.pdf"))).toEqual(
        Buffer.from("secret pdf bytes"),
      );
      expect(ctx.report).toHaveBeenNthCalledWith(1, 10, "Redacting");
      expect(ctx.report).toHaveBeenNthCalledWith(2, 90, "Done");
      expect(result).toEqual({
        scratchPath: join(scratchDir, "annual report_redacted.pdf"),
        filename: "annual report_redacted.pdf",
        contentType: "application/pdf",
        resultPayload: { found: 3 },
      });
    });
  });

  it("defaults caseSensitive to false when the setting is omitted", async () => {
    registerRedactPdf(createMockApp());
    const config = getToolConfig("redact-pdf");

    await withScratch(async (scratchDir) => {
      const ctx = createRedactCtx(scratchDir, "doc.pdf", { terms: ["confidential"] });
      await config?.processV2?.(ctx);

      expect(pdfRedactPy).toHaveBeenCalledWith(
        join(scratchDir, "in-doc.pdf"),
        join(scratchDir, "doc_redacted.pdf"),
        ["confidential"],
        false,
      );
    });
  });

  it("sanitizes hostile filenames for the input path while keeping the display base", async () => {
    registerRedactPdf(createMockApp());
    const config = getToolConfig("redact-pdf");

    await withScratch(async (scratchDir) => {
      const ctx = createRedactCtx(scratchDir, "My Secret (v2)/../evil.pdf", {
        terms: ["x"],
        caseSensitive: false,
      });
      const result = await config?.processV2?.(ctx);

      // Chars outside [A-Za-z0-9._-] collapse to "_" (dots and dashes stay),
      // so the "/" separators are neutralized into the on-disk input name.
      expect(pdfRedactPy).toHaveBeenCalledWith(
        join(scratchDir, "in-My_Secret__v2__.._evil.pdf"),
        join(scratchDir, "My Secret (v2)/../evil_redacted.pdf"),
        ["x"],
        false,
      );
      // base is filename with the final extension stripped, unsanitized.
      expect(result?.filename).toBe("My Secret (v2)/../evil_redacted.pdf");
    });
  });

  it("propagates a redaction engine failure instead of swallowing it", async () => {
    vi.mocked(pdfRedactPy).mockRejectedValueOnce(new Error("doc_redact failed: boom"));
    registerRedactPdf(createMockApp());
    const config = getToolConfig("redact-pdf");

    await withScratch(async (scratchDir) => {
      const ctx = createRedactCtx(scratchDir, "doc.pdf", { terms: ["a"] });
      await expect(config?.processV2?.(ctx)).rejects.toThrow(/doc_redact failed/);
      // The completion report never fires when the engine throws mid-run.
      expect(ctx.report).toHaveBeenCalledWith(10, "Redacting");
      expect(ctx.report).not.toHaveBeenCalledWith(90, "Done");
    });
  });

  it("re-validates settings inside processV2 and rejects an empty terms array", async () => {
    registerRedactPdf(createMockApp());
    const config = getToolConfig("redact-pdf");

    await withScratch(async (scratchDir) => {
      const ctx = createRedactCtx(scratchDir, "doc.pdf", { terms: [] });
      await expect(config?.processV2?.(ctx)).rejects.toThrow();
      expect(pdfRedactPy).not.toHaveBeenCalled();
    });
  });

  it("keeps the legacy process fn as a v2-only guard that throws", async () => {
    registerRedactPdf(createMockApp());
    const config = getToolConfig("redact-pdf");

    await expect(
      config?.process?.(Buffer.from("x"), { terms: ["a"] }, "doc.pdf", {
        signal: new AbortController().signal,
        scratchDir: "/tmp",
        report: vi.fn(),
      }),
    ).rejects.toThrow("redact-pdf is v2-only");
  });
});
