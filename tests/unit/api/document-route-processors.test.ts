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
  pdfTextPy: vi.fn(async () => ({ chars: 12, hasText: true })),
  qpdfAvailable: vi.fn(() => false),
  qpdfCheck: vi.fn(),
  qpdfPageCount: vi.fn(),
  resolveGs: vi.fn(() => null),
  resolveQpdf: vi.fn(() => null),
  resolveSoffice: vi.fn(() => null),
  sofficeAvailable: vi.fn(() => false),
}));

import { htmlToPdfPy, pdfFlattenPy, pdfTextPy } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerFlattenPdf } from "../../../apps/api/src/routes/tools/flatten-pdf.js";
import { registerHtmlToPdf } from "../../../apps/api/src/routes/tools/html-to-pdf.js";
import { registerMarkdownToPdf } from "../../../apps/api/src/routes/tools/markdown-to-pdf.js";
import { registerPdfToText } from "../../../apps/api/src/routes/tools/pdf-to-text.js";

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
