/**
 * Maximum input megapixels for CPU-only AI upscaling (#2513); a larger input
 * is reduced to fit first (#4820).
 * RealESRGAN_x4plus always runs at 4x internally (allocating a 4x output buffer
 * plus fp32 tile tensors), so a 4 MP ceiling caps the internal 4x array at
 * 64 MP (~192 MB RGB) on CPU hosts. Configurable via MAX_CPU_UPSCALE_MP (0 = unlimited).
 */
export const MAX_CPU_UPSCALE_MP = 4;

/**
 * Maximum output megapixels (`width * height * scale^2 / 1e6`) on CPU hosts,
 * equal to a 4 MP input at 4x scale (64 MP). Bounds high scale factors (6x, 8x)
 * on smaller inputs so the final upscaled array cannot OOM a 4 GB container.
 * Scales with MAX_CPU_UPSCALE_MP.
 */
export const MAX_CPU_UPSCALE_OUTPUT_MP = 64;

/**
 * The size a CPU host reduces the input to before upscaling, or null when it
 * already fits (#4820). Refusing a 12 MP phone photo after the upload left
 * people with nothing, so the input shrinks to the largest size both ceilings
 * allow: `maxCpuMp` for the AI models (lanczos is exempt), and the output
 * ceiling `maxCpuMp * 16` divided by the scale squared. Floors keep the result
 * within the budget (bar the 1 px minimum side); 0 disables both.
 *
 * Shared so the upscale panel can warn before the run with the same numbers
 * the server will use (#5036).
 */
export function cpuFitDimensions(
  width: number,
  height: number,
  scale: number,
  model: string | undefined,
  maxCpuMp: number,
): { width: number; height: number } | null {
  if (maxCpuMp <= 0 || width <= 0 || height <= 0) return null;
  const maxCpuOutputMp = maxCpuMp * (MAX_CPU_UPSCALE_OUTPUT_MP / MAX_CPU_UPSCALE_MP);
  const outputBudgetMp = scale > 0 ? maxCpuOutputMp / scale ** 2 : Number.POSITIVE_INFINITY;
  const budgetMp = model === "lanczos" ? outputBudgetMp : Math.min(maxCpuMp, outputBudgetMp);
  const megapixels = (width * height) / 1_000_000;
  if (megapixels <= budgetMp) return null;
  const factor = Math.sqrt(budgetMp / megapixels);
  return {
    width: Math.max(1, Math.floor(width * factor)),
    height: Math.max(1, Math.floor(height * factor)),
  };
}

/**
 * Past the point where the fitted result would be no bigger than the original
 * (a 48 MP photo at 2x lands at 16 MP), an "upscaled" file is a downgrade, so
 * the server refuses instead of reducing.
 */
export function cpuFitRefuses(
  width: number,
  height: number,
  scale: number,
  fit: { width: number; height: number },
): boolean {
  return fit.width * fit.height * scale ** 2 <= width * height;
}
