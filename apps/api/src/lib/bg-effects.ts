import sharp from "sharp";

/**
 * Background removal post-processing effects.
 * All effects use Sharp (libvips) for fast server-side image manipulation.
 */

/**
 * Blur the original background and composite the sharp subject on top.
 * Produces a "portrait mode" / bokeh effect.
 *
 * @param originalBuffer - The original image before bg removal
 * @param subjectBuffer  - The bg-removed PNG with alpha channel
 * @param intensity      - 0-100 slider value, mapped to sigma 1-50
 */
export async function blurBackground(
  originalBuffer: Buffer,
  subjectBuffer: Buffer,
  intensity: number,
): Promise<Buffer> {
  const sigma = 1 + (Math.max(0, Math.min(100, intensity)) / 100) * 49;

  // Ensure both images are the same dimensions
  const subjectMeta = await sharp(subjectBuffer).metadata();
  const { width, height } = subjectMeta;

  const blurredBg = await sharp(originalBuffer)
    .resize(width, height, { fit: "fill" })
    .blur(sigma)
    .toBuffer();

  return sharp(blurredBg)
    .composite([{ input: subjectBuffer, blend: "over" }])
    .png()
    .toBuffer();
}

/**
 * Add a drop shadow generated from the subject's alpha mask.
 * Shadow is offset downward and blurred for a natural look.
 *
 * @param subjectBuffer - PNG with alpha channel
 * @param opacity       - 0-100 slider value
 */
export async function addDropShadow(subjectBuffer: Buffer, opacity: number): Promise<Buffer> {
  const meta = await sharp(subjectBuffer).metadata();
  if (!meta.width || !meta.height) throw new Error("Cannot read image dimensions");
  const { width, height } = meta;
  const normalizedOpacity = Math.max(0, Math.min(100, opacity)) / 100;

  // Shadow parameters
  const offsetY = Math.max(4, Math.round(height * 0.015));
  const blurSigma = Math.max(5, Math.round(height * 0.02));

  // Extract alpha channel
  const alphaRaw = await sharp(subjectBuffer).extractChannel(3).raw().toBuffer();

  // Build shadow RGBA: black pixels with scaled alpha
  const shadowPixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    shadowPixels[i * 4] = 0;
    shadowPixels[i * 4 + 1] = 0;
    shadowPixels[i * 4 + 2] = 0;
    shadowPixels[i * 4 + 3] = Math.round(alphaRaw[i] * normalizedOpacity);
  }

  // Blur the shadow
  const shadowBlurred = await sharp(shadowPixels, {
    raw: { width, height, channels: 4 },
  })
    .blur(blurSigma)
    .png()
    .toBuffer();

  // Composite: transparent canvas -> shadow (offset) -> subject (centered)
  // Keep same canvas size, shadow clips at edges
  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: shadowBlurred, left: 0, top: offsetY, blend: "over" },
      { input: subjectBuffer, left: 0, top: 0, blend: "over" },
    ])
    .png()
    .toBuffer();
}

/**
 * Create a linear gradient background image as SVG, rendered via Sharp.
 */
