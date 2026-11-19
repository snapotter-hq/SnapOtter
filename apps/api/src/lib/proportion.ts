/**
 * Rule-of-three solver for the proportion-calculator tool. Pure so the route
 * stays a thin shell and the arithmetic edge cases are unit-testable.
 */

export const PROPORTION_MODES = ["direct", "inverse"] as const;

export type ProportionMode = (typeof PROPORTION_MODES)[number];

export type ProportionResult =
  | { ok: true; x: number }
  | { ok: false; reason: "zero-divisor" | "out-of-range" };

// Doubles carry about 15.9 significant decimal digits, so rounding to 15 drops
// noise like 0.10000000000000002 without losing anything a person typed.
const SIGNIFICANT_DIGITS = 15;

// Smallest positive double with full precision. Below it a value is subnormal
// and has already lost digits.
const MIN_NORMAL = 2.2250738585072014e-308;

function isNormal(v: number): boolean {
  return Number.isFinite(v) && Math.abs(v) >= MIN_NORMAL;
}

/**
 * Solve for X. Direct: A is to B as C is to X, so X = B * C / A. Inverse:
 * A * B = C * X, so X = A * B / C.
 */
export function solveProportion(
  a: number,
  b: number,
  c: number,
  mode: ProportionMode,
): ProportionResult {
  const divisor = mode === "direct" ? a : c;
  if (divisor === 0) return { ok: false, reason: "zero-divisor" };
  const [p, q] = mode === "direct" ? [b, c] : [a, b];
  if (p === 0 || q === 0) return { ok: true, x: 0 };
  // p * q / d can overflow or underflow in the middle even when the answer
  // fits (1e200 * 1e200 / 1e200), so take the first grouping whose
  // intermediate and result both stay normal.
  const groupings: Array<[number, (v: number) => number]> = [
    [p * q, (v) => v / divisor],
    [p / divisor, (v) => v * q],
    [q / divisor, (v) => v * p],
  ];
  for (const [intermediate, finish] of groupings) {
    if (!isNormal(intermediate)) continue;
    const x = finish(intermediate);
    if (!isNormal(x)) continue;
    const rounded = Number(x.toPrecision(SIGNIFICANT_DIGITS));
    // Rounding the top of the range to 15 digits can carry past MAX_VALUE.
    return { ok: true, x: Number.isFinite(rounded) ? rounded : x };
  }
  return { ok: false, reason: "out-of-range" };
}
