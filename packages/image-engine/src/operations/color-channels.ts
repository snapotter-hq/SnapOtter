import type { ColorChannelOptions, Sharp } from "../types.js";
import { applyRecombMatrix, type Matrix3x3 } from "../utils/recomb.js";

export async function colorChannels(image: Sharp, options: ColorChannelOptions): Promise<Sharp> {
  const { red, green, blue } = options;

  if (red < 0 || red > 200) {
    throw new Error("Red channel value must be between 0 and 200");
  }
  if (green < 0 || green > 200) {
    throw new Error("Green channel value must be between 0 and 200");
  }
  if (blue < 0 || blue > 200) {
    throw new Error("Blue channel value must be between 0 and 200");
  }

  // Map 0-200 to 0-2 multipliers on the diagonal of a 3x3 recomb matrix
  const rMul = red / 100;
  const gMul = green / 100;
  const bMul = blue / 100;

  const matrix: Matrix3x3 = [
    [rMul, 0, 0],
    [0, gMul, 0],
    [0, 0, bMul],
  ];

  return applyRecombMatrix(image, matrix);
}
