import { readFile } from "node:fs/promises";
import { resolveGs } from "@snapotter/doc-engine";
import { ffmpegAvailable } from "@snapotter/media-engine";
import { describe, expect, it } from "vitest";
import { pdfFirstPagePreview, videoPosterPreview } from "../../../apps/api/src/modality/preview.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

describe.skipIf(!ffmpegAvailable())("video poster preview (requires ffmpeg)", () => {
  it("renders a webp poster", async () => {
    const buf = readFixture(fixtures.video.tiny("mp4"));
    const poster = await videoPosterPreview(buf);
    expect(poster).not.toBeNull();
    expect(poster?.length).toBeGreaterThan(50);
  });
});

describe.skipIf(!resolveGs())("pdf first-page preview (requires ghostscript)", () => {
  it("renders a png of page 1", async () => {
    const buf = readFixture(fixtures.document.pdf3);
    const png = await pdfFirstPagePreview(buf);
    expect(png).not.toBeNull();
    expect(png?.subarray(1, 4).toString()).toBe("PNG");
  });
});
