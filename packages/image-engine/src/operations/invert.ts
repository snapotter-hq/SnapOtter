import type { Sharp } from "../types.js";

export async function invert(image: Sharp): Promise<Sharp> {
  return image.negate();
}
