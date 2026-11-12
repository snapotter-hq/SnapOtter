import type { TranslationKeys } from "@snapotter/shared";
import { format } from "@/lib/format";

/**
 * Why a preview request failed, when the API names a reason worth showing:
 * - `encoder-missing`: 422 `code: "ENCODER_MISSING"` with the encoder the
 *   server's ffmpeg lacks (#1290).
 * - `engine-unavailable`: 503 `code: "ENGINE_UNAVAILABLE"`, sent when the
 *   server can't run ffmpeg at all (#4149).
 */
export type PreviewFailureReason =
  | { kind: "encoder-missing"; encoder: string }
  | { kind: "engine-unavailable" };

/**
 * The reason a failed preview response gives, or null. Anything without one
 * of the codes above, including a body that isn't JSON (a proxy error page),
 * is null.
 *
 * Returns data rather than a sentence so the caller translates it when it
 * renders, and a language switch while the error is on screen still applies.
 */
export async function previewFailureReason(
  res: Pick<Response, "json">,
): Promise<PreviewFailureReason | null> {
  const body: unknown = await res.json().catch(() => null);
  if (body === null || typeof body !== "object") return null;
  const { code, encoder } = body as { code?: unknown; encoder?: unknown };
  if (code === "ENCODER_MISSING" && typeof encoder === "string") {
    return { kind: "encoder-missing", encoder };
  }
  if (code === "ENGINE_UNAVAILABLE") return { kind: "engine-unavailable" };
  return null;
}

/** The translated message for a failure reason, or `fallback` when there is none. */
export function previewFailureMessage(
  reason: PreviewFailureReason | null,
  t: TranslationKeys,
  fallback: string,
): string {
  if (reason?.kind === "encoder-missing") {
    return format(t.toolPage.previewEncoderMissing, { encoder: reason.encoder });
  }
  if (reason?.kind === "engine-unavailable") return t.toolPage.previewEngineUnavailable;
  return fallback;
}
