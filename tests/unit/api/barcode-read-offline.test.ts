import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initZXingReader } from "../../../apps/api/src/routes/tools/barcode-read.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

// Load ESM zxing-wasm reader module instance
const { purgeZXingModule, readBarcodes } = await import(
  new URL("../../../apps/api/node_modules/zxing-wasm/dist/es/reader/index.js", import.meta.url).href
);

async function decodeQrFixture() {
  const buf = readFixture(fixtures.image.code.qrPng);
  const image = sharp(buf);
  const meta = await image.metadata();
  const rawData = await image.ensureAlpha().raw().toBuffer();

  const imageData = {
    data: new Uint8ClampedArray(rawData.buffer, rawData.byteOffset, rawData.length),
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  } as ImageData;

  return readBarcodes(imageData);
}

function blockFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    throw new Error("Network request blocked in offline environment");
  });
}

describe("barcode-read offline wasm loading (#1385)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Ensure module is left in configured state with local wasm via production helper
    initZXingReader();
  });

  it("verifies unconfigured zxing-wasm attempts a remote fetch", async () => {
    purgeZXingModule();

    let fetchedUrl = "";
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      fetchedUrl = String(url);
      return Promise.reject(new Error("Network request blocked"));
    });

    const dummyImg = {
      data: new Uint8ClampedArray(16 * 16 * 4).fill(255),
      width: 16,
      height: 16,
    } as ImageData;

    await expect(readBarcodes(dummyImg)).rejects.toThrow();
    expect(fetchedUrl).toMatch(/^https?:\/\/.*zxing_reader\.wasm$/);
  });

  it("configures the local wasm when the route module is imported", async () => {
    purgeZXingModule();

    // Re-evaluate the route so only its module-scope setup can configure zxing.
    vi.resetModules();
    await import("../../../apps/api/src/routes/tools/barcode-read.js");

    const fetchSpy = blockFetch();
    const results = await decodeQrFixture();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(results[0]?.text).toBe("https://snapotter.com");
  });

  it("decodes barcodes with fetch blocked after initZXingReader", async () => {
    purgeZXingModule();
    initZXingReader();

    const fetchSpy = blockFetch();
    const results = await decodeQrFixture();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].text).toBe("https://snapotter.com");
    expect(results[0].format).toBe("QRCode");
  });
});
