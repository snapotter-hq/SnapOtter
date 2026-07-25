import sharp from "sharp";

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

function assertOracle(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Installed AI output oracle failed: ${message}`);
}

/** Require recognizable content from the committed CC0 speech fixture. */
export function expectKnownTranscript(text: string): void {
  assertOracle(text.trim().length > 20, "transcript is too short");
  const words = normalizedWords(text);
  const recognized = KNOWN_TRANSCRIPT_TERMS.filter((term) => words.has(term));
  assertOracle(
    recognized.length >= 3,
    `recognized only ${recognized.length} fixture terms: ${recognized.join(", ")}`,
  );
}

export function expectSrtArtifact(text: string): void {
  assertOracle(
    /(?:^|\r?\n)1\r?\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\r?\n\S/u.test(text),
    "artifact does not contain a valid first SRT cue",
  );
}

export function expectVttArtifact(text: string): void {
  assertOracle(/^WEBVTT\r?\n/u.test(text), "artifact is missing its WEBVTT header");
  assertOracle(
    /\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/u.test(text),
    "artifact does not contain a valid VTT cue",
  );
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
  assertOracle(info.channels === 3, `decoded image has ${info.channels} channels instead of RGB`);
  assertOracle(info.width > 0, "decoded image has no width");
  assertOracle(info.height > 0, "decoded image has no height");
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
  assertOracle(
    after.width === before.width && after.height === before.height,
    `output dimensions ${after.width}x${after.height} differ from input ${before.width}x${before.height}`,
  );
}

function luminance(image: RawRgbImage, x: number, y: number): number {
  const offset = (y * image.width + x) * 3;
  return (
    image.data[offset] * 0.2126 + image.data[offset + 1] * 0.7152 + image.data[offset + 2] * 0.0722
  );
}

function backgroundGradientEnergy(image: RawRgbImage): number {
  // The committed portrait fixture has only wall/window/plant background in
  // this upper-left ROI. Keeping this oracle fixture-specific prevents the
  // subject edge from masquerading as unblurred background detail.
  const right = Math.max(3, Math.floor(image.width * 0.35));
  const bottom = Math.max(3, Math.floor(image.height * 0.5));
  let energy = 0;
  let comparisons = 0;
  for (let y = 0; y < bottom - 1; y += 1) {
    for (let x = 0; x < right - 1; x += 1) {
      const current = luminance(image, x, y);
      energy += Math.abs(current - luminance(image, x + 1, y));
      energy += Math.abs(current - luminance(image, x, y + 1));
      comparisons += 2;
    }
  }
  return energy / comparisons;
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

  assertOracle(changedPixels / inspectedPixels > 0.08, "too few background pixels changed");
  assertOracle(
    absoluteDifference / inspectedPixels > 2,
    "background mean pixel difference is too small",
  );
}

/** Prove background detail was materially blurred, not just recolored. */
export async function expectBackgroundBlurEnergyReduced(
  input: Buffer,
  output: Buffer,
): Promise<void> {
  const [before, after] = await Promise.all([rawRgb(input), rawRgb(output)]);
  expectSameDimensions(before, after);
  const beforeEnergy = backgroundGradientEnergy(before);
  const afterEnergy = backgroundGradientEnergy(after);

  // The committed portrait's deliberately subject-free ROI measures about 1.65
  // with this decoder and formula. Keep the floor below that evidence while
  // still rejecting flat or nearly-flat fixtures that cannot prove a blur.
  assertOracle(beforeEnergy > 0.75, "portrait background does not contain measurable detail");
  assertOracle(
    afterEnergy / beforeEnergy < 0.7,
    `background high-frequency energy ratio ${afterEnergy / beforeEnergy} is not below 0.7`,
  );
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

  assertOracle(inspectedPixels > 0, "foreground region contains no pixels");
  assertOracle(preservedPixels / inspectedPixels > 0.8, "too few foreground pixels survived");
  assertOracle(
    absoluteDifference / inspectedPixels < 18,
    "foreground mean pixel difference is too large",
  );
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

  assertOracle(
    redPixels / inspectedPixels > (kind === "solid-red" ? 0.2 : 0.02),
    "requested red background is not visible at the image border",
  );
  if (kind === "red-blue-gradient") {
    assertOracle(
      bluePixels / inspectedPixels > 0.02,
      "requested blue gradient endpoint is not visible at the image border",
    );
  }
}
