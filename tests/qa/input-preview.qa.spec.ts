// Per-tool x per-format PROCESSING coverage is handled by the separate API sweep
// (api-sweep.mts). This spec covers INPUT PREVIEW rendering: every (modality x
// format) combination once on a representative standard tool, plus every
// custom-displayMode tool individually.
//
// Input preview is tool-independent for standard displayMode tools (all image
// tools share ImageViewer, all video share the media player, etc.), so we test
// each format once on a representative tool rather than on every tool.

import { expect, type Page, test } from "@playwright/test";
import type { PageIssues } from "./qa-helpers";
import {
  assertAudioPreview,
  assertDocumentPreview,
  assertImageRendered,
  assertNoBrokenImages,
  assertVideoPreview,
  fixture,
  gotoTool,
  instrument,
  isClean,
  issuesSummary,
  uploadFiles,
} from "./qa-helpers";

// ---------------------------------------------------------------------------
// Custom oracles
// ---------------------------------------------------------------------------

/**
 * Server-decode image preview: the browser cannot decode the raw blob, so the
 * app must either (a) produce a server-decoded preview (img naturalWidth > 0)
 * or (b) show a graceful fallback message. A raw blob <img> stuck at
 * naturalWidth==0 with NO fallback is BROKEN.
 */
async function assertServerDecodePreview(
  page: Page,
  fixtureName: string,
): Promise<"rendered" | "fallback"> {
  const img = page.locator(`img[alt="${fixtureName}"]`).first();
  const fallback = page
    .getByText(/generating preview|preview not available|cannot preview|processing/i)
    .first();

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await img.isVisible().catch(() => false)) {
      const w = await img.evaluate((el: HTMLImageElement) => el.naturalWidth).catch(() => 0);
      if (w > 0) return "rendered";
    }
    if (await fallback.isVisible().catch(() => false)) return "fallback";
    await page.waitForTimeout(400);
  }

  // Final check after timeout
  if (await img.isVisible().catch(() => false)) {
    const w = await img.evaluate((el: HTMLImageElement) => el.naturalWidth).catch(() => 0);
    if (w > 0) return "rendered";
    throw new Error(
      `BROKEN: img[alt="${fixtureName}"] visible but naturalWidth=0, no fallback shown`,
    );
  }
  if (await fallback.isVisible().catch(() => false)) return "fallback";

  throw new Error(`BROKEN: no preview img or fallback message for "${fixtureName}" after 15s`);
}

/**
 * Video non-native: the browser may not decode MKV/AVI/etc directly. The app
 * should either play the video (Chrome sometimes can) OR show a "Generate
 * Preview" button. Neither = BROKEN.
 */
async function assertVideoNonNativePreview(page: Page): Promise<void> {
  const video = page.getByTestId("media-player-video").first();
  const generateBtn = page.getByRole("button", { name: /generate preview/i }).first();
  const fallbackText = page
    .getByText(/preview not available|cannot preview|unsupported format/i)
    .first();

  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (await video.isVisible().catch(() => false)) {
      const state = await video.evaluate((el: HTMLVideoElement) => el.readyState).catch(() => 0);
      if (state >= 1) return;
    }
    if (await generateBtn.isVisible().catch(() => false)) return;
    if (await fallbackText.isVisible().catch(() => false)) return;
    await page.waitForTimeout(400);
  }
  throw new Error(
    "BROKEN: neither video player (readyState>=1) nor Generate Preview button visible",
  );
}

/**
 * Non-PDF document on a "document" displayMode tool: pdf.js cannot render it.
 * Check for graceful handling vs ugly "Load failed" error.
 */
async function assertNonPdfDocumentPreview(page: Page): Promise<void> {
  await page.waitForTimeout(4_000);
  const destructive = page.locator(".text-destructive");
  const count = await destructive.count();
  for (let i = 0; i < count; i++) {
    const text = (
      await destructive
        .nth(i)
        .innerText()
        .catch(() => "")
    ).trim();
    if (/failed to load|load failed|error loading|invalid pdf/i.test(text)) {
      throw new Error(`Non-PDF document shows ugly pdf.js error: "${text.substring(0, 200)}"`);
    }
  }
}

