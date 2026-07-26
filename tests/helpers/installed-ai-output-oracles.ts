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

interface RawRgbaImage {
  data: Buffer;
  hasAlpha: boolean;
  height: number;
  width: number;
}

async function rawRgba(buffer: Buffer): Promise<RawRgbaImage> {
  const image = sharp(buffer);
  const meta = await image.metadata();
  const { data, info } = await image
    .ensureAlpha()
    .toColorspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  assertOracle(info.channels === 4, `decoded image has ${info.channels} channels instead of RGBA`);
  return {
    data,
    hasAlpha: meta.hasAlpha === true,
    height: info.height,
    width: info.width,
  };
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

// ---------------------------------------------------------------------------
// Campaign master-20260724, AI lane. Oracles for the remaining bundle-gated
// tools. Every one of these has to be able to FAIL on a degenerate artifact,
// so each asserts something specific to the operation rather than "bytes came
// back". `expectNonDegenerateImage` is the shared floor: it rejects the four
// classic silent-success shapes (empty, undecodable, single-colour, fully
// transparent) and is applied before any tool-specific assertion.
// ---------------------------------------------------------------------------

export interface ImageStats {
  distinctColors: number;
  height: number;
  meanAlpha: number;
  meanLuma: number;
  opaqueFraction: number;
  stdLuma: number;
  transparentFraction: number;
  width: number;
}

/** Decode once and report the numbers every degeneracy check needs. */
export async function imageStats(buffer: Buffer): Promise<ImageStats> {
  const image = await rawRgba(buffer);
  const pixels = image.width * image.height;
  const colors = new Set<number>();
  let sumLuma = 0;
  let sumLumaSq = 0;
  let sumAlpha = 0;
  let transparent = 0;
  let opaque = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    const r = image.data[offset];
    const g = image.data[offset + 1];
    const b = image.data[offset + 2];
    const a = image.data[offset + 3];
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    sumLuma += luma;
    sumLumaSq += luma * luma;
    sumAlpha += a;
    if (a <= 8) transparent += 1;
    if (a >= 247) opaque += 1;
    if (colors.size < 4096) colors.add((r << 16) | (g << 8) | b);
  }
  const meanLuma = sumLuma / pixels;
  return {
    distinctColors: colors.size,
    height: image.height,
    meanAlpha: sumAlpha / pixels,
    meanLuma,
    opaqueFraction: opaque / pixels,
    stdLuma: Math.sqrt(Math.max(0, sumLumaSq / pixels - meanLuma * meanLuma)),
    transparentFraction: transparent / pixels,
    width: image.width,
  };
}

/**
 * Reject the four silent-success shapes an AI tool can return when its model
 * did not actually run: nothing, garbage, a flat fill, or a fully erased frame.
 */
export async function expectNonDegenerateImage(output: Buffer): Promise<ImageStats> {
  assertOracle(output.length > 0, "artifact is empty");
  let stats: ImageStats;
  try {
    stats = await imageStats(output);
  } catch (error) {
    throw new Error(
      `Installed AI output oracle failed: artifact is not decodable (${String(error)})`,
    );
  }
  assertOracle(stats.width > 0 && stats.height > 0, "artifact has no pixels");
  assertOracle(stats.transparentFraction < 0.995, "artifact is fully transparent");
  assertOracle(
    stats.distinctColors > 3,
    `artifact has only ${stats.distinctColors} distinct colours`,
  );
  assertOracle(stats.stdLuma > 1.5, `artifact luminance is flat (std ${stats.stdLuma.toFixed(2)})`);
  assertOracle(
    !(stats.meanLuma < 3 && stats.stdLuma < 6),
    `artifact is effectively all black (mean ${stats.meanLuma.toFixed(2)})`,
  );
  return stats;
}

/**
 * Background removal: the border must become mostly transparent while the
 * central subject stays opaque. A model that no-ops leaves the border opaque;
 * one that fails open erases everything.
 */
