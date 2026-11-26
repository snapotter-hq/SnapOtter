import { gzipSync } from "node:zlib";
import { isToolInputError } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import {
  MAX_OPTIMIZE_SVG_BYTES,
  optimizeOnWorker,
  optimizeSvgBuffer,
  settingsSchema,
} from "../../../apps/api/src/routes/tools/optimize-svg.js";

const DEFAULTS = settingsSchema.parse({});

const VERBOSE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: Some Editor 1.0 -->
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <title>Badge</title>
  <desc>A long description of the badge</desc>
  <metadata><rdf>editor data</rdf></metadata>
  <g>
    <g>
      <rect x="10.123456" y="10.987654" width="80.555555" height="80.444444" fill="#ff0000"/>
    </g>
  </g>
  <path d="M 100.123456 10.000000 L 190.987654 10.000000 L 190.987654 90.000000 Z" fill="#0000ff"/>
</svg>
`;

async function run(
  input: string | Buffer,
  overrides: Partial<typeof DEFAULTS> = {},
  name = "badge.svg",
) {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  const result = await optimizeSvgBuffer(buf, { ...DEFAULTS, ...overrides }, name);
  return { ...result, text: result.buffer.toString("utf-8") };
}

/** A valid SVG whose path data is about `bytes` long: varied coordinates, so svgo has real work to do. */
function bigSvg(bytes: number): Buffer {
  let seed = 1;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * 100;
  };
  const segments: string[] = [];
  for (let size = 0; size < bytes; ) {
    const segment = ` L${next().toFixed(6)} ${next().toFixed(6)}`;
    segments.push(segment);
    size += segment.length;
  }
  const path = `<path d="M0 0${segments.join("")}"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${path}</svg>`);
}

describe("optimize-svg", () => {
  it("returns smaller SVG markup, not a raster", async () => {
    const out = await run(VERBOSE_SVG);
    expect(out.contentType).toBe("image/svg+xml");
    expect(out.filename).toBe("badge.svg");
    expect(out.text.startsWith("<svg")).toBe(true);
    expect(out.buffer.length).toBeLessThan(Buffer.byteLength(VERBOSE_SVG));
    expect(out.text).not.toContain("Generator");
    expect(out.text).not.toContain("<metadata");
  });

  it("keeps viewBox and title so the result still scales and keeps its name", async () => {
    const out = await run(VERBOSE_SVG);
    expect(out.text).toContain('viewBox="0 0 200 100"');
    expect(out.text).toContain("<title>Badge</title>");
  });

  it("rounds coordinates to the requested precision", async () => {
    const coarse = await run(VERBOSE_SVG, { precision: 0 });
    const fine = await run(VERBOSE_SVG, { precision: 5 });
    expect(coarse.text).not.toMatch(/\d\.\d/);
    expect(fine.text).toContain("10.12346");
  });

  it("keeps comments, desc and metadata when removeMetadata is off", async () => {
    const out = await run(VERBOSE_SVG, { removeMetadata: false });
    expect(out.text).toContain("Generator");
    expect(out.text).toContain("<desc>");
    expect(out.text).toContain("<metadata");
  });

  it("indents the output when pretty is on", async () => {
    const minified = await run(VERBOSE_SVG);
    const pretty = await run(VERBOSE_SVG, { pretty: true });
    expect(minified.text.trim().split("\n")).toHaveLength(1);
    expect(pretty.text.split("\n").length).toBeGreaterThan(2);
  });

  it("inflates .svgz input and writes plain .svg", async () => {
    const out = await run(gzipSync(Buffer.from(VERBOSE_SVG)), {}, "badge.svgz");
    expect(out.filename).toBe("badge.svg");
    expect(out.text).toContain('viewBox="0 0 200 100"');
  });

  it("sanitizes script out of the input", async () => {
    const out = await run(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><rect width="10" height="10"/></svg>',
    );
    expect(out.text).not.toMatch(/script|onload|alert/i);
    expect(out.text).toContain("<path");
  });

  it("applies the sanitizer's element cap before svgo can merge the elements away", async () => {
    const rects = '<rect width="1" height="1"/>'.repeat(6000);
    const err = await optimizeSvgBuffer(
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">${rects}</svg>`),
      DEFAULTS,
      "huge.svg",
    ).catch((e: unknown) => e);
    expect(isToolInputError(err)).toBe(true);
    expect((err as { code?: string }).code).toBe("SVG_TOO_LARGE");
  });

  it("refuses input over the optimize size cap before running svgo", async () => {
    const path = `<path d="M0 0${" L1 1".repeat(MAX_OPTIMIZE_SVG_BYTES / 5)}"/>`;
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">${path}</svg>`,
    );
    const err = await optimizeSvgBuffer(svg, DEFAULTS, "big.svg").catch((e: unknown) => e);
    expect(isToolInputError(err)).toBe(true);
    expect((err as { code?: string }).code).toBe("SVG_TOO_LARGE");
  });

  it("applies the size cap to the inflated size of .svgz input", async () => {
    const path = `<path d="M0 0${" L1 1".repeat(MAX_OPTIMIZE_SVG_BYTES / 5)}"/>`;
    const svgz = gzipSync(
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">${path}</svg>`),
    );
    expect(svgz.length).toBeLessThan(MAX_OPTIMIZE_SVG_BYTES);
    const err = await optimizeSvgBuffer(svgz, DEFAULTS, "big.svgz").catch((e: unknown) => e);
    expect((err as { code?: string }).code).toBe("SVG_TOO_LARGE");
  });

  it("refuses input that is not SVG as a client error", async () => {
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    const err = await optimizeSvgBuffer(png, DEFAULTS, "photo.png").catch((e: unknown) => e);
    expect(isToolInputError(err)).toBe(true);
  });

  it("refuses SVG markup the parser rejects as a client error", async () => {
    const err = await optimizeSvgBuffer(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>'),
      DEFAULTS,
      "broken.svg",
    ).catch((e: unknown) => e);
    expect(isToolInputError(err)).toBe(true);
  });

  it("rejects out-of-range precision at the settings boundary", () => {
    expect(settingsSchema.safeParse({ precision: 9 }).success).toBe(false);
    expect(settingsSchema.safeParse({ precision: 1.5 }).success).toBe(false);
  });

  it("keeps the event loop responsive while svgo runs", { timeout: 60_000 }, async () => {
    let worstGapMs = 0;
    let last = performance.now();
    const ticker = setInterval(() => {
      const now = performance.now();
      worstGapMs = Math.max(worstGapMs, now - last);
      last = now;
    }, 10);
    try {
      // Synchronous svgo on 3 MB of path data holds the loop for about a second.
      await optimizeSvgBuffer(bigSvg(3 * 1024 * 1024), DEFAULTS, "big.svg");
      // Blocking work finishes before any timer runs, so let the ticker fire once
      // to record the stall; the 1 ms timeout is due after it.
      await new Promise((resolve) => setTimeout(resolve, 1));
    } finally {
      clearInterval(ticker);
    }
    expect(worstGapMs).toBeLessThan(200);
  });

  it("optimizes an SVG larger than the old 2 MB cap", async () => {
    const out = await run(bigSvg(3 * 1024 * 1024));
    expect(out.text.startsWith("<svg")).toBe(true);
  }, 60_000);

  it("answers a client error when svgo overruns its deadline", async () => {
    const input = bigSvg(1024 * 1024).toString("utf-8");
    const err = await optimizeOnWorker(input, {}, 50).catch((e: unknown) => e);
    expect(isToolInputError(err)).toBe(true);
    expect((err as { code?: string }).code).toBe("SVG_TOO_LARGE");
  });
});
