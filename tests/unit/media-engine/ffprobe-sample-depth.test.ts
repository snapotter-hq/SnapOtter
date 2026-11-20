import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("../../../packages/media-engine/src/binaries.js", () => ({
  resolveFfprobe: vi.fn(() => "/usr/bin/ffprobe"),
}));
vi.mock("@snapotter/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@snapotter/shared")>()),
  wrapWithMemoryLimit: vi.fn((bin: string, args: string[]) => [bin, args]),
}));

function createMockProcess(): ChildProcess {
  const child = new EventEmitter() as unknown as ChildProcess;
  Object.assign(child, {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    killed: false,
    kill: vi.fn(() => true),
  });
  return child;
}

async function probeStream(stream: Record<string, unknown>) {
  const child = createMockProcess();
  vi.mocked(spawn).mockReturnValue(child);
  const { probeMedia } = await import("../../../packages/media-engine/src/ffprobe.js");
  const result = probeMedia("/tmp/in");
  child.stdout?.emit("data", Buffer.from(JSON.stringify({ format: {}, streams: [stream] })));
  child.emit("close", 0, null);
  return (await result).streams[0];
}

// Field values are what ffprobe 8 prints for each source (#4969).
describe("probeMedia sample format and bit depth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads a FLAC's depth from bits_per_raw_sample", async () => {
    const s = await probeStream({
      codec_type: "audio",
      codec_name: "flac",
      sample_fmt: "s32",
      bits_per_sample: 0,
      bits_per_raw_sample: "24",
    });
    expect(s.sampleFmt).toBe("s32");
    expect(s.bitsPerSample).toBe(24);
  });

  it("reads a PCM stream's depth from bits_per_sample when the raw field is N/A", async () => {
    const s = await probeStream({
      codec_type: "audio",
      codec_name: "pcm_f32le",
      sample_fmt: "flt",
      bits_per_sample: 32,
      bits_per_raw_sample: "N/A",
    });
    expect(s.sampleFmt).toBe("flt");
    expect(s.bitsPerSample).toBe(32);
  });

  it("leaves the depth unset for a lossy stream", async () => {
    const s = await probeStream({
      codec_type: "audio",
      codec_name: "mp3",
      sample_fmt: "fltp",
      bits_per_sample: 0,
    });
    expect(s.sampleFmt).toBe("fltp");
    expect(s.bitsPerSample).toBeUndefined();
  });

  it("leaves both unset for a video stream", async () => {
    const s = await probeStream({ codec_type: "video", codec_name: "h264", width: 2, height: 2 });
    expect(s.sampleFmt).toBeUndefined();
    expect(s.bitsPerSample).toBeUndefined();
  });
});