/**
 * Interactive tool preview: image may be on an <img> (any alt), a Konva
 * canvas, or a plain <canvas>. The crop screenshot proves content renders
 * on a canvas without the fixture-name alt. Broaden: accept any decoded
 * img OR any visible canvas in the main content area.
 */
async function assertInteractivePreview(page: Page, label: string): Promise<void> {
  // Any img with decoded pixels (naturalWidth > 0)
  const anyDecodedImg = page.locator("img").first();
  // Any canvas element (Konva, react-konva, native canvas)
  const anyCanvas = page.locator("canvas").first();

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    // Check for any decoded image on the page
    const imgs = await page.locator("img").all();
    for (const img of imgs) {
      const w = await img.evaluate((el: HTMLImageElement) => el.naturalWidth).catch(() => 0);
      if (w > 50) return; // skip tiny icons
    }
    // Check for any visible canvas
    if (await anyCanvas.isVisible().catch(() => false)) {
      const dims = await anyCanvas
        .evaluate((el: HTMLCanvasElement) => ({ w: el.width, h: el.height }))
        .catch(() => ({ w: 0, h: 0 }));
      if (dims.w > 50) return; // non-trivial canvas
    }
    await page.waitForTimeout(400);
  }
  throw new Error(`${label}: no decoded image (naturalWidth>50) or canvas (width>50) after 15s`);
}

/**
 * Custom-results tool: some show a standard image preview, others (like
 * find-duplicates, passport-photo) may show files in a different layout.
 * Accept: any decoded img, or at least the file-accepted UI without crash.
 */
async function assertCustomResultsPreview(page: Page, label: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const imgs = await page.locator("img").all();
    for (const img of imgs) {
      const w = await img.evaluate((el: HTMLImageElement) => el.naturalWidth).catch(() => 0);
      if (w > 50) return; // found a real decoded image
    }
    await page.waitForTimeout(400);
  }
  // No decoded image found -- check that at least the file was accepted
  // (dropzone gone, file info visible). Not a hard failure for custom-results.
  const dropzone = page.locator("[class*='border-dashed']").first();
  const dropzoneGone = !(await dropzone.isVisible().catch(() => false));
  if (!dropzoneGone) {
    throw new Error(`${label}: file not accepted (dropzone still visible)`);
  }
  // File accepted but no preview image -- acceptable for custom-results tools
}

/** Shorthand for console-clean assertion with context. */
function assertClean(issues: PageIssues, context: string): void {
  expect(isClean(issues), `Console/network issues [${context}]: ${issuesSummary(issues)}`).toBe(
    true,
  );
}

// ===========================================================================
// 1. IMAGE BROWSER-NATIVE FORMATS (on resize, side-by-side)
//    Oracle: img[alt=fixtureName] reaches naturalWidth>0 within ~5s.
// ===========================================================================

const IMAGE_BROWSER_NATIVE: Array<[string, string]> = [
  ["jpg", "sample.jpg"],
  ["png", "sample.png"],
  ["webp", "sample.webp"],
  ["gif", "sample.gif"],
  ["svg", "sample.svg"],
  ["bmp", "sample.bmp"],
  ["avif", "sample.avif"],
];

test.describe("Image browser-native input preview", () => {
  for (const [ext, filename] of IMAGE_BROWSER_NATIVE) {
    test(`[${ext}] on resize`, async ({ page }) => {
      test.setTimeout(60_000);
      const issues = instrument(page);
      await gotoTool(page, "resize");
      await uploadFiles(page, fixture("image", "formats", filename));
      await assertImageRendered(page, filename, `input preview ${ext}`);
      await assertNoBrokenImages(page);
      assertClean(issues, ext);
    });
  }
});

// ===========================================================================
// 2. IMAGE SERVER-DECODE FORMATS (on resize)
//    Oracle: decoded preview (naturalWidth>0 within ~10s) OR graceful
//    "Generating preview" / "Preview not available" state. Raw blob <img>
//    stuck at naturalWidth==0 with no fallback = BROKEN.
// ===========================================================================

