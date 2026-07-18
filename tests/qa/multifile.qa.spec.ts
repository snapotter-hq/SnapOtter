import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
  downloadResult,
  fixture,
  gotoTool,
  imageInfo,
  instrument,
  isClean,
  issuesSummary,
  magicMatches,
  mediaDuration,
  probeMedia,
  processTool,
  setSecondaryInput,
  uploadFiles,
  waitForResult,
} from "./qa-helpers";

// ---------------------------------------------------------------------------
// Multi-file and batch QA sweep.
// Covers: A) multi-input tools, B) batch processing, C) edge cases.
// Config: tests/qa/playwright.qa.config.ts (QA container, auth off).
// Run:  pnpm playwright test --config tests/qa/playwright.qa.config.ts tests/qa/multifile.qa.spec.ts --workers=2
// ---------------------------------------------------------------------------

// Generous timeout: multi-file uploads + media processing can be slow.
test.setTimeout(180_000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Click the tool's run/submit button by test-id. */
async function clickSubmit(page: Page, toolId: string) {
  const submit = page.getByTestId(`${toolId}-submit`);
  await submit.first().waitFor({ state: "visible", timeout: 15_000 });
  await submit.first().click();
}

/** Download via a specific test-id (for tools whose download is not `${toolId}-download`). */
async function downloadViaTestId(
  page: Page,
  testId: string,
): Promise<{ path: string; name: string; size: number; buf: Buffer }> {
  const dlPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByTestId(testId).first().click();
  const dl = await dlPromise;
  const name = dl.suggestedFilename();
  const out = path.join(os.tmpdir(), `qa-mf-${process.hrtime.bigint()}-${name}`);
  await dl.saveAs(out);
  const buf = fs.readFileSync(out);
  return { path: out, name, size: buf.length, buf };
}

/** Count pages in a PDF using pdfinfo or qpdf (whatever is available). */
function pdfPageCount(file: string): number {
  try {
    const out = execFileSync("pdfinfo", [file], { encoding: "utf8", timeout: 10_000 });
    const m = out.match(/Pages:\s+(\d+)/);
    return m ? Number(m[1]) : -1;
  } catch {
    // Fallback: qpdf
    try {
      const out = execFileSync("qpdf", ["--show-npages", file], {
        encoding: "utf8",
        timeout: 10_000,
      });
      return Number(out.trim());
    } catch {
      return -1;
    }
  }
}

/**
 * List entries inside a ZIP file. Uses Python's zipfile module which handles
 * fflate-generated ZIPs (the browser-side batch ZIP is built with fflate).
 * Falls back to the `unzip` CLI if Python is unavailable.
 */
function zipEntries(fileOrBuf: string | Buffer): string[] {
  let zipPath: string;
  if (typeof fileOrBuf === "string") {
    zipPath = fileOrBuf;
  } else {
    zipPath = path.join(os.tmpdir(), `qa-zip-${process.hrtime.bigint()}.zip`);
    fs.writeFileSync(zipPath, fileOrBuf);
  }

  // Approach 1: Python's zipfile (handles fflate ZIPs reliably)
  try {
    const out = execFileSync(
      "python3",
      [
        "-c",
        `import zipfile, json, sys
zf = zipfile.ZipFile(sys.argv[1])
print(json.dumps([n for n in zf.namelist() if not n.endswith('/')]))`,
        zipPath,
      ],
      { encoding: "utf8", timeout: 10_000 },
    );
    return JSON.parse(out.trim());
  } catch {
    // ignore
  }

  // Approach 2: unzip -l (parse table output)
  try {
    const out = execFileSync("unzip", ["-Z1", zipPath], {
      encoding: "utf8",
      timeout: 10_000,
    });
    return out
      .trim()
      .split("\n")
      .filter((l) => l.length > 0 && !l.endsWith("/"));
  } catch {
    // ignore
  }

  return [];
}

/**
 * Wait for the batch "Download All (ZIP)" button, click it, and save the file.
 * The batch ZIP is created client-side via fflate.
 */
async function downloadBatchZip(
  page: Page,
): Promise<{ path: string; name: string; size: number; buf: Buffer }> {
  const zipBtn = page.getByRole("button", { name: /download all.*zip/i }).first();
  await expect(zipBtn).toBeVisible({ timeout: 90_000 });

  // Start listening for the download BEFORE clicking
  const dlPromise = page.waitForEvent("download", { timeout: 60_000 });
  await zipBtn.click();
  const dl = await dlPromise;
  const name = dl.suggestedFilename();
  const out = path.join(os.tmpdir(), `qa-batch-${process.hrtime.bigint()}-${name}`);
  await dl.saveAs(out);
  const buf = fs.readFileSync(out);
  return { path: out, name, size: buf.length, buf };
}

/**
 * Wait for either the standard per-tool download button OR the batch "Download
 * All (ZIP)" button to appear. Returns which was found.
 */
async function waitForAnyDownload(
  page: Page,
  toolId: string,
  timeoutMs = 60_000,
): Promise<"tool-download" | "batch-zip" | "none"> {
  const toolDl = page.getByTestId(`${toolId}-download`).first();
  const genericDl = page.locator("[data-download-button]").first();
  const batchZip = page.getByRole("button", { name: /download all.*zip/i }).first();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await toolDl.isVisible().catch(() => false)) return "tool-download";
    if (await genericDl.isVisible().catch(() => false)) return "tool-download";
    if (await batchZip.isVisible().catch(() => false)) return "batch-zip";
    await page.waitForTimeout(500);
  }
  return "none";
}

