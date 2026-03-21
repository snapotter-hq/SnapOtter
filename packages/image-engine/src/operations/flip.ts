import type { Sharp, FlipOptions } from "../types.js";

export async function flip(image: Sharp, options: FlipOptions): Promise<Sharp> {
  const { horizontal, vertical } = options;

  if (!horizontal && !vertical) {
    throw new Error("Flip requires at least one of horizontal or vertical");
  }

  let result = image;

  if (horizontal) {
    result = result.flop();
  }

  if (vertical) {
    result = result.flip();
  }

  return result;
}
