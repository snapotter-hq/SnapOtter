import type { Sharp } from "../types.js";

export type Matrix3x3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

type RecombCarrier = { options?: { recombMatrix?: unknown } };

export function readRecombMatrix(image: Sharp): Matrix3x3 | null {
  const flat = (image as unknown as RecombCarrier).options?.recombMatrix;
  if (flat === undefined) return null;
  if (!Array.isArray(flat) || flat.length !== 9 || !flat.every((n) => typeof n === "number")) {
    throw new Error("Expected Sharp options.recombMatrix to be a 9-number array");
  }
  return [
    [flat[0], flat[1], flat[2]],
    [flat[3], flat[4], flat[5]],
    [flat[6], flat[7], flat[8]],
  ];
}

export function multiplyMatrix3x3(a: Matrix3x3, b: Matrix3x3): Matrix3x3 {
  return [
    [
      a[0][0] * b[0][0] + a[0][1] * b[1][0] + a[0][2] * b[2][0],
      a[0][0] * b[0][1] + a[0][1] * b[1][1] + a[0][2] * b[2][1],
      a[0][0] * b[0][2] + a[0][1] * b[1][2] + a[0][2] * b[2][2],
    ],
    [
      a[1][0] * b[0][0] + a[1][1] * b[1][0] + a[1][2] * b[2][0],
      a[1][0] * b[0][1] + a[1][1] * b[1][1] + a[1][2] * b[2][1],
      a[1][0] * b[0][2] + a[1][1] * b[1][2] + a[1][2] * b[2][2],
    ],
    [
      a[2][0] * b[0][0] + a[2][1] * b[1][0] + a[2][2] * b[2][0],
      a[2][0] * b[0][1] + a[2][1] * b[1][1] + a[2][2] * b[2][1],
      a[2][0] * b[0][2] + a[2][1] * b[1][2] + a[2][2] * b[2][2],
    ],
  ];
}

function isMatrix3x3(matrix: unknown): matrix is Matrix3x3 {
  return (
    Array.isArray(matrix) &&
    matrix.length === 3 &&
    matrix.every(
      (row) =>
        Array.isArray(row) && row.length === 3 && row.every((cell) => typeof cell === "number"),
    )
  );
}

/**
 * Sharp stores a single recombMatrix slot per pipeline instance, so calling
 * .recomb() a second time overwrites the earlier matrix (#2608, #3121).
 * Left-multiply the new 3x3 matrix with any active recombMatrix on the instance.
 */
export function applyRecombMatrix(image: Sharp, matrix: Matrix3x3): Sharp {
  if (!isMatrix3x3(matrix)) {
    return image.recomb(matrix);
  }
  const prev = readRecombMatrix(image);
  return image.recomb(prev ? multiplyMatrix3x3(matrix, prev) : matrix);
}
