export interface FfmpegProgress {
  outTimeMs: number | null;
  done: boolean;
  raw: Record<string, string>;
}

/** Parses one `-progress pipe:1` block (key=value lines ending in progress=...). */
export function parseProgressBlock(block: string): FfmpegProgress {
  const raw: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const idx = line.indexOf("=");
    if (idx > 0) raw[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  let outTimeMs: number | null = null;
  if (raw.out_time_us !== undefined) {
    const us = Number(raw.out_time_us);
    if (Number.isFinite(us)) outTimeMs = Math.round(us / 1000);
  } else if (raw.out_time_ms !== undefined) {
    // ffmpeg's out_time_ms is historically MICROseconds despite the name.
    const us = Number(raw.out_time_ms);
    if (Number.isFinite(us)) outTimeMs = Math.round(us / 1000);
  }
  return { outTimeMs, done: raw.progress === "end", raw };
}
