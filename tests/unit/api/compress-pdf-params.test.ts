import { describe, expect, it } from "vitest";
import { paramsForQuality } from "../../../apps/api/src/routes/tools/compress-pdf.js";

describe("paramsForQuality", () => {
  it("endpoints: q=100 preserves resolution at best quality; q=1 is smallest but stays legible", () => {
    const hi = paramsForQuality(100);
    expect(hi.dpi).toBe(300);
    expect(hi.qFactor).toBeCloseTo(0.1, 2);
    const lo = paramsForQuality(1);
    expect(lo.dpi).toBeGreaterThanOrEqual(150);
    expect(lo.dpi).toBeLessThan(300);
    expect(lo.qFactor).toBeGreaterThan(2.0);
  });

  it("never asks Ghostscript to downsample below the 150 dpi legibility floor (#1086)", () => {
    // 26 dpi turns 10.5pt body text on a 300 dpi scan into blocks: the reporter
    // saw butchered text, and OCR of the result matched well under half the
    // source words. 150 dpi is Ghostscript's own /ebook floor and keeps
    // scanned text readable.
    for (let q = 1; q <= 100; q++) {
      expect(paramsForQuality(q).dpi).toBeGreaterThanOrEqual(150);
      expect(paramsForQuality(q).dpi).toBeLessThanOrEqual(300);
    }
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