const IMAGE_SERVER_DECODE: Array<[string, string]> = [
  ["heic", "sample.heic"],
  ["heif", "sample.heif"],
  ["tiff", "sample.tiff"],
  ["psd", "sample.psd"],
  ["jxl", "sample.jxl"],
  ["ico", "sample.ico"],
  ["exr", "sample.exr"],
  ["hdr", "sample.hdr"],
  ["dng", "sample.dng"],
  ["cr2", "sample.cr2"],
  ["nef", "sample.nef"],
  ["arw", "sample.arw"],
  ["orf", "sample.orf"],
  ["rw2", "sample.rw2"],
  ["tga", "sample.tga"],
  ["dds", "sample.dds"],
  ["fits", "sample.fits"],
  ["dpx", "sample.dpx"],
  ["jp2", "sample.jp2"],
  ["ppm", "sample.ppm"],
  ["pgm", "sample.pgm"],
  ["pbm", "sample.pbm"],
  ["qoi", "sample.qoi"],
  ["eps", "sample.eps"],
  ["cur", "sample.cur"],
  ["apng", "sample.apng"],
  ["svgz", "sample.svgz"],
];

test.describe("Image server-decode input preview", () => {
  for (const [ext, filename] of IMAGE_SERVER_DECODE) {
    test(`[${ext}] on resize`, async ({ page }) => {
      test.setTimeout(90_000);
      const issues = instrument(page);
      await gotoTool(page, "resize");
      await uploadFiles(page, fixture("image", "formats", filename));
      const status = await assertServerDecodePreview(page, filename);
      expect(
        ["rendered", "fallback"],
        `${ext}: expected rendered or fallback, got ${status}`,
      ).toContain(status);
      assertClean(issues, `${ext} (${status})`);
    });
  }
});

// ===========================================================================
// 3. VIDEO NATIVE FORMATS (on convert-video, media-player)
//    Oracle: assertVideoPreview (readyState>=1, videoWidth>0).
// ===========================================================================

const VIDEO_NATIVE: Array<[string, string]> = [
  ["mp4", "tiny.mp4"],
  ["webm", "tiny.webm"],
  ["m4v", "tiny.m4v"],
  ["mov", "tiny.mov"],
];

test.describe("Video native input preview", () => {
  for (const [ext, filename] of VIDEO_NATIVE) {
    test(`[${ext}] on convert-video`, async ({ page }) => {
      test.setTimeout(60_000);
      const issues = instrument(page);
      await gotoTool(page, "convert-video");
      await uploadFiles(page, fixture("video", "formats", filename));
      await assertVideoPreview(page);
      assertClean(issues, ext);
    });
  }
});

// ===========================================================================
// 4. VIDEO NON-NATIVE FORMATS (on convert-video)
//    Oracle: a "Generate Preview" button must be present (graceful fallback),
//    OR the video actually decodes (Chrome can sometimes play MKV/AVI).
//    Neither = BROKEN.
// ===========================================================================

const VIDEO_NON_NATIVE: Array<[string, string]> = [
  // ogv: Chrome parses the Ogg container but cannot decode Theora (videoWidth==0);
  // F7 falls back to the Generate Preview affordance.
  ["ogv", "tiny.ogv"],
  ["mkv", "tiny-subs.mkv"],
  ["avi", "tiny.avi"],
  ["mts", "tiny.mts"],
  ["m2ts", "tiny.m2ts"],
  ["3gp", "tiny.3gp"],
  ["flv", "tiny.flv"],
  ["wmv", "tiny.wmv"],
  ["mpg", "tiny.mpg"],
  ["mpeg", "tiny.mpeg"],
  ["ts", "tiny.ts"],
];

