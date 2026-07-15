import { describe, expect, it } from "vitest";
import { paramsForQuality } from "../../../apps/api/src/routes/tools/compress-pdf.js";

describe("paramsForQuality", () => {
  it("endpoints: q=100 preserves resolution at best quality; q=1 is smallest", () => {
    const hi = paramsForQuality(100);
    expect(hi.dpi).toBe(300);
    expect(hi.qFactor).toBeCloseTo(0.1, 2);
    const lo = paramsForQuality(1);
    expect(lo.dpi).toBeLessThanOrEqual(30);
    expect(lo.qFactor).toBeGreaterThan(2.0);
  });

  it("is monotonic in size: dpi non-decreasing and qFactor non-increasing as q rises", () => {
    let prevDpi = 0;
    let prevQf = Number.POSITIVE_INFINITY;
    for (let q = 1; q <= 100; q++) {
      const { dpi, qFactor } = paramsForQuality(q);
      expect(dpi).toBeGreaterThanOrEqual(prevDpi);
      expect(qFactor).toBeLessThanOrEqual(prevQf + 1e-9);
      prevDpi = dpi;
      prevQf = qFactor;
    }
  });

  it("clamps out-of-range input", () => {
    expect(paramsForQuality(0)).toEqual(paramsForQuality(1));
    expect(paramsForQuality(200)).toEqual(paramsForQuality(100));
  });
});
