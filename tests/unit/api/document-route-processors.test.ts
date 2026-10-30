import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
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
    BASE_PATH: "",
    WORKSPACE_PATH: "/tmp/test",
    MAX_MEGAPIXELS: 100,
    MAX_SVG_SIZE_MB: 10,
    MAX_UPLOAD_SIZE_MB: 50,
    RATE_LIMIT_PER_MIN: 0,
  },
}));

const isStorageServiceFaultMock = vi.hoisted(() => vi.fn<(_err: unknown) => boolean>(() => false));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>()),
  getObjectBuffer: vi.fn(),
  isStorageServiceFault: isStorageServiceFaultMock,
}));

vi.mock("@snapotter/doc-engine", () => ({
  convertDocument: vi.fn(),
  gsCompressPdfTuned: vi.fn(),
  gsGrayscalePdf: vi.fn(),
  gsPdfaConvert: vi.fn(),
  htmlToPdfPy: vi.fn(),
  pdfcpuBooklet: vi.fn(),
  pdfcpuCropMargin: vi.fn(),
  pdfcpuNup: vi.fn(),
  pdfcpuTextStamp: vi.fn(),
  pdfFlattenPy: vi.fn(),
  pdfMetadataGetPy: vi.fn(async () => ({ Title: "Updated" })),
  pdfMetadataSetPy: vi.fn(),
  pdfRedactPy: vi.fn(async () => ({ found: 3 })),
  pdfScrubProducerPy: vi.fn(),
  pdfSignPy: vi.fn(async () => ({ placed: 1 })),
  pdfTextPy: vi.fn(async () => ({ chars: 12, hasText: true })),
  pdfToWordPy: vi.fn(),
  qpdfAssemblePages: vi.fn(),
  qpdfAvailable: vi.fn(() => false),
  qpdfCheck: vi.fn(),
  qpdfDecrypt: vi.fn(),
  qpdfEncrypt: vi.fn(),
  qpdfLinearize: vi.fn(),
  qpdfMerge: vi.fn(),
  qpdfPageCount: vi.fn(),
  qpdfPagesSpec: vi.fn(),
  qpdfPagesSpecUnchecked: vi.fn(),
  qpdfRepair: vi.fn(),
  qpdfRotate: vi.fn(),
  qpdfRotatePages: vi.fn(),
  qpdfSplitRanges: vi.fn(),
  resolveGs: vi.fn(() => null),
  resolveQpdf: vi.fn(() => null),
  resolveSoffice: vi.fn(() => null),
  runPandoc: vi.fn(),
  sofficeAvailable: vi.fn(() => false),
}));