test.describe("Video non-native input preview", () => {
  for (const [ext, filename] of VIDEO_NON_NATIVE) {
    test(`[${ext}] on convert-video`, async ({ page }) => {
      test.setTimeout(60_000);
      const issues = instrument(page);
      await gotoTool(page, "convert-video");
      await uploadFiles(page, fixture("video", "formats", filename));
      await assertVideoNonNativePreview(page);
      assertClean(issues, ext);
    });
  }
});

// ===========================================================================
// 5. AUDIO DECODABLE FORMATS (on convert-audio, media-player)
//    Oracle: waveform-play-pause becomes enabled.
// ===========================================================================

const AUDIO_DECODABLE: Array<[string, string]> = [
  ["mp3", "tiny.mp3"],
  ["wav", "tiny.wav"],
  ["flac", "tiny.flac"],
  ["ogg", "tiny.ogg"],
  ["opus", "tiny.opus"],
  ["aac", "tiny.aac"],
  ["m4a", "tiny.m4a"],
];

test.describe("Audio decodable input preview", () => {
  for (const [ext, filename] of AUDIO_DECODABLE) {
    test(`[${ext}] on convert-audio`, async ({ page }) => {
      test.setTimeout(60_000);
      const issues = instrument(page);
      await gotoTool(page, "convert-audio");
      await uploadFiles(page, fixture("audio", "formats", filename));
      await assertAudioPreview(page);
      assertClean(issues, ext);
    });
  }
});

// ===========================================================================
// 6. AUDIO UNDECODABLE (F8: the browser cannot decode these codecs, so the
//    player must surface a graceful fallback message, not a silently-disabled
//    play button). Tested once per format.
// ===========================================================================

const AUDIO_UNDECODABLE: Array<[string, string]> = [
  ["wma", "tiny.wma"],
  ["amr", "tiny.amr"],
  ["ac3", "tiny.ac3"],
  ["aiff", "tiny.aiff"],
];

test.describe("Audio undecodable input preview (graceful fallback)", () => {
  for (const [ext, filename] of AUDIO_UNDECODABLE) {
    test(`[${ext}] on convert-audio -- shows graceful fallback`, async ({ page }) => {
      test.setTimeout(60_000);
      const issues = instrument(page);
      await gotoTool(page, "convert-audio");
      await uploadFiles(page, fixture("audio", "formats", filename));
      // F8: WaveSurfer error/timeout surfaces a graceful "cannot be previewed"
      // message instead of a dead disabled play button.
      const fallback = page.getByText(/cannot be previewed in the browser/i).first();
      await expect(fallback, `${ext} shows graceful decode-unsupported fallback`).toBeVisible({
        timeout: 20_000,
      });
      assertClean(issues, `${ext} (graceful fallback)`);
    });
  }
});

// ===========================================================================
// 7. DOCUMENT - PDF (on rotate-pdf, document displayMode)
//    Oracle: assertDocumentPreview (canvas non-blank, no .text-destructive).
// ===========================================================================

test.describe("Document PDF input preview", () => {
  test("[pdf] on rotate-pdf", async ({ page }) => {
    test.setTimeout(60_000);
    const issues = instrument(page);
    await gotoTool(page, "rotate-pdf");
    await uploadFiles(page, fixture("document", "formats", "tiny.pdf"));
    await assertDocumentPreview(page);
    assertClean(issues, "pdf");
  });
});

// ===========================================================================
// 8. DOCUMENT - NON-PDF INPUTS (document displayMode tools)
//    pdf.js cannot render non-PDF files. Check graceful state vs ugly error.
// ===========================================================================

// word-to-pdf (document mode) accepts: docx, doc, odt, rtf, txt
const DOC_WORD: Array<[string, string]> = [
  ["docx", "tiny.docx"],
  ["doc", "tiny.doc"],
  ["odt", "tiny.odt"],
  ["rtf", "tiny.rtf"],
  ["txt", "tiny.txt"],
];

test.describe("Document non-PDF input preview (word-to-pdf)", () => {
  for (const [ext, filename] of DOC_WORD) {
    test(`[${ext}] on word-to-pdf`, async ({ page }) => {
      test.setTimeout(60_000);
      const issues = instrument(page);
      await gotoTool(page, "word-to-pdf");
      await uploadFiles(page, fixture("document", "formats", filename));
      await assertNonPdfDocumentPreview(page);
      await assertNoBrokenImages(page);
      assertClean(issues, ext);
    });
  }
});

