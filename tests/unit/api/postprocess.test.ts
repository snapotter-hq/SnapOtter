/**
 * Unit tests for postprocess helpers.
 *
 * Tests buildOutputName (output filename construction with tool-specific
 * suffix and extension fixup). This pure function was extracted from
 * tool-factory.ts during the job-spine refactor to apps/api/src/jobs/postprocess.ts.
 */
import { describe, expect, it, vi } from "vitest";

// Minimal mocks so the module loads without Postgres/Redis/sharp
vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {},
  schema: { jobs: {}, userFiles: {} },
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", () => ({
  putObject: vi.fn(),
}));

vi.mock("sharp", () => ({
  default: vi.fn(),
}));

import { buildOutputName, CONTENT_TYPE_TO_EXT } from "../../../apps/api/src/jobs/postprocess.js";

describe("buildOutputName", () => {
  it("appends toolId suffix when filename is unchanged", () => {
    const result = buildOutputName("photo.png", "photo.png", "resize", "image/png");
    expect(result).toBe("photo_resize.png");
  });

  it("does not add suffix when tool renames the file", () => {
    const result = buildOutputName("converted.jpg", "photo.png", "convert", "image/jpeg");
    expect(result).toBe("converted.jpg");
  });

  it("fixes extension mismatch between content-type and filename", () => {
    const result = buildOutputName("output.png", "input.bmp", "convert", "image/jpeg");
    expect(result).toBe("output.jpg");
  });

  it("applies both suffix and extension fixup when needed", () => {
    const result = buildOutputName("input.bmp", "input.bmp", "convert", "image/jpeg");
    expect(result).toBe("input_convert.jpg");
  });

  it("preserves extension when content-type matches", () => {
    const result = buildOutputName("output.webp", "input.png", "compress", "image/webp");
    expect(result).toBe("output.webp");
  });

  it("handles filenames without extension", () => {
    const result = buildOutputName("photo", "photo", "resize", "image/png");
    expect(result).toBe("photo_resize");
  });
});

describe("CONTENT_TYPE_TO_EXT", () => {
  it("maps common image MIME types to extensions", () => {
    expect(CONTENT_TYPE_TO_EXT["image/jpeg"]).toBe(".jpg");
    expect(CONTENT_TYPE_TO_EXT["image/png"]).toBe(".png");
    expect(CONTENT_TYPE_TO_EXT["image/webp"]).toBe(".webp");
    expect(CONTENT_TYPE_TO_EXT["image/gif"]).toBe(".gif");
    expect(CONTENT_TYPE_TO_EXT["image/svg+xml"]).toBe(".svg");
  });
});
