import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { runFfprobe, softwareEncoder } from "@snapotter/media-engine";
import type { ToolProcessCtxV2 } from "../routes/tool-factory.js";
import { formatFfmpegSeconds, mp4TimescaleArgs, runFfmpegWithProgress } from "./media-tool.js";

/**
 * Smart cut for trim-video's fast mode (#4370): re-encode only the frames
 * between the requested start and the next keyframe, stream-copy from that
 * keyframe on, and join the two. Plain `-ss` before `-i` with `-c copy`
 * snaps the start back to the previous keyframe, so a 2..7 s request came
 * back 7.1 s long.
 */

/** A video packet on ffmpeg's -ss timeline (container start_time removed), in decode order. */
export interface VideoPacket {
  pts: number;
  key: boolean;
}

export type SmartCutPlan =
  /** Start is on a keyframe: stream-copy `frames` packets from it. */
  | { kind: "copy"; keyframeS: number; frames: number }
  /** Re-encode [start, keyframeS), then stream-copy `frames` packets from keyframeS. */
  | { kind: "smart"; keyframeS: number; frames: number }
  /** No safe copy point: re-encode the whole range. */
  | { kind: "reencode" };

/**
 * ffprobe prints timestamps to the microsecond, so a start within a
 * millisecond of a keyframe is that keyframe. Frames are at least ~4 ms
 * apart even at 240 fps, so this never merges two frames.
 */
const ON_KEYFRAME_TOLERANCE_S = 0.001;
/** Margin under a frame boundary so float rounding can't pull in the next frame. */
const FRAME_EDGE_S = 0.0005;

/**
 * Decides how to cut [startS, endS) from packets read around that range.
 * `canEncodeHead` says whether a re-encoded head would splice cleanly onto
 * the copied stream; without it only a start that is already on a keyframe
 * can be copied.
 */
export function planSmartCut(
  packets: VideoPacket[],
  startS: number,
  endS: number,
  canEncodeHead: boolean,
): SmartCutPlan {
  const keyIndex = packets.findIndex(
    (p) => p.key && p.pts >= startS - ON_KEYFRAME_TOLERANCE_S && p.pts < endS - FRAME_EDGE_S,
  );
  if (keyIndex === -1) return { kind: "reencode" };
  const keyframeS = packets[keyIndex].pts;
  let frames = 0;
  for (let i = keyIndex; i < packets.length; i++) {
    // A frame shown before the keyframe but decoded after it belongs to an
    // open GOP: it references the previous GOP, which the copy drops.
    if (packets[i].pts < keyframeS - FRAME_EDGE_S) return { kind: "reencode" };
    // Counted in decode order, so reference frames past endS that earlier
    // frames need are kept; the copy can overshoot by up to one B-frame
    // group (one frame on media-30s.mp4, up to ~3 with x264's b-pyramid).
    if (packets[i].pts < endS - FRAME_EDGE_S) frames = i - keyIndex + 1;
  }
  // No frame shown between start and the keyframe (start on it, or in the
  // gap a negative container start_time leaves before the first frame).
  // No tolerance here: ffmpeg's accurate seek drops every frame before
  // startS, so a frame a hair earlier would leave the head empty.
  const headHasFrames = packets.some((p) => p.pts >= startS && p.pts < keyframeS - FRAME_EDGE_S);
  if (!headHasFrames) return { kind: "copy", keyframeS, frames };
  return canEncodeHead ? { kind: "smart", keyframeS, frames } : { kind: "reencode" };
}

/** Containers whose stream-copy output we verified through the smart-cut path. */
const COPY_CONTAINERS = new Set([".mp4", ".m4v", ".mov", ".mkv", ".webm"]);
/** Containers that can hold the re-encoded H.264 head next to copied H.264. */
const HEAD_CONTAINERS = new Set([".mp4", ".m4v", ".mov", ".mkv"]);
const MP4_FAMILY = new Set([".mp4", ".m4v", ".mov"]);
const X264_PROFILES: Record<string, string> = {
  "Constrained Baseline": "baseline",
  Baseline: "baseline",
  Main: "main",
  High: "high",
};
const X264_PIX_FMTS = new Set(["yuv420p", "yuvj420p"]);

export interface SmartCutSource {
  /** Format start_time, subtracted from packet pts to land on ffmpeg's -ss timeline. */
  startTimeS: number;
  codec: string;
  /** Sample-entry fourcc (hvc1, avc1, ...), reapplied because the intermediates drop it. */
  codecTag?: string;
  profile?: string;
  pixFmt?: string;
  level?: number;
  fieldOrder?: string;
  /** Display-matrix rotation in degrees, 0 when absent. */
  rotation: number;
  /** Audio or subtitle streams that must be cut and carried alongside the video. */
  hasSideStreams: boolean;
}

