import { expect, test } from "@playwright/test";
import {
  assertAudioPreview,
  assertDocumentPreview,
  assertImageRendered,
  assertNoBrokenImages,
  assertVideoPreview,
  downloadResult,
  fixture,
  gotoTool,
  imageInfo,
  instrument,
  isClean,
  issuesSummary,
  magicMatches,
  processTool,
  uploadFiles,
} from "./qa-helpers";

// Harness smoke: validates upload, per-modality preview oracles, processing,
// download + decode verification, and the console instrument against the live
// QA container. Also satisfies the Phase 0 "one tool per modality" smoke.

test("image: resize round-trip, previews, dimension oracle", async ({ page }) => {
  const issues = instrument(page);
  await gotoTool(page, "resize");
  await uploadFiles(page, fixture("image", "formats", "sample.png"));
  await assertNoBrokenImages(page);
  await page.locator("#resize-width").fill("64");
  const res = await processTool(page, "resize", "fast");
  expect(res.ok, res.error).toBe(true);
  await assertImageRendered(page, "Processed", "resize output");
  const dl = await downloadResult(page, "resize");
  expect(dl.size).toBeGreaterThan(0);
  const dims = imageInfo(dl.path);
  expect(dims.width, "resized width applied").toBe(64);
  expect(isClean(issues), issuesSummary(issues)).toBe(true);
});

test("image: convert png -> webp, magic-byte oracle", async ({ page }) => {
  await gotoTool(page, "convert");
  await uploadFiles(page, fixture("image", "formats", "sample.png"));
  await assertNoBrokenImages(page);
  await page.locator("#convert-target-format").selectOption("webp");
  const res = await processTool(page, "convert", "fast");
  expect(res.ok, res.error).toBe(true);
  const dl = await downloadResult(page, "convert");
  expect(magicMatches(dl.buf, "webp"), `expected webp, got ${dl.name}`).toBe(true);
});

test("video: input preview decodes (tiny.mp4)", async ({ page }) => {
  await gotoTool(page, "convert-video");
  await uploadFiles(page, fixture("video", "formats", "tiny.mp4"));
  await assertVideoPreview(page);
});

test("audio: input waveform ready (tiny.mp3)", async ({ page }) => {
  await gotoTool(page, "convert-audio");
  await uploadFiles(page, fixture("audio", "formats", "tiny.mp3"));
  await assertAudioPreview(page);
});

test("document: pdf input preview renders (tiny.pdf)", async ({ page }) => {
  await gotoTool(page, "rotate-pdf");
  await uploadFiles(page, fixture("document", "formats", "tiny.pdf"));
  await assertDocumentPreview(page);
});
