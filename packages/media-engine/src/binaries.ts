import { spawnSync } from "node:child_process";

let ffmpegPath: string | null | undefined;
let ffprobePath: string | null | undefined;

function which(bin: string): string | null {
  const res = spawnSync(process.platform === "win32" ? "where" : "which", [bin], {
    encoding: "utf8",
  });
  if (res.status === 0 && res.stdout.trim()) return res.stdout.trim().split("\n")[0];
  return null;
}

/** FFMPEG_PATH env override, else $PATH. Null when unavailable. Cached. */
export function resolveFfmpeg(): string | null {
  if (ffmpegPath === undefined) ffmpegPath = process.env.FFMPEG_PATH || which("ffmpeg");
  return ffmpegPath;
}

export function resolveFfprobe(): string | null {
  if (ffprobePath === undefined) ffprobePath = process.env.FFPROBE_PATH || which("ffprobe");
  return ffprobePath;
}

export function ffmpegAvailable(): boolean {
  return resolveFfmpeg() !== null && resolveFfprobe() !== null;
}
