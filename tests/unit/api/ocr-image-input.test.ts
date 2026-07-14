import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prepare: vi.fn() }));

vi.mock("@snapotter/ai", () => ({
  MAX_OCR_INPUT_DIMENSION: 40_000,
  MAX_OCR_INPUT_PIXELS: 40_000_000,
}));
vi.mock("../../../apps/api/src/modality/input-handler.js", () => ({
  inputHandlerFor: () => ({ prepare: mocks.prepare }),
}));

import { prepareOcrIngressImage } from "../../../apps/api/src/lib/ocr-image-input.js";

describe("prepareOcrIngressImage", () => {
  beforeEach(() => {
    mocks.prepare.mockReset();
    mocks.prepare.mockResolvedValue({ buffer: Buffer.from("prepared"), filename: "scan.png" });
  });

  it("uses the shared image handler with both OCR decoded-dimension ceilings", async () => {
    const raw = Buffer.from("raw");

    await expect(prepareOcrIngressImage(raw, "scan.qoi", "/tmp/ocr-ingress")).resolves.toEqual({
      buffer: Buffer.from("prepared"),
      filename: "scan.png",
    });
    expect(mocks.prepare).toHaveBeenCalledWith(raw, "scan.qoi", {
      scratchDir: "/tmp/ocr-ingress",
      maxDimension: 40_000,
      maxPixels: 40_000_000,
    });
  });
});
