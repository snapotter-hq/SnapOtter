import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  calculateAspectRatio,
  registerAspectRatioCalculator,
} from "../../../apps/api/src/routes/tools/aspect-ratio-calculator.js";

const URL = "/api/v1/tools/image/aspect-ratio-calculator";

describe("calculateAspectRatio", () => {
  it("reduces 1920x1080 to 16:9 and leaves the new dimensions empty without a target", () => {
    expect(calculateAspectRatio({ width: 1920, height: 1080, round: true })).toEqual({
      width: 1920,
      height: 1080,
      ratio: "16:9",
      ratioDecimal: 1.7778,
      newWidth: null,
      newHeight: null,
    });
  });

  it("solves the height from a new width, rounded to whole pixels", () => {
    const result = calculateAspectRatio({ width: 1920, height: 1080, newWidth: 1000, round: true });
    expect(result.newWidth).toBe(1000);
    expect(result.newHeight).toBe(563);
  });

  it("solves the width from a new height", () => {
    const result = calculateAspectRatio({ width: 1920, height: 1080, newHeight: 720, round: true });
    expect(result.newWidth).toBe(1280);
    expect(result.newHeight).toBe(720);
  });

  it("keeps two decimals when rounding is off", () => {
    const result = calculateAspectRatio({
      width: 1920,
      height: 1080,
      newWidth: 1000,
      round: false,
    });
    expect(result.newHeight).toBe(562.5);
  });

  it("reduces decimal dimensions such as US Letter to a whole-number ratio", () => {
    expect(calculateAspectRatio({ width: 8.5, height: 11, round: true }).ratio).toBe("17:22");
  });

  it("handles portrait and square inputs", () => {
    expect(calculateAspectRatio({ width: 1080, height: 1920, round: true }).ratio).toBe("9:16");
    expect(calculateAspectRatio({ width: 500, height: 500, round: true }).ratio).toBe("1:1");
  });

  it("never rounds a solved dimension down to zero", () => {
    const result = calculateAspectRatio({ width: 10000, height: 1, newWidth: 1, round: true });
    expect(result.newHeight).toBe(1);
    const unrounded = calculateAspectRatio({
      width: 1_000_000,
      height: 1,
      newWidth: 1,
      round: false,
    });
    expect(unrounded.newHeight).toBe(0.01);
  });

  it("reduces the smallest accepted dimension to a real ratio", () => {
    expect(calculateAspectRatio({ width: 0.0001, height: 0.0001, round: true }).ratio).toBe("1:1");
    expect(calculateAspectRatio({ width: 0.0001, height: 1920, round: true }).ratio).toBe(
      "1:19200000",
    );
  });
});

describe("POST /api/v1/tools/image/aspect-ratio-calculator", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    registerAspectRatioCalculator(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("answers with the solved dimension and simplified ratio", async () => {
    const res = await app.inject({
      method: "POST",
      url: URL,
      payload: { width: 1920, height: 1080, newWidth: 1280 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      width: 1920,
      height: 1080,
      ratio: "16:9",
      ratioDecimal: 1.7778,
      newWidth: 1280,
      newHeight: 720,
    });
  });

  it("rejects a request that fixes both new dimensions", async () => {
    const res = await app.inject({
      method: "POST",
      url: URL,
      payload: { width: 1920, height: 1080, newWidth: 1280, newHeight: 720 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Invalid settings");
  });

  it.each([
    [{ width: 0, height: 1080 }],
    [{ width: -1, height: 1080 }],
    [{ width: 1920 }],
    [{ width: "1920", height: 1080 }],
    [{ width: 1920, height: 1080, newHeight: 0 }],
    [{ width: 2_000_000, height: 1080 }],
    [{ width: 0.00001, height: 0.00001 }],
    [{ width: 1e-7, height: 1 }],
  ])("rejects invalid dimensions %j", async (payload) => {
    const res = await app.inject({ method: "POST", url: URL, payload });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Invalid settings");
  });
});
