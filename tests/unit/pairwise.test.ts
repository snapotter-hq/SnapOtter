import { describe, expect, it } from "vitest";
import { pairwise } from "../helpers/pairwise.js";

describe("pairwise covering-array generator", () => {
  it("covers every pair of values across all axis pairs", () => {
    const axes = [
      { key: "fit", values: ["contain", "cover", "fill", "inside"] },
      { key: "format", values: ["png", "jpeg", "webp"] },
      { key: "withMetadata", values: [true, false] },
      { key: "quality", values: [1, 50, 100] },
    ];
    const cases = pairwise(axes);

    for (let i = 0; i < axes.length; i++) {
      for (let j = i + 1; j < axes.length; j++) {
        for (const vi of axes[i].values) {
          for (const vj of axes[j].values) {
            const covered = cases.some((c) => c[axes[i].key] === vi && c[axes[j].key] === vj);
            expect(covered, `pair ${axes[i].key}=${vi} x ${axes[j].key}=${vj} not covered`).toBe(
              true,
            );
          }
        }
      }
    }
  });

  it("produces far fewer cases than the full cartesian product", () => {
    const axes = [
      { key: "a", values: [1, 2, 3, 4] },
      { key: "b", values: [1, 2, 3] },
      { key: "c", values: [true, false] },
      { key: "d", values: ["x", "y", "z"] },
    ];
    const cases = pairwise(axes);
    // Cartesian product is 72; pairwise needs at least 12 (largest axis pair).
    expect(cases.length).toBeGreaterThanOrEqual(12);
    expect(cases.length).toBeLessThan(30);
  });

  it("is deterministic", () => {
    const axes = [
      { key: "a", values: [1, 2, 3] },
      { key: "b", values: ["x", "y"] },
      { key: "c", values: [true, false] },
    ];
    expect(pairwise(axes)).toEqual(pairwise(axes));
  });

  it("handles degenerate inputs", () => {
    expect(pairwise([])).toEqual([]);
    expect(pairwise([{ key: "only", values: [1, 2] }])).toEqual([{ only: 1 }, { only: 2 }]);
  });
});
