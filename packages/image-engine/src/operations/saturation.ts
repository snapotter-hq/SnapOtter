import type { Sharp, SaturationOptions } from "../types.js";

export async function saturation(image: Sharp, options: SaturationOptions): Promise<Sharp> {
  const { value } = options;

  if (value < -100 || value > 100) {
    throw new Error("Saturation value must be between -100 and +100");
  }

  // Map -100..+100 to 0..2 where 1.0 = no change
  // -100 -> 0 (grayscale), 0 -> 1 (no change), +100 -> 2 (double saturation)
  const multiplier = 1 + value / 100;

  return image.modulate({ saturation: multiplier });
}
