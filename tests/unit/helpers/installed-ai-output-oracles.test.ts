import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createGradientBackground } from "../../../apps/api/src/lib/bg-effects.js";
import {
  expectBackgroundBlurEnergyReduced,
  expectConfiguredBackground,
  expectForegroundPreserved,
  expectKnownTranscript,
  expectObservablePixelChange,
  expectSrtArtifact,
  expectVttArtifact,
} from "../../helpers/installed-ai-output-oracles.js";

describe("installed AI output oracles", () => {
  it("recognizes the committed speech fixture transcript without exact wording", () => {
    expect(() =>
      expectKnownTranscript("The quick brown fox transcribes audio files reliably."),
    ).not.toThrow();
    expect(() => expectKnownTranscript("unrelated noise with no fixture vocabulary")).toThrow();
  });

  it("requires real SRT and VTT timing structures", () => {
    expect(() =>
      expectSrtArtifact("1\n00:00:00,000 --> 00:00:01,250\nThe quick brown fox.\n"),
    ).not.toThrow();
    expect(() =>
      expectVttArtifact("WEBVTT\n\n00:00:00.000 --> 00:00:01.250\nThe quick brown fox.\n"),
    ).not.toThrow();
    expect(() => expectSrtArtifact("not subtitles")).toThrow();
    expect(() => expectVttArtifact("not subtitles")).toThrow();
  });

  it("requires observable decoded changes in the background region", async () => {
    const input = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#000000" },
    })
      .png()
      .toBuffer();
    const changed = await sharp(input)
      .composite([
        {
          input: await sharp({
            create: { width: 100, height: 12, channels: 3, background: "#ffffff" },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .webp({ lossless: true })
      .toBuffer();

    const centerOnly = await sharp(input)
      .composite([
        {
          input: await sharp({
            create: { width: 30, height: 30, channels: 3, background: "#ffffff" },
          })
            .png()
            .toBuffer(),
          left: 35,
          top: 35,
        },
      ])
      .png()
      .toBuffer();

    await expect(expectObservablePixelChange(input, changed)).resolves.toBeUndefined();
    await expect(expectObservablePixelChange(input, centerOnly)).rejects.toThrow();
    await expect(expectObservablePixelChange(input, input)).rejects.toThrow();
  });

  it("requires real high-frequency energy loss in the background region", async () => {
    const checker = Buffer.alloc(200 * 200 * 3);
    for (let y = 0; y < 200; y += 1) {
      for (let x = 0; x < 200; x += 1) {
        const value = (x + y) % 2 === 0 ? 0 : 255;
        const offset = (y * 200 + x) * 3;
        checker[offset] = value;
        checker[offset + 1] = value;
        checker[offset + 2] = value;
      }
    }
    const input = await sharp(checker, { raw: { width: 200, height: 200, channels: 3 } })
      .png()
      .toBuffer();
    const blurred = await sharp(input).blur(12).webp({ lossless: true }).toBuffer();

    await expect(expectBackgroundBlurEnergyReduced(input, blurred)).resolves.toBeUndefined();
    await expect(expectBackgroundBlurEnergyReduced(input, input)).rejects.toThrow();
  });

  it("is calibrated against the committed portrait fixture used in production QA", async () => {
    const portrait = readFileSync("tests/fixtures/image/valid/portrait-color.jpg");
    const blurred = await sharp(portrait).blur(37.75).webp({ lossless: true }).toBuffer();
    const reencoded = await sharp(portrait).webp({ lossless: true }).toBuffer();

    await expect(expectBackgroundBlurEnergyReduced(portrait, blurred)).resolves.toBeUndefined();
    await expect(expectBackgroundBlurEnergyReduced(portrait, reencoded)).rejects.toThrow(
      "background high-frequency energy ratio",
    );
  });

  it("requires the known central foreground region to remain recognizable", async () => {
    const input = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#808080" },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 20, height: 40, channels: 3, background: "#2080e0" },
          })
            .png()
            .toBuffer(),
          left: 40,
          top: 33,
        },
      ])
      .png()
      .toBuffer();
    const backgroundChanged = await sharp(input)
      .composite([
        {
          input: await sharp({
            create: { width: 100, height: 20, channels: 3, background: "#ff0000" },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .webp({ lossless: true })
      .toBuffer();
    const foregroundDestroyed = await sharp(input)
      .composite([
        {
          input: await sharp({
            create: { width: 20, height: 40, channels: 3, background: "#ff0000" },
          })
            .png()
            .toBuffer(),
          left: 40,
          top: 33,
        },
      ])
      .png()
      .toBuffer();

    await expect(expectForegroundPreserved(input, backgroundChanged)).resolves.toBeUndefined();
    await expect(expectForegroundPreserved(input, foregroundDestroyed)).rejects.toThrow();
  });

  it("requires configured solid and gradient background colors", async () => {
    const red = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    const gradient = await createGradientBackground(200, 200, "#ff0000", "#0000ff", 45);

    await expect(expectConfiguredBackground(red, "solid-red")).resolves.toBeUndefined();
    await expect(
      expectConfiguredBackground(gradient, "red-blue-gradient"),
    ).resolves.toBeUndefined();
    await expect(expectConfiguredBackground(red, "red-blue-gradient")).rejects.toThrow();
  });
});