// =========================================================================
// A) MULTI-INPUT TOOLS
// =========================================================================

test.describe("A) Multi-input tools", () => {
  test("merge-pdf: 3pg + 2pg -> 5 pages", async ({ page }) => {
    const issues = instrument(page);
    await gotoTool(page, "merge-pdf");
    await uploadFiles(page, [
      fixture("document", "formats", "tiny.pdf"),
      fixture("document", "valid", "alt-2page.pdf"),
    ]);
    await page.waitForTimeout(1_000);
    const res = await processTool(page, "merge-pdf", "fast");
    expect(res.ok, `merge-pdf failed: ${res.error}`).toBe(true);

    const dl = await downloadResult(page, "merge-pdf");
    expect(dl.size, "downloaded file is non-empty").toBeGreaterThan(0);
    expect(magicMatches(dl.buf, "pdf"), "output is a valid PDF").toBe(true);

    const pages = pdfPageCount(dl.path);
    expect(pages, `merge-pdf produced ${pages} pages, expected 5`).toBe(5);
    expect(isClean(issues), issuesSummary(issues)).toBe(true);
  });

  test("merge-audio: mp3 + wav -> duration ~= sum", async ({ page }) => {
    // BUG CHECK: merge-audio-settings.tsx uses processAllFiles (batch) instead
    // of processFiles (merge) when multiple files are present. This means it
    // tries to process each file individually instead of merging them. merge-pdf
    // correctly uses processFiles for its merge. If this test fails, the bug is
    // confirmed: the UI sends files to the batch endpoint instead of the merge
    // endpoint.
    const issues = instrument(page);
    await gotoTool(page, "merge-audio");
    await uploadFiles(page, [
      fixture("audio", "formats", "tiny.mp3"),
      fixture("audio", "formats", "tiny.wav"),
    ]);
    await page.waitForTimeout(1_000);

    // Click submit and watch what happens
    await clickSubmit(page, "merge-audio");

    const which = await waitForAnyDownload(page, "merge-audio", 60_000);

    if (which === "batch-zip") {
      // BUG: merge-audio routed through batch endpoint instead of merge.
      // The output is a ZIP of individually processed files, NOT a merged audio.
      expect(
        false,
        "BUG: merge-audio uses processAllFiles (batch) instead of processFiles (merge). " +
          "Files are processed individually, not concatenated. " +
          "Fix: change merge-audio-settings.tsx to call processFiles(files, settings) " +
          "for multiple files, like merge-pdf does.",
      ).toBe(true);
    } else if (which === "tool-download") {
      // Correct behavior: single merged download
      const dl = await downloadResult(page, "merge-audio");
      expect(dl.size).toBeGreaterThan(0);
      const dur = mediaDuration(dl.path);
      expect(dur, `merge-audio output duration ${dur.toFixed(2)}s, expected ~2.0s`).toBeGreaterThan(
        1.5,
      );
      expect(dur, `merge-audio output too long: ${dur.toFixed(2)}s`).toBeLessThan(3.5);
    } else {
      // Neither download nor batch ZIP appeared. The UI sent files to the batch
      // endpoint (processAllFiles) which tried to process each file individually.
      // Since merge-audio requires 2+ inputs, each individual file fails, yielding
      // "All files failed processing". This confirms the batch-instead-of-merge bug.
      const errorText = await page
        .locator("[role='alert'], .text-destructive-ink, .text-red-500")
        .first()
        .innerText()
        .catch(() => "no error visible");
      expect(
        false,
        "BUG: merge-audio uses processAllFiles (batch) instead of processFiles (merge). " +
          "Each file is sent individually to the batch endpoint, failing because merge-audio " +
          "requires 2+ files. Visible error: " +
          errorText +
          ". Fix: change merge-audio-settings.tsx to always call processFiles(files, settings), " +
          "like merge-pdf does.",
      ).toBe(true);
    }
    expect(isClean(issues), issuesSummary(issues)).toBe(true);
  });

  test("merge-videos: mp4 + mov -> duration ~= sum", async ({ page }) => {
    const issues = instrument(page);
    await gotoTool(page, "merge-videos");
    await uploadFiles(page, [
      fixture("video", "formats", "tiny.mp4"),
      fixture("video", "formats", "tiny.mov"),
    ]);
    await page.waitForTimeout(1_000);

    // merge-videos has executionHint "long" => SSE/async
    const res = await processTool(page, "merge-videos", "long");
    expect(res.ok, `merge-videos failed: ${res.error}`).toBe(true);

    const dl = await downloadResult(page, "merge-videos");
    expect(dl.size).toBeGreaterThan(0);

    // Source durations: mp4 ~1.0s, mov ~1.0s => sum ~2.0s
    const dur = mediaDuration(dl.path);
    expect(dur, `merge-videos duration ${dur.toFixed(2)}s, expected ~2.0s`).toBeGreaterThan(1.5);
    expect(dur, `merge-videos output too long: ${dur.toFixed(2)}s`).toBeLessThan(3.5);
    expect(isClean(issues), issuesSummary(issues)).toBe(true);
  });

  test("merge-csvs: tiny-a + tiny-b -> combined rows", async ({ page }) => {
    // BUG CHECK: Same as merge-audio -- merge-csvs-settings.tsx uses
    // processAllFiles (batch) instead of processFiles (merge) when multiple
    // files are present.
    const issues = instrument(page);
    await gotoTool(page, "merge-csvs");
    await uploadFiles(page, [
      fixture("data", "valid", "tiny-a.csv"),
      fixture("data", "valid", "tiny-b.csv"),
    ]);
    await page.waitForTimeout(1_000);

    await clickSubmit(page, "merge-csvs");

    const which = await waitForAnyDownload(page, "merge-csvs", 60_000);

    if (which === "batch-zip") {
      expect(
        false,
        "BUG: merge-csvs uses processAllFiles (batch) instead of processFiles (merge). " +
          "Files are processed individually, not concatenated. " +
          "Fix: change merge-csvs-settings.tsx to always call processFiles(files, settings).",
      ).toBe(true);
    } else if (which === "tool-download") {
      const dl = await downloadResult(page, "merge-csvs");
      expect(dl.size).toBeGreaterThan(0);
      const csv = dl.buf.toString("utf8");
      const lines = csv
        .trim()
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0);
      expect(
        lines.length,
        `merge-csvs output has ${lines.length} lines, expected >= 3`,
      ).toBeGreaterThanOrEqual(3);
      expect(csv, "merge-csvs output should contain 'alpha'").toContain("alpha");
      expect(csv, "merge-csvs output should contain 'beta'").toContain("beta");
    } else {
      // Same bug as merge-audio: processAllFiles sends each file individually,
      // merge-csvs needs 2+ files, so each individual file fails.
      const errorText = await page
        .locator("[role='alert'], .text-destructive-ink, .text-red-500")
        .first()
        .innerText()
        .catch(() => "no error visible");
      expect(
        false,
        "BUG: merge-csvs uses processAllFiles (batch) instead of processFiles (merge). " +
          "Each file is sent individually, failing because merge needs 2+ files. " +
          "Visible error: " +
          errorText +
          ". Fix: change merge-csvs-settings.tsx to always call processFiles(files, settings).",
      ).toBe(true);
    }
    expect(isClean(issues), issuesSummary(issues)).toBe(true);
  });

  test("stitch: 2 images -> stitched output with combined dimensions", async ({ page }) => {
    const issues = instrument(page);
    await gotoTool(page, "stitch");
    await uploadFiles(page, [
      fixture("image", "formats", "sample.png"),
      fixture("image", "formats", "sample.jpg"),
    ]);
    await page.waitForTimeout(1_000);

    await clickSubmit(page, "stitch");
    const dlBtn = page.getByTestId("stitch-download").first();
    await expect(dlBtn).toBeVisible({ timeout: 60_000 });

    const dl = await downloadViaTestId(page, "stitch-download");
    expect(dl.size).toBeGreaterThan(0);

    const info = imageInfo(dl.path);
    const src1 = imageInfo(fixture("image", "formats", "sample.png"));
    const src2 = imageInfo(fixture("image", "formats", "sample.jpg"));
    // Default direction is horizontal => width should be roughly sum of inputs
    expect(
      info.width,
      `stitch output width ${info.width} should exceed each input (${src1.width}, ${src2.width})`,
    ).toBeGreaterThan(Math.max(src1.width, src2.width));
    expect(info.height, "stitch output has nonzero height").toBeGreaterThan(0);
    expect(isClean(issues), issuesSummary(issues)).toBe(true);
  });

  test("collage: 2 images -> collage output present with sane dimensions", async ({ page }) => {
    const issues = instrument(page);
    await gotoTool(page, "collage");

    await uploadFiles(page, [
      fixture("image", "formats", "sample.png"),
      fixture("image", "formats", "sample.jpg"),
    ]);
    await page.waitForTimeout(1_500);

    await clickSubmit(page, "collage");
    const dlBtn = page.getByTestId("collage-download").first();
    await expect(dlBtn).toBeVisible({ timeout: 60_000 });

    const dl = await downloadViaTestId(page, "collage-download");
    expect(dl.size).toBeGreaterThan(0);
    const info = imageInfo(dl.path);
    expect(info.width, "collage output has nonzero width").toBeGreaterThan(0);
    expect(info.height, "collage output has nonzero height").toBeGreaterThan(0);
    expect(isClean(issues), issuesSummary(issues)).toBe(true);
  });

  test("compose: base + overlay -> composited image", async ({ page }) => {
    const issues = instrument(page);
    await gotoTool(page, "compose");
    await uploadFiles(page, fixture("image", "formats", "sample.png"));
    await page.waitForTimeout(500);

    await setSecondaryInput(
      page,
      "#compose-overlay-image",
      fixture("image", "formats", "sample.jpg"),
    );
    await page.waitForTimeout(500);

    await clickSubmit(page, "compose");
    const dlBtn = page.getByTestId("compose-download").first();
    await expect(dlBtn).toBeVisible({ timeout: 60_000 });

    const dl = await downloadViaTestId(page, "compose-download");
    expect(dl.size).toBeGreaterThan(0);
    const info = imageInfo(dl.path);
    expect(info.width, "compose output has nonzero width").toBeGreaterThan(0);
    expect(info.height, "compose output has nonzero height").toBeGreaterThan(0);
    expect(isClean(issues), issuesSummary(issues)).toBe(true);
  });

  test("compare: two distinct images -> similarity score + diff image", async ({ page }) => {
    const issues = instrument(page);
    await gotoTool(page, "compare");
    await uploadFiles(page, fixture("image", "formats", "sample.png"));
    await page.waitForTimeout(500);

    await setSecondaryInput(
      page,
      "#compare-second-image",
      fixture("image", "valid", "portrait-color.jpg"),
    );
    await page.waitForTimeout(500);

    await clickSubmit(page, "compare");

    const simText = page.locator("text=/Similarity:\\s*\\d/").first();
    await expect(simText).toBeVisible({ timeout: 30_000 });

    const dlBtn = page.getByTestId("compare-download").first();
    await expect(dlBtn).toBeVisible({ timeout: 30_000 });

    const dl = await downloadViaTestId(page, "compare-download");
    expect(dl.size, "compare diff image is non-empty").toBeGreaterThan(0);
    expect(isClean(issues), issuesSummary(issues)).toBe(true);
  });

  test("find-duplicates: identical pair + distinct -> reports duplicate group", async ({
    page,
  }) => {
    const issues = instrument(page);
    await gotoTool(page, "find-duplicates");
    await uploadFiles(page, [
      fixture("image", "valid", "portrait-color.jpg"),
      fixture("image", "valid", "portrait-color-dup.jpg"),
      fixture("image", "formats", "sample.png"),
    ]);
    await page.waitForTimeout(1_500);

    await clickSubmit(page, "find-duplicates");

    const groupsText = page.locator("text=/Duplicate groups/").first();
    await expect(groupsText).toBeVisible({ timeout: 60_000 });

    const groupCountEl = groupsText.locator("..").locator("span.text-yellow-500").first();
    const groupCountText = await groupCountEl.innerText();
    const groupCount = Number(groupCountText.trim());
    expect(
      groupCount,
      `find-duplicates reported ${groupCount} duplicate groups, expected >= 1`,
    ).toBeGreaterThanOrEqual(1);

    const uniqueText = page.locator("text=/Unique images/").first();
    await expect(uniqueText).toBeVisible({ timeout: 5_000 });
    expect(isClean(issues), issuesSummary(issues)).toBe(true);
  });

  test("images-to-video: 3 images -> playable video", async ({ page }) => {
    const issues = instrument(page);
    await gotoTool(page, "images-to-video");
    await uploadFiles(page, [
      fixture("image", "formats", "sample.png"),
      fixture("image", "formats", "sample.jpg"),
      fixture("image", "formats", "sample.webp"),
    ]);
    await page.waitForTimeout(1_000);

    const res = await processTool(page, "images-to-video", "fast");
    expect(res.ok, `images-to-video failed: ${res.error}`).toBe(true);

    const dl = await downloadResult(page, "images-to-video");
    expect(dl.size).toBeGreaterThan(0);

    const probe = probeMedia(dl.path);
    const videoStream = probe.streams?.find((s) => s.codec_type === "video");
    expect(videoStream, "images-to-video output has a video stream").toBeTruthy();
    expect(videoStream?.width, "video has nonzero width").toBeGreaterThan(0);

    // With 3 images at 2s each (default) => ~6s
    const dur = mediaDuration(dl.path);
    expect(
      dur,
      `images-to-video duration ${dur.toFixed(2)}s, expected ~6s (3 images x 2s)`,
    ).toBeGreaterThan(4);
    expect(dur).toBeLessThan(10);
    expect(isClean(issues), issuesSummary(issues)).toBe(true);
  });

  test("create-zip: several files -> ZIP with correct entry count", async ({ page }) => {
    // BUG CHECK: create-zip-settings.tsx uses processAllFiles (batch) instead
    // of processFiles when multiple files are present. Also, create-zip has
    // acceptedInputs:[] which may cause the dropzone to reject file uploads
    // client-side.
    const issues = instrument(page);
    await gotoTool(page, "create-zip");
    // Use a mix of file types since create-zip should accept all types
    const inputFiles = [
      fixture("document", "formats", "tiny.pdf"),
      fixture("data", "valid", "tiny-a.csv"),
      fixture("document", "formats", "tiny.txt"),
    ];
    await uploadFiles(page, inputFiles);
    await page.waitForTimeout(2_000);

    // Check if the submit button is visible (files were accepted)
    const submitBtn = page.getByTestId("create-zip-submit").first();
    const submitVisible = await submitBtn.isVisible().catch(() => false);

    if (!submitVisible) {
      // Files were likely rejected by the dropzone or the settings component
      // did not render. This could mean create-zip's empty acceptedInputs []
      // is being interpreted as "reject all" by the file validation logic.
      // Check if there are any files in the file list
      const hasFiles = await page
        .locator("text=/file|image|uploaded/i")
        .first()
        .isVisible()
        .catch(() => false);
      expect(
        false,
        "BUG: create-zip submit button not visible after uploading files. " +
          "The tool has acceptedInputs:[] which may cause client-side file rejection. " +
          "Files accepted: " +
          hasFiles +
          ". " +
          "Check if the file store or dropzone treats empty acceptedInputs as 'reject all' " +
          "instead of 'accept all'.",
      ).toBe(true);
    } else {
      await submitBtn.click();
      const which = await waitForAnyDownload(page, "create-zip", 60_000);

      if (which === "batch-zip") {
        const dl = await downloadBatchZip(page);
        expect(dl.size).toBeGreaterThan(0);
        const entries = zipEntries(dl.buf);
        expect(
          entries.length,
          `BUG: create-zip used batch mode (processAllFiles). Batch ZIP has ${entries.length} entries. ` +
            "Fix: change create-zip-settings.tsx to always call processFiles(files, settings).",
        ).toBe(inputFiles.length);
      } else if (which === "tool-download") {
        const dl = await downloadResult(page, "create-zip");
        expect(dl.size).toBeGreaterThan(0);
        expect(magicMatches(dl.buf, "zip"), "output is a valid ZIP").toBe(true);
        const entries = zipEntries(dl.buf);
        expect(
          entries.length,
          `create-zip produced ${entries.length} entries, expected ${inputFiles.length}`,
        ).toBe(inputFiles.length);
      } else {
        const errorText = await page
          .locator("[role='alert'], .text-destructive-ink, .text-red-500")
          .first()
          .innerText()
          .catch(() => "no error visible");
        expect(
          false,
          "BUG: create-zip processed but no download appeared. " +
            "Likely the processAllFiles batch call failed for each individual file. " +
            "Error: " +
            errorText,
        ).toBe(true);
      }
    }
    expect(isClean(issues), issuesSummary(issues)).toBe(true);
  });

  test("replace-audio: video + audio -> output video has audio track", async ({ page }) => {
    const issues = instrument(page);
    await gotoTool(page, "replace-audio");
    await uploadFiles(page, [
      fixture("video", "formats", "tiny.mp4"),
      fixture("audio", "formats", "tiny.mp3"),
    ]);
    await page.waitForTimeout(1_000);

    const res = await processTool(page, "replace-audio", "fast");
    expect(res.ok, `replace-audio failed: ${res.error}`).toBe(true);

    const dl = await downloadResult(page, "replace-audio");
    expect(dl.size).toBeGreaterThan(0);

    const probe = probeMedia(dl.path);
    const videoStream = probe.streams?.find((s) => s.codec_type === "video");
    const audioStream = probe.streams?.find((s) => s.codec_type === "audio");
    expect(videoStream, "replace-audio output has video stream").toBeTruthy();
    expect(audioStream, "replace-audio output has audio stream").toBeTruthy();
    expect(isClean(issues), issuesSummary(issues)).toBe(true);
  });

  test("burn-subtitles: video + srt -> output produced", async ({ page }) => {
    const issues = instrument(page);
    await gotoTool(page, "burn-subtitles");
    await uploadFiles(page, [
      fixture("video", "formats", "tiny.mp4"),
      fixture("video", "formats", "tiny.srt"),
    ]);
    await page.waitForTimeout(1_000);

    const res = await processTool(page, "burn-subtitles", "long");
    expect(res.ok, `burn-subtitles failed: ${res.error}`).toBe(true);

    const dl = await downloadResult(page, "burn-subtitles");
    expect(dl.size, "burn-subtitles output is non-empty").toBeGreaterThan(0);

    const probe = probeMedia(dl.path);
    const videoStream = probe.streams?.find((s) => s.codec_type === "video");
    expect(videoStream, "burn-subtitles output has video stream").toBeTruthy();
    expect(isClean(issues), issuesSummary(issues)).toBe(true);
  });

  test("embed-subtitles: video + srt -> output has subtitle stream", async ({ page }) => {
    const issues = instrument(page);
    await gotoTool(page, "embed-subtitles");
    await uploadFiles(page, [
      fixture("video", "formats", "tiny.mp4"),
      fixture("video", "formats", "tiny.srt"),
    ]);
    await page.waitForTimeout(1_000);

    const res = await processTool(page, "embed-subtitles", "fast");
    expect(res.ok, `embed-subtitles failed: ${res.error}`).toBe(true);

    const dl = await downloadResult(page, "embed-subtitles");
    expect(dl.size, "embed-subtitles output is non-empty").toBeGreaterThan(0);

    const probe = probeMedia(dl.path);
    const subStream = probe.streams?.find((s) => s.codec_type === "subtitle");
    const videoStream = probe.streams?.find((s) => s.codec_type === "video");
    expect(videoStream, "embed-subtitles output has video stream").toBeTruthy();
    expect(subStream, "embed-subtitles output has subtitle stream").toBeTruthy();
    expect(isClean(issues), issuesSummary(issues)).toBe(true);
  });
});

