import type { Sharp, ContrastOptions } from "../types.js";

export async function contrast(image: Sharp, options: ContrastOptions): Promise<Sharp> {
  const { value } = options;

  if (value < -100 || value > 100) {
    throw new Error("Contrast value must be between -100 and +100");
  }

  // Map -100..+100 to linear transform
  // slope = 1 + (value/100), e.g. -100 -> 0, 0 -> 1, +100 -> 2
  // intercept centers the adjustment around middle gray (128)
  const slope = 1 + value / 100;
  const intercept = 128 * (1 - slope);

  return image.linear(slope, intercept);
}
