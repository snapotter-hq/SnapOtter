// apps/web/src/components/editor/konva-filters.ts
// Custom Konva filter factories for the image editor.
// Each factory returns a function `(imageData: ImageData) => void` that mutates pixel data in place.

// ---------------------------------------------------------------------------
// Adjustment Filters
// ---------------------------------------------------------------------------

/**
 * Exposure adjustment via gamma curve.
 * exposure > 0 brightens, exposure < 0 darkens.
 * Formula: pixel = 255 * pow(pixel/255, 1/(1 + exposure))
 */
export function createExposureFilter(exposure: number): (imageData: ImageData) => void {
  return (imageData: ImageData) => {
    const d = imageData.data;
    const gamma = 1 / (1 + exposure);
    // Build a lookup table for performance
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      lut[i] = Math.min(255, Math.max(0, Math.round(255 * (i / 255) ** gamma)));
    }
    for (let i = 0; i < d.length; i += 4) {
      d[i] = lut[d[i]];
      d[i + 1] = lut[d[i + 1]];
      d[i + 2] = lut[d[i + 2]];
    }
  };
}

/**
 * Vibrance: selective saturation boost that increases saturation more
 * for less-saturated pixels, preserving already-vivid colors.
 * amount is in [-100, 100] range.
 */
export function createVibranceFilter(amount: number): (imageData: ImageData) => void {
  return (imageData: ImageData) => {
    const d = imageData.data;
    const amt = amount / 100;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      // Saturation approximation (0..1)
      const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
      // Boost less-saturated pixels more
      const boost = amt * (1 - sat);
      const avg = (r + g + b) / 3;
      d[i] = Math.min(255, Math.max(0, Math.round(r + (r - avg) * boost)));
      d[i + 1] = Math.min(255, Math.max(0, Math.round(g + (g - avg) * boost)));
      d[i + 2] = Math.min(255, Math.max(0, Math.round(b + (b - avg) * boost)));
    }
  };
}

/**
 * Warmth / color temperature shift.
 * Positive warmth: boost red, reduce blue (warmer).
 * Negative warmth: boost blue, reduce red (cooler).
 * amount is in [-100, 100] range.
 */
export function createWarmthFilter(amount: number): (imageData: ImageData) => void {
  return (imageData: ImageData) => {
    const d = imageData.data;
    // Scale to a reasonable pixel shift range
    const shift = (amount / 100) * 30;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, Math.max(0, Math.round(d[i] + shift)));
      d[i + 2] = Math.min(255, Math.max(0, Math.round(d[i + 2] - shift)));
    }
  };
}

// ---------------------------------------------------------------------------
// Creative Filters
// ---------------------------------------------------------------------------

/**
 * Motion blur: directional box blur along a given angle.
 * angle in degrees, distance is the blur length in pixels.
 */
export function createMotionBlurFilter(params: {
  angle: number;
  distance: number;
}): (imageData: ImageData) => void {
  return (imageData: ImageData) => {
    const { angle, distance } = params;
    if (distance <= 0) return;

    const w = imageData.width;
    const h = imageData.height;
    const d = imageData.data;
    const copy = new Uint8ClampedArray(d);

    const rad = (angle * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const steps = Math.max(1, Math.round(distance));
    const half = steps / 2;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let aSum = 0;
        let count = 0;

        for (let s = -half; s <= half; s++) {
          const sx = Math.round(x + dx * s);
          const sy = Math.round(y + dy * s);
          if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
            const idx = (sy * w + sx) * 4;
            rSum += copy[idx];
            gSum += copy[idx + 1];
            bSum += copy[idx + 2];
            aSum += copy[idx + 3];
            count++;
          }
        }

        if (count > 0) {
          const idx = (y * w + x) * 4;
          d[idx] = Math.round(rSum / count);
          d[idx + 1] = Math.round(gSum / count);
          d[idx + 2] = Math.round(bSum / count);
          d[idx + 3] = Math.round(aSum / count);
        }
      }
    }
  };
}

/**
 * Radial blur: concentric blur emanating from a center point.
 * amount controls blur strength, centerX/centerY are 0..1 normalized.
 */
