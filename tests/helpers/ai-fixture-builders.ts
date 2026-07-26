import sharp from "sharp";

/**
 * A black canvas the size of `input` with a white rectangle over its centre,
 * which is the mask shape Object Eraser expects: white marks the pixels to
 * repaint. Returned as PNG so the route's image validator accepts it.
 */
export async function buildCenteredRectMask(
  input: Buffer,
  fraction = 0.3,
): Promise<{ mask: Buffer; region: { height: number; left: number; top: number; width: number } }> {
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error("cannot size a mask for an image with no dimensions");
  const region = {
    width: Math.max(1, Math.floor(width * fraction)),
    height: Math.max(1, Math.floor(height * fraction)),
    left: Math.floor((width * (1 - fraction)) / 2),
    top: Math.floor((height * (1 - fraction)) / 2),
  };
  const rect = await sharp({
    create: { width: region.width, height: region.height, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const mask = await sharp({ create: { width, height, channels: 3, background: "#000000" } })
    .composite([{ input: rect, left: region.left, top: region.top }])
    .png()
    .toBuffer();
  return { mask, region };
}

/** Mean absolute per-channel difference between two same-size rasters. */
export async function meanAbsoluteDifference(a: Buffer, b: Buffer): Promise<number> {
  const decode = async (buffer: Buffer) =>
    sharp(buffer).removeAlpha().toColorspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const [left, right] = await Promise.all([decode(a), decode(b)]);
  if (left.info.width !== right.info.width || left.info.height !== right.info.height) {
    return Number.POSITIVE_INFINITY;
  }
  let total = 0;
  for (let i = 0; i < left.data.length; i += 1) total += Math.abs(left.data[i] - right.data[i]);
  return total / left.data.length;
}
