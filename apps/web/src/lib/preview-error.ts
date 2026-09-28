/**
 * The encoder a failed preview request says the server's ffmpeg lacks, or
 * null. The API only names a reason worth showing in that case: it answers
 * 422 with `code: "ENCODER_MISSING"` and the encoder (#1290). Anything else,
 * including a body that isn't JSON (a proxy error page), is null.
 *
 * Returns data rather than a sentence so the caller translates it when it
 * renders, and a language switch while the error is on screen still applies.
 */
export async function previewFailureEncoder(res: Pick<Response, "json">): Promise<string | null> {
  const body: unknown = await res.json().catch(() => null);
  if (
    body !== null &&
    typeof body === "object" &&
    (body as { code?: unknown }).code === "ENCODER_MISSING" &&
    typeof (body as { encoder?: unknown }).encoder === "string"
  ) {
    return (body as { encoder: string }).encoder;
  }
  return null;
}
