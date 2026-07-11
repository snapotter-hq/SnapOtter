/**
 * crypto.randomUUID only exists in secure contexts, and self-hosted SnapOtter
 * is very often reached over plain http on a LAN, where calling it throws
 * (Sentry NODE-1K/1M crashed Sign PDF exactly this way). getRandomValues works
 * everywhere, so fall back to assembling a v4 UUID from it.
 */
export function safeRandomUUID(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
