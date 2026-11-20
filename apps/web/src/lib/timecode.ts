const WHOLE = /^\d+$/;
const SECONDS = /^\d+(?:[.,]\d+)?$/;

/**
 * Reads plain seconds ("90", "12.5") or a colon timecode ("1:30",
 * "01:02:03.5"). Only the last field may carry a fraction, and every field
 * after the first must be under 60. Returns null for anything else.
 */
export function parseTimecode(input: string): number | null {
  const parts = input.trim().split(":");
  if (parts.length > 3) return null;
  const last = parts.pop() as string;
  if (!SECONDS.test(last)) return null;
  const seconds = Number(last.replace(",", "."));
  if (parts.length > 0 && seconds >= 60) return null;
  let total = 0;
  for (const [i, part] of parts.entries()) {
    if (!WHOLE.test(part)) return null;
    const n = Number(part);
    if (i > 0 && n >= 60) return null;
    total = total * 60 + n;
  }
  const result = total * 60 + seconds;
  return Number.isFinite(result) ? result : null;
}

/** Formats seconds as M:SS, or H:MM:SS from an hour up, keeping up to 3 decimals. */
export function formatTimecode(totalSeconds: number): string {
  const ms = Math.round(Math.max(0, totalSeconds) * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const frac = ms % 1000;
  const sec = `${s.toString().padStart(2, "0")}${frac ? `.${frac.toString().padStart(3, "0").replace(/0+$/, "")}` : ""}`;
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