// =========================================================================
// B) BATCH PROCESSING (same tool, many files)
// =========================================================================

test.describe("B) Batch processing", () => {
  test("resize: batch 5 images -> ZIP with 5 outputs", async ({ page }) => {
    const issues = instrument(page);
    await gotoTool(page, "resize");
    const batchFiles = [
      fixture("image", "formats", "sample.png"),
      fixture("image", "formats", "sample.jpg"),
      fixture("image", "formats", "sample.webp"),
      fixture("image", "formats", "sample.bmp"),
      fixture("image", "formats", "sample.gif"),
    ];
    await uploadFiles(page, batchFiles);
    await page.waitForTimeout(1_500);

    // Set a resize width so all 5 process
    await page.locator("#resize-width").fill("128");
    await page.waitForTimeout(300);

    // Submit triggers batch mode for 5 files
    const res = await processTool(page, "resize", "fast");
    expect(res.ok, `resize batch failed: ${res.error}`).toBe(true);

    // The batch "Download All (ZIP)" button should appear
    const dl = await downloadBatchZip(page);
    expect(dl.size).toBeGreaterThan(0);
    expect(magicMatches(dl.buf, "zip"), "batch output is a valid ZIP").toBe(true);

    const entries = zipEntries(dl.buf);
    expect(entries.length, `resize batch ZIP has ${entries.length} entries, expected 5`).toBe(5);
    expect(isClean(issues), issuesSummary(issues)).toBe(true);
  });

  test("convert: batch 5 images to webp -> ZIP with 5 outputs", async ({ page }) => {
    const issues = instrument(page);
    await gotoTool(page, "convert");
    const batchFiles = [
      fixture("image", "formats", "sample.png"),
      fixture("image", "formats", "sample.jpg"),
      fixture("image", "formats", "sample.bmp"),
      fixture("image", "formats", "sample.gif"),
      fixture("image", "formats", "sample.tiff"),
    ];
    await uploadFiles(page, batchFiles);
    await page.waitForTimeout(1_500);

    await page.locator("#convert-target-format").selectOption("webp");
    await page.waitForTimeout(300);

    const res = await processTool(page, "convert", "fast");
    expect(res.ok, `convert batch failed: ${res.error}`).toBe(true);

    const dl = await downloadBatchZip(page);
    expect(dl.size).toBeGreaterThan(0);
    expect(magicMatches(dl.buf, "zip"), "batch ZIP is valid").toBe(true);

    const entries = zipEntries(dl.buf);
    expect(entries.length, `convert batch ZIP has ${entries.length} entries, expected 5`).toBe(5);
    expect(isClean(issues), issuesSummary(issues)).toBe(true);
  });

  test("compress: batch 5 images -> ZIP with 5 outputs", async ({ page }) => {
    const issues = instrument(page);
    await gotoTool(page, "compress");
    const batchFiles = [
      fixture("image", "formats", "sample.png"),
      fixture("image", "formats", "sample.jpg"),
      fixture("image", "formats", "sample.webp"),
      fixture("image", "formats", "sample.gif"),
      fixture("image", "formats", "sample.tiff"),
    ];
    await uploadFiles(page, batchFiles);
    await page.waitForTimeout(1_500);

    // Compress defaults to "targetSize" mode which requires entering a value.
    // Switch to "quality" mode so the submit button becomes enabled.
    const qualityBtn = page.getByRole("button", { name: /quality/i }).first();
    if (await qualityBtn.isVisible().catch(() => false)) {
      await qualityBtn.click();
      await page.waitForTimeout(300);
    }

    const res = await processTool(page, "compress", "fast");
    expect(res.ok, `compress batch failed: ${res.error}`).toBe(true);

    const dl = await downloadBatchZip(page);
    expect(dl.size).toBeGreaterThan(0);
    expect(magicMatches(dl.buf, "zip"), "batch ZIP is valid").toBe(true);

    const entries = zipEntries(dl.buf);
    expect(entries.length, `compress batch ZIP has ${entries.length} entries, expected 5`).toBe(5);
    expect(isClean(issues), issuesSummary(issues)).toBe(true);
  });
});

