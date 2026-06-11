import { spawn } from "node:child_process";
import { resolveFfprobe } from "./binaries.js";

export interface MediaStreamInfo {
  type: "video" | "audio" | "other";
  codec: string;
  width?: number;
  height?: number;
}

export interface MediaInfo {
  container: string;
  durationS: number | null;
  bitrateKbps: number | null;
  streams: MediaStreamInfo[];
}

export interface ProbeOptions {
  timeoutMs?: number; // default 15s
}

/** Capped, time-limited ffprobe of a file path (spec 4.7). */
export async function probeMedia(filePath: string, opts: ProbeOptions = {}): Promise<MediaInfo> {
  const bin = resolveFfprobe();
  if (!bin) throw new Error("ffprobe binary not found (set FFPROBE_PATH or install ffmpeg)");
  const args = [
    "-v",
    "error",
    "-analyzeduration",
    "10M",
    "-probesize",
    "25M",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ];
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const stdout = await new Promise<string>((resolvePromise, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`ffprobe timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdout.on("data", (c: Buffer) => {
      out += c.toString("utf8");
    });
    child.stderr.on("data", (c: Buffer) => {
      err = (err + c.toString("utf8")).slice(-4096);
    });
    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolvePromise(out);
      else reject(new Error(`ffprobe exited ${code ?? signal}: ${err.slice(-1000)}`));
    });
  });
  const parsed = JSON.parse(stdout) as {
    format?: { format_name?: string; duration?: string; bit_rate?: string };
    streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }>;
  };
  const duration = parsed.format?.duration ? Number(parsed.format.duration) : null;
  const bitRate = parsed.format?.bit_rate ? Number(parsed.format.bit_rate) : null;
  return {
    container: parsed.format?.format_name ?? "unknown",
    durationS: Number.isFinite(duration as number) ? (duration as number) : null,
    bitrateKbps: Number.isFinite(bitRate as number) ? Math.round((bitRate as number) / 1000) : null,
    streams: (parsed.streams ?? []).map((s) => ({
      type: s.codec_type === "video" ? "video" : s.codec_type === "audio" ? "audio" : "other",
      codec: s.codec_name ?? "unknown",
      width: s.width,
      height: s.height,
    })),
  };
}