/**
 * Whether a head re-encoded with libx264 can share a stream with the copied
 * rest: same codec family, a profile and 8-bit 4:2:0 pixel format libx264
 * reproduces, and progressive frames. Anything else re-encodes the range.
 */
export function canEncodeHead(source: SmartCutSource, ext: string): boolean {
  if (!HEAD_CONTAINERS.has(ext.toLowerCase())) return false;
  if (source.codec !== "h264") return false;
  if (!source.profile || !(source.profile in X264_PROFILES)) return false;
  if (!source.pixFmt || !X264_PIX_FMTS.has(source.pixFmt)) return false;
  const field = source.fieldOrder ?? "unknown";
  return field === "progressive" || field === "unknown";
}

export function smartCutContainerSupported(ext: string): boolean {
  return COPY_CONTAINERS.has(ext.toLowerCase());
}

/** libx264 args that reproduce the source's profile, level and pixel format. */
export function headEncodeArgs(source: SmartCutSource): string[] {
  const args = [
    "-c:v",
    softwareEncoder("h264"),
    "-preset",
    "fast",
    "-crf",
    "18",
    "-profile:v",
    X264_PROFILES[source.profile as string],
    "-pix_fmt",
    source.pixFmt as string,
    // The joined MP4 keeps only the head's SPS/PPS in avcC and carries the
    // body's in band. Distinct ids (sources almost always use 0) stop a
    // decoder that caches parameter sets by id from reusing the head's
    // PPS for the copied frames.
    "-x264-params",
    "sps-id=31",
  ];
  // ffprobe reports H.264 level_idc as level x 10 (21 = 2.1).
  if (source.level !== undefined && source.level > 0) {
    args.push("-level:v", (source.level / 10).toFixed(1));
  }
  return args;
}

interface ProbeJson {
  format?: { start_time?: string };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    codec_tag_string?: string;
    profile?: string;
    pix_fmt?: string;
    level?: number;
    field_order?: string;
    side_data_list?: Array<{ rotation?: number }>;
  }>;
  packets?: Array<{ pts_time?: string; flags?: string }>;
}

/** Stream facts the smart cut needs; null when the file has no video stream. */
export async function probeSmartCutSource(
  inPath: string,
  signal: AbortSignal,
): Promise<SmartCutSource | null> {
  const out = await runFfprobe(
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_entries",
      "format=start_time:stream=codec_type,codec_name,codec_tag_string,profile,pix_fmt,level,field_order:stream_side_data=rotation",
      inPath,
    ],
    { signal },
  );
  const parsed = JSON.parse(out) as ProbeJson;
  const streams = parsed.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  if (!video?.codec_name) return null;
  const startTime = Number(parsed.format?.start_time);
  const rotation = video.side_data_list?.find((d) => typeof d.rotation === "number")?.rotation;
  return {
    startTimeS: Number.isFinite(startTime) ? startTime : 0,
    codec: video.codec_name,
    codecTag: video.codec_tag_string,
    profile: video.profile,
    pixFmt: video.pix_fmt,
    level: video.level,
    fieldOrder: video.field_order,
    rotation: rotation ?? 0,
    hasSideStreams: streams.some((s) => s.codec_type === "audio" || s.codec_type === "subtitle"),
  };
}

/**
 * How far past endS packets are read. Reference frames that frames before
 * endS depend on sit a few frames later in presentation order; 10 s covers
 * that even for slideshow-rate video.
 */
const PACKET_READ_MARGIN_S = 10;

/** First video stream's packets around [startS, endS], in decode order. */
export async function probeVideoPackets(
  inPath: string,
  source: SmartCutSource,
  startS: number,
  endS: number,
  signal: AbortSignal,
): Promise<VideoPacket[]> {
  const from = source.startTimeS + startS;
  const to = source.startTimeS + endS + PACKET_READ_MARGIN_S;
  const out = await runFfprobe(
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      // An absolute end: a "+duration" end counts from the keyframe ffprobe
      // seeked back to, which on a long GOP stops short of endS.
      "-read_intervals",
      `${formatFfmpegSeconds(from)}%${formatFfmpegSeconds(to)}`,
      "-print_format",
      "json",
      "-show_entries",
      "packet=pts_time,flags",
      inPath,
    ],
    { signal, timeoutMs: 60_000 },
  );
  const packets: VideoPacket[] = [];
  for (const p of (JSON.parse(out) as ProbeJson).packets ?? []) {
    const pts = Number(p.pts_time);
    if (!Number.isFinite(pts)) continue;
    packets.push({ pts: pts - source.startTimeS, key: p.flags?.includes("K") ?? false });
  }
  return packets;
}

