/**
 * How long an AI sidecar process (the Python dispatcher and the accurate-OCR
 * runtime) may sit with no request before it exits and gives its memory back.
 *
 * The session cache's own reaper only frees models and GPU memory; the
 * interpreter plus torch/onnxruntime stays resident at 0.7 to 1.3 GB per
 * process. The default matches AI_SESSION_IDLE_TIMEOUT's auto value (600 s) so
 * an exit never discards a cached session earlier than that cache would have.
 * Raise this at least as high as AI_SESSION_IDLE_TIMEOUT if you raise that one.
 */
export const DEFAULT_SIDECAR_IDLE_TIMEOUT_S = 600;

/** Idle window in milliseconds. 0 means the process never exits on idle. */
export function resolveSidecarIdleTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.AI_SIDECAR_IDLE_TIMEOUT?.trim();
  if (raw === undefined || raw === "") return DEFAULT_SIDECAR_IDLE_TIMEOUT_S * 1000;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_SIDECAR_IDLE_TIMEOUT_S * 1000;
  return Math.floor(seconds * 1000);
}
