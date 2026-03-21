import type { Sharp } from "../types.js";

// Standard sepia tone matrix
const SEPIA_MATRIX: [
  [number, number, number],
  [number, number, number],
  [number, number, number],
] = [
  [0.393, 0.769, 0.189],
  [0.349, 0.686, 0.168],
  [0.272, 0.534, 0.131],
];

export async function sepia(image: Sharp): Promise<Sharp> {
  return image.recomb(SEPIA_MATRIX);
}