/**
 * Runs a copy or smart plan into outPath. Video goes through intermediate
 * segments joined by the concat demuxer; MPEG-TS for H.264 keeps each
 * segment's SPS/PPS in band, so the decoder follows the switch from the
 * re-encoded head to the copied body. Audio and subtitles are cut by packet
 * from the source in its own container, and global metadata and rotation
 * are carried over from the source.
 */
export async function runSmartCut(
  ctx: ToolProcessCtxV2,
  opts: {
    inPath: string;
    outPath: string;
    ext: string;
    startS: number;
    endS: number;
    source: SmartCutSource;
    plan: Exclude<SmartCutPlan, { kind: "reencode" }>;
  },
): Promise<void> {
  const { inPath, outPath, ext, startS, endS, source, plan } = opts;
  const dir = dirname(outPath);
  const segExt = source.codec === "h264" ? ".ts" : ".mkv";
  const list: string[] = [];

  if (plan.kind === "smart") {
    const headName = `smartcut-head${segExt}`;
    const headPath = join(dir, headName);
    await runFfmpegWithProgress(
      ctx,
      [
        "-ss",
        formatFfmpegSeconds(startS),
        // Encode the stored orientation; the copied body keeps it too, and
        // the rotation is reapplied to the joined stream below.
        "-noautorotate",
        "-i",
        inPath,
        "-t",
        formatFfmpegSeconds(plan.keyframeS - startS - FRAME_EDGE_S),
        "-map",
        "0:v:0",
        "-an",
        "-sn",
        "-dn",
        ...headEncodeArgs(source),
        headPath,
      ],
      plan.keyframeS - startS,
    );
    list.push(`file '${headName}'`, `duration ${formatFfmpegSeconds(plan.keyframeS - startS)}`);
  }

  const bodyName = `smartcut-body${segExt}`;
  const bodyPath = join(dir, bodyName);
  await runFfmpegWithProgress(
    ctx,
    [
      // Seek a hair past the keyframe: -ss lands on the last keyframe at or
      // before its target, and a target rounded below it would land a GOP early.
      "-ss",
      formatFfmpegSeconds(plan.keyframeS + FRAME_EDGE_S / 5),
      "-i",
      inPath,
      "-map",
      "0:v:0",
      "-frames:v",
      String(plan.frames),
      "-c",
      "copy",
      bodyPath,
    ],
    null,
  );
  // Bare names: the concat demuxer resolves them next to the list file.
  list.push(`file '${bodyName}'`);
  const listPath = join(dir, "smartcut-list.txt");
  await writeFile(listPath, `${list.join("\n")}\n`);

  const inputs = ["-f", "concat", "-safe", "0", "-i", listPath];
  // A copy whose start fell in the gap before the keyframe shows nothing
  // until that keyframe; delay the video so it stays in sync with the audio,
  // which is cut from startS.
  const leadS = plan.kind === "copy" ? plan.keyframeS - startS : 0;
  if (leadS > FRAME_EDGE_S) inputs.unshift("-itsoffset", formatFfmpegSeconds(leadS));
  if (source.rotation !== 0) {
    inputs.unshift("-display_rotation:v:0", String(source.rotation));
  }
  const maps = ["-map", "0:v"];
  if (source.hasSideStreams) {
    const sidePath = join(dir, `smartcut-side${ext}`);
    await runFfmpegWithProgress(
      ctx,
      [
        "-i",
        inPath,
        "-ss",
        formatFfmpegSeconds(startS),
        "-to",
        formatFfmpegSeconds(endS),
        "-map",
        "0:a?",
        "-map",
        "0:s?",
        "-c",
        "copy",
        sidePath,
      ],
      null,
    );
    inputs.push("-i", sidePath);
    maps.push("-map", "1");
  }
  const metadataInput = source.hasSideStreams ? 2 : 1;
  // Matroska and MPEG-TS have no fourcc, so without this an iPhone's hvc1
  // HEVC comes back as hev1, which QuickTime and Safari won't play.
  const tagArgs =
    MP4_FAMILY.has(ext.toLowerCase()) && source.codecTag && /^[a-z0-9]{4}$/i.test(source.codecTag)
      ? ["-tag:v", source.codecTag]
      : [];
  await runFfmpegWithProgress(
    ctx,
    [
      ...inputs,
      "-i",
      inPath,
      ...maps,
      "-map_metadata",
      String(metadataInput),
      "-c",
      "copy",
      ...tagArgs,
      ...mp4TimescaleArgs(ext),
      outPath,
    ],
    null,
  );
}