export async function expectBackgroundCutOut(output: Buffer): Promise<void> {
  const image = await rawRgba(output);
  assertOracle(image.hasAlpha, "cut-out artifact has no alpha channel");
  const borderX = Math.max(1, Math.floor(image.width * 0.06));
  const borderY = Math.max(1, Math.floor(image.height * 0.06));
  let borderPixels = 0;
  let borderTransparent = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const onBorder =
        x < borderX || x >= image.width - borderX || y < borderY || y >= image.height - borderY;
      if (!onBorder) continue;
      borderPixels += 1;
      if (image.data[(y * image.width + x) * 4 + 3] <= 16) borderTransparent += 1;
    }
  }
  const left = Math.floor(image.width * 0.42);
  const right = Math.ceil(image.width * 0.58);
  const top = Math.floor(image.height * 0.35);
  const bottom = Math.ceil(image.height * 0.7);
  let centerPixels = 0;
  let centerOpaque = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      centerPixels += 1;
      if (image.data[(y * image.width + x) * 4 + 3] >= 200) centerOpaque += 1;
    }
  }
  assertOracle(
    borderTransparent / borderPixels > 0.5,
    `only ${((borderTransparent / borderPixels) * 100).toFixed(1)}% of the border became transparent`,
  );
  assertOracle(
    centerOpaque / centerPixels > 0.8,
    `subject was erased too: only ${((centerOpaque / centerPixels) * 100).toFixed(1)}% of the centre stayed opaque`,
  );
}

/** Upscaling must actually enlarge the raster by roughly the requested factor. */
export async function expectUpscaled(
  input: Buffer,
  output: Buffer,
  minFactor: number,
): Promise<void> {
  const [before, after] = await Promise.all([imageStats(input), imageStats(output)]);
  const factor = after.width / before.width;
  assertOracle(
    factor >= minFactor - 0.05,
    `output is ${after.width}x${after.height}, only ${factor.toFixed(2)}x the ${before.width}x${before.height} input`,
  );
  assertOracle(
    Math.abs(after.height / before.height - factor) < 0.1,
    "aspect ratio was not preserved by the upscale",
  );
}

/** Colorization must introduce chroma into a near-grayscale input. */
export async function expectColorAdded(input: Buffer, output: Buffer): Promise<void> {
  const chroma = async (buffer: Buffer): Promise<number> => {
    const image = await rawRgb(buffer);
    let total = 0;
    const pixels = image.width * image.height;
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      const offset = pixel * 3;
      const r = image.data[offset];
      const g = image.data[offset + 1];
      const b = image.data[offset + 2];
      total += Math.max(r, g, b) - Math.min(r, g, b);
    }
    return total / pixels;
  };
  const [before, after] = await Promise.all([chroma(input), chroma(output)]);
  assertOracle(
    before < 12,
    `input is not grayscale enough to prove colorization (chroma ${before.toFixed(2)})`,
  );
  assertOracle(
    after > before + 6,
    `output chroma ${after.toFixed(2)} is not meaningfully above the input's ${before.toFixed(2)}`,
  );
}

/** Any operation that must visibly rewrite pixels without resizing the raster. */
export async function expectSameSizeButChanged(
  input: Buffer,
  output: Buffer,
  minChangedFraction = 0.01,
): Promise<void> {
  const [before, after] = await Promise.all([rawRgb(input), rawRgb(output)]);
  expectSameDimensions(before, after);
  let changed = 0;
  const pixels = before.width * before.height;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    if (pixelDifference(before, after, pixel) >= 8) changed += 1;
  }
  assertOracle(
    changed / pixels >= minChangedFraction,
    `only ${((changed / pixels) * 100).toFixed(3)}% of pixels changed, below the ${(minChangedFraction * 100).toFixed(2)}% floor`,
  );
}

/** Prove a specific rectangle was rewritten, e.g. an eraser mask region. */
export async function expectRegionRewritten(
  input: Buffer,
  output: Buffer,
  region: { height: number; left: number; top: number; width: number },
): Promise<void> {
  const [before, after] = await Promise.all([rawRgb(input), rawRgb(output)]);
  expectSameDimensions(before, after);
  let inside = 0;
  let insideChanged = 0;
  for (let y = region.top; y < region.top + region.height; y += 1) {
    for (let x = region.left; x < region.left + region.width; x += 1) {
      if (x < 0 || y < 0 || x >= before.width || y >= before.height) continue;
      inside += 1;
      if (pixelDifference(before, after, y * before.width + x) >= 10) insideChanged += 1;
    }
  }
  assertOracle(inside > 0, "requested region lies outside the image");
  assertOracle(
    insideChanged / inside > 0.35,
    `only ${((insideChanged / inside) * 100).toFixed(1)}% of the masked region changed`,
  );
}

