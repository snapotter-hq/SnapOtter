import type { Sharp, ResizeOptions } from "../types.js";

export async function resize(image: Sharp, options: ResizeOptions): Promise<Sharp> {
  let { width, height, fit, withoutEnlargement, percentage } = options;

  if (percentage !== undefined) {
    if (percentage <= 0) {
      throw new Error("Resize percentage must be greater than 0");
    }
    const metadata = await image.metadata();
    const currentWidth = metadata.width ?? 0;
    const currentHeight = metadata.height ?? 0;
    width = Math.round(currentWidth * (percentage / 100));
    height = Math.round(currentHeight * (percentage / 100));
  }

  if (width !== undefined && width <= 0) {
    throw new Error("Resize width must be greater than 0");
  }
  if (height !== undefined && height <= 0) {
    throw new Error("Resize height must be greater than 0");
  }
  if (width === undefined && height === undefined) {
    throw new Error("Resize requires width, height, or percentage");
  }

  return image.resize({
    width,
    height,
    fit: fit ?? "cover",
    withoutEnlargement: withoutEnlargement ?? false,
  });
}
