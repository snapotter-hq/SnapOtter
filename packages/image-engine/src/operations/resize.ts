import type { ResizeOptions, Sharp } from "../types.js";

export async function resize(image: Sharp, options: ResizeOptions): Promise<Sharp> {
  let { width, height, fit, withoutEnlargement, percentage } = options;

  if (percentage !== undefined) {
    if (percentage <= 0) {
      throw new Error("Resize percentage must be greater than 0");
    }
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("Cannot determine image dimensions for percentage resize");
    }
    width = Math.max(1, Math.round(metadata.width * (percentage / 100)));
    height = Math.max(1, Math.round(metadata.height * (percentage / 100)));
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

  if (withoutEnlargement) {
    const meta = await image.metadata();
    if (!meta.width || !meta.height) {
      throw new Error("Cannot determine image dimensions for resize clamping");
    }
    if (width !== undefined && width > meta.width) width = meta.width;
    if (height !== undefined && height > meta.height) height = meta.height;
  }

  return image.resize({
    width,
    height,
    fit: fit ?? "cover",
    withoutEnlargement: withoutEnlargement ?? false,
  });
}
