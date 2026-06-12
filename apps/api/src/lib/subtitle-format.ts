export interface TranscriptSegment {
  startS: number;
  endS: number;
  text: string;
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, "0");
}

function stamp(totalS: number, msSep: string): string {
  const ms = Math.max(0, Math.round(totalS * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const frac = ms % 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}${msSep}${pad(frac, 3)}`;
}

/** SubRip: 1-based counters, comma millisecond separator. */
export function toSrt(segments: TranscriptSegment[]): string {
  return segments
    .map(
      (seg, i) =>
        `${i + 1}\n${stamp(seg.startS, ",")} --> ${stamp(seg.endS, ",")}\n${seg.text.trim()}\n`,
    )
    .join("\n");
}

/** WebVTT: header + dot millisecond separator, no counters. */
export function toVtt(segments: TranscriptSegment[]): string {
  const body = segments
    .map((seg) => `${stamp(seg.startS, ".")} --> ${stamp(seg.endS, ".")}\n${seg.text.trim()}\n`)
    .join("\n");
  return `WEBVTT\n\n${body}`;
}
