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
    BASE_PATH: "",
    WORKSPACE_PATH: "/tmp/test",
    MAX_MEGAPIXELS: 100,
    MAX_SVG_SIZE_MB: 10,
    MAX_UPLOAD_SIZE_MB: 50,
    RATE_LIMIT_PER_MIN: 0,
  },
}));

vi.mock("@snapotter/doc-engine", () => ({
  gsCompressPdfTuned: vi.fn(),
  htmlToPdfPy: vi.fn(),
  pdfFlattenPy: vi.fn(),
  pdfRedactPy: vi.fn(async () => ({ found: 3 })),
  pdfScrubProducerPy: vi.fn(),
  pdfTextPy: vi.fn(async () => ({ chars: 12, hasText: true })),
  qpdfAvailable: vi.fn(() => false),
  qpdfCheck: vi.fn(),
  qpdfPageCount: vi.fn(),
  resolveGs: vi.fn(() => null),
  resolveQpdf: vi.fn(() => null),
  resolveSoffice: vi.fn(() => null),
  runPandoc: vi.fn(),
  sofficeAvailable: vi.fn(() => false),
}));

import { writeFile } from "node:fs/promises";
import {
  gsCompressPdfTuned,
  htmlToPdfPy,
  pdfFlattenPy,
  pdfRedactPy,
  pdfScrubProducerPy,
  pdfTextPy,
  runPandoc,
} from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerCompressPdf } from "../../../apps/api/src/routes/tools/compress-pdf.js";
import { registerEpubConvert } from "../../../apps/api/src/routes/tools/epub-convert.js";
import { registerFlattenPdf } from "../../../apps/api/src/routes/tools/flatten-pdf.js";
import { registerHtmlToPdf } from "../../../apps/api/src/routes/tools/html-to-pdf.js";
import { registerMarkdownToPdf } from "../../../apps/api/src/routes/tools/markdown-to-pdf.js";
import { registerPdfToText } from "../../../apps/api/src/routes/tools/pdf-to-text.js";
import { registerRedactPdf } from "../../../apps/api/src/routes/tools/redact-pdf.js";
import { registerToEpub } from "../../../apps/api/src/routes/tools/to-epub.js";

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
});
