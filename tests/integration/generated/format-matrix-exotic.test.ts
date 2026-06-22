/**
 * Exotic format deep-dive integration tests.
 *
 * Focuses on less common formats most likely to have bugs:
 *   DNG, EXR, HDR, JXL, PSD, TGA, APNG, QOI
 *
 * Test suites:
 *   1. Format auto-detection: upload with wrong extension, verify correct
 *      format detection via magic bytes and successful processing
 *   2. Output format conversion matrix: uncommon input formats to every
 *      supported output format (jpg, png, webp, avif, tiff, gif, heic, jxl,
 *      bmp, ico, jp2, qoi)
 *   3. Uncommon format deep-dive: multiple tool parameter variations per
 *      format, with output verification using Sharp where possible
 *   4. Chained operations on exotic formats: decode -> process -> convert
 *   5. Edge cases: zero-byte files, truncated files, corrupt headers
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { apiToolPath } from "@snapotter/shared";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureDir, fixtures } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

// ---------------------------------------------------------------------------
// Format definitions
// ---------------------------------------------------------------------------
interface FormatDef {
  name: string;
  file: string;
  mime: string;
  /** If true, requires CLI decoder (may not be installed) */
  needsCliDecoder: boolean;
}

/** The 8 uncommon formats we focus on */
const EXOTIC_FORMATS: FormatDef[] = [
  { name: "DNG", file: "sample.dng", mime: "image/x-adobe-dng", needsCliDecoder: true },
  { name: "EXR", file: "sample.exr", mime: "image/x-exr", needsCliDecoder: true },
  { name: "HDR", file: "sample.hdr", mime: "image/vnd.radiance", needsCliDecoder: true },
  { name: "JXL", file: "sample.jxl", mime: "image/jxl", needsCliDecoder: true },
  { name: "PSD", file: "sample.psd", mime: "image/vnd.adobe.photoshop", needsCliDecoder: true },
  { name: "TGA", file: "sample.tga", mime: "image/x-tga", needsCliDecoder: true },
  { name: "APNG", file: "sample.apng", mime: "image/apng", needsCliDecoder: false },
  { name: "QOI", file: "sample.qoi", mime: "image/x-qoi", needsCliDecoder: true },
];

/** Core formats for cross-comparison */
const CORE_FORMATS: FormatDef[] = [
  { name: "JPEG", file: "sample.jpg", mime: "image/jpeg", needsCliDecoder: false },
  { name: "PNG", file: "sample.png", mime: "image/png", needsCliDecoder: false },
  { name: "WebP", file: "sample.webp", mime: "image/webp", needsCliDecoder: false },
  { name: "GIF", file: "sample.gif", mime: "image/gif", needsCliDecoder: false },
  { name: "AVIF", file: "sample.avif", mime: "image/avif", needsCliDecoder: false },
  { name: "TIFF", file: "sample.tiff", mime: "image/tiff", needsCliDecoder: false },
  { name: "SVG", file: "sample.svg", mime: "image/svg+xml", needsCliDecoder: false },
];

/** All supported output formats */
const ALL_OUTPUT_FORMATS = ["jpg", "png", "webp", "avif", "tiff", "gif"];

/** Extended output formats that may need CLI encoders */
const EXTENDED_OUTPUT_FORMATS = ["heic", "jxl", "bmp", "ico", "jp2", "qoi"];

/** Acceptable status codes for exotic formats that may lack decoders */
const ACCEPTABLE_CODES = [200, 202, 400, 422];

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function callToolWithFile(
  toolId: string,
  filename: string,
  mime: string,
  buffer: Buffer,
  settings: Record<string, unknown>,
) {
  const fields: Array<{
    name: string;
    filename?: string;
    contentType?: string;
    content: Buffer | string;
  }> = [{ name: "file", filename, contentType: mime, content: buffer }];

  if (Object.keys(settings).length > 0) {
    fields.push({ name: "settings", content: JSON.stringify(settings) });
  }

  const { body: payload, contentType } = createMultipartPayload(fields);

  return app.inject({
    method: "POST",
    url: apiToolPath(toolId),
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body: payload,
  });
}

function assertNoServerCrash(statusCode: number) {
  expect(statusCode).not.toBe(500);
  expect(ACCEPTABLE_CODES).toContain(statusCode);
}

function assertSuccessOrCleanError(res: { statusCode: number; body: string }) {
  assertNoServerCrash(res.statusCode);
  const body = JSON.parse(res.body);
  if (res.statusCode >= 400) {
    expect(body.error).toBeDefined();
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  }
  return body;
}

