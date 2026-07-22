import { spawn } from "node:child_process";
import { wrapWithMemoryLimit } from "@snapotter/shared";
import { resolveFfprobe } from "./binaries.js";
import { markIfInputError } from "./ffmpeg.js";

export interface MediaStreamInfo {
  type: "video" | "audio" | "other";
  codec: string;
  width?: number;
  height?: number;
  sampleRate?: number;
  channels?: number;
}

export interface MediaInfo {
  container: string;
  durationS: number | null;
  bitrateKbps: number | null;
  streams: MediaStreamInfo[];
  tags?: Record<string, string>;
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
    const [limBin, limArgs] = wrapWithMemoryLimit(bin, args);
    const child = spawn(limBin, limArgs, { stdio: ["ignore", "pipe", "pipe"] });
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
      else {
        const probeErr = new Error(`ffprobe exited ${code ?? signal}: ${err.slice(-1000)}`);
        reject(markIfInputError(probeErr, err));
      }
    });
  });
  const parsed = JSON.parse(stdout) as {
    format?: {
      format_name?: string;
      duration?: string;
      bit_rate?: string;
      tags?: Record<string, unknown>;
    };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      sample_rate?: string;
      channels?: number;
    }>;
  };
  const duration = parsed.format?.duration ? Number(parsed.format.duration) : null;
  const bitRate = parsed.format?.bit_rate ? Number(parsed.format.bit_rate) : null;
  const rawTags = (parsed.format?.tags ?? {}) as Record<string, unknown>;
  const tags: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawTags)) {
    if (typeof v === "string" && v.length > 0) tags[k.toLowerCase()] = v;
  }
  return {
    container: parsed.format?.format_name ?? "unknown",
    durationS: Number.isFinite(duration as number) ? (duration as number) : null,
    bitrateKbps: Number.isFinite(bitRate as number) ? Math.round((bitRate as number) / 1000) : null,
    streams: (parsed.streams ?? []).map((s) => {
      const sr = s.sample_rate ? Number(s.sample_rate) : undefined;
      return {
        type: s.codec_type === "video" ? "video" : s.codec_type === "audio" ? "audio" : "other",
        codec: s.codec_name ?? "unknown",
        width: s.width,
        height: s.height,
        sampleRate: Number.isFinite(sr) && (sr as number) > 0 ? sr : undefined,
        channels: typeof s.channels === "number" && s.channels > 0 ? s.channels : undefined,
      } as MediaStreamInfo;
    }),
    tags: Object.keys(tags).length > 0 ? tags : undefined,
  };
}
