/**
 * Shortest window trim-video and trim-audio keep. Audio stream copy cannot cut
 * below one codec frame (mp3 ~26ms, flac up to ~93ms) and a shorter video
 * window can hold no frame at all, so either way the output comes out empty.
 * The windowTooShort strings in every locale quote this value.
 */
export const MIN_TRIM_WINDOW_S = 0.1;

/** Absorbs float subtraction, so 5.1 - 5 counts as the full 0.1s. */
const WINDOW_EPSILON_S = 1e-9;

export function isTrimWindowTooShort(startS: number, endS: number): boolean {
  return endS - startS < MIN_TRIM_WINDOW_S - WINDOW_EPSILON_S;
}
