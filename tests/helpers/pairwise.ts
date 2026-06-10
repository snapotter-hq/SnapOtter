import type { PictAxis } from "./zod-pict.js";

/**
 * Deterministic greedy pairwise (order-2) covering-array generator.
 *
 * Guarantees that every pair of values from any two axes appears in at least
 * one generated case, which is the standard interaction-coverage target.
 * In-repo and dependency-free on purpose: the natural alternative (pict-node)
 * compiles Microsoft PICT from C++ at install time, which breaks on machines
 * without a working native toolchain. For our axis counts (<= ~10 per tool)
 * the greedy construction is within a few cases of PICT's optimum.
 *
 * Determinism matters: same axes in, same cases out, so CI runs are
 * reproducible. No randomness is used anywhere.
 */
export function pairwise(axes: PictAxis[]): Record<string, unknown>[] {
  if (axes.length === 0) return [];
  if (axes.length === 1) {
    return axes[0].values.map((v) => ({ [axes[0].key]: v }));
  }

  // Track uncovered pairs by value indexes: "i|j|a|b" with i < j.
  const uncovered = new Set<string>();
  for (let i = 0; i < axes.length; i++) {
    for (let j = i + 1; j < axes.length; j++) {
      for (let a = 0; a < axes[i].values.length; a++) {
        for (let b = 0; b < axes[j].values.length; b++) {
          uncovered.add(`${i}|${j}|${a}|${b}`);
        }
      }
    }
  }

  const pairKey = (x: number, vx: number, y: number, vy: number): string =>
    x < y ? `${x}|${y}|${vx}|${vy}` : `${y}|${x}|${vy}|${vx}`;

  const cases: number[][] = [];
  while (uncovered.size > 0) {
    // Seed the case with the first uncovered pair (insertion order is stable).
    const seed = uncovered.values().next().value as string;
    const [i, j, a, b] = seed.split("|").map(Number);
    const chosen: number[] = new Array(axes.length).fill(-1);
    chosen[i] = a;
    chosen[j] = b;

    // Fill the remaining axes greedily: pick the value covering the most
    // still-uncovered pairs against the axes already chosen.
    for (let k = 0; k < axes.length; k++) {
      if (chosen[k] !== -1) continue;
      let bestValue = 0;
      let bestScore = -1;
      for (let v = 0; v < axes[k].values.length; v++) {
        let score = 0;
        for (let m = 0; m < axes.length; m++) {
          if (chosen[m] === -1 || m === k) continue;
          if (uncovered.has(pairKey(k, v, m, chosen[m]))) score++;
        }
        if (score > bestScore) {
          bestScore = score;
          bestValue = v;
        }
      }
      chosen[k] = bestValue;
    }

    for (let x = 0; x < axes.length; x++) {
      for (let y = x + 1; y < axes.length; y++) {
        uncovered.delete(`${x}|${y}|${chosen[x]}|${chosen[y]}`);
      }
    }
    cases.push(chosen);
  }

  return cases.map((indexes) =>
    Object.fromEntries(axes.map((axis, k) => [axis.key, axis.values[indexes[k]]])),
  );
}