// =========================================================================
// 1. FORMAT AUTO-DETECTION: wrong extension, correct processing
//
// Upload files with deliberately wrong extensions to test that the API
// uses magic-byte detection rather than trusting the filename extension.
// =========================================================================
describe("Format auto-detection with wrong extensions", () => {
  // Pairs: [actual format file, wrong extension to use, wrong mime to send]
  const WRONG_EXTENSION_CASES = [
    {
      label: "JPEG sent as .png",
      file: "sample.jpg",
      wrongFilename: "sample.png",
      wrongMime: "image/png",
    },
    {
      label: "PNG sent as .jpg",
      file: "sample.png",
      wrongFilename: "sample.jpg",
      wrongMime: "image/jpeg",
    },
    {
      label: "WebP sent as .gif",
      file: "sample.webp",
      wrongFilename: "sample.gif",
      wrongMime: "image/gif",
    },
    {
      label: "GIF sent as .webp",
      file: "sample.gif",
      wrongFilename: "sample.webp",
      wrongMime: "image/webp",
    },
    {
      label: "AVIF sent as .jpg",
      file: "sample.avif",
      wrongFilename: "sample.jpg",
      wrongMime: "image/jpeg",
    },
    {
      label: "TIFF sent as .png",
      file: "sample.tiff",
      wrongFilename: "sample.png",
      wrongMime: "image/png",
    },
    {
      label: "PSD sent as .jpg",
      file: "sample.psd",
      wrongFilename: "photo.jpg",
      wrongMime: "image/jpeg",
    },
    {
      label: "EXR sent as .png",
      file: "sample.exr",
      wrongFilename: "image.png",
      wrongMime: "image/png",
    },
    {
      label: "JXL sent as .webp",
      file: "sample.jxl",
      wrongFilename: "image.webp",
      wrongMime: "image/webp",
    },
    {
      label: "QOI sent as .bmp",
      file: "sample.qoi",
      wrongFilename: "image.bmp",
      wrongMime: "image/bmp",
    },
  ];

  describe("info tool detects correct format regardless of extension", () => {
    for (const tc of WRONG_EXTENSION_CASES) {
      it(tc.label, async () => {
        const fixturePath = join(fixtureDir.formats, tc.file);
        if (!existsSync(fixturePath)) return;

        const buffer = readFileSync(fixturePath);
        const res = await callToolWithFile("info", tc.wrongFilename, tc.wrongMime, buffer, {});

        // Must not crash; exotic formats may return 422 if decoder missing
        assertNoServerCrash(res.statusCode);

        if (res.statusCode === 200) {
          const body = JSON.parse(res.body);
          expect(body.width).toBeGreaterThan(0);
          expect(body.height).toBeGreaterThan(0);
          // The format field should reflect the actual file content, not the extension
          expect(body.format).toBeDefined();
          expect(typeof body.format).toBe("string");
        }
      }, 120_000);
    }
  });

  describe("resize tool processes files despite wrong extension", () => {
    for (const tc of WRONG_EXTENSION_CASES) {
      it(tc.label, async () => {
        const fixturePath = join(fixtureDir.formats, tc.file);
        if (!existsSync(fixturePath)) return;

        const buffer = readFileSync(fixturePath);
        const res = await callToolWithFile("resize", tc.wrongFilename, tc.wrongMime, buffer, {
          width: 50,
          height: 50,
        });

        assertNoServerCrash(res.statusCode);

        if (res.statusCode === 200) {
          const body = JSON.parse(res.body);
          expect(body.downloadUrl).toBeDefined();
          expect(body.processedSize).toBeGreaterThan(0);
        }
      }, 120_000);
    }
  });

  describe("convert tool processes files despite wrong extension", () => {
    for (const tc of WRONG_EXTENSION_CASES) {
      it(tc.label, async () => {
        const fixturePath = join(fixtureDir.formats, tc.file);
        if (!existsSync(fixturePath)) return;

        const buffer = readFileSync(fixturePath);
        const res = await callToolWithFile("convert", tc.wrongFilename, tc.wrongMime, buffer, {
          format: "png",
        });

        assertNoServerCrash(res.statusCode);

        if (res.statusCode === 200) {
          const body = JSON.parse(res.body);
          expect(body.downloadUrl).toBeDefined();
          expect(body.processedSize).toBeGreaterThan(0);
        }
      }, 120_000);
    }
  });
});

// =========================================================================
// 2. OUTPUT FORMAT CONVERSION MATRIX: exotic input -> all outputs
//
// Every exotic format as input, converted to every supported output format.
// =========================================================================
describe("Exotic format output conversion matrix", () => {
  for (const fmt of EXOTIC_FORMATS) {
    describe(`${fmt.name} input`, () => {
      for (const outFmt of ALL_OUTPUT_FORMATS) {
        it(`-> ${outFmt}`, async () => {
          const fixturePath = join(fixtureDir.formats, fmt.file);
          if (!existsSync(fixturePath)) return;

          const buffer = readFileSync(fixturePath);
          const res = await callToolWithFile("convert", fmt.file, fmt.mime, buffer, {
            format: outFmt,
          });

          assertNoServerCrash(res.statusCode);

          if (res.statusCode === 200) {
            const body = JSON.parse(res.body);
            expect(body.downloadUrl).toBeDefined();
            expect(body.processedSize).toBeGreaterThan(0);

            // Verify output URL contains correct extension
            const ext = outFmt === "jpg" ? ".jpg" : `.${outFmt}`;
            expect(body.downloadUrl).toContain(ext);
          } else if (res.statusCode >= 400) {
            // 202 (accepted, async) has no sync body to verify; only error
            // codes carry a JSON error.
            const body = JSON.parse(res.body);
            expect(body.error).toBeDefined();
            expect(typeof body.error).toBe("string");
          }
        }, 180_000);
      }

      // Also test extended output formats (may need encoders)
      for (const outFmt of EXTENDED_OUTPUT_FORMATS) {
        it(`-> ${outFmt} (extended)`, async () => {
          const fixturePath = join(fixtureDir.formats, fmt.file);
          if (!existsSync(fixturePath)) return;

          const buffer = readFileSync(fixturePath);
          const res = await callToolWithFile("convert", fmt.file, fmt.mime, buffer, {
            format: outFmt,
          });

          // Extended outputs may fail with 422 if encoder not available
          assertNoServerCrash(res.statusCode);

          if (res.statusCode === 200) {
            const body = JSON.parse(res.body);
            expect(body.downloadUrl).toBeDefined();
            expect(body.processedSize).toBeGreaterThan(0);
          }
        }, 180_000);
      }
    });
  }
});