export function createRadialBlurFilter(params: {
  amount: number;
  centerX: number;
  centerY: number;
}): (imageData: ImageData) => void {
  return (imageData: ImageData) => {
    const { amount, centerX, centerY } = params;
    if (amount <= 0) return;

    const w = imageData.width;
    const h = imageData.height;
    const d = imageData.data;
    const copy = new Uint8ClampedArray(d);

    const cx = centerX * w;
    const cy = centerY * h;
    const maxDist = Math.sqrt(w * w + h * h) / 2;
    const samples = Math.max(2, Math.min(32, Math.round(amount / 3)));

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Blur strength scales with distance from center
        const strength = (dist / maxDist) * (amount / 100);

        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let aSum = 0;
        let count = 0;

        for (let s = 0; s < samples; s++) {
          const t = (s / (samples - 1)) * 2 - 1; // -1..1
          const sx = Math.round(x + dx * t * strength);
          const sy = Math.round(y + dy * t * strength);
          if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
            const idx = (sy * w + sx) * 4;
            rSum += copy[idx];
            gSum += copy[idx + 1];
            bSum += copy[idx + 2];
            aSum += copy[idx + 3];
            count++;
          }
        }

        if (count > 0) {
          const idx = (y * w + x) * 4;
          d[idx] = Math.round(rSum / count);
          d[idx + 1] = Math.round(gSum / count);
          d[idx + 2] = Math.round(bSum / count);
          d[idx + 3] = Math.round(aSum / count);
        }
      }
    }
  };
}

/**
 * Surface blur: bilateral-like filter that blurs while preserving edges.
 * radius controls the spatial extent, threshold controls the edge sensitivity.
 */
export function createSurfaceBlurFilter(params: {
  radius: number;
  threshold: number;
}): (imageData: ImageData) => void {
  return (imageData: ImageData) => {
    const { radius, threshold } = params;
    if (radius <= 0) return;

    const w = imageData.width;
    const h = imageData.height;
    const d = imageData.data;
    const copy = new Uint8ClampedArray(d);

    const r = Math.min(radius, 10); // Cap radius for performance
    const threshSq = threshold * threshold;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const cR = copy[idx];
        const cG = copy[idx + 1];
        const cB = copy[idx + 2];

        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let wSum = 0;

        for (let ky = -r; ky <= r; ky++) {
          const sy = y + ky;
          if (sy < 0 || sy >= h) continue;
          for (let kx = -r; kx <= r; kx++) {
            const sx = x + kx;
            if (sx < 0 || sx >= w) continue;

            const sIdx = (sy * w + sx) * 4;
            const dR = copy[sIdx] - cR;
            const dG = copy[sIdx + 1] - cG;
            const dB = copy[sIdx + 2] - cB;
            const colorDist = dR * dR + dG * dG + dB * dB;

            // Weight falls off as color difference increases
            const weight = colorDist < threshSq ? 1 - colorDist / threshSq : 0;

            if (weight > 0) {
              rSum += copy[sIdx] * weight;
              gSum += copy[sIdx + 1] * weight;
              bSum += copy[sIdx + 2] * weight;
              wSum += weight;
            }
          }
        }

        if (wSum > 0) {
          d[idx] = Math.round(rSum / wSum);
          d[idx + 1] = Math.round(gSum / wSum);
          d[idx + 2] = Math.round(bSum / wSum);
        }
      }
    }
  };
}

/**
 * Vignette: darken edges in a radial gradient pattern.
 * amount controls darkness (0..100), midpoint controls where falloff begins (0..100).
 */
export function createVignetteFilter(params: {
  amount: number;
  midpoint: number;
}): (imageData: ImageData) => void {
  return (imageData: ImageData) => {
    const { amount, midpoint } = params;
    if (amount <= 0) return;

    const w = imageData.width;
    const h = imageData.height;
    const d = imageData.data;

    const cx = w / 2;
    const cy = h / 2;
    const strength = amount / 100;
    const mid = midpoint / 100;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x - cx) / cx;
        const dy = (y - cy) / cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Smooth falloff: no darkening below midpoint, ramps up after
        const factor = Math.max(0, (dist - mid) / (Math.SQRT2 - mid));
        const darken = 1 - factor * factor * strength;

        const idx = (y * w + x) * 4;
        d[idx] = Math.round(d[idx] * darken);
        d[idx + 1] = Math.round(d[idx + 1] * darken);
        d[idx + 2] = Math.round(d[idx + 2] * darken);
      }
    }
  };
}

