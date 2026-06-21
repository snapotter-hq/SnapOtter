import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  generateBackground,
  getDominantBackground,
} from "../../../apps/api/src/lib/beautify/backgrounds.js";

describe("generateBackground", () => {
  it("generates a solid color background", async () => {
    const buf = await generateBackground({
      type: "solid",
      color: "#ff0000",
      width: 200,
      height: 100,
    });
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(100);
    expect(meta.channels).toBe(4);
  });

  it("generates a linear gradient background", async () => {
    const buf = await generateBackground({
      type: "linear-gradient",
      stops: [
        { color: "#667eea", position: 0 },
        { color: "#764ba2", position: 100 },
      ],
      angle: 135,
      width: 400,
      height: 300,
    });
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it("generates a radial gradient background", async () => {
    const buf = await generateBackground({
      type: "radial-gradient",
      stops: [
        { color: "#667eea", position: 0 },
        { color: "#764ba2", position: 100 },
      ],
      width: 400,
      height: 300,
    });
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it("generates a transparent background", async () => {
    const buf = await generateBackground({
      type: "transparent",
      width: 200,
      height: 100,
    });
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(100);
    expect(meta.hasAlpha).toBe(true);
  });

  it("generates an image background", async () => {
    const red = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const buf = await generateBackground({
      type: "image",
      imageBuffer: red,
      width: 400,
      height: 300,
    });
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it("generates multi-stop linear gradient", async () => {
    const buf = await generateBackground({
      type: "linear-gradient",
      stops: [
        { color: "#0f0c29", position: 0 },
        { color: "#302b63", position: 50 },
        { color: "#24243e", position: 100 },
      ],
      angle: 135,
      width: 400,
      height: 300,
    });
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });
});

describe("getDominantBackground", () => {
  it("returns solid color for solid type", () => {
    const result = getDominantBackground({ type: "solid", color: "#ff0000" });
    expect(result).toEqual({ r: 255, g: 0, b: 0, alpha: 1 });
  });

  it("returns last gradient stop for gradient type", () => {
    const result = getDominantBackground({
      type: "linear-gradient",
      stops: [
        { color: "#667eea", position: 0 },
        { color: "#764ba2", position: 100 },
      ],
    });
    expect(result.r).toBe(118);
    expect(result.g).toBe(75);
    expect(result.b).toBe(162);
  });

  it("returns transparent for transparent type", () => {
    const result = getDominantBackground({ type: "transparent" });
    expect(result.alpha).toBe(0);
  });
});