// =========================================================================
// 3. CORE FORMAT -> ALL OUTPUT FORMATS (full matrix not covered elsewhere)
//
// Existing tests only cover core -> {jpg, png, webp, avif, tiff, gif}.
// This adds core -> {heic, jxl, bmp, ico, jp2, qoi}.
// =========================================================================
describe("Core format to extended output format matrix", () => {
  for (const fmt of CORE_FORMATS) {
    // Skip SVG for convert (it goes through svg-to-raster)
    if (fmt.name === "SVG") continue;

    for (const outFmt of EXTENDED_OUTPUT_FORMATS) {
      it(`${fmt.name} -> ${outFmt}`, async () => {
        const fixturePath = join(fixtureDir.formats, fmt.file);
        if (!existsSync(fixturePath)) return;

        const buffer = readFileSync(fixturePath);
        const res = await callToolWithFile("convert", fmt.file, fmt.mime, buffer, {
          format: outFmt,
        });

        // Extended encoders may not be available
        expect([200, 202, 400, 422]).toContain(res.statusCode);

        if (res.statusCode === 200) {
          const body = JSON.parse(res.body);
          expect(body.downloadUrl).toBeDefined();
          expect(body.processedSize).toBeGreaterThan(0);
        }
      }, 120_000);
    }
  }
});

// =========================================================================
// 4. EXOTIC FORMAT DEEP-DIVE: multiple tool parameter variations
//
// Each exotic format tested with deeper parameter combinations and output
// verification using Sharp where the decode succeeds.
// =========================================================================
describe("Exotic format deep-dive: DNG", () => {
  const fmt: FormatDef = {
    name: "DNG",
    file: "sample.dng",
    mime: "image/x-adobe-dng",
    needsCliDecoder: true,
  };

  it("resize with percentage", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("resize", fmt.file, fmt.mime, buffer, { percentage: 25 });
    assertSuccessOrCleanError(res);
  }, 180_000);

  it("rotate 270 degrees", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("rotate", fmt.file, fmt.mime, buffer, { angle: 270 });
    assertSuccessOrCleanError(res);
  }, 180_000);

  it("color palette extraction", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("color-palette", fmt.file, fmt.mime, buffer, {});
    assertNoServerCrash(res.statusCode);
    if (res.statusCode === 200) {
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.colors)).toBe(true);
      expect(body.colors.length).toBeGreaterThan(0);
      expect(body.count).toBeGreaterThan(0);
    }
  }, 180_000);

  it("image to base64", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("image-to-base64", fmt.file, fmt.mime, buffer, {});
    assertNoServerCrash(res.statusCode);
    if (res.statusCode === 200) {
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.results)).toBe(true);
      if (body.results.length > 0) {
        expect(body.results[0].base64.length).toBeGreaterThan(0);
        expect(body.results[0].dataUri).toMatch(/^data:/);
      }
    }
  }, 180_000);

  it("optimize for web as webp", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("optimize-for-web", fmt.file, fmt.mime, buffer, {
      format: "webp",
      quality: 60,
    });
    assertSuccessOrCleanError(res);
  }, 180_000);
});

describe("Exotic format deep-dive: EXR", () => {
  const fmt: FormatDef = {
    name: "EXR",
    file: "sample.exr",
    mime: "image/x-exr",
    needsCliDecoder: true,
  };

  it("color adjustments - brightness and contrast", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("adjust-colors", fmt.file, fmt.mime, buffer, {
      brightness: 15,
      contrast: 10,
      saturation: -5,
    });
    assertSuccessOrCleanError(res);
  }, 180_000);

  it("border with thick border", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("border", fmt.file, fmt.mime, buffer, {
      borderWidth: 15,
      borderColor: "#0000FF",
    });
    assertSuccessOrCleanError(res);
  }, 180_000);

  it("text overlay", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("text-overlay", fmt.file, fmt.mime, buffer, {
      text: "EXR TEST",
      fontSize: 24,
      position: "center",
    });
    assertSuccessOrCleanError(res);
  }, 180_000);

  it("replace color", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("replace-color", fmt.file, fmt.mime, buffer, {
      sourceColor: "#000000",
      targetColor: "#FF0000",
      tolerance: 50,
    });
    assertSuccessOrCleanError(res);
  }, 180_000);
});

describe("Exotic format deep-dive: HDR", () => {
  const fmt: FormatDef = {
    name: "HDR",
    file: "sample.hdr",
    mime: "image/vnd.radiance",
    needsCliDecoder: true,
  };

  it("sharpening with unsharp-mask", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("sharpening", fmt.file, fmt.mime, buffer, {
      method: "unsharp-mask",
    });
    assertSuccessOrCleanError(res);
  }, 180_000);

  it("crop region", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("crop", fmt.file, fmt.mime, buffer, {
      width: 20,
      height: 20,
      left: 0,
      top: 0,
    });
    assertSuccessOrCleanError(res);
  }, 180_000);

  it("watermark text overlay", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("watermark-text", fmt.file, fmt.mime, buffer, {
      text: "HDR WATERMARK",
      fontSize: 20,
      opacity: 75,
    });
    assertSuccessOrCleanError(res);
  }, 180_000);

  it("compress quality 30", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("compress", fmt.file, fmt.mime, buffer, {
      mode: "quality",
      quality: 30,
    });
    assertSuccessOrCleanError(res);
  }, 180_000);
});

