import { env } from "../config.js";

type ToolCategory = "sharp" | "ai_cpu" | "ai_gpu" | "external" | "python";

const TIMEOUT_RATES: Record<ToolCategory, number> = {
  sharp: 2,
  ai_cpu: 30,
  ai_gpu: 5,
  external: 10,
  python: 15,
};

export function computeTimeout(megapixels: number, category: ToolCategory, fileCount = 1): number {
  if (env.PROCESSING_TIMEOUT_S > 0) {
    return env.PROCESSING_TIMEOUT_S * 1000;
  }
  const perFile = Math.max(60_000, megapixels * TIMEOUT_RATES[category] * 1000);
  return perFile * fileCount;
}

export function computeExternalToolTimeout(megapixels: number): number {
  if (env.PROCESSING_TIMEOUT_S > 0) {
    return env.PROCESSING_TIMEOUT_S * 1000;
  }
  return Math.max(60_000, megapixels * TIMEOUT_RATES.external * 1000);
}

/**
 * User-facing message for a job that exceeded its worker timeout. Tool-agnostic
 * on purpose: the previous copy hardcoded "background-removal", so an AI upscale
 * that timed out on a modest CPU told the user a background-removal model was
 * still downloading. Set the CPU-vs-GPU expectation instead, which is the usual
 * reason heavy AI times out on self-hosted hardware (#591).
 */
export function timeoutMessage(timeoutMs: number): string {
  const seconds = Math.round(timeoutMs / 1000);
  // Must stay under friendlyError's 280-char / 3-line limit, or the whole
  // message collapses to the generic "Processing failed" fallback
  // (worker-timeout.test.ts guards this).
  return (
    `Timed out after ${seconds}s. Heavy tools run much slower on CPU than a GPU, ` +
    `so a large input can exceed the limit; on the first run the model may still ` +
    `be downloading. Try a smaller input or retry.`
  );
}