/** Noise removal / restoration: high-frequency energy must fall. */
export async function expectHighFrequencyEnergyReduced(
  input: Buffer,
  output: Buffer,
  maxRatio = 0.95,
): Promise<void> {
  const energy = async (buffer: Buffer): Promise<number> => {
    const image = await rawRgb(buffer);
    let total = 0;
    let comparisons = 0;
    for (let y = 0; y < image.height - 1; y += 1) {
      for (let x = 0; x < image.width - 1; x += 1) {
        const current = luminance(image, x, y);
        total += Math.abs(current - luminance(image, x + 1, y));
        total += Math.abs(current - luminance(image, x, y + 1));
        comparisons += 2;
      }
    }
    return total / comparisons;
  };
  const [before, after] = await Promise.all([energy(input), energy(output)]);
  assertOracle(before > 0.5, "input has no measurable high-frequency detail");
  assertOracle(
    after / before < maxRatio,
    `high-frequency energy ratio ${(after / before).toFixed(3)} is not below ${maxRatio}`,
  );
}

/** Smart crop must return a strictly smaller raster than it was given. */
export async function expectCropped(input: Buffer, output: Buffer): Promise<void> {
  const [before, after] = await Promise.all([imageStats(input), imageStats(output)]);
  assertOracle(
    after.width < before.width || after.height < before.height,
    `output ${after.width}x${after.height} is not smaller than the ${before.width}x${before.height} input`,
  );
  assertOracle(after.width >= 16 && after.height >= 16, "crop collapsed to a degenerate size");
}

/** Canvas expansion must grow the raster on the requested sides. */
export async function expectCanvasExpanded(
  input: Buffer,
  output: Buffer,
  extend: { bottom: number; left: number; right: number; top: number },
): Promise<void> {
  const [before, after] = await Promise.all([imageStats(input), imageStats(output)]);
  assertOracle(
    after.width === before.width + extend.left + extend.right,
    `output width ${after.width} does not equal ${before.width} + ${extend.left} + ${extend.right}`,
  );
  assertOracle(
    after.height === before.height + extend.top + extend.bottom,
    `output height ${after.height} does not equal ${before.height} + ${extend.top} + ${extend.bottom}`,
  );
}

/** Red-eye removal must cut the count of saturated-red pixels. */
export async function expectRedPixelsReduced(input: Buffer, output: Buffer): Promise<void> {
  const redCount = async (buffer: Buffer): Promise<number> => {
    const image = await rawRgb(buffer);
    let count = 0;
    const pixels = image.width * image.height;
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      const offset = pixel * 3;
      const r = image.data[offset];
      const g = image.data[offset + 1];
      const b = image.data[offset + 2];
      if (r >= 120 && r >= g * 2 && r >= b * 2) count += 1;
    }
    return count;
  };
  const [before, after] = await Promise.all([redCount(input), redCount(output)]);
  assertOracle(before > 0, "input contains no saturated-red pixels to remove");
  assertOracle(
    after < before,
    `saturated-red pixel count did not fall (${before} before, ${after} after)`,
  );
}

/** OCR: require the specific known words from the committed fixture. */
export function expectRecognizedTerms(
  text: string,
  terms: readonly string[],
  minimum: number,
): void {
  const words = normalizedWords(text);
  const recognized = terms.filter((term) => words.has(term.toLowerCase()));
  assertOracle(
    recognized.length >= minimum,
    `recognized ${recognized.length}/${terms.length} expected terms (need ${minimum}): ${recognized.join(", ")}`,
  );
}

/** OCR Japanese: require real CJK/kana codepoints, not latin transliteration. */
export function expectJapaneseScript(text: string, minimumChars = 4): void {
  const matches = text.match(/[぀-ゟ゠-ヿ一-鿿ｦ-ﾝ]/gu) ?? [];
  assertOracle(
    matches.length >= minimumChars,
    `found only ${matches.length} Japanese codepoints in the transcript`,
  );
}

/** PDF OCR: a real PDF that now carries a selectable text layer. */
export function expectSearchablePdf(output: Buffer): void {
  assertOracle(output.subarray(0, 5).toString("latin1") === "%PDF-", "artifact is not a PDF");
  assertOracle(output.length > 1000, "PDF artifact is implausibly small");
  const body = output.toString("latin1");
  assertOracle(
    body.includes("/Font") || body.includes("BT\n") || body.includes("Tj"),
    "PDF carries no text-drawing operators, so no OCR layer was added",
  );
}

/** Animated cut-outs must stay animated: a single-frame result is a regression. */
export async function expectAnimatedFrames(output: Buffer, minimumFrames = 2): Promise<void> {
  const meta = await sharp(output, { pages: -1 }).metadata();
  const pages = meta.pages ?? 1;
  assertOracle(
    pages >= minimumFrames,
    `artifact has ${pages} frame(s), expected at least ${minimumFrames}`,
  );
}