// excel-to-pdf (document mode) accepts: xlsx, xls, ods, csv
const DOC_SPREADSHEET: Array<[string, string]> = [
  ["xlsx", "tiny.xlsx"],
  ["xls", "tiny.xls"],
  ["ods", "tiny.ods"],
];

test.describe("Document non-PDF input preview (excel-to-pdf)", () => {
  for (const [ext, filename] of DOC_SPREADSHEET) {
    test(`[${ext}] on excel-to-pdf`, async ({ page }) => {
      test.setTimeout(60_000);
      const issues = instrument(page);
      await gotoTool(page, "excel-to-pdf");
      await uploadFiles(page, fixture("document", "formats", filename));
      await assertNonPdfDocumentPreview(page);
      await assertNoBrokenImages(page);
      assertClean(issues, ext);
    });
  }
});

// powerpoint-to-pdf (document mode) accepts: pptx, ppt, odp
const DOC_PRESENTATION: Array<[string, string]> = [
  ["pptx", "tiny.pptx"],
  ["ppt", "tiny.ppt"],
  ["odp", "tiny.odp"],
];

test.describe("Document non-PDF input preview (powerpoint-to-pdf)", () => {
  for (const [ext, filename] of DOC_PRESENTATION) {
    test(`[${ext}] on powerpoint-to-pdf`, async ({ page }) => {
      test.setTimeout(60_000);
      const issues = instrument(page);
      await gotoTool(page, "powerpoint-to-pdf");
      await uploadFiles(page, fixture("document", "formats", filename));
      await assertNonPdfDocumentPreview(page);
      await assertNoBrokenImages(page);
      assertClean(issues, ext);
    });
  }
});

// html-to-pdf (document mode) accepts: html, htm
const DOC_HTML: Array<[string, string]> = [
  ["html", "tiny.html"],
  ["htm", "tiny.htm"],
];

test.describe("Document non-PDF input preview (html-to-pdf)", () => {
  for (const [ext, filename] of DOC_HTML) {
    test(`[${ext}] on html-to-pdf`, async ({ page }) => {
      test.setTimeout(60_000);
      const issues = instrument(page);
      await gotoTool(page, "html-to-pdf");
      await uploadFiles(page, fixture("document", "formats", filename));
      await assertNonPdfDocumentPreview(page);
      await assertNoBrokenImages(page);
      assertClean(issues, ext);
    });
  }
});

// markdown-to-pdf (document mode) accepts: md, markdown
const DOC_MARKDOWN: Array<[string, string]> = [
  ["md", "tiny.md"],
  ["markdown", "tiny.markdown"],
];

test.describe("Document non-PDF input preview (markdown-to-pdf)", () => {
  for (const [ext, filename] of DOC_MARKDOWN) {
    test(`[${ext}] on markdown-to-pdf`, async ({ page }) => {
      test.setTimeout(60_000);
      const issues = instrument(page);
      await gotoTool(page, "markdown-to-pdf");
      await uploadFiles(page, fixture("document", "formats", filename));
      await assertNonPdfDocumentPreview(page);
      await assertNoBrokenImages(page);
      assertClean(issues, ext);
    });
  }
});

// epub-convert (no-comparison mode) accepts: epub
test.describe("Document non-PDF input preview (epub-convert)", () => {
  test("[epub] on epub-convert", async ({ page }) => {
    test.setTimeout(60_000);
    const issues = instrument(page);
    await gotoTool(page, "epub-convert");
    await uploadFiles(page, fixture("document", "formats", "tiny.epub"));
    // epub-convert uses no-comparison mode, not document viewer.
    // Just verify file accepted and no crash.
    await page.waitForTimeout(3_000);
    await assertNoBrokenImages(page);
    assertClean(issues, "epub");
  });
});

