import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

// sharp is only installed in the image-engine package, so resolve it from there
const require = createRequire(
  path.resolve(__dirname, "../../../packages/image-engine/src/index.ts"),
);
const sharp = require("sharp") as typeof import("sharp").default;

import { compressDetailed } from "@snapotter/image-engine";

/** Random noise barely compresses, so a small target forces the downscale path. */
async function noisyPng(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  let seed = 1234567;
  for (let i = 0; i < raw.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    raw[i] = seed & 0xff;
  }
  return await sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

describe("compressDetailed (#1272)", () => {
  it("reports no resize when quality alone reaches the target", async () => {
    const flat = await sharp({
      create: { width: 400, height: 300, channels: 3, background: "#884422" },
    })
      .jpeg({ quality: 95 })
      .toBuffer();

    const result = await compressDetailed(sharp(flat), { targetSizeBytes: 20_000, format: "jpg" });

    expect(result.resizedTo).toBeUndefined();
    const meta = await sharp(await result.image.toBuffer()).metadata();
    expect({ width: meta.width, height: meta.height }).toEqual({ width: 400, height: 300 });
  });

  it("reports the dimensions it shrank to when quality alone can't fit", async () => {
    // At quality 1 this noise is still ~7.6 KB, so 5 KB can't be reached at full size.
    const noise = await noisyPng(1200, 900);
    const targetBytes = 5_000;

    const result = await compressDetailed(sharp(noise), {
      targetSizeBytes: targetBytes,
      format: "jpg",
    });
    const out = await result.image.toBuffer();
    const meta = await sharp(out).metadata();

    expect(out.length).toBeLessThanOrEqual(targetBytes);
    expect(result.resizedTo).toBeDefined();
    expect(result.resizedTo?.width).toBeLessThan(1200);
    expect(result.resizedTo?.height).toBeLessThan(900);
    expect({ width: meta.width, height: meta.height }).toEqual(result.resizedTo);
  });

  it("explains an unreachable target in KB, not bytes", async () => {
    // A JPEG's headers alone outweigh 200 bytes, so no scale can get there.
    const noise = await noisyPng(200, 200);

    const attempt = compressDetailed(sharp(noise), { targetSizeBytes: 200, format: "jpg" });

    await expect(attempt).rejects.toThrow(
      "Couldn't get this image under 0.2 KB, even after scaling it down. Try a larger target, or crop the image first.",
    );
  });

  it("keeps the fractional part when the target isn't a whole KB", async () => {
    const noise = await noisyPng(200, 200);

    const attempt = compressDetailed(sharp(noise), { targetSizeBytes: 250, format: "jpg" });

    await expect(attempt).rejects.toThrow("under 0.25 KB");
  });
});
