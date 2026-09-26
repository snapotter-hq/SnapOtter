/**
 * Target-size tools (compress, compress-pdf and their presets) count a KB as
 * 1000 bytes. Upload forms that say "under 20 KB" almost always mean 20,000
 * bytes, so a 1024-byte KB could hand back a file the form then rejects (#1272).
 */
export const BYTES_PER_KB = 1000;

/** Byte budget for a KB target, floored so it never exceeds what was asked for. */
export function kbToBytes(kb: number): number {
  return Math.floor(kb * BYTES_PER_KB);
}

/**
 * "20 KB", "0.25 KB", "1234 KB": a byte budget as the KB figure the user typed.
 * Three decimals cover every whole byte, so nothing is rounded away.
 */
export function formatTargetKb(bytes: number): string {
  return `${Number((bytes / BYTES_PER_KB).toFixed(3))} KB`;
}
