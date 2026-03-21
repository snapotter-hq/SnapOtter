import type { Sharp } from "../types.js";

export async function grayscale(image: Sharp): Promise<Sharp> {
  return image.grayscale();
}
