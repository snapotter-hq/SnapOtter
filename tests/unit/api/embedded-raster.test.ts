import { describe, expect, it } from "vitest";
import { readEmbeddedRasterSize } from "../../../apps/api/src/lib/embedded-raster.js";

// Real 3x2 files written by sharp.
const b64 = (s: string) => Buffer.from(s, "base64");
const PNG = b64(
  "iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWP4z8DQAMMMyBwAeUMI+0cxNA0AAAAASUVORK5CYII=",
);
const JPEG = b64(
  "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCDgBlJf//Z",
);
const GIF = b64("R0lGODlhAwACAIAAAExpcf8AACH5BAUAAAAALAAAAAADAAIAAAICjF8AOw==");
const WEBP_LOSSY = b64(
  "UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoDAAIAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=",
);
const WEBP_LOSSLESS = b64("UklGRhwAAABXRUJQVlA4TA8AAAAvAkAAEAcQ/Y8CBiKi/wEA");
const WEBP_EXTENDED = b64(
  "UklGRloAAABXRUJQVlA4WAoAAAAQAAAAAgAAAQAAQUxQSAcAAAAAgICAgICAAFZQOCAsAAAAkAEAnQEqAwACAALATCWgAnS6AAOYAP7uQx/ubHOLcFf/bQ//Wh/+tD/pQAA=",
);

describe("readEmbeddedRasterSize", () => {
  it.each([
    ["png", PNG],
    ["jpeg", JPEG],
    ["gif", GIF],
    ["webp", WEBP_LOSSY],
    ["webp", WEBP_LOSSLESS],
    ["webp", WEBP_EXTENDED],
  ] as const)("reads the size of a %s", (type, bytes) => {
    expect(readEmbeddedRasterSize(type, bytes)).toEqual({ width: 3, height: 2 });
  });

  it.each([
    ["png", JPEG],
    ["jpeg", PNG],
    ["gif", WEBP_LOSSY],
    ["webp", GIF],
    ["png", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")],
  ] as const)("refuses bytes that are not a %s", (type, bytes) => {
    expect(readEmbeddedRasterSize(type, bytes)).toBeNull();
  });

  it.each([
    ["png", PNG.subarray(0, 20)],
    ["jpeg", JPEG.subarray(0, 100)],
    ["gif", GIF.subarray(0, 5)],
    ["webp", WEBP_LOSSY.subarray(0, 20)],
  ] as const)("refuses a truncated %s", (type, bytes) => {
    expect(readEmbeddedRasterSize(type, bytes)).toBeNull();
  });

  it("refuses a JPEG whose scan starts before any frame header", () => {
    const sos = Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 0, 0, 0, 0, 0, 0]);
    expect(readEmbeddedRasterSize("jpeg", sos)).toBeNull();
  });

  it("reads a GIF frame that runs past the logical screen", () => {
    // Screen 1x1, one 300x200 frame at the origin, then the trailer.
    const gif = Buffer.from([
      ...Buffer.from("GIF89a", "latin1"),
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      0x2c,
      0,
      0,
      0,
      0,
      0x2c,
      0x01,
      0xc8,
      0x00,
      0,
      2,
      0,
      0x3b,
    ]);
    expect(readEmbeddedRasterSize("gif", gif)).toEqual({ width: 300, height: 200 });
  });
});
