import sharp from "sharp";
import { expect } from "vitest";

const KNOWN_TRANSCRIPT_TERMS = [
  "quick",
  "brown",
  "fox",
  "lazy",
  "dog",
  "converts",
  "transcribes",
  "audio",
  "files",
  "quickly",
  "reliably",
];

function normalizedWords(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z]+/g) ?? []);
}

/** Require recognizable content from the committed CC0 speech fixture. */
export function expectKnownTranscript(text: string): void {
  expect(text.trim().length).toBeGreaterThan(20);
  const words = normalizedWords(text);
  const recognized = KNOWN_TRANSCRIPT_TERMS.filter((term) => words.has(term));
  expect(
    recognized.length,
    `recognized transcript terms: ${recognized.join(", ")}`,
  ).toBeGreaterThanOrEqual(3);
}

export function expectSrtArtifact(text: string): void {
  expect(text).toMatch(
    /(?:^|\r?\n)1\r?\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\r?\n\S/u,
  );
}

export function expectVttArtifact(text: string): void {
  expect(text).toMatch(/^WEBVTT\r?\n/u);
  expect(text).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/u);
}

interface RawRgbImage {
  data: Buffer;
  height: number;
  width: number;
}

async function rawRgb(buffer: Buffer): Promise<RawRgbImage> {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .toColorspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(info.channels).toBe(3);
  expect(info.width).toBeGreaterThan(0);
  expect(info.height).toBeGreaterThan(0);
  return { data, height: info.height, width: info.width };
}

function pixelDifference(before: RawRgbImage, after: RawRgbImage, pixel: number): number {
  const offset = pixel * 3;
  return Math.max(
    Math.abs(before.data[offset] - after.data[offset]),
    Math.abs(before.data[offset + 1] - after.data[offset + 1]),
    Math.abs(before.data[offset + 2] - after.data[offset + 2]),
  );
}

function expectSameDimensions(before: RawRgbImage, after: RawRgbImage): void {
  expect({ width: after.width, height: after.height }).toEqual({
    width: before.width,
    height: before.height,
  });
}

/** Prove the decoded background region changed, rather than only the subject. */
export async function expectObservablePixelChange(input: Buffer, output: Buffer): Promise<void> {
  const [before, after] = await Promise.all([rawRgb(input), rawRgb(output)]);
  expectSameDimensions(before, after);

  let changedPixels = 0;
  let absoluteDifference = 0;
  let inspectedPixels = 0;
  const borderX = Math.max(1, Math.floor(before.width * 0.12));
  const borderY = Math.max(1, Math.floor(before.height * 0.12));
  for (let pixel = 0; pixel < before.width * before.height; pixel += 1) {
    const x = pixel % before.width;
    const y = Math.floor(pixel / before.width);
    const onBorder =
      x < borderX || x >= before.width - borderX || y < borderY || y >= before.height - borderY;
    if (!onBorder) continue;

    inspectedPixels += 1;
    const difference = pixelDifference(before, after, pixel);
    absoluteDifference += difference;
    if (difference >= 12) changedPixels += 1;
  }

  expect(changedPixels / inspectedPixels).toBeGreaterThan(0.08);
  expect(absoluteDifference / inspectedPixels).toBeGreaterThan(2);
}

/**
 * Prove the central subject in the committed portrait fixture survived the
 * operation. The region is deliberately inside the face, shirt, and tie so
 * expected mask-edge feathering cannot create false failures.
 */
export async function expectForegroundPreserved(input: Buffer, output: Buffer): Promise<void> {
  const [before, after] = await Promise.all([rawRgb(input), rawRgb(output)]);
  expectSameDimensions(before, after);

  const left = Math.floor(before.width * 0.4);
  const right = Math.ceil(before.width * 0.6);
  const top = Math.floor(before.height * 0.33);
  const bottom = Math.ceil(before.height * 0.73);
  let inspectedPixels = 0;
  let preservedPixels = 0;
  let absoluteDifference = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const difference = pixelDifference(before, after, y * before.width + x);
      inspectedPixels += 1;
      absoluteDifference += difference;
      if (difference <= 30) preservedPixels += 1;
    }
  }

  expect(inspectedPixels).toBeGreaterThan(0);
  expect(preservedPixels / inspectedPixels).toBeGreaterThan(0.8);
  expect(absoluteDifference / inspectedPixels).toBeLessThan(18);
}

/** Prove the requested red or red-to-blue replacement is visible in the output. */
export async function expectConfiguredBackground(
  output: Buffer,
  kind: "solid-red" | "red-blue-gradient",
): Promise<void> {
  const image = await rawRgb(output);
  const borderX = Math.max(1, Math.floor(image.width * 0.1));
  const borderY = Math.max(1, Math.floor(image.height * 0.1));
  let inspectedPixels = 0;
  let redPixels = 0;
  let bluePixels = 0;
  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
    const x = pixel % image.width;
    const y = Math.floor(pixel / image.width);
    const onBorder =
      x < borderX || x >= image.width - borderX || y < borderY || y >= image.height - borderY;
    if (!onBorder) continue;

    inspectedPixels += 1;
    const offset = pixel * 3;
    const red = image.data[offset];
    const green = image.data[offset + 1];
    const blue = image.data[offset + 2];
    if (red >= 180 && red >= green * 2 && red >= blue * 2) redPixels += 1;
    if (blue >= 180 && blue >= red * 2 && blue >= green * 2) bluePixels += 1;
  }

  expect(redPixels / inspectedPixels).toBeGreaterThan(kind === "solid-red" ? 0.2 : 0.02);
  if (kind === "red-blue-gradient") {
    expect(bluePixels / inspectedPixels).toBeGreaterThan(0.02);
  }
}
