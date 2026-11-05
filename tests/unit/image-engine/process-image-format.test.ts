import { processImage } from "@snapotter/image-engine";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

// #4310: the outputFormat parameter must admit only formats processImage can write.
// The @ts-expect-error lines fail typecheck:tests if the type admits them again.
describe("processImage outputFormat contract", () => {
  it("rejects formats the engine cannot encode, in the types and at runtime", async () => {
    const empty = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#808080" },
    })
      .png()
      .toBuffer();
    // @ts-expect-error heic is in OutputFormat but not writable here
    await expect(processImage(empty, [], "heic")).rejects.toThrow("Unsupported output format");
    // @ts-expect-error bmp is in OutputFormat but not writable here
    await expect(processImage(empty, [], "bmp")).rejects.toThrow("Unsupported output format");
    // @ts-expect-error ico is in OutputFormat but not writable here
    await expect(processImage(empty, [], "ico")).rejects.toThrow("Unsupported output format");
    // @ts-expect-error jp2 is in OutputFormat but not writable here
    await expect(processImage(empty, [], "jp2")).rejects.toThrow("Unsupported output format");
    // @ts-expect-error qoi is in OutputFormat but not writable here
    await expect(processImage(empty, [], "qoi")).rejects.toThrow("Unsupported output format");
  });
});
