import path from "node:path";
import { qoiDecode, qoiEncode } from "@snapotter/image-engine";
import { describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";

describe("QOI codec", () => {
  it("round-trips RGBA pixel data", () => {
    const w = 4,
      h = 4;
    const pixels = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      pixels[i * 4] = (i * 17) & 0xff;
      pixels[i * 4 + 1] = (i * 31) & 0xff;
      pixels[i * 4 + 2] = (i * 53) & 0xff;
      pixels[i * 4 + 3] = 255;
    }
    const encoded = qoiEncode(pixels, w, h, 4);
    const { header, pixels: decoded } = qoiDecode(encoded);
    expect(header.width).toBe(w);
    expect(header.height).toBe(h);
    for (let i = 0; i < w * h * 4; i++) expect(decoded[i]).toBe(pixels[i]);
  });

  it("encodes 3-channel data", () => {
    const w = 3,
      h = 3;
    const pixels = new Uint8Array(w * h * 3);
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 41) & 0xff;
    const encoded = qoiEncode(pixels, w, h, 3);
    const { header, pixels: decoded } = qoiDecode(encoded);
    expect(header.channels).toBe(3);
    for (let i = 0; i < w * h; i++) {
      expect(decoded[i * 4 + 3]).toBe(255);
    }
  });

  it("writes correct header magic", () => {
    const encoded = qoiEncode(new Uint8Array(4), 1, 1, 4);
    const view = new DataView(encoded.buffer, encoded.byteOffset);
    expect(view.getUint32(0)).toBe(0x716f6966);
  });

  it("writes correct header dimensions", () => {
    const encoded = qoiEncode(new Uint8Array(20 * 15 * 4), 20, 15, 4);
    const view = new DataView(encoded.buffer, encoded.byteOffset);
    expect(view.getUint32(4)).toBe(20);
    expect(view.getUint32(8)).toBe(15);
    expect(encoded[12]).toBe(4);
  });

  it("round-trips 1x1 image", () => {
    const pixels = new Uint8Array([42, 128, 200, 255]);
    const { pixels: decoded } = qoiDecode(qoiEncode(pixels, 1, 1, 4));
    expect(decoded[0]).toBe(42);
    expect(decoded[3]).toBe(255);
  });

  it("round-trips solid color image", () => {
    const w = 8,
      h = 8;
    const pixels = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      pixels[i * 4] = 100;
      pixels[i * 4 + 1] = 150;
      pixels[i * 4 + 2] = 200;
      pixels[i * 4 + 3] = 255;
    }
    const { pixels: decoded } = qoiDecode(qoiEncode(pixels, w, h, 4));
    for (let i = 0; i < pixels.length; i++) expect(decoded[i]).toBe(pixels[i]);
  });

  it("compresses solid color efficiently", () => {
    const w = 100,
      h = 100;
    const pixels = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      pixels[i * 4] = 50;
      pixels[i * 4 + 1] = 100;
      pixels[i * 4 + 2] = 150;
      pixels[i * 4 + 3] = 255;
    }
    const encoded = qoiEncode(pixels, w, h, 4);
    expect(encoded.length).toBeLessThan(pixels.length / 10);
  });

  it("round-trips gradient", () => {
    const w = 16,
      h = 1;
    const pixels = new Uint8Array(w * 4);
    for (let i = 0; i < w; i++) {
      const v = Math.round((i / (w - 1)) * 255);
      pixels[i * 4] = v;
      pixels[i * 4 + 1] = v;
      pixels[i * 4 + 2] = v;
      pixels[i * 4 + 3] = 255;
    }
    const { pixels: decoded } = qoiDecode(qoiEncode(pixels, w, h, 4));
    for (let i = 0; i < pixels.length; i++) expect(decoded[i]).toBe(pixels[i]);
  });

  it("round-trips random-ish data", () => {
    const w = 10,
      h = 10;
    const pixels = new Uint8Array(w * h * 4);
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 97 + 53) & 0xff;
    const { pixels: decoded } = qoiDecode(qoiEncode(pixels, w, h, 4));
    for (let i = 0; i < pixels.length; i++) expect(decoded[i]).toBe(pixels[i]);
  });

  it("round-trips varying alpha", () => {
    const pixels = new Uint8Array([
      100, 150, 200, 0, 100, 150, 200, 128, 100, 150, 200, 255, 0, 0, 0, 0,
    ]);
    const { pixels: decoded } = qoiDecode(qoiEncode(pixels, 4, 1, 4));
    for (let i = 0; i < pixels.length; i++) expect(decoded[i]).toBe(pixels[i]);
  });

  it("throws on invalid magic", () => {
    expect(() => qoiDecode(new Uint8Array(20))).toThrow();
  });

  it("throws on zero width", () => {
    const buf = new Uint8Array(14);
    const v = new DataView(buf.buffer);
    v.setUint32(0, 0x716f6966);
    v.setUint32(4, 0);
    v.setUint32(8, 1);
    buf[12] = 4;
    expect(() => qoiDecode(buf)).toThrow();
  });

  it("throws on zero height", () => {
    const buf = new Uint8Array(14);
    const v = new DataView(buf.buffer);
    v.setUint32(0, 0x716f6966);
    v.setUint32(4, 1);
    v.setUint32(8, 0);
    buf[12] = 4;
    expect(() => qoiDecode(buf)).toThrow();
  });

  it("throws on invalid channels", () => {
    const buf = new Uint8Array(14);
    const v = new DataView(buf.buffer);
    v.setUint32(0, 0x716f6966);
    v.setUint32(4, 1);
    v.setUint32(8, 1);
    buf[12] = 5;
    expect(() => qoiDecode(buf)).toThrow();
  });

  it("ends with correct end marker", () => {
    const encoded = qoiEncode(new Uint8Array([1, 2, 3, 255]), 1, 1, 4);
    expect(Array.from(encoded.slice(-8))).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
  });

  it("decodes real fixture with correct header", () => {
    const data = readFixture(fixtures.image.formats("qoi"));
    const { header } = qoiDecode(new Uint8Array(data));
    expect(header.width).toBe(10);
    expect(header.height).toBe(10);
    expect(header.channels).toBe(4);
  });

  it("re-encodes real fixture with matching pixels", () => {
    const data = readFixture(fixtures.image.formats("qoi"));
    const { header, pixels } = qoiDecode(new Uint8Array(data));
    const reEncoded = qoiEncode(pixels, header.width, header.height, 4);
    const { pixels: reDecoded } = qoiDecode(reEncoded);
    for (let i = 0; i < pixels.length; i++) expect(reDecoded[i]).toBe(pixels[i]);
  });
});