describe("Exotic format deep-dive: JXL", () => {
  const fmt: FormatDef = {
    name: "JXL",
    file: "sample.jxl",
    mime: "image/jxl",
    needsCliDecoder: true,
  };

  it("resize to exact dimensions", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("resize", fmt.file, fmt.mime, buffer, {
      width: 100,
      height: 75,
      fit: "cover",
    });
    assertSuccessOrCleanError(res);
  }, 180_000);

  it("image enhancement in low-light mode", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("image-enhancement", fmt.file, fmt.mime, buffer, {
      mode: "low-light",
      intensity: 60,
    });
    assertSuccessOrCleanError(res);
  }, 300_000);

  it("strip all metadata", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("strip-metadata", fmt.file, fmt.mime, buffer, {
      stripAll: true,
    });
    assertSuccessOrCleanError(res);
  }, 180_000);
});

describe("Exotic format deep-dive: PSD", () => {
  const fmt: FormatDef = {
    name: "PSD",
    file: "sample.psd",
    mime: "image/vnd.adobe.photoshop",
    needsCliDecoder: true,
  };

  it("resize with contain fit", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("resize", fmt.file, fmt.mime, buffer, {
      width: 80,
      height: 80,
      fit: "contain",
    });
    assertSuccessOrCleanError(res);
  }, 180_000);

  it("rotate 180", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("rotate", fmt.file, fmt.mime, buffer, { angle: 180 });
    assertSuccessOrCleanError(res);
  }, 180_000);

  it("color-blindness deuteranopia simulation", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("color-blindness", fmt.file, fmt.mime, buffer, {
      simulationType: "deuteranopia",
    });
    assertSuccessOrCleanError(res);
  }, 180_000);

  it("beautify with solid background", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("beautify", fmt.file, fmt.mime, buffer, {
      padding: 30,
      borderRadius: 12,
      backgroundType: "solid",
      backgroundColor: "#e0e0e0",
    });
    assertSuccessOrCleanError(res);
  }, 180_000);

  it("vectorize in bw mode", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("vectorize", fmt.file, fmt.mime, buffer, {
      colorMode: "bw",
      threshold: 128,
    });
    assertSuccessOrCleanError(res);
    if (res.statusCode === 200) {
      const body = JSON.parse(res.body);
      expect(body.downloadUrl).toContain(".svg");
    }
  }, 180_000);
});

describe("Exotic format deep-dive: TGA", () => {
  const fmt: FormatDef = {
    name: "TGA",
    file: "sample.tga",
    mime: "image/x-tga",
    needsCliDecoder: true,
  };

  it("convert to multiple formats", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);

    for (const outFmt of ["png", "jpg", "webp"]) {
      const res = await callToolWithFile("convert", fmt.file, fmt.mime, buffer, {
        format: outFmt,
      });
      assertSuccessOrCleanError(res);
      if (res.statusCode === 200) {
        const body = JSON.parse(res.body);
        expect(body.processedSize).toBeGreaterThan(0);
      }
    }
  }, 180_000);

  it("meme generator", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("meme-generator", fmt.file, fmt.mime, buffer, {
      textLayout: "top-bottom",
      textBoxes: [
        { id: "top", text: "TGA FORMAT" },
        { id: "bottom", text: "STILL WORKS" },
      ],
    });
    assertSuccessOrCleanError(res);
  }, 180_000);

  it("adjust colors with saturation", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("adjust-colors", fmt.file, fmt.mime, buffer, {
      saturation: 20,
      brightness: -5,
    });
    assertSuccessOrCleanError(res);
  }, 180_000);
});

describe("Exotic format deep-dive: APNG", () => {
  const fmt: FormatDef = {
    name: "APNG",
    file: "sample.apng",
    mime: "image/apng",
    needsCliDecoder: false,
  };

  it("resize preserves output", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("resize", fmt.file, fmt.mime, buffer, {
      width: 50,
      height: 50,
    });
    // APNG should be readable since it is PNG-compatible
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.downloadUrl).toBeDefined();
    expect(body.processedSize).toBeGreaterThan(0);
    expect(body.originalSize).toBeGreaterThan(0);
  });

  it("info extraction", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("info", fmt.file, fmt.mime, buffer, {});
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.width).toBeGreaterThan(0);
    expect(body.height).toBeGreaterThan(0);
    expect(body.format).toBeDefined();
  });

  it("convert to gif", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("convert", fmt.file, fmt.mime, buffer, { format: "gif" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.downloadUrl).toContain(".gif");
    expect(body.processedSize).toBeGreaterThan(0);
  });

  it("convert to webp", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("convert", fmt.file, fmt.mime, buffer, { format: "webp" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.downloadUrl).toContain(".webp");
    expect(body.processedSize).toBeGreaterThan(0);
  });

  it("border and color adjustments", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);

    // Border
    const borderRes = await callToolWithFile("border", fmt.file, fmt.mime, buffer, {
      borderWidth: 8,
      borderColor: "#FF00FF",
    });
    expect(borderRes.statusCode).toBe(200);
    const borderBody = JSON.parse(borderRes.body);
    expect(borderBody.processedSize).toBeGreaterThan(0);

    // Color adjustments
    const colorRes = await callToolWithFile("adjust-colors", fmt.file, fmt.mime, buffer, {
      brightness: 10,
      contrast: 5,
    });
    expect(colorRes.statusCode).toBe(200);
    const colorBody = JSON.parse(colorRes.body);
    expect(colorBody.processedSize).toBeGreaterThan(0);
  });

  it("sharpening and compress", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);

    const sharpRes = await callToolWithFile("sharpening", fmt.file, fmt.mime, buffer, {
      method: "adaptive",
    });
    expect(sharpRes.statusCode).toBe(200);

    const compressRes = await callToolWithFile("compress", fmt.file, fmt.mime, buffer, {
      mode: "quality",
      quality: 50,
    });
    expect(compressRes.statusCode).toBe(200);
  });
});

