import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import multipart from "@fastify/multipart";
import { apiToolPath, BASE_CONFIG, COMPRESS_PRESETS, CONVERSION_PRESETS } from "@snapotter/shared";
import AdmZip from "adm-zip";
import Fastify from "fastify";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pdfScrubProducerPy = vi.fn();
const storedObjects = new Map<string, Buffer>();
const putObject = vi.fn(async (key: string, data: Buffer) => {
  storedObjects.set(key, Buffer.from(data));
});
const getObjectBuffer = vi.fn(async (key: string) => {
  const buf = storedObjects.get(key);
  if (!buf) throw new Error(`missing object: ${key}`);
  return buf;
});

vi.mock("@snapotter/doc-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@snapotter/doc-engine")>();
  return {
    ...actual,
    pdfScrubProducerPy: (...args: unknown[]) => pdfScrubProducerPy(...args),
  };
});

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: (key: string, data: Buffer) => putObject(key, data),
    getObjectBuffer: (key: string) => getObjectBuffer(key),
  };
});

import {
  SCRUB_PDF_PRODUCER_TOOLS,
  scrubPdfProducer,
  scrubPdfProducerFile,
} from "../../../apps/api/src/lib/pdf-producer.js";
import {
  registerImageToPdf,
  registerImageToPdfPreset,
} from "../../../apps/api/src/routes/tools/image-to-pdf.js";

