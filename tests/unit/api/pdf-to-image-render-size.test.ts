/**
 * #4424: a DPI that makes the render too large failed as a 422 "PDF conversion
 * failed" carrying mupdf's allocator text (`malloc (832787013 bytes) failed`,
 * `Overly large image`). The route now refuses a page whose render would pass
 * sharp's pixel cap with a 400 that names the DPI and the size, and maps
 * mupdf's own allocation refusals to the same kind of 400.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import multipart from "@fastify/multipart";
import { apiToolPath } from "@snapotter/shared";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const putObject = vi.fn();
const getObjectBuffer = vi.fn();
const deletePrefix = vi.fn();

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: (...args: unknown[]) => putObject(...args),
    getObjectBuffer: (...args: unknown[]) => getObjectBuffer(...args),
    deletePrefix: (...args: unknown[]) => deletePrefix(...args),
  };
});

vi.mock("../../../apps/api/src/permissions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/permissions.js")>();
  return { ...actual, requireToolAccess: async () => true };
});

// mupdf is an apps/api dependency only, so the root test tree cannot resolve
// the bare specifier. This path is the same module instance the route loads,
// which the toPixmap spies below rely on.
import * as mupdf from "../../../apps/api/node_modules/mupdf/dist/mupdf.js";
import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import {
  MAX_RENDER_PIXELS,
  registerPdfToImage,
  renderPixelSize,
} from "../../../apps/api/src/routes/tools/pdf-to-image.js";

const PDF_3PAGE = readFileSync(join(__dirname, "../../fixtures/document/valid/test-3page.pdf"));

/** A blank PDF with one page per [width, height] in points. */
function pdfWithPages(sizes: Array<[number, number]>): Buffer {
  const doc = new mupdf.PDFDocument();
  try {
    for (const [w, h] of sizes) {
      doc.insertPage(-1, doc.addPage([0, 0, w, h], 0, doc.newDictionary(), ""));
    }
    return Buffer.from(doc.saveToBuffer("").asUint8Array());
  } finally {
    doc.destroy();
  }
}

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(multipart);
  registerErrorHandler(app);
  registerPdfToImage(app);
  await app.ready();
  return app;
}

async function convert(pdf: Buffer, settings: Record<string, unknown>) {
  const boundary = "----unit";
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
    ),
    pdf,
    Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="settings"\r\n\r\n${JSON.stringify(settings)}\r\n--${boundary}--\r\n`,
    ),
  ]);
  const app = await buildApp();
  try {
    return await app.inject({
      method: "POST",
      url: apiToolPath("pdf-to-image"),
      payload,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
  } finally {
    await app.close();
  }
}

describe("renderPixelSize", () => {
  it("matches the pixmap mupdf renders for the fixture page", () => {
    const doc = mupdf.Document.openDocument(PDF_3PAGE, "application/pdf");
    const page = doc.loadPage(0);
    try {
      for (const dpi of [36, 72, 150, 300]) {
        const scale = dpi / 72;
        const pixmap = page.toPixmap(
          mupdf.Matrix.scale(scale, scale),
          mupdf.ColorSpace.DeviceRGB,
          false,
          true,
        );
        expect(renderPixelSize(page.getBounds(), dpi)).toEqual({
          width: pixmap.getWidth(),
          height: pixmap.getHeight(),
        });
        pixmap.destroy();
      }
    } finally {
      page.destroy();
      doc.destroy();
    }
  });

  it("puts the issue's letter page at 2400 DPI over the cap and 1800 DPI under it", () => {
    const at = (dpi: number) => {
      const { width, height } = renderPixelSize([0, 0, 420, 595], dpi);
      return width * height;
    };
    expect(at(2400)).toBeGreaterThan(MAX_RENDER_PIXELS);
    expect(at(1800)).toBeLessThanOrEqual(MAX_RENDER_PIXELS);
  });
});

describe("pdf-to-image refuses a render that is too large (#4424)", () => {
  beforeEach(() => {
    putObject.mockReset().mockResolvedValue(undefined);
    getObjectBuffer.mockReset().mockResolvedValue(Buffer.from("page"));
    deletePrefix.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("answers 400 naming the DPI and the size instead of mupdf's malloc text", async () => {
    const res = await convert(pdfWithPages([[420, 595]]), { dpi: 2400, pages: "1" });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe("RESULT_TOO_LARGE");
    expect(body.error).toMatch(/^Page 1 at 2400 DPI would render 14000 x 19834 px \(278 MP\)/);
    expect(body.error).toContain("268 MP limit");
    expect(body.error).toContain("Lower the DPI");
    expect(JSON.stringify(body)).not.toMatch(/malloc/);
    expect(putObject).not.toHaveBeenCalled();
  });

  it("refuses the issue's 6000 x 4000 pt page at 300 DPI", async () => {
    const res = await convert(pdfWithPages([[6000, 4000]]), { dpi: 300, format: "jpg" });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/^Page 1 at 300 DPI would render 25000 x 16667 px/);
  });

  it("clears the pages already written when a later page is the one too large", async () => {
    const res = await convert(
      pdfWithPages([
        [100, 100],
        [20000, 20000],
      ]),
      { dpi: 72 },
    );

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/^Page 2 at 72 DPI/);
    expect(putObject).toHaveBeenCalledTimes(1);
    const prefix = String(putObject.mock.calls[0][0]).replace(/\/[^/]+$/, "");
    expect(deletePrefix).toHaveBeenCalledWith(prefix);
  });

  it.each(["malloc (832787013 bytes) failed", "Overly large image"])(
    "maps mupdf's %s under the cap to a 400 that names the DPI",
    async (message) => {
      vi.spyOn(mupdf.PDFPage.prototype, "toPixmap").mockImplementation(() => {
        throw new Error(message);
      });
      const res = await convert(PDF_3PAGE, { dpi: 600, pages: "1" });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("RESULT_TOO_LARGE");
      expect(body.error).toMatch(/^Page 1 is too large to render at 600 DPI \(\d+ x \d+ px\)/);
      expect(JSON.stringify(body)).not.toContain(message);
    },
  );

  it("still answers 422 for a render failure that is not about size", async () => {
    vi.spyOn(mupdf.PDFPage.prototype, "toPixmap").mockImplementation(() => {
      throw new Error("syntax error in content stream");
    });
    const res = await convert(PDF_3PAGE, { dpi: 150, pages: "1" });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("PDF conversion failed");
  });

  it("renders a page right at a normal DPI", async () => {
    const res = await convert(PDF_3PAGE, { dpi: 150, pages: "1" });

    expect(res.statusCode).toBe(200);
  });
});
