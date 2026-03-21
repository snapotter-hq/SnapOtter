import type { Sharp, BrightnessOptions } from "../types.js";

export async function brightness(image: Sharp, options: BrightnessOptions): Promise<Sharp> {
  const { value } = options;

  if (value < -100 || value > 100) {
    throw new Error("Brightness value must be between -100 and +100");
  }

  // Map -100..+100 to 0..2 where 1.0 = no change
  // -100 -> 0, 0 -> 1, +100 -> 2
  const multiplier = 1 + value / 100;

  return image.modulate({ brightness: multiplier });
}
