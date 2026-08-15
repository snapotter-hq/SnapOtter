/**
 * generatePreview honesty (#746). When the processed result can't be decoded
 * for a preview, generatePreview must return no preview and log the failure. It
 * must never fabricate a "result preview" from a different buffer (the old code
 * fell back to the pre-processing input, which the client renders under the
 * processed filename, so a converted file showed the untouched original).
 *
 * Uses REAL sharp (the sibling postprocess.test.ts mocks it) so an undecodable
 * buffer actually throws and a valid one actually encodes.
 */

import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {},
  schema: { jobs: {}, userFiles: {} },
}));

const putObjectMock = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/api/src/lib/object-storage.js", () => ({
  putObject: putObjectMock,
}));

const loggerMock = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("../../../apps/api/src/lib/logger.js", () => ({ logger: loggerMock }));

import { generatePreview } from "../../../apps/api/src/jobs/postprocess.js";

const JOB_ID = "job-preview-test";

beforeEach(() => {
  putObjectMock.mockReset();
  loggerMock.warn.mockReset();
});

describe("generatePreview honesty (#746)", () => {
  it("previews the actual result for a non-browser-previewable format", async () => {
    const tiffResult = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .tiff()
      .toBuffer();

    const key = await generatePreview(tiffResult, "image/tiff", JOB_ID);

    expect(key).toBe(`outputs/${JOB_ID}/preview.webp`);
    expect(putObjectMock).toHaveBeenCalledOnce();
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("returns no preview and logs when the result can't be decoded, never fabricating one from the input", async () => {
    const undecodableResult = Buffer.from("this is not a decodable image at all");
    const decodableInput = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();

    // The 4th arg is the pre-processing input the old code fell back to. It is no
    // longer a parameter (#746); passing it anyway proves the result preview is
    // never fabricated from it.
    // @ts-expect-error generatePreview no longer accepts a fallback input buffer.
    const key = await generatePreview(undecodableResult, "image/tiff", JOB_ID, decodableInput);

    expect(key).toBeUndefined();
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledOnce();
  });
});
