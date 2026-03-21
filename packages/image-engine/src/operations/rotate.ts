import type { Sharp, RotateOptions } from "../types.js";

export async function rotate(image: Sharp, options: RotateOptions): Promise<Sharp> {
  const { angle, background } = options;

  const isMultipleOf90 = angle % 90 === 0;

  if (isMultipleOf90) {
    return image.rotate(angle);
  }

  return image.rotate(angle, {
    background: background ?? "#000000",
  });
}