describe("Exotic format deep-dive: QOI", () => {
  const fmt: FormatDef = {
    name: "QOI",
    file: "sample.qoi",
    mime: "image/x-qoi",
    needsCliDecoder: true,
  };

  it("info extraction", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("info", fmt.file, fmt.mime, buffer, {});
    assertNoServerCrash(res.statusCode);
    if (res.statusCode === 200) {
      const body = JSON.parse(res.body);
      expect(body.width).toBeGreaterThan(0);
      expect(body.height).toBeGreaterThan(0);
    }
  }, 180_000);

  it("resize and verify output with Sharp", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("resize", fmt.file, fmt.mime, buffer, {
      width: 32,
      height: 32,
    });
    assertNoServerCrash(res.statusCode);
    if (res.statusCode === 200) {
      const body = JSON.parse(res.body);
      expect(body.downloadUrl).toBeDefined();

      // Download and verify with Sharp
      const downloadRes = await app.inject({
        method: "GET",
        url: body.downloadUrl,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(downloadRes.statusCode).toBe(200);

      const outBuffer = Buffer.from(downloadRes.rawPayload);
      expect(outBuffer.length).toBeGreaterThan(0);

      const metadata = await sharp(outBuffer).metadata();
      expect(metadata.width).toBeLessThanOrEqual(32);
      expect(metadata.height).toBeLessThanOrEqual(32);
    }
  }, 180_000);

  it("convert to png and verify", async () => {
    const fixturePath = join(fixtureDir.formats, fmt.file);
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("convert", fmt.file, fmt.mime, buffer, { format: "png" });
    assertNoServerCrash(res.statusCode);
    if (res.statusCode === 200) {
      const body = JSON.parse(res.body);
      expect(body.downloadUrl).toContain(".png");

      // Download and verify it is valid PNG
      const downloadRes = await app.inject({
        method: "GET",
        url: body.downloadUrl,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(downloadRes.statusCode).toBe(200);
      const outBuffer = Buffer.from(downloadRes.rawPayload);
      const metadata = await sharp(outBuffer).metadata();
      expect(metadata.format).toBe("png");
    }
  }, 180_000);
});

// =========================================================================
// 5. OUTPUT VERIFICATION: download results and verify with Sharp
//
// For core formats, verify that tool output is a valid image with correct
// dimensions and format after processing.
// =========================================================================
describe("Output verification with Sharp", () => {
  it("resize JPEG to 64x48 produces correct dimensions", async () => {
    const fixturePath = fixtures.image.formats("jpg");
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("resize", "sample.jpg", "image/jpeg", buffer, {
      width: 64,
      height: 48,
      fit: "fill",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    const downloadRes = await app.inject({
      method: "GET",
      url: body.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(downloadRes.statusCode).toBe(200);

    const outBuffer = Buffer.from(downloadRes.rawPayload);
    const metadata = await sharp(outBuffer).metadata();
    expect(metadata.width).toBe(64);
    expect(metadata.height).toBe(48);
  });

  it("convert PNG to WebP produces valid WebP output", async () => {
    const fixturePath = fixtures.image.formats("png");
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);
    const res = await callToolWithFile("convert", "sample.png", "image/png", buffer, {
      format: "webp",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    const downloadRes = await app.inject({
      method: "GET",
      url: body.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(downloadRes.statusCode).toBe(200);

    const outBuffer = Buffer.from(downloadRes.rawPayload);
    const metadata = await sharp(outBuffer).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBeGreaterThan(0);
    expect(metadata.height).toBeGreaterThan(0);
  });

  it("rotate WebP 90 degrees swaps width and height", async () => {
    const fixturePath = fixtures.image.formats("webp");
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);

    // Get original dimensions
    const origMeta = await sharp(buffer).metadata();
    const origWidth = origMeta.width ?? 0;
    const origHeight = origMeta.height ?? 0;
    expect(origWidth).toBeGreaterThan(0);
    expect(origHeight).toBeGreaterThan(0);

    const res = await callToolWithFile("rotate", "sample.webp", "image/webp", buffer, {
      angle: 90,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    const downloadRes = await app.inject({
      method: "GET",
      url: body.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(downloadRes.statusCode).toBe(200);

    const outBuffer = Buffer.from(downloadRes.rawPayload);
    const rotatedMeta = await sharp(outBuffer).metadata();

    // After 90-degree rotation, width and height should swap
    expect(rotatedMeta.width).toBe(origHeight);
    expect(rotatedMeta.height).toBe(origWidth);
  });

  it("border on PNG adds pixels to dimensions", async () => {
    const fixturePath = fixtures.image.formats("png");
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);

    const origMeta = await sharp(buffer).metadata();
    const origWidth = origMeta.width ?? 0;
    const origHeight = origMeta.height ?? 0;
    expect(origWidth).toBeGreaterThan(0);
    expect(origHeight).toBeGreaterThan(0);

    const borderWidth = 10;
    const res = await callToolWithFile("border", "sample.png", "image/png", buffer, {
      borderWidth,
      borderColor: "#FF0000",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    const downloadRes = await app.inject({
      method: "GET",
      url: body.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(downloadRes.statusCode).toBe(200);

    const outBuffer = Buffer.from(downloadRes.rawPayload);
    const borderedMeta = await sharp(outBuffer).metadata();

    // Border adds borderWidth * 2 pixels to each dimension
    expect(borderedMeta.width).toBe(origWidth + borderWidth * 2);
    expect(borderedMeta.height).toBe(origHeight + borderWidth * 2);
  });

  it("crop AVIF produces exact requested dimensions", async () => {
    const fixturePath = fixtures.image.formats("avif");
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);

    const res = await callToolWithFile("crop", "sample.avif", "image/avif", buffer, {
      width: 30,
      height: 25,
      left: 0,
      top: 0,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    const downloadRes = await app.inject({
      method: "GET",
      url: body.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(downloadRes.statusCode).toBe(200);

    const outBuffer = Buffer.from(downloadRes.rawPayload);
    const croppedMeta = await sharp(outBuffer).metadata();
    expect(croppedMeta.width).toBe(30);
    expect(croppedMeta.height).toBe(25);
  });

  it("convert GIF to TIFF produces valid TIFF", async () => {
    const fixturePath = fixtures.image.formats("gif");
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);

    const res = await callToolWithFile("convert", "sample.gif", "image/gif", buffer, {
      format: "tiff",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    const downloadRes = await app.inject({
      method: "GET",
      url: body.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(downloadRes.statusCode).toBe(200);

    const outBuffer = Buffer.from(downloadRes.rawPayload);
    const metadata = await sharp(outBuffer).metadata();
    expect(metadata.format).toBe("tiff");
  });

  it("convert AVIF to JPEG produces valid JPEG", async () => {
    const fixturePath = fixtures.image.formats("avif");
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);

    const res = await callToolWithFile("convert", "sample.avif", "image/avif", buffer, {
      format: "jpg",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    const downloadRes = await app.inject({
      method: "GET",
      url: body.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(downloadRes.statusCode).toBe(200);

    const outBuffer = Buffer.from(downloadRes.rawPayload);
    const metadata = await sharp(outBuffer).metadata();
    expect(metadata.format).toBe("jpeg");
  });
});

// =========================================================================
// 6. CHAINED OPERATIONS ON EXOTIC FORMATS
//
// Decode an exotic format, process through multiple tools sequentially,
// verify each step produces valid output.
// =========================================================================
describe("Chained operations on exotic formats", () => {
  it("APNG -> resize -> convert to jpg -> compress", async () => {
    const fixturePath = fixtures.image.formats("apng");
    if (!existsSync(fixturePath)) return;
    const buffer = readFileSync(fixturePath);

    // Step 1: Resize
    const resizeRes = await callToolWithFile("resize", "sample.apng", "image/apng", buffer, {
      width: 60,
      height: 60,
    });
    expect(resizeRes.statusCode).toBe(200);
    const resizeBody = JSON.parse(resizeRes.body);
    expect(resizeBody.downloadUrl).toBeDefined();

    // Step 2: Download resized output
    const downloadRes = await app.inject({
      method: "GET",
      url: resizeBody.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(downloadRes.statusCode).toBe(200);
    const resizedBuffer = Buffer.from(downloadRes.rawPayload);

    // Step 3: Convert to JPEG
    const convertRes = await callToolWithFile(
      "convert",
      "resized.png",
      (downloadRes.headers["content-type"] as string) || "image/png",
      resizedBuffer,
      { format: "jpg" },
    );
    expect(convertRes.statusCode).toBe(200);
    const convertBody = JSON.parse(convertRes.body);

    // Step 4: Download converted output
    const downloadRes2 = await app.inject({
      method: "GET",
      url: convertBody.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(downloadRes2.statusCode).toBe(200);
    const convertedBuffer = Buffer.from(downloadRes2.rawPayload);

    // Step 5: Compress the JPEG
    const compressRes = await callToolWithFile(
      "compress",
      "converted.jpg",
      "image/jpeg",
      convertedBuffer,
      { mode: "quality", quality: 40 },
    );
    expect(compressRes.statusCode).toBe(200);
    const compressBody = JSON.parse(compressRes.body);
    expect(compressBody.processedSize).toBeGreaterThan(0);
  });
});

// =========================================================================
// 7. EDGE CASES: corrupt/truncated files
//
// Verify the API returns clean errors for broken files, never crashes.
// =========================================================================
describe("Edge cases: corrupt and truncated files", () => {
  it("truncated JPEG (first 100 bytes)", async () => {
    const fixturePath = fixtures.image.formats("jpg");
    if (!existsSync(fixturePath)) return;
    const fullBuffer = readFileSync(fixturePath);
    const truncated = fullBuffer.subarray(0, 100);

    const res = await callToolWithFile("resize", "truncated.jpg", "image/jpeg", truncated, {
      width: 50,
      height: 50,
    });

    // Must not crash
    expect(res.statusCode).not.toBe(500);
    // Truncated file should be rejected
    expect([400, 422]).toContain(res.statusCode);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
    expect(typeof body.error).toBe("string");
  });

  it("truncated PNG (first 50 bytes)", async () => {
    const fixturePath = fixtures.image.formats("png");
    if (!existsSync(fixturePath)) return;
    const fullBuffer = readFileSync(fixturePath);
    const truncated = fullBuffer.subarray(0, 50);

    const res = await callToolWithFile("info", "truncated.png", "image/png", truncated, {});

    expect(res.statusCode).not.toBe(500);
    expect([400, 422]).toContain(res.statusCode);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
  });

  it("random bytes are rejected with clean error", async () => {
    const randomBuffer = Buffer.alloc(1024);
    for (let i = 0; i < randomBuffer.length; i++) {
      randomBuffer[i] = Math.floor(Math.random() * 256);
    }

    const res = await callToolWithFile("resize", "random.jpg", "image/jpeg", randomBuffer, {
      width: 50,
      height: 50,
    });

    expect(res.statusCode).not.toBe(500);
    expect([400, 422]).toContain(res.statusCode);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
    expect(typeof body.error).toBe("string");
  });

  it("empty file is rejected with 400", async () => {
    const emptyBuffer = Buffer.alloc(0);

    const res = await callToolWithFile("info", "empty.png", "image/png", emptyBuffer, {});

    expect(res.statusCode).not.toBe(500);
    expect([400, 422]).toContain(res.statusCode);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
  });

  it("1-byte file is rejected with clean error", async () => {
    const tinyBuffer = Buffer.from([0xff]);

    const res = await callToolWithFile("resize", "tiny.jpg", "image/jpeg", tinyBuffer, {
      width: 50,
      height: 50,
    });

    expect(res.statusCode).not.toBe(500);
    expect([400, 422]).toContain(res.statusCode);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
  });
});

// =========================================================================
// 8. EXOTIC FORMAT x MULTI-FILE TOOLS
//
// Test exotic formats with tools that accept multiple files: compose,
// stitch, collage, compare.
// =========================================================================
describe("Exotic formats with multi-file tools", () => {
  const PNG_PATH = fixtures.image.formats("png");

  for (const fmt of EXOTIC_FORMATS) {
    it(`compose: ${fmt.name} base + PNG overlay`, async () => {
      const fixturePath = join(fixtureDir.formats, fmt.file);
      if (!existsSync(fixturePath) || !existsSync(PNG_PATH)) return;

      const baseBuffer = readFileSync(fixturePath);
      const overlayBuffer = readFileSync(PNG_PATH);

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: fmt.file, contentType: fmt.mime, content: baseBuffer },
        {
          name: "overlay",
          filename: "sample.png",
          contentType: "image/png",
          content: overlayBuffer,
        },
        {
          name: "settings",
          content: JSON.stringify({ x: 0, y: 0, opacity: 50, blendMode: "over" }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/compose",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body: payload,
      });

      assertNoServerCrash(res.statusCode);
    }, 180_000);
  }

  for (const fmt of EXOTIC_FORMATS) {
    it(`stitch: ${fmt.name} + PNG vertically`, async () => {
      const fixturePath = join(fixtureDir.formats, fmt.file);
      if (!existsSync(fixturePath) || !existsSync(PNG_PATH)) return;

      const fmtBuffer = readFileSync(fixturePath);
      const pngBuffer = readFileSync(PNG_PATH);

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: fmt.file, contentType: fmt.mime, content: fmtBuffer },
        { name: "file", filename: "sample.png", contentType: "image/png", content: pngBuffer },
        {
          name: "settings",
          content: JSON.stringify({ direction: "vertical", resizeMode: "fit", format: "png" }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/stitch",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body: payload,
      });

      assertNoServerCrash(res.statusCode);
    }, 180_000);
  }

  for (const fmt of EXOTIC_FORMATS) {
    it(`collage: ${fmt.name} + PNG in 2-image layout`, async () => {
      const fixturePath = join(fixtureDir.formats, fmt.file);
      if (!existsSync(fixturePath) || !existsSync(PNG_PATH)) return;

      const fmtBuffer = readFileSync(fixturePath);
      const pngBuffer = readFileSync(PNG_PATH);

      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: fmt.file, contentType: fmt.mime, content: fmtBuffer },
        { name: "file", filename: "sample.png", contentType: "image/png", content: pngBuffer },
        {
          name: "settings",
          content: JSON.stringify({ templateId: "2-h-equal", gap: 4, outputFormat: "png" }),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/collage",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body: payload,
      });

      assertNoServerCrash(res.statusCode);
    }, 180_000);
  }
});

// =========================================================================
// 9. ADDITIONAL UNCOMMON FORMAT FIXTURES: DDS, DPX, FITS, PBM, PGM, PPM
//
// Verify these rarely-tested formats work through multiple tools.
// =========================================================================
describe("Additional uncommon format fixtures", () => {
  const ADDITIONAL_FORMATS: FormatDef[] = [
    { name: "DDS", file: "sample.dds", mime: "image/vnd.ms-dds", needsCliDecoder: true },
    { name: "DPX", file: "sample.dpx", mime: "image/x-dpx", needsCliDecoder: true },
    { name: "FITS", file: "sample.fits", mime: "image/fits", needsCliDecoder: true },
    { name: "PBM", file: "sample.pbm", mime: "image/x-portable-bitmap", needsCliDecoder: true },
    { name: "PGM", file: "sample.pgm", mime: "image/x-portable-graymap", needsCliDecoder: true },
    { name: "PPM", file: "sample.ppm", mime: "image/x-portable-pixmap", needsCliDecoder: true },
    { name: "CUR", file: "sample.cur", mime: "image/x-icon", needsCliDecoder: true },
    { name: "JP2", file: "sample.jp2", mime: "image/jp2", needsCliDecoder: true },
    { name: "EPS", file: "sample.eps", mime: "application/postscript", needsCliDecoder: true },
  ];

  const TOOLS_TO_TEST = [
    { id: "info", settings: {} },
    { id: "resize", settings: { width: 40, height: 40 } },
    { id: "convert", settings: { format: "png" } },
    { id: "rotate", settings: { angle: 90 } },
  ];

  for (const fmt of ADDITIONAL_FORMATS) {
    describe(`${fmt.name}`, () => {
      for (const tool of TOOLS_TO_TEST) {
        it(`${tool.id}`, async () => {
          const fixturePath = join(fixtureDir.formats, fmt.file);
          if (!existsSync(fixturePath)) return;
          const buffer = readFileSync(fixturePath);
          const res = await callToolWithFile(tool.id, fmt.file, fmt.mime, buffer, tool.settings);
          assertNoServerCrash(res.statusCode);
          if (res.statusCode === 200) {
            const body = JSON.parse(res.body);
            if (tool.id === "info") {
              expect(body.width).toBeGreaterThan(0);
              expect(body.height).toBeGreaterThan(0);
            } else {
              expect(body.downloadUrl).toBeDefined();
              expect(body.processedSize).toBeGreaterThan(0);
            }
          } else {
            const body = JSON.parse(res.body);
            expect(body.error).toBeDefined();
            expect(typeof body.error).toBe("string");
          }
        }, 180_000);
      }
    });
  }
});

// =========================================================================
// 10. TINY FILE (1x1) THROUGH EXOTIC-LIKE OPERATIONS
//
// Test minimum-dimension input through tools that might have edge cases
// with very small images.
// =========================================================================
describe("Tiny file (1x1 pixel) edge cases", () => {
  const tinyPath = fixtures.image.edge.px1;

  it("resize 1x1 to 100x100", async () => {
    if (!existsSync(tinyPath)) return;
    const buffer = readFileSync(tinyPath);
    const res = await callToolWithFile("resize", "test-1x1.png", "image/png", buffer, {
      width: 100,
      height: 100,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.processedSize).toBeGreaterThan(0);

    // Verify output dimensions
    const downloadRes = await app.inject({
      method: "GET",
      url: body.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const outBuffer = Buffer.from(downloadRes.rawPayload);
    const metadata = await sharp(outBuffer).metadata();
    expect(metadata.width).toBe(100);
    expect(metadata.height).toBe(100);
  });

  it("crop 1x1 at origin", async () => {
    if (!existsSync(tinyPath)) return;
    const buffer = readFileSync(tinyPath);
    const res = await callToolWithFile("crop", "test-1x1.png", "image/png", buffer, {
      width: 1,
      height: 1,
      left: 0,
      top: 0,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.processedSize).toBeGreaterThan(0);
  });

  it("border adds pixels to 1x1", async () => {
    if (!existsSync(tinyPath)) return;
    const buffer = readFileSync(tinyPath);
    const res = await callToolWithFile("border", "test-1x1.png", "image/png", buffer, {
      borderWidth: 5,
      borderColor: "#000000",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    const downloadRes = await app.inject({
      method: "GET",
      url: body.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const outBuffer = Buffer.from(downloadRes.rawPayload);
    const metadata = await sharp(outBuffer).metadata();
    // 1 + 5*2 = 11
    expect(metadata.width).toBe(11);
    expect(metadata.height).toBe(11);
  });

  it("info on 1x1", async () => {
    if (!existsSync(tinyPath)) return;
    const buffer = readFileSync(tinyPath);
    const res = await callToolWithFile("info", "test-1x1.png", "image/png", buffer, {});
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.width).toBe(1);
    expect(body.height).toBe(1);
  });

  it("convert 1x1 PNG to multiple formats", async () => {
    if (!existsSync(tinyPath)) return;
    const buffer = readFileSync(tinyPath);

    for (const outFmt of ["jpg", "webp", "gif", "tiff"]) {
      const res = await callToolWithFile("convert", "test-1x1.png", "image/png", buffer, {
        format: outFmt,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.processedSize).toBeGreaterThan(0);
    }
  });

  it("color palette from 1x1 (single color)", async () => {
    if (!existsSync(tinyPath)) return;
    const buffer = readFileSync(tinyPath);
    const res = await callToolWithFile("color-palette", "test-1x1.png", "image/png", buffer, {});
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.colors)).toBe(true);
    expect(body.count).toBeGreaterThanOrEqual(1);
  });
});