/**
 * Grain: add random noise overlay to simulate film grain.
 * amount controls intensity (0..100), size controls grain size (1..100).
 */
export function createGrainFilter(params: {
  amount: number;
  size: number;
}): (imageData: ImageData) => void {
  return (imageData: ImageData) => {
    const { amount, size } = params;
    if (amount <= 0) return;

    const w = imageData.width;
    const h = imageData.height;
    const d = imageData.data;

    const intensity = (amount / 100) * 80; // Max noise amplitude in pixel values
    const grainSize = Math.max(1, Math.round((size / 100) * 4)); // 1..4 pixel blocks

    // Pre-generate noise grid at reduced resolution for grain size > 1
    const nw = Math.ceil(w / grainSize);
    const nh = Math.ceil(h / grainSize);
    const noise = new Float32Array(nw * nh);
    for (let i = 0; i < noise.length; i++) {
      noise[i] = (Math.random() - 0.5) * 2 * intensity;
    }

    for (let y = 0; y < h; y++) {
      const ny = Math.floor(y / grainSize);
      for (let x = 0; x < w; x++) {
        const nx = Math.floor(x / grainSize);
        const n = noise[ny * nw + nx];
        const idx = (y * w + x) * 4;
        d[idx] = Math.min(255, Math.max(0, Math.round(d[idx] + n)));
        d[idx + 1] = Math.min(255, Math.max(0, Math.round(d[idx + 1] + n)));
        d[idx + 2] = Math.min(255, Math.max(0, Math.round(d[idx + 2] + n)));
      }
    }
  };
}

/**
 * Sharpen: unsharp mask convolution.
 * amount controls sharpening strength (0..100), radius controls kernel size.
 */
export function createSharpenFilter(params: {
  amount: number;
  radius: number;
}): (imageData: ImageData) => void {
  return (imageData: ImageData) => {
    const { amount, radius } = params;
    if (amount <= 0) return;

    const w = imageData.width;
    const h = imageData.height;
    const d = imageData.data;
    const copy = new Uint8ClampedArray(d);

    const r = Math.max(1, Math.min(Math.round(radius), 5));
    const strength = amount / 100;

    // Simple box blur for the "unsharp" step
    const blurred = new Float32Array(w * h * 4);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let count = 0;

        for (let ky = -r; ky <= r; ky++) {
          const sy = Math.min(h - 1, Math.max(0, y + ky));
          for (let kx = -r; kx <= r; kx++) {
            const sx = Math.min(w - 1, Math.max(0, x + kx));
            const sIdx = (sy * w + sx) * 4;
            rSum += copy[sIdx];
            gSum += copy[sIdx + 1];
            bSum += copy[sIdx + 2];
            count++;
          }
        }

        const idx = (y * w + x) * 4;
        blurred[idx] = rSum / count;
        blurred[idx + 1] = gSum / count;
        blurred[idx + 2] = bSum / count;
      }
    }

    // Unsharp mask: original + strength * (original - blurred)
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, Math.max(0, Math.round(copy[i] + strength * (copy[i] - blurred[i]))));
      d[i + 1] = Math.min(
        255,
        Math.max(0, Math.round(copy[i + 1] + strength * (copy[i + 1] - blurred[i + 1]))),
      );
      d[i + 2] = Math.min(
        255,
        Math.max(0, Math.round(copy[i + 2] + strength * (copy[i + 2] - blurred[i + 2]))),
      );
    }
  };
}

/**
 * Apply per-channel lookup tables (Levels + Curves). Each LUT is a 256-entry
 * array mapping input intensity to output. Alpha is untouched.
 */
export function createChannelLutFilter(luts: {
  r: number[];
  g: number[];
  b: number[];
}): (imageData: ImageData) => void {
  return (imageData: ImageData) => {
    const d = imageData.data;
    const { r, g, b } = luts;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = r[d[i]];
      d[i + 1] = g[d[i + 1]];
      d[i + 2] = b[d[i + 2]];
    }
  };
}