import { writeFile } from "node:fs/promises";
import {
  convertDocument,
  gsCompressPdfTuned,
  gsGrayscalePdf,
  gsPdfaConvert,
  htmlToPdfPy,
  pdfcpuBooklet,
  pdfcpuCropMargin,
  pdfcpuNup,
  pdfcpuTextStamp,
  pdfFlattenPy,
  pdfMetadataGetPy,
  pdfMetadataSetPy,
  pdfRedactPy,
  pdfScrubProducerPy,
  pdfSignPy,
  pdfTextPy,
  pdfToWordPy,
  qpdfAssemblePages,
  qpdfDecrypt,
  qpdfEncrypt,
  qpdfLinearize,
  qpdfMerge,
  qpdfPageCount,
  qpdfPagesSpec,
  qpdfPagesSpecUnchecked,
  qpdfRepair,
  qpdfRotate,
  qpdfRotatePages,
  qpdfSplitRanges,
  runPandoc,
} from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { runAiToolJob } from "../../../apps/api/src/jobs/ai-handlers.js";
import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import { getObjectBuffer } from "../../../apps/api/src/lib/object-storage.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerBookletPdf } from "../../../apps/api/src/routes/tools/booklet-pdf.js";
import { registerCompressPdf } from "../../../apps/api/src/routes/tools/compress-pdf.js";
import { registerConvertDocument } from "../../../apps/api/src/routes/tools/convert-document.js";
import { registerConvertPresentation } from "../../../apps/api/src/routes/tools/convert-presentation.js";
import { registerConvertSpreadsheet } from "../../../apps/api/src/routes/tools/convert-spreadsheet.js";
import { registerCropPdf } from "../../../apps/api/src/routes/tools/crop-pdf.js";
import { registerEpubConvert } from "../../../apps/api/src/routes/tools/epub-convert.js";
import { registerExcelToPdf } from "../../../apps/api/src/routes/tools/excel-to-pdf.js";
import { registerExtractPages } from "../../../apps/api/src/routes/tools/extract-pages.js";
import { registerFlattenPdf } from "../../../apps/api/src/routes/tools/flatten-pdf.js";
import { registerGrayscalePdf } from "../../../apps/api/src/routes/tools/grayscale-pdf.js";
import { registerHtmlToPdf } from "../../../apps/api/src/routes/tools/html-to-pdf.js";
import { registerLinearizePdf } from "../../../apps/api/src/routes/tools/linearize-pdf.js";
import { registerMarkdownToDocx } from "../../../apps/api/src/routes/tools/markdown-to-docx.js";
import { registerMarkdownToHtml } from "../../../apps/api/src/routes/tools/markdown-to-html.js";
import { registerMarkdownToPdf } from "../../../apps/api/src/routes/tools/markdown-to-pdf.js";
import { registerMergePdf } from "../../../apps/api/src/routes/tools/merge-pdf.js";
import { registerMultiToolPdf } from "../../../apps/api/src/routes/tools/multi-tool-pdf.js";
import { registerNupPdf } from "../../../apps/api/src/routes/tools/nup-pdf.js";
import { registerOrganizePdf } from "../../../apps/api/src/routes/tools/organize-pdf.js";
import { registerPdfMetadata } from "../../../apps/api/src/routes/tools/pdf-metadata.js";
import { registerPdfPageNumbers } from "../../../apps/api/src/routes/tools/pdf-page-numbers.js";
import { registerPdfToText } from "../../../apps/api/src/routes/tools/pdf-to-text.js";
import { registerPdfToWord } from "../../../apps/api/src/routes/tools/pdf-to-word.js";
import { registerPdfaConvert } from "../../../apps/api/src/routes/tools/pdfa-convert.js";
import { registerPowerpointToPdf } from "../../../apps/api/src/routes/tools/powerpoint-to-pdf.js";
import { registerProtectPdf } from "../../../apps/api/src/routes/tools/protect-pdf.js";
import { registerRedactPdf } from "../../../apps/api/src/routes/tools/redact-pdf.js";
import { registerRemovePages } from "../../../apps/api/src/routes/tools/remove-pages.js";
import { registerRepairPdf } from "../../../apps/api/src/routes/tools/repair-pdf.js";
import { registerRotatePdf } from "../../../apps/api/src/routes/tools/rotate-pdf.js";
import "../../../apps/api/src/routes/tools/sign-pdf.js";
import { registerSplitPdf } from "../../../apps/api/src/routes/tools/split-pdf.js";
import { registerToEpub } from "../../../apps/api/src/routes/tools/to-epub.js";
import { registerUnlockPdf } from "../../../apps/api/src/routes/tools/unlock-pdf.js";
import { registerWatermarkPdf } from "../../../apps/api/src/routes/tools/watermark-pdf.js";
import { registerWordToPdf } from "../../../apps/api/src/routes/tools/word-to-pdf.js";
import { pairwise } from "../../helpers/pairwise.js";
import { pairwiseSettingsFor } from "../../helpers/tool-default-settings.js";
import { compactCase, deriveAxes } from "../../helpers/zod-pict.js";

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
  isStorageServiceFaultMock.mockReturnValue(false);
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
        { signal: ctx.signal },
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
      await expect(config?.processV2?.(ctx)).rejects.toMatchObject({
        message: expect.stringMatching(/text layer/i),
        statusCode: 422,
        code: "NO_TEXT_LAYER",
      });
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
        { signal: ctx.signal },
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
        { signal: ctx.signal },
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
        { signal: ctx.signal },
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

  it("epub-convert chains self-contained runPandoc into htmlToPdfPy with ctx.signal for pdf", async () => {
    registerEpubConvert(createMockApp());
    const config = getToolConfig("epub-convert");

    await withScratch(async (scratchDir) => {
      const ctx = { ...createCtx(scratchDir, "My Book.epub"), settings: { format: "pdf" } };
      const result = await config?.processV2?.(ctx);

      expect(runPandoc).toHaveBeenCalledWith(
        join(scratchDir, "in-My_Book.epub"),
        join(scratchDir, "book.html"),
        { selfContained: true, signal: ctx.signal },
      );
      expect(htmlToPdfPy).toHaveBeenCalledWith(
        join(scratchDir, "book.html"),
        join(scratchDir, "My Book.pdf"),
        "html",
        { signal: ctx.signal },
      );
      expect(result).toEqual({
        scratchPath: join(scratchDir, "My Book.pdf"),
        filename: "My Book.pdf",
        contentType: "application/pdf",
      });
    });
  });

  it("epub-convert passes selfContained only for html and forwards ctx.signal for html, docx, and md", async () => {
    registerEpubConvert(createMockApp());
    const config = getToolConfig("epub-convert");

    await withScratch(async (scratchDir) => {
      const htmlCtx = { ...createCtx(scratchDir, "novel.epub"), settings: { format: "html" } };
      await config?.processV2?.(htmlCtx);
      expect(runPandoc).toHaveBeenLastCalledWith(
        join(scratchDir, "in-novel.epub"),
        join(scratchDir, "novel.html"),
        { selfContained: true, signal: htmlCtx.signal },
      );

      const docxCtx = { ...createCtx(scratchDir, "novel.epub"), settings: { format: "docx" } };
      await config?.processV2?.(docxCtx);
      expect(runPandoc).toHaveBeenLastCalledWith(
        join(scratchDir, "in-novel.epub"),
        join(scratchDir, "novel.docx"),
        { signal: docxCtx.signal },
      );

      const mdCtx = { ...createCtx(scratchDir, "novel.epub"), settings: { format: "md" } };
      await config?.processV2?.(mdCtx);
      expect(runPandoc).toHaveBeenLastCalledWith(
        join(scratchDir, "in-novel.epub"),
        join(scratchDir, "novel.md"),
        { signal: mdCtx.signal },
      );
    });
  });

  it("to-epub disables yaml_metadata_block only for .txt inputs and forwards ctx.signal", async () => {
    registerToEpub(createMockApp());
    const config = getToolConfig("to-epub");

    await withScratch(async (scratchDir) => {
      const txtCtx = createCtx(scratchDir, "Notes.TXT");
      await config?.processV2?.(txtCtx);
      expect(runPandoc).toHaveBeenLastCalledWith(
        join(scratchDir, "in-Notes.TXT"),
        join(scratchDir, "Notes.epub"),
        {
          signal: txtCtx.signal,
          extraArgs: ["-f", "markdown-yaml_metadata_block", "--metadata", "title=Notes"],
        },
      );

      const mdCtx = createCtx(scratchDir, "chapter.md");
      await config?.processV2?.(mdCtx);
      expect(runPandoc).toHaveBeenLastCalledWith(
        join(scratchDir, "in-chapter.md"),
        join(scratchDir, "chapter.epub"),
        {
          signal: mdCtx.signal,
          extraArgs: ["--metadata", "title=chapter"],
        },
      );
    });
  });

  it("markdown-to-docx and markdown-to-html forward ctx.signal to runPandoc (#3560)", async () => {
    registerMarkdownToDocx(createMockApp());
    registerMarkdownToHtml(createMockApp());
    const docxConfig = getToolConfig("markdown-to-docx");
    const htmlConfig = getToolConfig("markdown-to-html");

    await withScratch(async (scratchDir) => {
      const docxCtx = createCtx(scratchDir, "Release Notes.md");
      const docxResult = await docxConfig?.processV2?.(docxCtx);
      expect(runPandoc).toHaveBeenLastCalledWith(
        join(scratchDir, "in-Release_Notes.md"),
        join(scratchDir, "Release Notes.docx"),
        { signal: docxCtx.signal },
      );
      expect(await readFile(join(scratchDir, "in-Release_Notes.md"))).toEqual(Buffer.from("input"));
      expect(docxCtx.report).toHaveBeenNthCalledWith(1, 10, "Converting");
      expect(docxCtx.report).toHaveBeenNthCalledWith(2, 90, "Done");
      expect(docxResult).toEqual({
        scratchPath: join(scratchDir, "Release Notes.docx"),
        filename: "Release Notes.docx",
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const htmlCtx = createCtx(scratchDir, "Release Notes.md");
      const htmlResult = await htmlConfig?.processV2?.(htmlCtx);
      expect(runPandoc).toHaveBeenLastCalledWith(
        join(scratchDir, "in-Release_Notes.md"),
        join(scratchDir, "Release Notes.html"),
        { extraArgs: ["--standalone"], signal: htmlCtx.signal },
      );
      expect(htmlCtx.report).toHaveBeenNthCalledWith(1, 10, "Converting");
      expect(htmlCtx.report).toHaveBeenNthCalledWith(2, 90, "Done");
      expect(htmlResult).toEqual({
        scratchPath: join(scratchDir, "Release Notes.html"),
        filename: "Release Notes.html",
        contentType: "text/html",
      });

      vi.mocked(runPandoc).mockImplementationOnce(
        async (_in: string, _out: string, opts?: { signal?: AbortSignal }) => {
          if (opts?.signal?.aborted) throw new Error("Canceled");
        },
      );
      const abortedDocxAc = new AbortController();
      abortedDocxAc.abort();
      const abortedDocxCtx = {
        ...createCtx(scratchDir, "Canceled.md"),
        signal: abortedDocxAc.signal,
      };
      await expect(docxConfig?.processV2?.(abortedDocxCtx)).rejects.toThrow("Canceled");
      expect(abortedDocxCtx.report).toHaveBeenCalledWith(10, "Converting");
      expect(abortedDocxCtx.report).not.toHaveBeenCalledWith(90, "Done");

      vi.mocked(runPandoc).mockImplementationOnce(
        async (_in: string, _out: string, opts?: { signal?: AbortSignal }) => {
          if (opts?.signal?.aborted) throw new Error("Canceled");
        },
      );
      const abortedHtmlAc = new AbortController();
      abortedHtmlAc.abort();
      const abortedHtmlCtx = {
        ...createCtx(scratchDir, "Canceled.md"),
        signal: abortedHtmlAc.signal,
      };
      await expect(htmlConfig?.processV2?.(abortedHtmlCtx)).rejects.toThrow("Canceled");
      expect(abortedHtmlCtx.report).toHaveBeenCalledWith(10, "Converting");
      expect(abortedHtmlCtx.report).not.toHaveBeenCalledWith(90, "Done");
    });

    await expect(
      docxConfig?.process?.(Buffer.from("x"), {}, "doc.md", {
        signal: new AbortController().signal,
        scratchDir: "/tmp",
        report: vi.fn(),
      }),
    ).rejects.toThrow("markdown-to-docx is v2-only");
    await expect(
      htmlConfig?.process?.(Buffer.from("x"), {}, "doc.md", {
        signal: new AbortController().signal,
        scratchDir: "/tmp",
        report: vi.fn(),
      }),
    ).rejects.toThrow("markdown-to-html is v2-only");
  });

  it("converts PDFs to Word through pdfToWordPy with ctx.signal", async () => {
    registerPdfToWord(createMockApp());
    const config = getToolConfig("pdf-to-word");

    await withScratch(async (scratchDir) => {
      const ctx = createCtx(scratchDir, "contract draft.pdf");
      const result = await config?.processV2?.(ctx);

      expect(pdfToWordPy).toHaveBeenCalledWith(
        join(scratchDir, "in-contract_draft.pdf"),
        join(scratchDir, "contract draft.docx"),
        { signal: ctx.signal },
      );
      expect(ctx.report).toHaveBeenNthCalledWith(1, 10, "Converting");
      expect(ctx.report).toHaveBeenNthCalledWith(2, 90, "Done");
      expect(result).toEqual({
        scratchPath: join(scratchDir, "contract draft.docx"),
        filename: "contract draft.docx",
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
    });
  });

  it("writes and reads back PDF metadata through pdfMetadataSetPy and pdfMetadataGetPy with ctx.signal", async () => {
    registerPdfMetadata(createMockApp());
    const config = getToolConfig("pdf-metadata");

    await withScratch(async (scratchDir) => {
      const ctx = {
        ...createCtx(scratchDir, "whitepaper.pdf"),
        settings: { title: "Updated", author: "" },
      };
      const result = await config?.processV2?.(ctx);

      expect(pdfMetadataSetPy).toHaveBeenCalledWith(
        join(scratchDir, "in-whitepaper.pdf"),
        join(scratchDir, "whitepaper_metadata.pdf"),
        { Title: "Updated", Author: "" },
        { signal: ctx.signal },
      );
      expect(pdfMetadataGetPy).toHaveBeenCalledWith(join(scratchDir, "whitepaper_metadata.pdf"), {
        signal: ctx.signal,
      });
      expect(ctx.report).toHaveBeenNthCalledWith(1, 10, "Setting metadata");
      expect(ctx.report).toHaveBeenNthCalledWith(2, 90, "Done");
      expect(result).toEqual({
        scratchPath: join(scratchDir, "whitepaper_metadata.pdf"),
        filename: "whitepaper_metadata.pdf",
        contentType: "application/pdf",
        resultPayload: { metadata: { Title: "Updated" } },
      });
    });
  });
});

describe("sign-pdf AI job handler", () => {
  function createSignJobData(): ToolJobData {
    return {
      jobId: "job-sign-1",
      toolId: "sign-pdf",
      userId: null,
      pool: "docs",
      inputRefs: [
        "uploads/job-sign-1/in.pdf",
        "uploads/job-sign-1/sig0.png",
        "uploads/job-sign-1/sig1.png",
      ],
      filename: "agreement.pdf",
      settings: {
        placements: [
          { sig: 0, page: 0, x: 0.1, y: 0.2, w: 0.3, h: 0.1 },
          { sig: 1, page: 0, x: 0.5, y: 0.2, w: 0.3, h: 0.1 },
        ],
      },
      kind: "ai-tool",
    };
  }

  it("fetches signature parts and forwards ctx.signal to pdfSignPy", async () => {
    vi.mocked(getObjectBuffer)
      .mockResolvedValueOnce(Buffer.from("sig-zero"))
      .mockResolvedValueOnce(Buffer.from("sig-one"));
    vi.mocked(pdfSignPy).mockImplementationOnce(async (_inPath: string, outPath: string) => {
      await writeFile(outPath, Buffer.from("signed-pdf-bytes"));
      return { placed: 2 };
    });

    await withScratch(async (scratchDir) => {
      const ctx = createCtx(scratchDir, "agreement.pdf");
      const output = await runAiToolJob(createSignJobData(), Buffer.from("pdf-bytes"), ctx);

      expect(getObjectBuffer).toHaveBeenCalledTimes(2);
      expect(pdfSignPy).toHaveBeenCalledWith(
        expect.stringMatching(/in\.pdf$/),
        expect.stringMatching(/out\.pdf$/),
        [expect.stringMatching(/sig0\.png$/), expect.stringMatching(/sig1\.png$/)],
        [
          { sig: 0, page: 0, x: 0.1, y: 0.2, w: 0.3, h: 0.1 },
          { sig: 1, page: 0, x: 0.5, y: 0.2, w: 0.3, h: 0.1 },
        ],
        { signal: ctx.signal },
      );
      expect(output).toEqual({
        buffer: Buffer.from("signed-pdf-bytes"),
        filename: "agreement_signed.pdf",
        contentType: "application/pdf",
      });
    });
  });

  it("stops fetching remaining signature parts and skips pdfSignPy when ctx.signal aborts mid-loop", async () => {
    const ac = new AbortController();
    vi.mocked(getObjectBuffer).mockImplementationOnce(async () => {
      ac.abort(new DOMException("The operation was aborted", "AbortError"));
      return Buffer.from("sig-zero");
    });

    await withScratch(async (scratchDir) => {
      const ctx = { ...createCtx(scratchDir, "agreement.pdf"), signal: ac.signal };
      await expect(
        runAiToolJob(createSignJobData(), Buffer.from("pdf-bytes"), ctx),
      ).rejects.toMatchObject({ name: "AbortError" });

      expect(getObjectBuffer).toHaveBeenCalledTimes(1);
      expect(pdfSignPy).not.toHaveBeenCalled();
      expect(ctx.report).not.toHaveBeenCalled();
    });
  });

  it("skips stamping and pdfSignPy when ctx.signal aborts during the final signature fetch", async () => {
    const ac = new AbortController();
    vi.mocked(getObjectBuffer)
      .mockResolvedValueOnce(Buffer.from("sig-zero"))
      .mockImplementationOnce(async () => {
        ac.abort(new DOMException("The operation was aborted", "AbortError"));
        return Buffer.from("sig-one");
      });

    await withScratch(async (scratchDir) => {
      const ctx = { ...createCtx(scratchDir, "agreement.pdf"), signal: ac.signal };
      await expect(
        runAiToolJob(createSignJobData(), Buffer.from("pdf-bytes"), ctx),
      ).rejects.toMatchObject({ name: "AbortError" });

      expect(getObjectBuffer).toHaveBeenCalledTimes(2);
      expect(pdfSignPy).not.toHaveBeenCalled();
      expect(ctx.report).not.toHaveBeenCalled();
    });
  });

  it("normalizes S3 GetObject faults on signature part reads into a 503 storage-unavailable SafeError (#3467)", async () => {
    const slowDown = Object.assign(new Error("Please reduce your request rate."), {
      name: "SlowDown",
      $metadata: { httpStatusCode: 503 },
    });
    isStorageServiceFaultMock.mockReturnValue(true);
    vi.mocked(getObjectBuffer)
      .mockResolvedValueOnce(Buffer.from("sig-zero"))
      .mockRejectedValueOnce(slowDown);

    await withScratch(async (scratchDir) => {
      const ctx = createCtx(scratchDir, "agreement.pdf");
      const err = await runAiToolJob(createSignJobData(), Buffer.from("pdf-bytes"), ctx).catch(
        (e: unknown) => e,
      );
      expect(err).toMatchObject({
        name: "SafeError",
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        message: "The server's storage service is unavailable.",
        cause: slowDown,
      });
      expect(pdfSignPy).not.toHaveBeenCalled();
      expect(await readdir(scratchDir)).toEqual([]);

      // Unexpected non-S3 defect passes through normalizeS3ReadFault untouched
      const unexpectedBug = new TypeError("unexpected S3 client defect");
      vi.mocked(getObjectBuffer).mockRejectedValueOnce(unexpectedBug);
      const bugErr = await runAiToolJob(createSignJobData(), Buffer.from("pdf-bytes"), ctx).catch(
        (e: unknown) => e,
      );
      expect(bugErr).toBe(unexpectedBug);

      // Local-mode EIO (isStorageServiceFault === false) bypasses normalizeS3ReadFault
      isStorageServiceFaultMock.mockReturnValue(false);
      const localEio = Object.assign(new Error("local disk read error"), {
        code: "EIO",
        syscall: "read",
      });
      vi.mocked(getObjectBuffer).mockRejectedValueOnce(localEio);
      const localErr = await runAiToolJob(createSignJobData(), Buffer.from("pdf-bytes"), ctx).catch(
        (e: unknown) => e,
      );
      expect(localErr).toBe(localEio);
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
        { signal: ctx.signal },
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
        { signal: ctx.signal },
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
        { signal: ctx.signal },
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

describe("compress-pdf route processor (#1373)", () => {
  function createCompressCtx(scratchDir: string, input: Buffer, settings: Record<string, unknown>) {
    return {
      inputs: [{ buffer: input, filename: "doc.pdf", ref: "uploads/job/input" }],
      settings,
      scratchDir,
      signal: new AbortController().signal,
      report: vi.fn(),
    };
  }

  it("scrubs each targetSize candidate before measuring so binary search and targetMet use post-scrub bytes", async () => {
    // Target is 1 KB (1000 bytes); input is 2000 bytes.
    // At q>=50 Ghostscript writes 990 bytes (under 1000), and the Producer scrub
    // adds 20 bytes -> 1010 bytes (over 1000). At q<50 Ghostscript writes 800
    // bytes -> 820 bytes after scrub (fits 1000). Without scrubbing inside runQ,
    // the search would accept q=50 at 990 bytes and ship 1010 bytes > target.
    vi.mocked(gsCompressPdfTuned).mockImplementation(
      async (_inPath: string, outPath: string, dpi: number) => {
        const size = dpi >= 300 ? 990 : 800;
        await writeFile(outPath, Buffer.alloc(size, 0x41));
      },
    );
    vi.mocked(pdfScrubProducerPy).mockImplementation(async (inPath: string, outPath: string) => {
      const orig = await readFile(inPath);
      await writeFile(outPath, Buffer.concat([orig, Buffer.alloc(20, 0x53)]));
    });

    registerCompressPdf(createMockApp());
    const config = getToolConfig("compress-pdf");

    await withScratch(async (scratchDir) => {
      const input = Buffer.alloc(2000, 0x49);
      const ctx = createCompressCtx(scratchDir, input, {
        mode: "targetSize",
        targetSizeKb: 1,
      });
      const result = await config?.processV2?.(ctx);
      const outBytes = await readFile(result?.scratchPath as string);
      expect(outBytes.length).toBe(820);
      expect(result?.resultPayload).toEqual({ targetKb: 1, targetMet: true });
    });
  });

  it("reports targetMet=false and falls back to untouched input when scrub pushes every candidate over target and input size", async () => {
    // Input is 955 bytes, target is 0.95 KB (950 bytes).
    // Ghostscript writes 940 bytes (<= 950 target and < 955 input), and the
    // Producer scrub adds 20 bytes -> 960 bytes (> 950 target and >= 955 input).
    // Without scrubbing before measuring, this would keep the 960-byte file and
    // report targetMet=true; with the fix, never-enlarge falls back to the
    // 955-byte input and reports targetMet=false.
    vi.mocked(gsCompressPdfTuned).mockImplementation(async (_inPath: string, outPath: string) => {
      await writeFile(outPath, Buffer.alloc(940, 0x41));
    });
    vi.mocked(pdfScrubProducerPy).mockImplementation(async (inPath: string, outPath: string) => {
      const orig = await readFile(inPath);
      await writeFile(outPath, Buffer.concat([orig, Buffer.alloc(20, 0x53)]));
    });

    registerCompressPdf(createMockApp());
    const config = getToolConfig("compress-pdf");

    await withScratch(async (scratchDir) => {
      const input = Buffer.alloc(955, 0x49);
      const ctx = createCompressCtx(scratchDir, input, {
        mode: "targetSize",
        targetSizeKb: 0.95,
      });
      const result = await config?.processV2?.(ctx);
      const outBytes = await readFile(result?.scratchPath as string);
      expect(outBytes.equals(input)).toBe(true);
      expect(result?.resultPayload).toEqual({ targetKb: 0.95, targetMet: false });
    });
  });

  it("reports targetMet=false when scrub pushes the smallest candidate over target while staying smaller than input", async () => {
    // Input is 2000 bytes, target is 1 KB (1000 bytes).
    // Ghostscript writes 990 bytes at every q, and the Producer scrub adds 20
    // bytes -> 1010 bytes (< 2000 input, > 1000 target). The 1010-byte scrubbed
    // candidate is kept, and targetMet is false.
    vi.mocked(gsCompressPdfTuned).mockImplementation(async (_inPath: string, outPath: string) => {
      await writeFile(outPath, Buffer.alloc(990, 0x41));
    });
    vi.mocked(pdfScrubProducerPy).mockImplementation(async (inPath: string, outPath: string) => {
      const orig = await readFile(inPath);
      await writeFile(outPath, Buffer.concat([orig, Buffer.alloc(20, 0x53)]));
    });

    registerCompressPdf(createMockApp());
    const config = getToolConfig("compress-pdf");

    await withScratch(async (scratchDir) => {
      const input = Buffer.alloc(2000, 0x49);
      const ctx = createCompressCtx(scratchDir, input, {
        mode: "targetSize",
        targetSizeKb: 1,
      });
      const result = await config?.processV2?.(ctx);
      const outBytes = await readFile(result?.scratchPath as string);
      expect(outBytes.length).toBe(1010);
      expect(result?.resultPayload).toEqual({ targetKb: 1, targetMet: false });
    });
  });

  it("applies quality-mode never-enlarge after the Producer scrub and keeps scrubbed output when smaller", async () => {
    // Input is 1000 bytes. First call: Ghostscript writes 990 bytes (< 1000), and
    // the scrub rewrites it to 1010 bytes (>= 1000) -> falls back to 1000-byte input.
    // Second call: Ghostscript writes 600 bytes, scrub rewrites to 620 bytes (< 1000)
    // -> keeps the 620-byte scrubbed file.
    vi.mocked(gsCompressPdfTuned)
      .mockImplementationOnce(async (_inPath: string, outPath: string) => {
        await writeFile(outPath, Buffer.alloc(990, 0x41));
      })
      .mockImplementationOnce(async (_inPath: string, outPath: string) => {
        await writeFile(outPath, Buffer.alloc(600, 0x41));
      });
    vi.mocked(pdfScrubProducerPy).mockImplementation(async (inPath: string, outPath: string) => {
      const orig = await readFile(inPath);
      await writeFile(outPath, Buffer.concat([orig, Buffer.alloc(20, 0x53)]));
    });

    registerCompressPdf(createMockApp());
    const config = getToolConfig("compress-pdf");

    await withScratch(async (scratchDir) => {
      const input = Buffer.alloc(1000, 0x49);
      const ctx = createCompressCtx(scratchDir, input, {
        mode: "quality",
        quality: 75,
      });
      const result = await config?.processV2?.(ctx);
      const outBytes = await readFile(result?.scratchPath as string);
      expect(outBytes.equals(input)).toBe(true);
    });

    await withScratch(async (scratchDir) => {
      const input = Buffer.alloc(1000, 0x49);
      const ctx = createCompressCtx(scratchDir, input, {
        mode: "quality",
        quality: 75,
      });
      const result = await config?.processV2?.(ctx);
      const outBytes = await readFile(result?.scratchPath as string);
      expect(outBytes.length).toBe(620);
    });
  });

  it("keeps the Ghostscript candidate and cleans up the sibling temp file when the Producer scrub fails", async () => {
    const candidate = Buffer.alloc(600, 0x43);
    vi.mocked(gsCompressPdfTuned).mockImplementation(async (_inPath: string, outPath: string) => {
      await writeFile(outPath, candidate);
    });
    vi.mocked(pdfScrubProducerPy).mockImplementation(async (_inPath: string, outPath: string) => {
      await writeFile(outPath, Buffer.from("partial"));
      throw new Error("PyMuPDF not installed");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    registerCompressPdf(createMockApp());
    const config = getToolConfig("compress-pdf");

    try {
      await withScratch(async (scratchDir) => {
        const input = Buffer.alloc(1000, 0x49);
        const ctx = createCompressCtx(scratchDir, input, {
          mode: "quality",
          quality: 75,
        });
        const result = await config?.processV2?.(ctx);
        const outPath = result?.scratchPath as string;
        expect((await readFile(outPath)).equals(candidate)).toBe(true);
        await expect(readFile(`${outPath}.scrub.pdf`)).rejects.toThrow();
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("[pdf-scrub] keeping original metadata: PyMuPDF not installed"),
        );
      });
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("rejects mode=targetSize when targetSizeKb is omitted or misspelled instead of falling back to quality mode (#2615)", async () => {
    registerCompressPdf(createMockApp());
    const config = getToolConfig("compress-pdf");
    expect(config).toBeDefined();

    for (const invalidSettings of [
      { mode: "targetSize" },
      { mode: "targetSize", targetKb: 10 },
      { mode: "targetSize", targetSize: 10 },
    ]) {
      const parsed = config?.settingsSchema.safeParse(invalidSettings);
      expect(parsed?.success).toBe(false);
      if (parsed && !parsed.success) {
        expect(parsed.error.issues[0]?.path).toEqual(["targetSizeKb"]);
        expect(parsed.error.issues[0]?.message).toMatch(/targetSizeKb/i);
      }

      await withScratch(async (scratchDir) => {
        const input = Buffer.alloc(1000, 0x49);
        const ctx = createCompressCtx(scratchDir, input, invalidSettings);
        await expect(config?.processV2?.(ctx)).rejects.toThrow(/targetSizeKb/i);
      });
    }

    expect(gsCompressPdfTuned).not.toHaveBeenCalled();
  });

  it("keeps both quality and targetSize modes reachable in pairwise sampling (#2615)", () => {
    registerCompressPdf(createMockApp());
    const schema = getToolConfig("compress-pdf")?.settingsSchema;
    expect(schema).toBeDefined();
    if (!schema) return;

    const axes = deriveAxes(schema);
    const base = pairwiseSettingsFor("compress-pdf");
    const cases = pairwise(axes)
      .map((combo) => ({ ...base, ...compactCase(combo) }))
      .map((combo) => schema.safeParse(combo))
      .filter((parsed): parsed is { success: true; data: { mode: string } } => parsed.success);

    const modes = new Set(cases.map((c) => c.data.mode));
    expect(modes).toEqual(new Set(["quality", "targetSize"]));
  });

  it("keeps every targetSize probe at or above the 150 dpi legibility floor (#1086)", async () => {
    // Every candidate is far over the 1 KB target, so the search walks the
    // whole axis down to q=1. Before #1086 that probe asked Ghostscript for
    // 26 dpi; a 300 dpi scan compressed there is unreadable.
    vi.mocked(gsCompressPdfTuned).mockImplementation(
      async (_inPath: string, outPath: string, dpi: number) => {
        await writeFile(outPath, Buffer.alloc(20_000 - dpi, 0x41));
      },
    );
    vi.mocked(pdfScrubProducerPy).mockImplementation(async (inPath: string, outPath: string) => {
      await writeFile(outPath, await readFile(inPath));
    });

    registerCompressPdf(createMockApp());
    const config = getToolConfig("compress-pdf");

    await withScratch(async (scratchDir) => {
      const input = Buffer.alloc(200_000, 0x49);
      const ctx = createCompressCtx(scratchDir, input, {
        mode: "targetSize",
        targetSizeKb: 1,
      });
      const result = await config?.processV2?.(ctx);

      const dpis = vi.mocked(gsCompressPdfTuned).mock.calls.map((call) => call[2] as number);
      expect(dpis.length).toBeGreaterThan(1);
      expect(Math.min(...dpis)).toBeGreaterThanOrEqual(150);
      // The floor makes small targets unreachable on scans, and the result has
      // to say so rather than reporting a legibility-destroying success.
      expect(result?.resultPayload).toEqual({ targetKb: 1, targetMet: false });
    });
  });

  it("forwards ctx.signal to pdfScrubProducerPy in both quality and targetSize modes (#3254)", async () => {
    vi.mocked(gsCompressPdfTuned).mockImplementation(async (_inPath: string, outPath: string) => {
      await writeFile(outPath, Buffer.alloc(600, 0x41));
    });
    vi.mocked(pdfScrubProducerPy).mockImplementation(async (inPath: string, outPath: string) => {
      const orig = await readFile(inPath);
      await writeFile(outPath, orig);
    });

    registerCompressPdf(createMockApp());
    const config = getToolConfig("compress-pdf");

    await withScratch(async (scratchDir) => {
      const input = Buffer.alloc(1000, 0x49);
      const qualityCtx = createCompressCtx(scratchDir, input, {
        mode: "quality",
        quality: 75,
      });
      await config?.processV2?.(qualityCtx);
      const expectedOut = join(scratchDir, "doc_compressed.pdf");
      expect(gsCompressPdfTuned).toHaveBeenCalledWith(
        join(scratchDir, "in-doc.pdf"),
        expectedOut,
        expect.any(Number),
        expect.any(Number),
        { signal: qualityCtx.signal },
      );
      expect(pdfScrubProducerPy).toHaveBeenCalledWith(expectedOut, `${expectedOut}.scrub.pdf`, {
        signal: qualityCtx.signal,
      });
    });

    vi.mocked(gsCompressPdfTuned).mockClear();
    vi.mocked(pdfScrubProducerPy).mockClear();

    await withScratch(async (scratchDir) => {
      const input = Buffer.alloc(1000, 0x49);
      const targetCtx = createCompressCtx(scratchDir, input, {
        mode: "targetSize",
        targetSizeKb: 1,
      });
      await config?.processV2?.(targetCtx);
      const expectedCand = join(scratchDir, "cand-q51.pdf");
      expect(gsCompressPdfTuned).toHaveBeenCalledWith(
        join(scratchDir, "in-doc.pdf"),
        expectedCand,
        expect.any(Number),
        expect.any(Number),
        { signal: targetCtx.signal },
      );
      expect(pdfScrubProducerPy).toHaveBeenCalledWith(expectedCand, `${expectedCand}.scrub.pdf`, {
        signal: targetCtx.signal,
      });
    });
  });

  it("stops targetSize binary search immediately when ctx.signal aborts (#3254)", async () => {
    registerCompressPdf(createMockApp());
    const config = getToolConfig("compress-pdf");

    // 1. Abort inside pdfScrubProducerPy on the first probe: must not swallow the abort or run further iterations.
    await withScratch(async (scratchDir) => {
      const ac = new AbortController();
      const abortErr = Object.assign(new Error("Python script canceled"), {
        name: "AbortError",
        code: "canceled",
      });
      vi.mocked(gsCompressPdfTuned).mockImplementation(async (_inPath: string, outPath: string) => {
        await writeFile(outPath, Buffer.alloc(900, 0x41));
      });
      vi.mocked(pdfScrubProducerPy).mockImplementationOnce(
        async (_inPath: string, outPath: string) => {
          await writeFile(outPath, Buffer.from("partial"));
          ac.abort(abortErr);
          throw abortErr;
        },
      );

      const input = Buffer.alloc(2000, 0x49);
      const ctx = {
        ...createCompressCtx(scratchDir, input, { mode: "targetSize", targetSizeKb: 0.5 }),
        signal: ac.signal,
      };
      await expect(config?.processV2?.(ctx)).rejects.toBe(abortErr);
      expect(gsCompressPdfTuned).toHaveBeenCalledTimes(1);
      expect(pdfScrubProducerPy).toHaveBeenCalledTimes(1);
      await expect(readFile(join(scratchDir, "cand-q51.pdf.scrub.pdf"))).rejects.toThrow();
    });

    vi.clearAllMocks();

    // 2. Signal aborts during gsCompressPdfTuned on iteration 0: scrubPdfProducerFile and iteration 1 never run.
    await withScratch(async (scratchDir) => {
      const ac = new AbortController();
      const abortErr = new DOMException("The operation was aborted", "AbortError");
      vi.mocked(gsCompressPdfTuned).mockImplementationOnce(
        async (_inPath: string, outPath: string) => {
          await writeFile(outPath, Buffer.alloc(900, 0x41));
          ac.abort(abortErr);
        },
      );

      const input = Buffer.alloc(2000, 0x49);
      const ctx = {
        ...createCompressCtx(scratchDir, input, { mode: "targetSize", targetSizeKb: 0.5 }),
        signal: ac.signal,
      };
      await expect(config?.processV2?.(ctx)).rejects.toBe(abortErr);
      expect(gsCompressPdfTuned).toHaveBeenCalledTimes(1);
      expect(pdfScrubProducerPy).not.toHaveBeenCalled();
    });

    vi.clearAllMocks();

    // 3. Signal aborts after iteration 0 completes (inside ctx.report on iteration 1): stops before iteration 1's probe.
    await withScratch(async (scratchDir) => {
      const ac = new AbortController();
      const abortErr = new DOMException("The operation was aborted", "AbortError");
      vi.mocked(gsCompressPdfTuned).mockImplementation(async (_inPath: string, outPath: string) => {
        await writeFile(outPath, Buffer.alloc(900, 0x41));
      });
      vi.mocked(pdfScrubProducerPy).mockImplementationOnce(
        async (inPath: string, outPath: string) => {
          await writeFile(outPath, await readFile(inPath));
          // Abort right as iteration 0's scrub finishes so iteration 1's loop-top throwIfAborted() trips.
          setImmediate(() => ac.abort(abortErr));
        },
      );

      const input = Buffer.alloc(2000, 0x49);
      const ctx = {
        ...createCompressCtx(scratchDir, input, { mode: "targetSize", targetSizeKb: 0.5 }),
        signal: ac.signal,
      };
      await expect(config?.processV2?.(ctx)).rejects.toBe(abortErr);
      expect(gsCompressPdfTuned).toHaveBeenCalledTimes(1);
      expect(pdfScrubProducerPy).toHaveBeenCalledTimes(1);
    });

    vi.clearAllMocks();

    // 4. Pre-aborted signal in quality mode skips Ghostscript and scrubbing entirely.
    await withScratch(async (scratchDir) => {
      const ac = new AbortController();
      const abortErr = new DOMException("The operation was aborted", "AbortError");
      ac.abort(abortErr);

      const input = Buffer.alloc(2000, 0x49);
      const ctx = {
        ...createCompressCtx(scratchDir, input, { mode: "quality", quality: 75 }),
        signal: ac.signal,
      };
      await expect(config?.processV2?.(ctx)).rejects.toBe(abortErr);
      expect(gsCompressPdfTuned).not.toHaveBeenCalled();
      expect(pdfScrubProducerPy).not.toHaveBeenCalled();
    });
  });
});

describe("ghostscript, libreoffice, pdfcpu, and qpdf route signal forwarding (#3305)", () => {
  it("forwards ctx.signal in grayscale-pdf and pdfa-convert", async () => {
    registerGrayscalePdf(createMockApp());
    registerPdfaConvert(createMockApp());

    await withScratch(async (scratchDir) => {
      const grayCtx = createCtx(scratchDir, "scan.pdf");
      await getToolConfig("grayscale-pdf")?.processV2?.(grayCtx);
      expect(gsGrayscalePdf).toHaveBeenCalledWith(
        join(scratchDir, "in-scan.pdf"),
        join(scratchDir, "scan_grayscale.pdf"),
        { signal: grayCtx.signal },
      );

      const pdfaCtx = createCtx(scratchDir, "archive.pdf");
      await getToolConfig("pdfa-convert")?.processV2?.(pdfaCtx);
      expect(gsPdfaConvert).toHaveBeenCalledWith(
        join(scratchDir, "in-archive.pdf"),
        join(scratchDir, "archive_pdfa.pdf"),
        { signal: pdfaCtx.signal },
      );
    });
  });

  it("forwards ctx.signal and timeoutMs in LibreOffice conversion routes", async () => {
    registerConvertDocument(createMockApp());
    registerConvertPresentation(createMockApp());
    registerConvertSpreadsheet(createMockApp());
    registerWordToPdf(createMockApp());
    registerExcelToPdf(createMockApp());
    registerPowerpointToPdf(createMockApp());

    await withScratch(async (scratchDir) => {
      vi.mocked(convertDocument).mockResolvedValue(join(scratchDir, "out.pdf"));

      const docCtx = { ...createCtx(scratchDir, "memo.odt"), settings: { format: "docx" } };
      await getToolConfig("convert-document")?.processV2?.(docCtx);
      expect(convertDocument).toHaveBeenLastCalledWith(
        join(scratchDir, "in-memo.odt"),
        scratchDir,
        "docx",
        { timeoutMs: 120_000, signal: docCtx.signal },
      );

      const presCtx = { ...createCtx(scratchDir, "deck.odp"), settings: { format: "pptx" } };
      await getToolConfig("convert-presentation")?.processV2?.(presCtx);
      expect(convertDocument).toHaveBeenLastCalledWith(
        join(scratchDir, "in-deck.odp"),
        scratchDir,
        "pptx",
        { timeoutMs: 120_000, signal: presCtx.signal },
      );

      const sheetCtx = { ...createCtx(scratchDir, "data.ods"), settings: { format: "xlsx" } };
      await getToolConfig("convert-spreadsheet")?.processV2?.(sheetCtx);
      expect(convertDocument).toHaveBeenLastCalledWith(
        join(scratchDir, "in-data.ods"),
        scratchDir,
        "xlsx",
        { timeoutMs: 120_000, signal: sheetCtx.signal },
      );

      const wordCtx = createCtx(scratchDir, "letter.docx");
      await getToolConfig("word-to-pdf")?.processV2?.(wordCtx);
      expect(convertDocument).toHaveBeenLastCalledWith(
        join(scratchDir, "in-letter.docx"),
        scratchDir,
        "pdf",
        { timeoutMs: 120_000, signal: wordCtx.signal },
      );

      const excelCtx = createCtx(scratchDir, "budget.xlsx");
      await getToolConfig("excel-to-pdf")?.processV2?.(excelCtx);
      expect(convertDocument).toHaveBeenLastCalledWith(
        join(scratchDir, "in-budget.xlsx"),
        scratchDir,
        "pdf",
        { timeoutMs: 120_000, signal: excelCtx.signal },
      );

      const pptCtx = createCtx(scratchDir, "slides.pptx");
      await getToolConfig("powerpoint-to-pdf")?.processV2?.(pptCtx);
      expect(convertDocument).toHaveBeenLastCalledWith(
        join(scratchDir, "in-slides.pptx"),
        scratchDir,
        "pdf",
        { timeoutMs: 120_000, signal: pptCtx.signal },
      );
    });
  });

  it("forwards ctx.signal in pdfcpu routes (crop, nup, booklet, watermark, page-numbers)", async () => {
    registerCropPdf(createMockApp());
    registerNupPdf(createMockApp());
    registerBookletPdf(createMockApp());
    registerWatermarkPdf(createMockApp());
    registerPdfPageNumbers(createMockApp());

    await withScratch(async (scratchDir) => {
      const cropCtx = { ...createCtx(scratchDir, "doc.pdf"), settings: { margin: 18 } };
      await getToolConfig("crop-pdf")?.processV2?.(cropCtx);
      expect(pdfcpuCropMargin).toHaveBeenCalledWith(
        join(scratchDir, "in-doc.pdf"),
        18,
        join(scratchDir, "doc_cropped.pdf"),
        { signal: cropCtx.signal },
      );

      const nupCtx = { ...createCtx(scratchDir, "doc.pdf"), settings: { perSheet: 4 } };
      await getToolConfig("nup-pdf")?.processV2?.(nupCtx);
      expect(pdfcpuNup).toHaveBeenCalledWith(
        join(scratchDir, "in-doc.pdf"),
        4,
        join(scratchDir, "doc_nup.pdf"),
        { signal: nupCtx.signal },
      );

      const bookletCtx = { ...createCtx(scratchDir, "doc.pdf"), settings: { perSheet: 2 } };
      await getToolConfig("booklet-pdf")?.processV2?.(bookletCtx);
      expect(pdfcpuBooklet).toHaveBeenCalledWith(
        join(scratchDir, "in-doc.pdf"),
        2,
        join(scratchDir, "doc_booklet.pdf"),
        { signal: bookletCtx.signal },
      );

      const wmCtx = { ...createCtx(scratchDir, "doc.pdf"), settings: { text: "DRAFT" } };
      await getToolConfig("watermark-pdf")?.processV2?.(wmCtx);
      expect(pdfcpuTextStamp).toHaveBeenLastCalledWith(
        join(scratchDir, "in-doc.pdf"),
        { text: "DRAFT", position: "c", fontSize: 48, opacity: 0.3, rotation: 45 },
        join(scratchDir, "doc_watermarked.pdf"),
        { signal: wmCtx.signal },
      );

      const numCtx = { ...createCtx(scratchDir, "doc.pdf"), settings: {} };
      await getToolConfig("pdf-page-numbers")?.processV2?.(numCtx);
      expect(pdfcpuTextStamp).toHaveBeenLastCalledWith(
        join(scratchDir, "in-doc.pdf"),
        { text: "Page %p of %P", position: "bc", fontSize: 10, opacity: 1, rotation: 0 },
        join(scratchDir, "doc_numbered.pdf"),
        { signal: numCtx.signal },
      );
    });
  });

  it("forwards ctx.signal across all qpdf routes", async () => {
    registerMergePdf(createMockApp());
    registerSplitPdf(createMockApp());
    registerRotatePdf(createMockApp());
    registerProtectPdf(createMockApp());
    registerUnlockPdf(createMockApp());
    registerRepairPdf(createMockApp());
    registerLinearizePdf(createMockApp());
    registerOrganizePdf(createMockApp());
    registerExtractPages(createMockApp());
    registerRemovePages(createMockApp());
    registerMultiToolPdf(createMockApp());

    await withScratch(async (scratchDir) => {
      const mergeCtx = {
        ...createCtx(scratchDir, "a.pdf"),
        inputs: [
          { buffer: Buffer.from("a"), filename: "a.pdf", ref: "r0" },
          { buffer: Buffer.from("b"), filename: "b.pdf", ref: "r1" },
        ],
      };
      await getToolConfig("merge-pdf")?.processV2?.(mergeCtx);
      expect(qpdfMerge).toHaveBeenCalledWith(
        [join(scratchDir, "in-0.pdf"), join(scratchDir, "in-1.pdf")],
        join(scratchDir, "merged.pdf"),
        { signal: mergeCtx.signal },
      );

      const splitRangeCtx = {
        ...createCtx(scratchDir, "doc.pdf"),
        settings: { mode: "range", range: "1-2" },
      };
      await getToolConfig("split-pdf")?.processV2?.(splitRangeCtx);
      expect(qpdfSplitRanges).toHaveBeenLastCalledWith(
        join(scratchDir, "in-doc.pdf"),
        "1-2",
        join(scratchDir, "doc_pages.pdf"),
        { signal: splitRangeCtx.signal },
      );

      vi.mocked(qpdfPageCount).mockResolvedValueOnce(2);
      vi.mocked(qpdfSplitRanges).mockImplementationOnce(
        async (_in: string, _range: string, out: string) => {
          await writeFile(out, Buffer.from("%PDF-part"));
        },
      );
      const splitEveryCtx = {
        ...createCtx(scratchDir, "doc.pdf"),
        settings: { mode: "every", everyN: 2 },
      };
      await getToolConfig("split-pdf")?.processV2?.(splitEveryCtx);
      expect(qpdfPageCount).toHaveBeenLastCalledWith(join(scratchDir, "in-doc.pdf"), {
        signal: splitEveryCtx.signal,
      });
      expect(qpdfSplitRanges).toHaveBeenLastCalledWith(
        join(scratchDir, "in-doc.pdf"),
        "1-2",
        join(scratchDir, "part-1.pdf"),
        { signal: splitEveryCtx.signal },
      );

      const rotateCtx = { ...createCtx(scratchDir, "doc.pdf"), settings: { angle: 90 } };
      await getToolConfig("rotate-pdf")?.processV2?.(rotateCtx);
      expect(qpdfRotate).toHaveBeenCalledWith(
        join(scratchDir, "in-doc.pdf"),
        90,
        "1-z",
        join(scratchDir, "doc_rotated.pdf"),
        { signal: rotateCtx.signal },
      );

      const protectCtx = {
        ...createCtx(scratchDir, "doc.pdf"),
        settings: { userPassword: "secret" },
      };
      await getToolConfig("protect-pdf")?.processV2?.(protectCtx);
      expect(qpdfEncrypt).toHaveBeenCalledWith(
        join(scratchDir, "in-doc.pdf"),
        "secret",
        "secret",
        join(scratchDir, "doc_protected.pdf"),
        { signal: protectCtx.signal },
      );

      const unlockCtx = { ...createCtx(scratchDir, "doc.pdf"), settings: { password: "secret" } };
      await getToolConfig("unlock-pdf")?.processV2?.(unlockCtx);
      expect(qpdfDecrypt).toHaveBeenCalledWith(
        join(scratchDir, "in-doc.pdf"),
        "secret",
        join(scratchDir, "doc_unlocked.pdf"),
        { signal: unlockCtx.signal },
      );

      const repairCtx = createCtx(scratchDir, "doc.pdf");
      await getToolConfig("repair-pdf")?.processV2?.(repairCtx);
      expect(qpdfRepair).toHaveBeenCalledWith(
        join(scratchDir, "in-doc.pdf"),
        join(scratchDir, "doc_repaired.pdf"),
        { signal: repairCtx.signal },
      );

      const linCtx = createCtx(scratchDir, "doc.pdf");
      await getToolConfig("linearize-pdf")?.processV2?.(linCtx);
      expect(qpdfLinearize).toHaveBeenCalledWith(
        join(scratchDir, "in-doc.pdf"),
        join(scratchDir, "doc_linearized.pdf"),
        { signal: linCtx.signal },
      );

      const orgCtx = { ...createCtx(scratchDir, "doc.pdf"), settings: { order: "2,1" } };
      await getToolConfig("organize-pdf")?.processV2?.(orgCtx);
      expect(qpdfPagesSpec).toHaveBeenLastCalledWith(
        join(scratchDir, "in-doc.pdf"),
        "2,1",
        join(scratchDir, "doc_organized.pdf"),
        { signal: orgCtx.signal },
      );

      const extCtx = { ...createCtx(scratchDir, "doc.pdf"), settings: { range: "1-2" } };
      await getToolConfig("extract-pages")?.processV2?.(extCtx);
      expect(qpdfPagesSpec).toHaveBeenLastCalledWith(
        join(scratchDir, "in-doc.pdf"),
        "1-2",
        join(scratchDir, "doc_extracted.pdf"),
        { signal: extCtx.signal },
      );

      vi.mocked(qpdfPageCount).mockResolvedValueOnce(3);
      const remCtx = { ...createCtx(scratchDir, "doc.pdf"), settings: { pages: "2" } };
      await getToolConfig("remove-pages")?.processV2?.(remCtx);
      expect(qpdfPageCount).toHaveBeenLastCalledWith(join(scratchDir, "in-doc.pdf"), {
        signal: remCtx.signal,
      });
      expect(qpdfPagesSpecUnchecked).toHaveBeenCalledWith(
        join(scratchDir, "in-doc.pdf"),
        "1,3",
        join(scratchDir, "doc_removed.pdf"),
        { signal: remCtx.signal },
      );

      vi.mocked(qpdfPageCount).mockResolvedValueOnce(2);
      const multiCtx = {
        ...createCtx(scratchDir, "doc.pdf"),
        settings: {
          items: [{ doc: 0, page: 1, rot: 90 }],
          pageCounts: [2],
        },
      };
      await getToolConfig("multi-tool-pdf")?.processV2?.(multiCtx);
      expect(qpdfPageCount).toHaveBeenLastCalledWith(join(scratchDir, "doc-0-doc.pdf"), {
        signal: multiCtx.signal,
      });
      expect(qpdfAssemblePages).toHaveBeenCalledWith(
        [join(scratchDir, "doc-0-doc.pdf")],
        [{ doc: 0, page: 1, rot: 90 }],
        join(scratchDir, "assembled.pdf"),
        { signal: multiCtx.signal },
      );
      expect(qpdfRotatePages).toHaveBeenCalledWith(
        join(scratchDir, "assembled.pdf"),
        [{ page: 1, angle: 90 }],
        join(scratchDir, "output.pdf"),
        { signal: multiCtx.signal },
      );
    });
  });

  it("stops multi-step qpdf routes immediately when an earlier step rejects on abort", async () => {
    registerSplitPdf(createMockApp());
    registerMultiToolPdf(createMockApp());

    await withScratch(async (scratchDir) => {
      vi.mocked(qpdfPageCount).mockResolvedValueOnce(4);
      vi.mocked(qpdfSplitRanges).mockRejectedValueOnce(new Error("Canceled"));
      const splitEveryCtx = {
        ...createCtx(scratchDir, "doc.pdf"),
        settings: { mode: "every", everyN: 2 },
      };
      await expect(getToolConfig("split-pdf")?.processV2?.(splitEveryCtx)).rejects.toThrow(
        "Canceled",
      );
      expect(qpdfSplitRanges).toHaveBeenCalledTimes(1);
      expect(splitEveryCtx.report).not.toHaveBeenCalledWith(85, "Creating archive");

      vi.clearAllMocks();
      vi.mocked(qpdfPageCount).mockResolvedValueOnce(2);
      vi.mocked(qpdfAssemblePages).mockRejectedValueOnce(new Error("Canceled"));
      const multiCtx = {
        ...createCtx(scratchDir, "doc.pdf"),
        settings: {
          items: [{ doc: 0, page: 1, rot: 90 }],
          pageCounts: [2],
        },
      };
      await expect(getToolConfig("multi-tool-pdf")?.processV2?.(multiCtx)).rejects.toThrow(
        "Canceled",
      );
      expect(qpdfAssemblePages).toHaveBeenCalledTimes(1);
      expect(qpdfRotatePages).not.toHaveBeenCalled();
      expect(multiCtx.report).not.toHaveBeenCalledWith(90, "Done");
    });
  });
});
