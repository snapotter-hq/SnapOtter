/**
 * User-facing message for a job that exceeded its worker timeout. Tool-agnostic
 * on purpose: the previous copy hardcoded "background-removal", so an AI upscale
 * that timed out on a modest CPU told the user a background-removal model was
 * still downloading. Set the CPU-vs-GPU expectation instead, which is the usual
 * reason heavy AI times out on self-hosted hardware (#591).
 *
 * That AI wording only fits the `ai` pool, though: a qpdf split or an image
 * job has no model to download and no GPU to miss, so non-AI pools get a
 * plain time-limit message naming the setting that controls their deadline
 * (`JOB_TIMEOUT_LONG_S` for the media pool, `JOB_TIMEOUT_FAST_S` for the
 * other fast pools) (#4516).
 */
export function timeoutMessage(timeoutMs: number, pool?: string): string {
  const seconds = Math.round(timeoutMs / 1000);
  // Must stay under friendlyError's 280-char / 3-line limit, or the whole
  // message collapses to the generic "Processing failed" fallback
  // (worker-timeout.test.ts guards this).
  if (pool === "ai") {
    return (
      `Timed out after ${seconds}s. Heavy tools run much slower on CPU than a GPU, ` +
      `so a large input can exceed the limit; on the first run the model may still ` +
      `be downloading. Try a smaller input or retry.`
    );
  }
  const setting = pool === "media" ? "JOB_TIMEOUT_LONG_S" : "JOB_TIMEOUT_FAST_S";
  return (
    `Timed out after ${seconds}s. Large inputs can exceed the processing time ` +
    `limit; an admin can raise ${setting}. Try a smaller input or retry.`
  );
}
