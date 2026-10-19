/**
 * Generated matrix for issue #949: every Sharp-backed image tool must classify
 * an upload that passes header-only intake (`sharp().metadata()`) but fails its
 * first full pixel decode (`tests/fixtures/image/hostile/truncated.jpg`) as an
 * authored input rejection (`UNDECODABLE_IMAGE_MESSAGE`) rather than a generic
 * processing failure or 500.
 */
import { apiToolPath, COMPRESS_PRESETS, CONVERSION_PRESETS, TOOLS } from "@snapotter/shared";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UNDECODABLE_IMAGE_MESSAGE } from "../../../../apps/api/src/lib/image-error.js";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import { defaultSettingsFor } from "../../../helpers/tool-default-settings.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const TRUNCATED_JPG = readFixture(fixtures.image.hostile.truncated);
const VALID_PNG = readFixture(fixtures.image.base.png200);

const FACTORY_SINGLE_IMAGE_TOOLS = [
  "resize",
  "compress",
  "crop",
  "rotate",
  "adjust-colors",
  "sharpening",
  "color-blindness",
  "optimize-for-web",
  "pixelate",
  "replace-color",
  "circle-crop",
  "rounded-crop",
  "border",
  "duotone",
  "image-pad",
  "vignette",
  "text-overlay",
  "watermark-text",
  "lqip-placeholder",
  "histogram",
  "convert",
  "gif-tools",
  "image-enhancement",
  "strip-metadata",
] as const;

// Non-preset image tools in TOOLS that are NOT in FACTORY_SINGLE_IMAGE_TOOLS:
// multi-input tools, custom HTTP routes, AI async routes, or metadata/generator tools.
const EXEMPT_IMAGE_TOOLS = new Set([
  // Tested in dedicated multi-input or custom-route blocks below
  "gif-webp",
  "sprite-sheet",
  "collage",
  "meme-generator",
  "beautify",
  "vectorize",
  "split",
  "content-aware-resize",
  // Input-agnostic / metadata-only / generator / custom-contract routes
  "edit-metadata",
  "bulk-rename",
  "image-to-pdf",
  "favicon",
  "watermark-image",
  "compose",
  "info",
  "compare",
  "find-duplicates",
  "color-palette",
  "qr-generate",
  "html-to-image",
  "barcode-read",
  "image-to-base64",
  "barcode-generate",
  "stitch",
  "svg-to-raster",
  // AI bundle-gated routes (tested at worker/registry level in image-error.test.ts)
  "smart-crop",
  "remove-background",
  "remove-gif-background",
  "upscale",
  "erase-object",
  "ocr",
  "blur-faces",
  "enhance-faces",
  "colorize",
  "noise-removal",
  "red-eye-removal",
  "restore-photo",
  "passport-photo",
  "ai-canvas-expand",
  "transparency-fixer",
  "background-replace",
  "blur-background",
]);

