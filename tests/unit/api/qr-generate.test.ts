import Fastify from "fastify";
import QRCode from "qrcode";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const putObject = vi.fn();

vi.mock("../../../apps/api/src/lib/object-storage.js", () => ({
  putObject: (...args: unknown[]) => putObject(...args),
}));

import { registerQrGenerate } from "../../../apps/api/src/routes/tools/qr-generate.js";

async function buildApp() {
  const app = Fastify();
  registerQrGenerate(app);
  await app.ready();
  return app;
}

describe("qr-generate route (#3604)", () => {
  beforeEach(() => {
    putObject.mockReset();
    putObject.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a 10000x10000 QR code via Sharp nearest-neighbor scaling without calling QRCode.toBuffer", async () => {
    const toBufferSpy = vi.spyOn(QRCode, "toBuffer");
    const app = await buildApp();

    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/qr-generate",
        payload: {
          text: "max size",
          size: 10000,
          foreground: "#112233",
          background: "#DDEEFF",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(toBufferSpy).not.toHaveBeenCalled();
      expect(putObject).toHaveBeenCalledTimes(1);

      const storedBuffer = putObject.mock.calls[0]?.[1] as Buffer;
      const meta = await sharp(storedBuffer).metadata();
      expect(meta.format).toBe("png");
      expect(meta.width).toBe(10000);
      expect(meta.height).toBe(10000);
    } finally {
      await app.close();
    }
  });

  it("maps asymmetric foreground and background RGB channels accurately across quiet zone and finder modules", async () => {
    const app = await buildApp();

    try {
      // Version 1 QR ("max size" at EC level M is 21x21 modules; + 2*2 quiet zone = 25x25 grid).
      // At size 250, each module is exactly 10x10 pixels.
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/qr-generate",
        payload: {
          text: "max size",
          size: 250,
          errorCorrection: "M",
          foreground: "#112233",
          background: "#DDEEFF",
        },
      });

      expect(res.statusCode).toBe(200);
      const storedBuffer = putObject.mock.calls[0]?.[1] as Buffer;
      const { data, info } = await sharp(storedBuffer).raw().toBuffer({ resolveWithObject: true });
      expect(info.width).toBe(250);
      expect(info.height).toBe(250);

      const pixelAt = (x: number, y: number) => {
        const idx = (y * info.width + x) * info.channels;
        return [data[idx], data[idx + 1], data[idx + 2]];
      };

      // Quiet zone at module (0, 0) -> pixel (5, 5) must be background #DDEEFF
      expect(pixelAt(5, 5)).toEqual([0xdd, 0xee, 0xff]);
      // Top-left finder outer border at module (2, 2) -> pixel (25, 25) must be foreground #112233
      expect(pixelAt(25, 25)).toEqual([0x11, 0x22, 0x33]);
      // Top-left finder inner ring at module (3, 3) -> pixel (35, 35) must be background #DDEEFF
      expect(pixelAt(35, 35)).toEqual([0xdd, 0xee, 0xff]);
      // Top-left finder center at module (4, 4) -> pixel (45, 45) must be foreground #112233
      expect(pixelAt(45, 45)).toEqual([0x11, 0x22, 0x33]);
    } finally {
      await app.close();
    }
  });

  it("composites a centered logo onto the resized QR code and forces error correction H", async () => {
    const createSpy = vi.spyOn(QRCode, "create");
    const logoPng = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const logoDataUri = `data:image/png;base64,${logoPng.toString("base64")}`;
    const app = await buildApp();

    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/qr-generate",
        payload: {
          text: "logo test",
          size: 400,
          errorCorrection: "L",
          logoDataUri,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(createSpy).toHaveBeenCalledWith("logo test", { errorCorrectionLevel: "H" });

      const storedBuffer = putObject.mock.calls[0]?.[1] as Buffer;
      const { data, info } = await sharp(storedBuffer).raw().toBuffer({ resolveWithObject: true });
      expect(info.width).toBe(400);
      expect(info.height).toBe(400);

      // Center pixel (200, 200) must be the red logo
      const centerIdx = (200 * 400 + 200) * info.channels;
      expect(data[centerIdx]).toBe(255);
      expect(data[centerIdx + 1]).toBe(0);
      expect(data[centerIdx + 2]).toBe(0);

      // Top-left quiet-zone pixel (0, 0) must be the default white background
      expect(data[0]).toBe(255);
      expect(data[1]).toBe(255);
      expect(data[2]).toBe(255);
    } finally {
      await app.close();
    }
  });

  it("returns 400 when logoDataUri is not a valid decodable image", async () => {
    const app = await buildApp();

    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/qr-generate",
        payload: {
          text: "bad logo",
          logoDataUri: "data:image/png;base64,bm90LWEtcmVhbC1pbWFnZQ==",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "Invalid logo image" });
      expect(putObject).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});

describe("qr-generate capacity per error-correction level (#4402)", () => {
  beforeEach(() => {
    putObject.mockReset();
    putObject.mockResolvedValue(undefined);
  });

  async function post(payload: Record<string, unknown>) {
    const app = await buildApp();
    try {
      return await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/qr-generate",
        payload,
      });
    } finally {
      await app.close();
    }
  }

  it("accepts byte-mode text at exactly the level H capacity", async () => {
    const res = await post({ text: "a".repeat(1273), errorCorrection: "H" });
    expect(res.statusCode).toBe(200);
  });

  it.each([
    ["L", 2953],
    ["M", 2331],
    ["Q", 1663],
    ["H", 1273],
  ] as const)(
    "returns 400 naming the %s limit when byte-mode text overflows it",
    async (level, limit) => {
      // Level L and M overflow only past the 2000-character cap, so use 2-byte characters there.
      const text = limit < 2000 ? "a".repeat(limit + 1) : "é".repeat(Math.ceil((limit + 1) / 2));
      const bytes = Buffer.byteLength(text, "utf8");
      const res = await post({ text, errorCorrection: level });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        error: "Invalid settings",
        details: `text: ${bytes} bytes is too long for error correction level ${level}, which holds at most ${limit} bytes of general text (more if it is only digits or uppercase letters). ${level === "L" ? "Shorten the text." : "Shorten the text or choose a lower error correction level."}`,
      });
      expect(putObject).not.toHaveBeenCalled();
    },
  );

  it("names level H when a logo forces it, even if a lower level was requested", async () => {
    const res = await post({
      text: "a".repeat(1274),
      errorCorrection: "L",
      logoDataUri:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().details).toBe(
      "text: 1274 bytes is too long for error correction level H, which holds at most 1273 bytes of general text (more if it is only digits or uppercase letters). A logo always uses level H. Shorten the text or remove the logo.",
    );
  });

  it("maps an alphanumeric-mode overflow to the same 400, past the denser alphanumeric limit", async () => {
    // Uppercase alphanumeric text holds 1852 characters at level H, more than the 1273-byte figure.
    const fits = await post({ text: "A".repeat(1852), errorCorrection: "H" });
    expect(fits.statusCode).toBe(200);

    const res = await post({ text: "A".repeat(1853), errorCorrection: "H" });
    expect(res.statusCode).toBe(400);
    expect(res.json().details).toContain("more if it is only digits or uppercase letters");
  });

  it("still accepts numeric text longer than the byte-mode limit, since numeric mode packs denser", async () => {
    const res = await post({ text: "1".repeat(2000), errorCorrection: "H" });
    expect(res.statusCode).toBe(200);
  });
});