function multipartBody(files: { name: string; type: string; data: Buffer }[], settings?: object) {
  const boundary = "----unit-pdf-producer";
  const chunks: Buffer[] = [];
  for (const f of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${f.name}"\r\nContent-Type: ${f.type}\r\n\r\n`,
      ),
      f.data,
      Buffer.from("\r\n"),
    );
  }
  if (settings) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="settings"\r\n\r\n${JSON.stringify(settings)}\r\n`,
      ),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

// The worker scrubs by the job's own toolId, and a preset's job carries the
// preset id, not its base's. A preset missing from the set ships the engine's
// "GPL Ghostscript" Producer that the base tool hides (#1070 review).
describe("SCRUB_PDF_PRODUCER_TOOLS covers presets of scrubbed bases", () => {
  it("includes every compress preset whose base is scrubbed", () => {
    const missing = COMPRESS_PRESETS.filter(
      (p) => SCRUB_PDF_PRODUCER_TOOLS.has(p.base) && !SCRUB_PDF_PRODUCER_TOOLS.has(p.id),
    ).map((p) => p.id);
    expect(missing).toEqual([]);
  });

  it("excludes compress-pdf and its presets from worker post-scrubbing so never-enlarge and targetMet hold (#1373)", () => {
    expect(SCRUB_PDF_PRODUCER_TOOLS.has("compress-pdf")).toBe(false);
    const pdfPresets = COMPRESS_PRESETS.filter((p) => p.base === "compress-pdf");
    expect(pdfPresets.length).toBeGreaterThan(0);
    for (const preset of pdfPresets) {
      expect(SCRUB_PDF_PRODUCER_TOOLS.has(preset.id)).toBe(false);
    }
  });

  it("includes every image-to-pdf conversion preset", () => {
    const missing = CONVERSION_PRESETS.filter(
      (p) => BASE_CONFIG[p.base]?.group === "image-to-pdf" && !SCRUB_PDF_PRODUCER_TOOLS.has(p.id),
    ).map((p) => p.id);
    expect(missing).toEqual([]);
  });
});

describe("image-to-pdf custom route Producer scrub (#2501)", () => {
  const SCRUB_TAG = Buffer.from("\n%Producer:SnapOtter\n");

  beforeEach(() => {
    storedObjects.clear();
    putObject.mockClear();
    getObjectBuffer.mockClear();
    pdfScrubProducerPy.mockReset().mockImplementation(async (inPath: string, outPath: string) => {
      const raw = await readFile(inPath);
      await writeFile(outPath, Buffer.concat([raw, SCRUB_TAG]));
    });
  });

  async function buildApp() {
    const app = Fastify();
    await app.register(multipart);
    registerImageToPdf(app);
    registerImageToPdfPreset(app, "png-to-pdf", [".png"]);
    await app.ready();
    return app;
  }

  async function makePng(): Promise<Buffer> {
    return sharp({
      create: { width: 20, height: 20, channels: 3, background: "#f00" },
    })
      .png()
      .toBuffer();
  }

  it("scrubs collated PDF output on image-to-pdf and png-to-pdf before storing and measuring processedSize", async () => {
    const app = await buildApp();
    const png = await makePng();

    for (const toolId of ["image-to-pdf", "png-to-pdf"]) {
      storedObjects.clear();
      pdfScrubProducerPy.mockClear();

      const res = await app.inject({
        method: "POST",
        url: apiToolPath(toolId),
        ...multipartBody([{ name: "a.png", type: "image/png", data: png }]),
      });

      expect(res.statusCode).toBe(200);
      expect(pdfScrubProducerPy).toHaveBeenCalledTimes(1);
      const body = res.json();
      const stored = storedObjects.get(`outputs/${body.jobId}/images.pdf`);
      expect(stored).toBeDefined();
      expect(stored?.subarray(-SCRUB_TAG.length).equals(SCRUB_TAG)).toBe(true);
      expect(body.processedSize).toBe(stored?.length);
    }

    await app.close();
  });

  it("evaluates targetMet against the post-scrub PDF size on collated output", async () => {
    const app = await buildApp();
    const png = await makePng();

    // First call: scrub keeps the PDF at 49,990 bytes (<= 50,000 targetBytes) -> targetMet: true.
    pdfScrubProducerPy.mockImplementationOnce(async (inPath: string, outPath: string) => {
      const raw = await readFile(inPath);
      expect(raw.length).toBeLessThanOrEqual(49_990);
      const pad = Buffer.alloc(49_990 - raw.length, 0x20);
      await writeFile(outPath, Buffer.concat([raw, pad]));
    });

    const metRes = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...multipartBody([{ name: "a.png", type: "image/png", data: png }], {
        targetSize: { value: 50, unit: "KB" },
      }),
    });

    expect(metRes.statusCode).toBe(200);
    expect(metRes.json()).toMatchObject({
      processedSize: 49_990,
      compression: {
        targetRequested: 50_000,
        targetMet: true,
        jpegQuality: expect.any(Number),
      },
    });

    // Second call: raw PDF is <= 50,000 bytes, but scrub pushes the final PDF to
    // 50,010 bytes -> targetMet flips to false and processedSize is 50,010.
    pdfScrubProducerPy.mockImplementationOnce(async (inPath: string, outPath: string) => {
      const raw = await readFile(inPath);
      expect(raw.length).toBeLessThanOrEqual(50_000);
      const pad = Buffer.alloc(50_010 - raw.length, 0x20);
      await writeFile(outPath, Buffer.concat([raw, pad]));
    });

    const missedRes = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...multipartBody([{ name: "a.png", type: "image/png", data: png }], {
        targetSize: { value: 50, unit: "KB" },
      }),
    });

    expect(missedRes.statusCode).toBe(200);
    expect(missedRes.json()).toMatchObject({
      processedSize: 50_010,
      compression: {
        targetRequested: 50_000,
        targetMet: false,
        jpegQuality: expect.any(Number),
      },
    });

    await app.close();
  });

  it("falls back to the unscrubbed PDFKit buffer when the Producer scrub fails", async () => {
    pdfScrubProducerPy.mockRejectedValueOnce(new Error("PyMuPDF not installed"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const app = await buildApp();
    const png = await makePng();

    try {
      const res = await app.inject({
        method: "POST",
        url: apiToolPath("image-to-pdf"),
        ...multipartBody([{ name: "a.png", type: "image/png", data: png }]),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const stored = storedObjects.get(`outputs/${body.jobId}/images.pdf`);
      expect(stored?.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(body.processedSize).toBe(stored?.length);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[pdf-scrub] keeping original metadata: PyMuPDF not installed"),
      );
    } finally {
      warnSpy.mockRestore();
      await app.close();
    }
  });

  it("scrubs every per-image PDF before zipping when collate is false", async () => {
    const app = await buildApp();
    const png = await makePng();

    const res = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...multipartBody(
        [
          { name: "first.png", type: "image/png", data: png },
          { name: "second.png", type: "image/png", data: png },
        ],
        { collate: false },
      ),
    });

    expect(res.statusCode).toBe(200);
    expect(pdfScrubProducerPy).toHaveBeenCalledTimes(2);
    const body = res.json();
    const firstPdf = storedObjects.get(`outputs/${body.jobId}/first.pdf`);
    const secondPdf = storedObjects.get(`outputs/${body.jobId}/second.pdf`);
    const zipBytes = storedObjects.get(`outputs/${body.jobId}/images.zip`);
    expect(firstPdf?.subarray(-SCRUB_TAG.length).equals(SCRUB_TAG)).toBe(true);
    expect(secondPdf?.subarray(-SCRUB_TAG.length).equals(SCRUB_TAG)).toBe(true);
    expect(body.processedSize).toBe((firstPdf?.length ?? 0) + (secondPdf?.length ?? 0));

    const zip = new AdmZip(zipBytes as Buffer);
    const entries = zip.getEntries();
    expect(entries.map((e) => e.entryName).sort()).toEqual(["first.pdf", "second.pdf"]);
    for (const entry of entries) {
      expect(entry.getData().subarray(-SCRUB_TAG.length).equals(SCRUB_TAG)).toBe(true);
    }

    await app.close();
  });

  it("evaluates targetMet against the post-scrub PDF size sum when collate is false (#2519)", async () => {
    const app = await buildApp();
    const png = await makePng();

    // First call: two scrubbed single-page PDFs sum to 50,000 bytes (exact targetBytes boundary) -> targetMet: true.
    for (const targetLen of [25_000, 25_000]) {
      pdfScrubProducerPy.mockImplementationOnce(async (inPath: string, outPath: string) => {
        const raw = await readFile(inPath);
        expect(raw.length).toBeLessThanOrEqual(targetLen);
        const pad = Buffer.alloc(targetLen - raw.length, 0x20);
        await writeFile(outPath, Buffer.concat([raw, pad]));
      });
    }

    const metRes = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...multipartBody(
        [
          { name: "first.png", type: "image/png", data: png },
          { name: "second.png", type: "image/png", data: png },
        ],
        {
          collate: false,
          targetSize: { value: 50, unit: "KB" },
        },
      ),
    });

    expect(metRes.statusCode).toBe(200);
    expect(metRes.json()).toMatchObject({
      processedSize: 50_000,
      collated: false,
      compression: {
        targetRequested: 50_000,
        targetMet: true,
        jpegQuality: expect.any(Number),
      },
    });

    // Second call: compressed JPEGs fit the pre-PDF budget, but the two scrubbed
    // single-page PDFs sum to 50,001 bytes (1 byte over targetBytes) -> targetMet: false.
    for (const targetLen of [25_000, 25_001]) {
      pdfScrubProducerPy.mockImplementationOnce(async (inPath: string, outPath: string) => {
        const raw = await readFile(inPath);
        expect(raw.length).toBeLessThanOrEqual(targetLen);
        const pad = Buffer.alloc(targetLen - raw.length, 0x20);
        await writeFile(outPath, Buffer.concat([raw, pad]));
      });
    }

    const missedRes = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...multipartBody(
        [
          { name: "first.png", type: "image/png", data: png },
          { name: "second.png", type: "image/png", data: png },
        ],
        {
          collate: false,
          targetSize: { value: 50, unit: "KB" },
        },
      ),
    });

    expect(missedRes.statusCode).toBe(200);
    expect(missedRes.json()).toMatchObject({
      processedSize: 50_001,
      collated: false,
      compression: {
        targetRequested: 50_000,
        targetMet: false,
        jpegQuality: expect.any(Number),
      },
    });

    await app.close();
  });

  it("budgets per-file PDF overhead when collate is false so multi-image runs meet targetSize (#2519)", async () => {
    const app = await buildApp();
    // Create a 160x160 detailed image whose JPEG size ranges from ~1.5 KB (q=10)
    // to ~4.2 KB (q=74). With 10 copies and a 50 KB target:
    // - collate=true overhead (2048 + 10 * 500 = 7,048 B) leaves a 42,952 B JPEG budget (~4.2 KB/image).
    // - collate=false wraps each image in its own PDF (~1 KB each), so budgeting single-PDF
    //   overhead picks a quality whose 10 PDFs exceed 50,000 B unless per-file overhead
    //   (10 * 2548 = 25,480 B, leaving 24,520 B for JPEGs) is reserved up front.
    const w = 160;
    const h = 160;
    const raw = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 3;
        raw[idx] = (x * 17 + y * 31) % 256;
        raw[idx + 1] = (x * 23 + y * 11) % 256;
        raw[idx + 2] = (x * 7 + y * 43) % 256;
      }
    }
    const noisyPng = await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
      .png()
      .toBuffer();
    const tenFiles = Array.from({ length: 10 }, (_, i) => ({
      name: `img-${i}.png`,
      type: "image/png",
      data: noisyPng,
    }));

    const collatedRes = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...multipartBody(tenFiles, {
        collate: true,
        targetSize: { value: 50, unit: "KB" },
      }),
    });
    expect(collatedRes.statusCode).toBe(200);
    const collatedBody = collatedRes.json();

    const uncollatedRes = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...multipartBody(tenFiles, {
        collate: false,
        targetSize: { value: 50, unit: "KB" },
      }),
    });
    expect(uncollatedRes.statusCode).toBe(200);
    const uncollatedBody = uncollatedRes.json();

    expect(uncollatedBody.compression.jpegQuality).toBeLessThan(
      collatedBody.compression.jpegQuality,
    );
    expect(uncollatedBody.processedSize).toBeLessThanOrEqual(50_000);
    expect(uncollatedBody.compression.targetMet).toBe(true);

    // When 20 files are converted with collate=false and a 50 KB target, the
    // conservative per-file overhead estimate (20 * 2548 = 50,960 B) exceeds
    // targetBytes (budget <= 0 -> quality 10, pre-PDF targetMet false), and
    // post-loop re-evaluation flips targetMet back to true when the actual
    // scrubbed single-page PDFs sum below 50,000 B.
    const tinyPng = await makePng();
    const twentyTinyFiles = Array.from({ length: 20 }, (_, i) => ({
      name: `tiny-${i}.png`,
      type: "image/png",
      data: tinyPng,
    }));
    const twentyRes = await app.inject({
      method: "POST",
      url: apiToolPath("image-to-pdf"),
      ...multipartBody(twentyTinyFiles, {
        collate: false,
        targetSize: { value: 50, unit: "KB" },
      }),
    });
    expect(twentyRes.statusCode).toBe(200);
    const twentyBody = twentyRes.json();
    expect(twentyBody.processedSize).toBeLessThanOrEqual(50_000);
    expect(twentyBody.compression).toEqual({
      targetRequested: 50_000,
      targetMet: true,
      jpegQuality: 10,
    });

    await app.close();
  });
});

describe("scrubPdfProducerFile and scrubPdfProducer AbortSignal handling (#3254)", () => {
  beforeEach(() => {
    pdfScrubProducerPy.mockReset();
  });

  it("forwards opts to pdfScrubProducerPy in scrubPdfProducerFile and rethrows on abort after cleaning up the sibling temp file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pdf-producer-unit-"));
    const filePath = join(dir, "cand.pdf");
    const original = Buffer.from("%PDF-1.4 original");
    await writeFile(filePath, original);

    try {
      const ac = new AbortController();
      pdfScrubProducerPy.mockImplementationOnce(async (_inPath: string, outPath: string) => {
        await writeFile(outPath, Buffer.from("%PDF-1.4 scrubbed"));
      });

      await scrubPdfProducerFile(filePath, { signal: ac.signal, timeoutMs: 15_000 });
      expect(pdfScrubProducerPy).toHaveBeenCalledWith(filePath, `${filePath}.scrub.pdf`, {
        signal: ac.signal,
        timeoutMs: 15_000,
      });
      expect(await readFile(filePath, "utf8")).toBe("%PDF-1.4 scrubbed");

      // Now abort mid-scrub: partial .scrub.pdf must be removed, original file kept, and abort rethrown without warning.
      await writeFile(filePath, original);
      const abortAc = new AbortController();
      const abortErr = Object.assign(new Error("Python script canceled"), {
        name: "AbortError",
        code: "canceled",
      });
      pdfScrubProducerPy.mockImplementationOnce(async (_inPath: string, outPath: string) => {
        await writeFile(outPath, Buffer.from("partial"));
        abortAc.abort(abortErr);
        throw abortErr;
      });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        await expect(scrubPdfProducerFile(filePath, { signal: abortAc.signal })).rejects.toBe(
          abortErr,
        );
        expect((await readFile(filePath)).equals(original)).toBe(true);
        await expect(stat(`${filePath}.scrub.pdf`)).rejects.toThrow();
        expect(warnSpy).not.toHaveBeenCalled();

        // Pre-aborted signal rejects before invoking pdfScrubProducerPy.
        pdfScrubProducerPy.mockClear();
        await expect(scrubPdfProducerFile(filePath, { signal: abortAc.signal })).rejects.toBe(
          abortErr,
        );
        expect(pdfScrubProducerPy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();

        // Non-abort scrub failure racing with a timeout signal throws the signal's reason ("timeout")
        // rather than leaking the internal scrub error.
        const timeoutAc = new AbortController();
        pdfScrubProducerPy.mockImplementationOnce(async () => {
          timeoutAc.abort("timeout");
          throw new Error("doc_scrub_meta failed: No module named 'fitz'");
        });
        await expect(scrubPdfProducerFile(filePath, { signal: timeoutAc.signal })).rejects.toBe(
          "timeout",
        );
        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("forwards opts to pdfScrubProducerPy in scrubPdfProducer and rethrows on abort instead of returning the unscrubbed buffer", async () => {
    const original = Buffer.from("%PDF-1.4 raw");
    const scrubbed = Buffer.from("%PDF-1.4 scrubbed");
    const ac = new AbortController();

    pdfScrubProducerPy.mockImplementationOnce(async (_inPath: string, outPath: string) => {
      await writeFile(outPath, scrubbed);
    });

    const out = await scrubPdfProducer(original, { signal: ac.signal });
    expect(out.equals(scrubbed)).toBe(true);
    expect(pdfScrubProducerPy).toHaveBeenCalledWith(
      expect.stringMatching(/in\.pdf$/),
      expect.stringMatching(/out\.pdf$/),
      { signal: ac.signal },
    );

    const abortAc = new AbortController();
    const abortErr = Object.assign(new Error("Python script canceled"), {
      name: "AbortError",
      code: "canceled",
    });
    let capturedDir = "";
    pdfScrubProducerPy.mockImplementationOnce(async (inPath: string) => {
      capturedDir = inPath.replace(/\/in\.pdf$/, "");
      abortAc.abort(abortErr);
      throw abortErr;
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(scrubPdfProducer(original, { signal: abortAc.signal })).rejects.toBe(abortErr);
      expect(capturedDir).not.toBe("");
      await expect(stat(capturedDir)).rejects.toThrow();
      expect(warnSpy).not.toHaveBeenCalled();

      // Pre-aborted signal rejects without calling pdfScrubProducerPy.
      pdfScrubProducerPy.mockClear();
      await expect(scrubPdfProducer(original, { signal: abortAc.signal })).rejects.toBe(abortErr);
      expect(pdfScrubProducerPy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();

      // Non-abort scrub failure racing with a timeout signal throws the signal's reason ("timeout").
      const timeoutAc = new AbortController();
      pdfScrubProducerPy.mockImplementationOnce(async () => {
        timeoutAc.abort("timeout");
        throw new Error("doc_scrub_meta failed: No module named 'fitz'");
      });
      await expect(scrubPdfProducer(original, { signal: timeoutAc.signal })).rejects.toBe(
        "timeout",
      );
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
