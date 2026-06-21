import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qpdfAvailable } from "@snapotter/doc-engine";
import { ffmpegAvailable } from "@snapotter/media-engine";
import { afterAll, describe, expect, it } from "vitest";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";
import { DocumentInputHandler } from "../../../apps/api/src/modality/document-input.js";
import { MediaInputHandler } from "../../../apps/api/src/modality/media-input.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

const scratchDir = mkdtempSync(join(tmpdir(), "modality-input-"));
afterAll(() => rmSync(scratchDir, { recursive: true, force: true }));

describe.skipIf(!ffmpegAvailable())("MediaInputHandler (requires ffmpeg)", () => {
  it("accepts the mp4 fixture as video", async () => {
    const buf = readFixture(fixtures.video.tiny("mp4"));
    const out = await new MediaInputHandler("video").prepare(buf, "tiny.mp4", { scratchDir });
    expect(out.buffer).toBe(buf);
  });

  it("rejects an audio-only file as video", async () => {
    const buf = readFixture(fixtures.audio.tiny("mp3"));
    await expect(
      new MediaInputHandler("video").prepare(buf, "fake.mp4", { scratchDir }),
    ).rejects.toThrow(InputValidationError);
  });

  it("rejects a still image presented as video", async () => {
    const buf = readFixture(fixtures.image.edge.px1);
    await expect(
      new MediaInputHandler("video").prepare(buf, "fake.mp4", { scratchDir }),
    ).rejects.toThrow(/still image/i);
  });

  it("accepts a real video despite short duration", async () => {
    const buf = readFixture(fixtures.video.tiny("mp4"));
    const out = await new MediaInputHandler("video").prepare(buf, "tiny.mp4", { scratchDir });
    expect(out.filename).toBe("tiny.mp4");
  });

  it("enforces the duration cap", async () => {
    const { env } = await import("../../../apps/api/src/config.js");
    const original = env.MAX_AUDIO_DURATION_S;
    (env as Record<string, unknown>).MAX_AUDIO_DURATION_S = 0.5;
    try {
      const buf = readFixture(fixtures.audio.tiny("mp3"));
      await expect(
        new MediaInputHandler("audio").prepare(buf, "tiny.mp3", { scratchDir }),
      ).rejects.toThrow(/exceeds the maximum/);
    } finally {
      (env as Record<string, unknown>).MAX_AUDIO_DURATION_S = original;
    }
  });
});

describe("DocumentInputHandler", () => {
  it("rejects a non-pdf with pdf extension", async () => {
    await expect(
      new DocumentInputHandler().prepare(Buffer.from("hello"), "fake.pdf", { scratchDir }),
    ).rejects.toThrow(/PDF header/);
  });

  it.skipIf(!qpdfAvailable())("accepts the 3-page fixture and enforces page caps", async () => {
    const buf = readFixture(fixtures.document.pdf3);
    const out = await new DocumentInputHandler().prepare(buf, "test.pdf", { scratchDir });
    expect(out.buffer).toBe(buf);
    const { env } = await import("../../../apps/api/src/config.js");
    const original = env.MAX_PDF_PAGES;
    (env as Record<string, unknown>).MAX_PDF_PAGES = 2;
    try {
      await expect(
        new DocumentInputHandler().prepare(buf, "test.pdf", { scratchDir }),
      ).rejects.toThrow(/exceeding the maximum/);
    } finally {
      (env as Record<string, unknown>).MAX_PDF_PAGES = original;
    }
  });

  it.skipIf(!qpdfAvailable())("accepts a password-protected pdf (unlock-pdf's input)", async () => {
    const buf = readFixture(fixtures.document.encrypted);
    const out = await new DocumentInputHandler().prepare(buf, "encrypted.pdf", { scratchDir });
    expect(out.filename).toBe("encrypted.pdf");
  });

  it.skipIf(!qpdfAvailable())("rejects a truncated PDF under strict mode", async () => {
    const full = readFixture(fixtures.document.pdf3);
    const truncated = full.subarray(0, Math.floor(full.length * 0.6));
    await expect(
      new DocumentInputHandler().prepare(truncated, "broken.pdf", { scratchDir }),
    ).rejects.toThrow(/Damaged PDF/);
  });

  it.skipIf(!qpdfAvailable())("accepts a truncated PDF under lenient mode", async () => {
    const full = readFixture(fixtures.document.pdf3);
    const truncated = full.subarray(0, Math.floor(full.length * 0.6));
    const out = await new DocumentInputHandler().prepare(truncated, "broken.pdf", {
      scratchDir,
      lenient: true,
    });
    // Lenient skips qpdfCheck, keeps %PDF- header check only
    expect(out.filename).toBe("broken.pdf");
  });

  it("accepts the docx fixture container", async () => {
    const buf = readFixture(fixtures.document.tiny("docx"));
    const out = await new DocumentInputHandler().prepare(buf, "tiny.docx", { scratchDir });
    expect(out.buffer).toBe(buf);
  });
});