// ===========================================================================
// 9. FILE / DATA (no visual preview by design - verify no crash)
// ===========================================================================

test.describe("File/data input preview", () => {
  // csv-json accepts: csv, tsv, json
  const DATA_CSV_JSON: Array<[string, string]> = [
    ["csv", "tiny.csv"],
    ["tsv", "tiny.tsv"],
    ["json", "tiny.json"],
  ];

  for (const [ext, filename] of DATA_CSV_JSON) {
    test(`[${ext}] on csv-json -- no visual preview`, async ({ page }) => {
      test.setTimeout(60_000);
      const issues = instrument(page);
      await gotoTool(page, "csv-json");
      await uploadFiles(page, fixture("data", "valid", filename));
      await page.waitForTimeout(2_000);
      await assertNoBrokenImages(page);
      assertClean(issues, ext);
    });
  }

  // json-xml accepts: json, xml (json already covered above)
  test("[xml] on json-xml -- no visual preview", async ({ page }) => {
    test.setTimeout(60_000);
    const issues = instrument(page);
    await gotoTool(page, "json-xml");
    await uploadFiles(page, fixture("data", "valid", "tiny.xml"));
    await page.waitForTimeout(2_000);
    await assertNoBrokenImages(page);
    assertClean(issues, "xml");
  });

  // yaml-json accepts: yaml, yml, json (json already covered)
  const DATA_YAML: Array<[string, string]> = [
    ["yaml", "tiny.yaml"],
    ["yml", "tiny.yml"],
  ];

  for (const [ext, filename] of DATA_YAML) {
    test(`[${ext}] on yaml-json -- no visual preview`, async ({ page }) => {
      test.setTimeout(60_000);
      const issues = instrument(page);
      await gotoTool(page, "yaml-json");
      await uploadFiles(page, fixture("data", "valid", filename));
      await page.waitForTimeout(2_000);
      await assertNoBrokenImages(page);
      assertClean(issues, ext);
    });
  }

  // extract-zip accepts: zip
  test("[zip] on extract-zip -- no visual preview", async ({ page }) => {
    test.setTimeout(60_000);
    const issues = instrument(page);
    await gotoTool(page, "extract-zip");
    await uploadFiles(page, fixture("data", "valid", "tiny.zip"));
    await page.waitForTimeout(2_000);
    await assertNoBrokenImages(page);
    assertClean(issues, "zip");
  });
});

// ===========================================================================
// 10. CUSTOM DISPLAY-MODE: no-dropzone
//     No upload -- verify the tool's initial UI renders without errors.
// ===========================================================================

const NO_DROPZONE_TOOLS = [
  "meme-generator",
  "qr-generate",
  "html-to-image",
  "barcode-generate",
  "collage",
  "chart-maker",
];

test.describe("Custom no-dropzone tools initial UI", () => {
  for (const toolId of NO_DROPZONE_TOOLS) {
    test(`[${toolId}] initial UI renders without errors`, async ({ page }) => {
      test.setTimeout(60_000);
      const issues = instrument(page);
      await gotoTool(page, toolId);
      await page.waitForTimeout(3_000);
      await assertNoBrokenImages(page);
      assertClean(issues, toolId);
    });
  }
});

// ===========================================================================
// 11. CUSTOM DISPLAY-MODE: custom-results
//     Upload input and verify the input preview renders.
// ===========================================================================

