import { describe, expect, it, vi } from "vitest";

const runFfprobe = vi.hoisted(() => vi.fn());

vi.mock("@snapotter/media-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@snapotter/media-engine")>()),
  runFfprobe,
  softwareEncoder: vi.fn(() => "libx264"),
}));

import {
  canEncodeHead,
  headEncodeArgs,
  planSmartCut,
  probeVideoPackets,
  type SmartCutSource,
  smartCutContainerSupported,
  type VideoPacket,
} from "../../../apps/api/src/lib/smart-cut.js";

// media-30s.mp4's real layout around its second keyframe (#4370): 24 fps,
// keyframes at 0 and 8.023193, two B-frames per P in decode order.
function gop(keyS: number, count: number): VideoPacket[] {
  const frame = 1 / 24;
  const out: VideoPacket[] = [{ pts: keyS, key: true }];
  // Decode order I, P3, B1, B2, P6, B4, B5, ...
  for (let base = 0; base + 3 < count; base += 3) {
    out.push({ pts: keyS + (base + 3) * frame, key: false });
    out.push({ pts: keyS + (base + 1) * frame, key: false });
    out.push({ pts: keyS + (base + 2) * frame, key: false });
  }
  return out;
}

const PACKETS = [...gop(0, 193), ...gop(8.023193, 193)];

const H264: SmartCutSource = {
  startTimeS: 0,
  codec: "h264",
  profile: "High",
  pixFmt: "yuv420p",
  level: 21,
  fieldOrder: "progressive",
  rotation: 0,
  hasSideStreams: true,
};

describe("planSmartCut", () => {
  it("re-encodes the whole range when it ends before the next keyframe (#4370 repro)", () => {
    expect(planSmartCut(PACKETS, 2, 7, true)).toEqual({ kind: "reencode" });
  });

  it("re-encodes only the head when a keyframe falls inside the range", () => {
    const plan = planSmartCut(PACKETS, 2, 12, true);
    expect(plan).toMatchObject({ kind: "smart", keyframeS: 8.023193 });
    // 8.023193 + n/24 < 12 holds for n = 0..95; the P-frame at n = 96 is a
    // reference for the B-frames before it, so decode order keeps it too.
    expect(plan.kind === "smart" && plan.frames).toBe(97);
  });

  it("copies without re-encoding when the start is on a keyframe", () => {
    expect(planSmartCut(PACKETS, 8.023193, 12, true)).toMatchObject({
      kind: "copy",
      keyframeS: 8.023193,
    });
    expect(planSmartCut(PACKETS, 0, 3, false)).toMatchObject({ kind: "copy", keyframeS: 0 });
  });

  it("treats a start within a millisecond of a keyframe as on it", () => {
    expect(planSmartCut(PACKETS, 8.0225, 12, true)).toMatchObject({ kind: "copy" });
    expect(planSmartCut(PACKETS, 8.0239, 12, true)).toMatchObject({ kind: "copy" });
  });

  it("copies when no frame is shown between start and the first keyframe", () => {
    // hero.mkv: start_time -0.023, so its first keyframe lands at 0.023 on
    // ffmpeg's timeline and a start of 0 has nothing before it to encode.
    const shifted = gop(0.023, 97);
    expect(planSmartCut(shifted, 0, 3, false)).toMatchObject({ kind: "copy", keyframeS: 0.023 });
  });

  it("copies when the start falls after the last frame before the keyframe", () => {
    // Here the frame before 8.023193 is at 8.0; ffmpeg's seek drops it for a
    // start of 8.0005, so a "smart" plan would encode an empty head.
    expect(planSmartCut(PACKETS, 8.0005, 12, true)).toMatchObject({
      kind: "copy",
      keyframeS: 8.023193,
    });
  });

  it("re-encodes when the head cannot be encoded to match", () => {
    expect(planSmartCut(PACKETS, 2, 12, false)).toEqual({ kind: "reencode" });
  });

  it("re-encodes when the keyframe opens an open GOP", () => {
    const open: VideoPacket[] = [
      { pts: 0, key: true },
      { pts: 1, key: false },
      { pts: 2, key: true },
      // Shown before the keyframe, decoded after it: needs the previous GOP.
      { pts: 1.5, key: false },
      { pts: 3, key: false },
    ];
    expect(planSmartCut(open, 0.5, 4, true)).toEqual({ kind: "reencode" });
  });

  it("re-encodes when no packets were read", () => {
    expect(planSmartCut([], 0, 5, true)).toEqual({ kind: "reencode" });
  });

  it("never picks a keyframe at or past the end", () => {
    expect(planSmartCut(PACKETS, 1, 8.023193, true)).toEqual({ kind: "reencode" });
  });
});

