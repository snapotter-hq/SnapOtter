import type { Sharp, SharpenAdvancedOptions, SharpenOptions } from "../types.js";

export async function sharpen(image: Sharp, options: SharpenOptions): Promise<Sharp> {
  const { value } = options;

  if (value <= 0) return image;
  if (value > 100) {
    throw new Error("Sharpness value must be between 0 and 100");
  }

  // Map 0-100 to sigma 0.5-10
  const sigma = 0.5 + (value / 100) * 9.5;

  return image.sharpen({ sigma });
}

const DENOISE_KERNEL: Record<string, number> = {
  light: 3,
  medium: 5,
  strong: 7,
};

export async function sharpenAdvanced(
  image: Sharp,
  options: SharpenAdvancedOptions,
): Promise<Sharp> {
  const { method, denoise } = options;

  // Optional noise reduction pre-pass
  let pipeline = image;
  if (denoise && denoise !== "off") {
    const kernelSize = DENOISE_KERNEL[denoise];
    if (kernelSize) {
      pipeline = pipeline.median(kernelSize);
    }
  }

  switch (method) {
    case "adaptive":
      return sharpenAdaptive(pipeline, options);
    case "unsharp-mask":
      return sharpenUnsharpMask(pipeline, options);
    case "high-pass":
      return sharpenHighPass(pipeline, options);
    default:
      throw new Error(`Unknown sharpening method: ${method}`);
  }
}

function sharpenAdaptive(image: Sharp, options: SharpenAdvancedOptions): Sharp {
  const sigma = options.sigma ?? 1.0;
  const m1 = options.m1 ?? 1.0;
  const m2 = options.m2 ?? 3.0;
  const x1 = options.x1 ?? 2.0;
  const y2 = options.y2 ?? 12;
  const y3 = options.y3 ?? 20;
  return image.sharpen({ sigma, m1, m2, x1, y2, y3 });
}

function sharpenUnsharpMask(image: Sharp, options: SharpenAdvancedOptions): Sharp {
  const amount = options.amount ?? 100;
  const radius = options.radius ?? 1.0;
  const threshold = options.threshold ?? 0;
  const sigma = radius;
  const intensity = amount / 100;
  const x1 = (threshold / 255) * 10;
  return image.sharpen({ sigma, m1: intensity, m2: intensity, x1, y2: 15, y3: 25 });
}

function sharpenHighPass(image: Sharp, options: SharpenAdvancedOptions): Sharp {
  const strength = options.strength ?? 50;
  const kernelSize = options.kernelSize ?? 3;
  const s = strength / 100;

  if (kernelSize === 5) {
    const k = [
      0,
      -s,
      -s,
      -s,
      0,
      -s,
      s,
      s * 2,
      s,
      -s,
      -s,
      s * 2,
      1 + s * 8,
      s * 2,
      -s,
      -s,
      s,
      s * 2,
      s,
      -s,
      0,
      -s,
      -s,
      -s,
      0,
    ];
    return image.convolve({ width: 5, height: 5, kernel: k });
  }

  const k = [0, -s, 0, -s, 1 + 4 * s, -s, 0, -s, 0];
  return image.convolve({ width: 3, height: 3, kernel: k });
}