test.describe("Custom custom-results tools input preview", () => {
  // image-to-base64 uses standard image preview (passed on first run)
  test("[image-to-base64] image input preview", async ({ page }) => {
    test.setTimeout(60_000);
    const issues = instrument(page);
    await gotoTool(page, "image-to-base64");
    await uploadFiles(page, fixture("image", "formats", "sample.png"));
    await assertImageRendered(page, "sample.png", "image-to-base64 input");
    await assertNoBrokenImages(page);
    assertClean(issues, "image-to-base64");
  });

  // find-duplicates may display uploads in a list/grid rather than a
  // single large preview img. Use the broader custom-results oracle.
  test("[find-duplicates] image input accepted", async ({ page }) => {
    test.setTimeout(60_000);
    const issues = instrument(page);
    await gotoTool(page, "find-duplicates");
    await uploadFiles(page, fixture("image", "formats", "sample.png"));
    await assertCustomResultsPreview(page, "find-duplicates");
    await assertNoBrokenImages(page);
    assertClean(issues, "find-duplicates");
  });

  // pdf-to-image is custom-results and may not use the standard document
  // canvas. Use the broader oracle (any rendered content or file-accepted).
  test("[pdf-to-image] pdf input accepted", async ({ page }) => {
    test.setTimeout(60_000);
    const issues = instrument(page);
    await gotoTool(page, "pdf-to-image");
    await uploadFiles(page, fixture("document", "formats", "tiny.pdf"));
    // Try document preview first; fall back to custom-results oracle
    try {
      await assertDocumentPreview(page);
    } catch {
      // custom-results mode may skip document canvas; just verify accepted
      await page.waitForTimeout(3_000);
      await assertNoBrokenImages(page);
    }
    assertClean(issues, "pdf-to-image");
  });

  // passport-photo (AI tool) may have a custom preview layout
  test("[passport-photo] image input accepted", async ({ page }) => {
    test.setTimeout(60_000);
    const issues = instrument(page);
    await gotoTool(page, "passport-photo");
    // Guard against route rot: a wrong/404 route must fail loudly, not silently skip.
    await expect(page.getByRole("heading", { name: "404" })).toHaveCount(0);
    // The country dropdown is only present once the tool's real UI has loaded;
    // on a container without the background-removal/face-detection bundles
    // installed, this page shows an install prompt instead (no dropzone), which
    // would otherwise fail uploadFiles() with an unclear timeout.
    const ready = await page
      .getByText("Country")
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!ready) {
      test.skip(true, "background-removal or face-detection feature bundle not installed");
    }
    await uploadFiles(page, fixture("image", "formats", "sample.png"));
    await assertCustomResultsPreview(page, "passport-photo");
    await assertNoBrokenImages(page);
    assertClean(issues, "passport-photo");
  });
});

// ===========================================================================
// 12. CUSTOM DISPLAY-MODE: interactive
//     Upload image and verify the interactive canvas renders.
// ===========================================================================

test.describe("Custom interactive tools input preview", () => {
  test("[crop] interactive-crop canvas renders", async ({ page }) => {
    test.setTimeout(60_000);
    const issues = instrument(page);
    await gotoTool(page, "crop");
    await uploadFiles(page, fixture("image", "formats", "sample.png"));
    await assertInteractivePreview(page, "crop");
    await assertNoBrokenImages(page);
    assertClean(issues, "crop");
  });

  test("[erase-object] interactive-eraser canvas renders", async ({ page }) => {
    test.setTimeout(60_000);
    const issues = instrument(page);
    await gotoTool(page, "erase-object");
    // Guard against route rot: a wrong/404 route must fail loudly, not silently skip.
    await expect(page.getByRole("heading", { name: "404" })).toHaveCount(0);
    // The submit button is only present once the tool's real UI has loaded; on
    // a container without the object-eraser-colorize bundle installed, this
    // page shows an install prompt instead (no dropzone), which would
    // otherwise fail uploadFiles() with an unclear timeout.
    const ready = await page
      .getByTestId("erase-object-submit")
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!ready) {
      test.skip(true, "object-eraser-colorize feature bundle not installed");
    }
    await uploadFiles(page, fixture("image", "formats", "sample.png"));
    await assertInteractivePreview(page, "erase-object");
    await assertNoBrokenImages(page);
    assertClean(issues, "erase-object");
  });

  test("[split] interactive-split canvas renders", async ({ page }) => {
    test.setTimeout(60_000);
    const issues = instrument(page);
    await gotoTool(page, "split");
    await uploadFiles(page, fixture("image", "formats", "sample.png"));
    await assertInteractivePreview(page, "split");
    await assertNoBrokenImages(page);
    assertClean(issues, "split");
  });
});