export async function createGradientBackground(
  width: number,
  height: number,
  color1: string,
  color2: string,
  angle = 180,
): Promise<Buffer> {
  const rad = (angle * Math.PI) / 180;
  const x1 = 50 - Math.sin(rad) * 50;
  const y1 = 50 - Math.cos(rad) * 50;
  const x2 = 50 + Math.sin(rad) * 50;
  const y2 = 50 + Math.cos(rad) * 50;

  const svg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">
          <stop offset="0%" stop-color="${color1}"/>
          <stop offset="100%" stop-color="${color2}"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
    </svg>`,
  );

  return sharp(svg).resize(width, height).png().toBuffer();
}

/**
 * Composite a subject (PNG with alpha) onto a solid color background.
 */
export async function compositeOnColor(subjectBuffer: Buffer, hexColor: string): Promise<Buffer> {
  const meta = await sharp(subjectBuffer).metadata();
  if (!meta.width || !meta.height) throw new Error("Cannot read image dimensions");
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return sharp({
    create: {
      width: meta.width,
      height: meta.height,
      channels: 4,
      background: { r, g, b, alpha: 255 },
    },
  })
    .composite([{ input: subjectBuffer, blend: "over" }])
    .png()
    .toBuffer();
}

/**
 * Composite a subject onto a background image.
 * The background image is resized to cover the subject dimensions.
 */
export async function compositeOnImage(
  subjectBuffer: Buffer,
  backgroundBuffer: Buffer,
): Promise<Buffer> {
  const meta = await sharp(subjectBuffer).metadata();
  if (!meta.width || !meta.height) throw new Error("Cannot read image dimensions");
  const { width, height } = meta;

  const resizedBg = await sharp(backgroundBuffer)
    .resize(width, height, { fit: "cover" })
    .toBuffer();

  return sharp(resizedBg)
    .composite([{ input: subjectBuffer, blend: "over" }])
    .png()
    .toBuffer();
}

/**
 * Apply the full effects pipeline to a bg-removed subject.
 *
 * Order: shadow -> blur/background compositing
 * Shadow is applied to the transparent subject first, then composited onto background.
 */
export async function applyEffects(
  subjectBuffer: Buffer,
  originalBuffer: Buffer,
  settings: {
    backgroundColor?: string;
    backgroundType?: string;
    gradientColor1?: string;
    gradientColor2?: string;
    gradientAngle?: number;
    backgroundImageBuffer?: Buffer;
    blurEnabled?: boolean;
    blurIntensity?: number;
    shadowEnabled?: boolean;
    shadowOpacity?: number;
  },
): Promise<Buffer> {
  const meta = await sharp(subjectBuffer).metadata();
  if (!meta.width || !meta.height) throw new Error("Cannot read image dimensions");
  const { width, height } = meta;
  const bgType = settings.backgroundType || "transparent";

  // Step 1: Add shadow to the subject (before background compositing)
  let subject = subjectBuffer;
  if (settings.shadowEnabled && settings.shadowOpacity && settings.shadowOpacity > 0) {
    subject = await addDropShadow(subject, settings.shadowOpacity);
  }

  // Step 2: Build the background layer
  let background: Buffer | null = null;

  if (bgType === "image" && settings.backgroundImageBuffer) {
    // Custom uploaded background image
    background = await sharp(settings.backgroundImageBuffer)
      .resize(width, height, { fit: "cover" })
      .toBuffer();
    // Apply blur to the uploaded bg image if enabled
    if (settings.blurEnabled) {
      const intensity = settings.blurIntensity ?? 50;
      const sigma = 1 + (Math.max(0, Math.min(100, intensity)) / 100) * 49;
      background = await sharp(background).blur(sigma).toBuffer();
    }
  } else if (settings.blurEnabled && (bgType === "transparent" || bgType === "blur")) {
    // Blur the original background (portrait mode)
    const intensity = settings.blurIntensity ?? 50;
    const sigma = 1 + (Math.max(0, Math.min(100, intensity)) / 100) * 49;
    background = await sharp(originalBuffer)
      .resize(width, height, { fit: "fill" })
      .blur(sigma)
      .toBuffer();
  } else if (bgType === "color" && settings.backgroundColor) {
    const hex = settings.backgroundColor.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    background = await sharp({
      create: { width, height, channels: 4, background: { r, g, b, alpha: 255 } },
    })
      .png()
      .toBuffer();
  } else if (bgType === "gradient" && settings.gradientColor1 && settings.gradientColor2) {
    background = await createGradientBackground(
      width,
      height,
      settings.gradientColor1,
      settings.gradientColor2,
      settings.gradientAngle ?? 180,
    );
  }
  // else: transparent - no background layer

  // Step 3: Composite subject onto background
  if (background) {
    return sharp(background)
      .composite([{ input: subject, blend: "over" }])
      .png()
      .toBuffer();
  }

  return subject;
}