describe("Undecodable image input matrix (#949)", () => {
  let testApp: TestApp;
  let adminToken: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
    adminToken = await loginAsAdmin(testApp.app);
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  }, 10_000);

  it("covers every non-preset image tool in TOOLS (no silent drift)", () => {
    const presetIds = new Set<string>([
      ...CONVERSION_PRESETS.map((p: { id: string }) => p.id),
      ...COMPRESS_PRESETS.map((p: { id: string }) => p.id),
    ]);
    const covered = new Set<string>([...FACTORY_SINGLE_IMAGE_TOOLS, ...EXEMPT_IMAGE_TOOLS]);
    const missing = TOOLS.filter(
      (t: { id: string; modality: string }) =>
        t.modality === "image" && !presetIds.has(t.id) && !covered.has(t.id),
    ).map((t: { id: string }) => t.id);
    expect(missing, `unaccounted image tools in TOOLS: ${missing.join(", ")}`).toEqual([]);
  });

  it.each(FACTORY_SINGLE_IMAGE_TOOLS)(
    "%s rejects truncated.jpg with 400 UNDECODABLE_IMAGE_MESSAGE",
    async (toolId) => {
      const settings = defaultSettingsFor(toolId);
      const { body, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "truncated.jpg",
          contentType: "image/jpeg",
          content: TRUNCATED_JPG,
        },
        { name: "settings", content: JSON.stringify(settings) },
      ]);
      const res = await testApp.app.inject({
        method: "POST",
        url: apiToolPath(toolId),
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect(res.statusCode, `${toolId}: ${res.body}`).toBe(400);
      expect(res.json().error).toBe(UNDECODABLE_IMAGE_MESSAGE);
    },
  );

  it("gif-webp rejects a multi-frame GIF with corrupt frame data with 400 UNDECODABLE_IMAGE_MESSAGE", async () => {
    const raw1 = Buffer.alloc(32 * 32 * 3, 100);
    const raw2 = Buffer.alloc(32 * 32 * 3);
    for (let i = 0; i < raw2.length; i++) raw2[i] = (i * 37) % 256;
    const f1 = await sharp(raw1, { raw: { width: 32, height: 32, channels: 3 } })
      .png()
      .toBuffer();
    const f2 = await sharp(raw2, { raw: { width: 32, height: 32, channels: 3 } })
      .png()
      .toBuffer();
    const gif = await sharp([f1, f2], { join: { across: 1, animated: true } })
      .gif({ delay: [100, 100] })
      .toBuffer();
    const corruptGif = Buffer.from(gif);
    for (let i = corruptGif.length - 100; i < corruptGif.length - 2; i++) corruptGif[i] = 0xff;

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "corrupt.gif", contentType: "image/gif", content: corruptGif },
      { name: "settings", content: "{}" },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: apiToolPath("gif-webp"),
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode, res.body).toBe(400);
    expect(res.json().error).toBe(UNDECODABLE_IMAGE_MESSAGE);
  });

  it("sprite-sheet rejects when the second uploaded image is truncated.jpg", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file1", filename: "valid.png", contentType: "image/png", content: VALID_PNG },
      {
        name: "file2",
        filename: "truncated.jpg",
        contentType: "image/jpeg",
        content: TRUNCATED_JPG,
      },
      { name: "settings", content: "{}" },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: apiToolPath("sprite-sheet"),
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode, res.body).toBe(400);
    expect(res.json().error).toBe(UNDECODABLE_IMAGE_MESSAGE);
  });

  it("collage rejects when a cell image is truncated.jpg with 422 UNDECODABLE_IMAGE_MESSAGE (not 500)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "f1", filename: "valid.png", contentType: "image/png", content: VALID_PNG },
      {
        name: "f2",
        filename: "truncated.jpg",
        contentType: "image/jpeg",
        content: TRUNCATED_JPG,
      },
      { name: "settings", content: JSON.stringify({ templateId: "2-h-equal" }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: apiToolPath("collage"),
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode, res.body).toBe(422);
    expect(res.json()).toEqual({
      error: "Collage creation failed",
      details: UNDECODABLE_IMAGE_MESSAGE,
    });
  });

  it.each([
    {
      toolId: "meme-generator",
      settings: { textBoxes: [{ id: "top", text: "HI" }] },
    },
    { toolId: "beautify", settings: {} },
    { toolId: "vectorize", settings: {} },
    { toolId: "split", settings: { columns: 2, rows: 2 } },
    { toolId: "content-aware-resize", settings: { width: 50 } },
  ])(
    "custom route $toolId surfaces UNDECODABLE_IMAGE_MESSAGE in 422 details",
    async ({ toolId, settings }) => {
      const { body, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "truncated.jpg",
          contentType: "image/jpeg",
          content: TRUNCATED_JPG,
        },
        { name: "settings", content: JSON.stringify(settings) },
      ]);
      const res = await testApp.app.inject({
        method: "POST",
        url: apiToolPath(toolId),
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect(res.statusCode, `${toolId}: ${res.body}`).toBe(422);
      expect(res.json().details).toBe(UNDECODABLE_IMAGE_MESSAGE);
    },
  );
});