describe("canEncodeHead", () => {
  it("accepts progressive 8-bit 4:2:0 H.264 in mp4, mov and mkv", () => {
    for (const ext of [".mp4", ".M4V", ".mov", ".mkv"]) expect(canEncodeHead(H264, ext)).toBe(true);
    expect(canEncodeHead({ ...H264, fieldOrder: undefined }, ".mp4")).toBe(true);
  });

  it("rejects what libx264 can't splice cleanly", () => {
    expect(canEncodeHead(H264, ".webm")).toBe(false);
    expect(canEncodeHead({ ...H264, codec: "hevc" }, ".mp4")).toBe(false);
    expect(canEncodeHead({ ...H264, profile: "High 10" }, ".mp4")).toBe(false);
    expect(canEncodeHead({ ...H264, pixFmt: "yuv422p" }, ".mp4")).toBe(false);
    expect(canEncodeHead({ ...H264, fieldOrder: "tt" }, ".mp4")).toBe(false);
    expect(canEncodeHead({ ...H264, profile: undefined }, ".mp4")).toBe(false);
  });
});

describe("smartCutContainerSupported", () => {
  it("covers the containers the copy path was verified on", () => {
    for (const ext of [".mp4", ".mov", ".mkv", ".webm"]) {
      expect(smartCutContainerSupported(ext)).toBe(true);
    }
    for (const ext of [".avi", ".flv", ".mpg", ".ts", ".3gp"]) {
      expect(smartCutContainerSupported(ext)).toBe(false);
    }
  });
});

describe("headEncodeArgs", () => {
  it("matches the source profile, pixel format and level", () => {
    expect(headEncodeArgs(H264)).toEqual([
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "18",
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-x264-params",
      "sps-id=31",
      "-level:v",
      "2.1",
    ]);
  });

  it("maps constrained baseline and omits an unknown level", () => {
    const args = headEncodeArgs({ ...H264, profile: "Constrained Baseline", level: undefined });
    expect(args).toContain("baseline");
    expect(args).not.toContain("-level:v");
  });
});

describe("probeVideoPackets", () => {
  it("reads to an absolute end past endS and shifts pts onto the -ss timeline", async () => {
    runFfprobe.mockResolvedValueOnce(
      JSON.stringify({
        packets: [
          { pts_time: "1.500000", flags: "K__" },
          { pts_time: "1.541667", flags: "___" },
          { pts_time: "N/A", flags: "___" },
        ],
      }),
    );
    const packets = await probeVideoPackets(
      "/in.mp4",
      { ...H264, startTimeS: 1.5 },
      120,
      600,
      new AbortController().signal,
    );
    const args = runFfprobe.mock.calls[0][0] as string[];
    // A "+duration" end counts from the keyframe ffprobe seeks back to, so a
    // long GOP (keyframes at 0 and 250 s) cut 120..600 stopped reading at 490 s.
    expect(args[args.indexOf("-read_intervals") + 1]).toBe("121.5%611.5");
    expect(packets).toEqual([
      { pts: 0, key: true },
      { pts: expect.closeTo(0.041667, 6), key: false },
    ]);
  });
});