// =========================================================================
// C) EDGE CASES
// =========================================================================

test.describe("C) Edge cases", () => {
  test("merge-videos: exceed maxInputs (> 10) -> clean limit error", async ({ page }) => {
    const issues = instrument(page);
    await gotoTool(page, "merge-videos");

    // Upload 11 copies of the same video to exceed the 10-file limit.
    const manyFiles: string[] = [];
    for (let i = 0; i < 11; i++) {
      manyFiles.push(fixture("video", "formats", "tiny.mp4"));
    }
    await uploadFiles(page, manyFiles);
    await page.waitForTimeout(2_000);

    // Try to process
    await clickSubmit(page, "merge-videos");

    // Wait with a reasonable timeout for either error or completion.
    // The server's createToolRoute validates maxInputs and should return 400.
    // Give the SSE response time to arrive (merge-videos is "long").
    const deadline = Date.now() + 90_000;
    let gotError = false;
    let gotDownload = false;
    while (Date.now() < deadline) {
      const errorRegion = page
        .locator("[role='alert'], [aria-live='assertive'], .text-destructive-ink, .text-red-500")
        .filter({ hasText: /error|failed|too many|maximum|limit|exceeded|invalid/i })
        .first();
      if (await errorRegion.isVisible().catch(() => false)) {
        gotError = true;
        break;
      }
      const dl = page.getByTestId("merge-videos-download").first();
      if (await dl.isVisible().catch(() => false)) {
        gotDownload = true;
        break;
      }
      await page.waitForTimeout(1_000);
    }

    if (gotDownload) {
      // The server processed 11 files without enforcing the limit -- this is a bug.
      expect(
        false,
        "BUG: merge-videos accepted 11 files but maxInputs is 10. " +
          "The server should reject with a 400 error.",
      ).toBe(true);
    } else if (gotError) {
      // Good: a clean error was shown
      expect(true, "merge-videos correctly rejected > 10 files").toBe(true);
    } else {
      // Timeout: neither error nor result within 90s -- the server is processing
      // slowly rather than rejecting. Still a bug but not a crash.
      expect(
        false,
        "merge-videos with 11 files: no error or result within 90s. " +
          "Expected a quick rejection, got a timeout.",
      ).toBe(true);
    }

    // No unhandled page crashes
    expect(
      issues.pageErrors.length,
      `unexpected page errors: ${issues.pageErrors.join(", ")}`,
    ).toBe(0);
  });

  test("collage: wrong-type file (.txt) -> clean rejection", async ({ page }) => {
    const issues = instrument(page);
    await gotoTool(page, "collage");

    // Upload a text file into collage (expects images)
    await uploadFiles(page, fixture("document", "formats", "tiny.txt"));
    await page.waitForTimeout(1_500);

    // Try to submit -- the button may be disabled (no valid images) or server rejects
    const submitBtn = page.getByTestId("collage-submit").first();
    const isDisabled = await submitBtn.getAttribute("disabled");

    if (isDisabled !== null) {
      expect(true, "collage correctly disables submit for non-image file").toBe(true);
    } else {
      await submitBtn.click();
      await page.waitForTimeout(3_000);
      const errorVisible = await page
        .locator("text=/error|invalid|unsupported|failed/i")
        .first()
        .isVisible()
        .catch(() => false);
      expect(
        errorVisible,
        "collage should show an error for non-image file, not silently fail",
      ).toBe(true);
    }

    expect(
      issues.pageErrors.length,
      `unexpected page errors: ${issues.pageErrors.join(", ")}`,
    ).toBe(0);
  });

  test("batch resize: duplicate filenames -> outputs do not collide", async ({ page }) => {
    const issues = instrument(page);
    await gotoTool(page, "resize");

    // Upload the same file twice (same filename) plus a different one.
    const dupeFiles = [
      fixture("image", "formats", "sample.png"),
      fixture("image", "formats", "sample.png"),
      fixture("image", "formats", "sample.jpg"),
    ];
    await uploadFiles(page, dupeFiles);
    await page.waitForTimeout(1_500);

    await page.locator("#resize-width").fill("64");
    await page.waitForTimeout(300);

    const res = await processTool(page, "resize", "fast");
    expect(res.ok, `resize with duplicate names failed: ${res.error}`).toBe(true);

    const dl = await downloadBatchZip(page);
    expect(dl.size).toBeGreaterThan(0);

    const entries = zipEntries(dl.buf);
    // Should have 3 entries (deduped names). If 2, duplicates overwrote each other.
    expect(
      entries.length,
      `batch ZIP has ${entries.length} entries, expected 3 (duplicate filenames should not collide)`,
    ).toBe(3);

    // All entry names should be unique
    const uniqueNames = new Set(entries);
    expect(
      uniqueNames.size,
      `batch ZIP has ${uniqueNames.size} unique names out of ${entries.length} entries`,
    ).toBe(entries.length);
    expect(isClean(issues), issuesSummary(issues)).toBe(true);
  });
});
