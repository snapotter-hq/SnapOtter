import type { TranslationKeys } from "@snapotter/shared";
import { format } from "@/lib/format";

/**
 * What to tell the user when a preview request fails. The API only names a
 * reason worth showing when the server's ffmpeg lacks an encoder: it answers
 * 422 with `code: "ENCODER_MISSING"` and the encoder, which becomes a
 * translated message naming it (#1290). Anything else, including a body that
 * isn't JSON (a proxy error page), gets `fallback`.
 */
export async function previewFailureMessage(
  res: Pick<Response, "json">,
  t: TranslationKeys,
  fallback: string,
): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  if (
    body !== null &&
    typeof body === "object" &&
    (body as { code?: unknown }).code === "ENCODER_MISSING" &&
    typeof (body as { encoder?: unknown }).encoder === "string"
  ) {
    return format(t.toolPage.previewEncoderMissing, {
      encoder: (body as { encoder: string }).encoder,
    });
  }
  return fallback;
}
