import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mediaEngine = vi.hoisted(() => ({
  probeMedia: vi.fn(),
}));

const fsPromisesSpy = vi.hoisted(() => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  fsPromisesSpy.mkdir.mockImplementation((...args: Parameters<typeof actual.mkdir>) =>
    actual.mkdir(...args),
  );
  fsPromisesSpy.writeFile.mockImplementation((...args: Parameters<typeof actual.writeFile>) =>
    actual.writeFile(...args),
  );
  return {
    ...actual,
    mkdir: fsPromisesSpy.mkdir,
    writeFile: fsPromisesSpy.writeFile,
  };
});

vi.mock("@snapotter/media-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@snapotter/media-engine")>()),
  probeMedia: mediaEngine.probeMedia,
}));

import { MediaInputHandler } from "../../../apps/api/src/modality/media-input.js";

let scratchDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  scratchDir = mkdtempSync(join(tmpdir(), "snapotter-media-input-"));
  mediaEngine.probeMedia.mockResolvedValue({
    container: "mov,mp4,m4a,3gp,3g2,mj2",
    durationS: 1.5,
    bitrateKbps: 128,
    streams: [{ type: "video", codec: "h264", width: 320, height: 240 }],
  });
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

describe("MediaInputHandler AbortSignal handling (#3709)", () => {
  it("rejects immediately without writing scratch files or spawning ffprobe when signal is already aborted", async () => {
    const validSrt = Buffer.from("1\n00:00:01,000 --> 00:00:04,000\nHello\n");
    const subtitleController = new AbortController();
    const subtitleReason = new DOMException("Pre-aborted subtitle", "AbortError");
    subtitleController.abort(subtitleReason);

    await expect(
      new MediaInputHandler("subtitle").prepare(validSrt, "subs.srt", {
        scratchDir,
        signal: subtitleController.signal,
      }),
    ).rejects.toBe(subtitleReason);

    for (const kind of ["video", "audio", "image"] as const) {
      const controller = new AbortController();
      const reason = new DOMException(`Pre-aborted ${kind}`, "AbortError");
      controller.abort(reason);

      await expect(
        new MediaInputHandler(kind).prepare(Buffer.from("media-bytes"), `clip.${kind}`, {
          scratchDir,
          signal: controller.signal,
        }),
      ).rejects.toBe(reason);
    }

    expect(fsPromisesSpy.mkdir).not.toHaveBeenCalled();
    expect(fsPromisesSpy.writeFile).not.toHaveBeenCalled();
    expect(mediaEngine.probeMedia).not.toHaveBeenCalled();
    expect(readdirSync(scratchDir)).toEqual([]);
  });

  it("forwards signal to writeFile and probeMedia and cleans up scratch dir if writeFile aborts", async () => {
    const controller = new AbortController();
    const input = Buffer.from("fake-mp4");

    await expect(
      new MediaInputHandler("video").prepare(input, "clip.mp4", {
        scratchDir,
        signal: controller.signal,
      }),
    ).resolves.toEqual({ buffer: input, filename: "clip.mp4" });

    expect(fsPromisesSpy.writeFile).toHaveBeenCalledWith(expect.stringMatching(/input$/), input, {
      signal: controller.signal,
    });
    expect(mediaEngine.probeMedia).toHaveBeenCalledWith(expect.stringMatching(/input$/), {
      signal: controller.signal,
    });
    expect(readdirSync(scratchDir)).toEqual([]);

    vi.clearAllMocks();
    const actualFs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const writeController = new AbortController();
    const writeAbortReason = new DOMException("Aborted during scratch write", "AbortError");
    fsPromisesSpy.writeFile.mockImplementationOnce(
      async (...args: Parameters<typeof actualFs.writeFile>) => {
        const options = args[2] as { signal?: AbortSignal } | undefined;
        expect(options?.signal).toBe(writeController.signal);
        writeController.abort(writeAbortReason);
        return actualFs.writeFile(...args);
      },
    );

    await expect(
      new MediaInputHandler("video").prepare(input, "clip.mp4", {
        scratchDir,
        signal: writeController.signal,
      }),
    ).rejects.toBe(writeAbortReason);
    expect(mediaEngine.probeMedia).not.toHaveBeenCalled();
    expect(readdirSync(scratchDir)).toEqual([]);

    vi.clearAllMocks();
    const mkdirController = new AbortController();
    const mkdirAbortReason = new DOMException("Aborted during mkdir", "AbortError");
    fsPromisesSpy.mkdir.mockImplementationOnce(
      async (...args: Parameters<typeof actualFs.mkdir>) => {
        const res = await actualFs.mkdir(...args);
        mkdirController.abort(mkdirAbortReason);
        return res;
      },
    );

    await expect(
      new MediaInputHandler("video").prepare(input, "clip.mp4", {
        scratchDir,
        signal: mkdirController.signal,
      }),
    ).rejects.toBe(mkdirAbortReason);
    expect(fsPromisesSpy.writeFile).not.toHaveBeenCalled();
    expect(mediaEngine.probeMedia).not.toHaveBeenCalled();
    expect(readdirSync(scratchDir)).toEqual([]);
  });

  it("rethrows abort errors from probeMedia instead of mapping them to 400 InputValidationError", async () => {
    const input = Buffer.from("fake-mp4");

    // 1. Aborted mid-probe via AbortController
    const probeController = new AbortController();
    const probeReason = new DOMException("Upload canceled during ffprobe", "AbortError");
    mediaEngine.probeMedia.mockImplementationOnce(
      async (_path: string, opts?: { signal?: AbortSignal }) => {
        expect(opts?.signal).toBe(probeController.signal);
        probeController.abort(probeReason);
        const abortErr = new Error("ffprobe canceled");
        abortErr.name = "AbortError";
        throw abortErr;
      },
    );

    await expect(
      new MediaInputHandler("video").prepare(input, "clip.mp4", {
        scratchDir,
        signal: probeController.signal,
      }),
    ).rejects.toBe(probeReason);
    expect(readdirSync(scratchDir)).toEqual([]);

    // 2. Direct AbortError from probeMedia even without signal.aborted
    const directAbortErr = Object.assign(new Error("ffprobe canceled"), { name: "AbortError" });
    mediaEngine.probeMedia.mockRejectedValueOnce(directAbortErr);

    await expect(
      new MediaInputHandler("audio").prepare(input, "clip.mp3", {
        scratchDir,
      }),
    ).rejects.toBe(directAbortErr);
    expect(readdirSync(scratchDir)).toEqual([]);

    // 3. Aborted signal takes precedence over ENOENT or parse failures during race
    const raceController = new AbortController();
    const raceReason = new DOMException("Client disconnected during spawn race", "AbortError");
    mediaEngine.probeMedia.mockImplementationOnce(async () => {
      raceController.abort(raceReason);
      throw Object.assign(new Error("spawn ffprobe ENOENT"), { code: "ENOENT", syscall: "spawn" });
    });

    await expect(
      new MediaInputHandler("video").prepare(input, "clip.mp4", {
        scratchDir,
        signal: raceController.signal,
      }),
    ).rejects.toBe(raceReason);
    expect(readdirSync(scratchDir)).toEqual([]);

    // 4. Aborted signal right as probeMedia resolves rejects with abort reason
    const postProbeController = new AbortController();
    const postProbeReason = new DOMException("Aborted right as probe resolved", "AbortError");
    mediaEngine.probeMedia.mockImplementationOnce(async () => {
      postProbeController.abort(postProbeReason);
      return {
        container: "mov,mp4",
        durationS: 1,
        bitrateKbps: 100,
        streams: [],
      };
    });

    await expect(
      new MediaInputHandler("video").prepare(input, "clip.mp4", {
        scratchDir,
        signal: postProbeController.signal,
      }),
    ).rejects.toBe(postProbeReason);
    expect(readdirSync(scratchDir)).toEqual([]);

    // 5. Non-abort failures with a live signal still map to 400 and 503 InputValidationError
    const liveController = new AbortController();
    mediaEngine.probeMedia.mockRejectedValueOnce(new Error("ffprobe exited 1: Invalid data"));
    await expect(
      new MediaInputHandler("video").prepare(input, "clip.mp4", {
        scratchDir,
        signal: liveController.signal,
      }),
    ).rejects.toMatchObject({
      name: "InputValidationError",
      statusCode: 400,
      message: expect.stringMatching(/Unrecognized video file/i),
    });

    const spawnErr = Object.assign(new Error("spawn ffprobe ENOENT"), {
      code: "ENOENT",
      syscall: "spawn",
    });
    mediaEngine.probeMedia.mockRejectedValueOnce(spawnErr);
    await expect(
      new MediaInputHandler("video").prepare(input, "clip.mp4", {
        scratchDir,
        signal: liveController.signal,
      }),
    ).rejects.toMatchObject({
      name: "InputValidationError",
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      cause: spawnErr,
    });
    expect(readdirSync(scratchDir)).toEqual([]);
  });

  it("rejects missing video or audio streams with plain-language messages", async () => {
    const input = Buffer.from("fake-media");
    mediaEngine.probeMedia.mockResolvedValueOnce({
      container: "mp3",
      durationS: 1,
      bitrateKbps: 128,
      streams: [{ type: "audio", codec: "mp3" }],
    });
    await expect(
      new MediaInputHandler("video").prepare(input, "audio-only.mp4", { scratchDir }),
    ).rejects.toThrow(/no video track \(no video stream\)/i);

    mediaEngine.probeMedia.mockResolvedValueOnce({
      container: "mov,mp4",
      durationS: 1,
      bitrateKbps: 128,
      streams: [{ type: "video", codec: "h264", width: 320, height: 240 }],
    });
    await expect(
      new MediaInputHandler("audio").prepare(input, "silent.mp3", { scratchDir }),
    ).rejects.toThrow(/no audio track \(no audio stream\)/i);
  });
});

describe("ffprobe spawn failures (#3716)", () => {
  const spawnFailure = (code: string) =>
    Object.assign(new Error(`spawn /bad/ffprobe ${code}`), {
      code,
      syscall: "spawn /bad/ffprobe",
      path: "/bad/ffprobe",
    });

  it.each(["ENOENT", "EACCES", "ENOEXEC", "ENOTDIR", "ENOMEM", "EAGAIN"])(
    "reports an ffprobe that cannot be started (%s) as 503 ENGINE_UNAVAILABLE and preserves cause",
    async (code) => {
      const input = Buffer.from("fake-media");
      for (const kind of ["video", "audio", "image"] as const) {
        const cause = spawnFailure(code);
        mediaEngine.probeMedia.mockRejectedValueOnce(cause);

        const err = await new MediaInputHandler(kind)
          .prepare(input, `clip.${kind}`, { scratchDir })
          .catch((e: unknown) => e);

        expect(err).toMatchObject({
          name: "InputValidationError",
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
          cause,
        });
        expect((err as Error).message).toMatch(/ffmpeg is not installed/i);
        expect((err as { details?: string }).details).toMatch(/FFMPEG_PATH and FFPROBE_PATH/);
      }
      expect(readdirSync(scratchDir)).toEqual([]);
    },
  );

  it("preserves cause when probeMedia rejects because no ffprobe binary was resolved", async () => {
    const cause = new Error("ffprobe binary not found (set FFPROBE_PATH or install ffmpeg)");
    mediaEngine.probeMedia.mockRejectedValueOnce(cause);

    const err = await new MediaInputHandler("video")
      .prepare(Buffer.from("fake-mp4"), "clip.mp4", { scratchDir })
      .catch((e: unknown) => e);

    expect(err).toMatchObject({
      name: "InputValidationError",
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      cause,
    });
    expect(readdirSync(scratchDir)).toEqual([]);
  });

  it("does not treat a non-spawn ENOENT (such as syscall 'open') as an unavailable engine", async () => {
    const openErr = Object.assign(new Error("ENOENT: no such file or directory, open '/tmp/x'"), {
      code: "ENOENT",
      syscall: "open",
    });
    mediaEngine.probeMedia.mockRejectedValueOnce(openErr);

    await expect(
      new MediaInputHandler("video").prepare(Buffer.from("fake-mp4"), "clip.mp4", { scratchDir }),
    ).rejects.toMatchObject({
      name: "InputValidationError",
      statusCode: 400,
      message: "Unrecognized video file. It may be corrupt or in an unsupported format.",
    });
    expect(readdirSync(scratchDir)).toEqual([]);
  });

  it("reports a probe timeout with a timeout-specific 400 message instead of claiming the file is unrecognized (#3825)", async () => {
    const input = Buffer.from("fake-media");
    for (const kind of ["video", "audio", "image"] as const) {
      const timeoutErr = Object.assign(new Error("ffprobe timed out after 15s"), {
        name: "FfprobeTimeoutError",
      });
      mediaEngine.probeMedia.mockRejectedValueOnce(timeoutErr);

      await expect(
        new MediaInputHandler(kind).prepare(input, `clip.${kind}`, { scratchDir }),
      ).rejects.toMatchObject({
        name: "InputValidationError",
        statusCode: 400,
        message: `Could not inspect this ${kind} file within the time limit. It may be malformed; try a different file.`,
      });

      // Also matches by message shape if an untagged Error("ffprobe timed out after 15s") surfaces
      mediaEngine.probeMedia.mockRejectedValueOnce(new Error("ffprobe timed out after 15s"));
      await expect(
        new MediaInputHandler(kind).prepare(input, `clip.${kind}`, { scratchDir }),
      ).rejects.toMatchObject({
        name: "InputValidationError",
        statusCode: 400,
        message: `Could not inspect this ${kind} file within the time limit. It may be malformed; try a different file.`,
      });
    }
    expect(readdirSync(scratchDir)).toEqual([]);
  });
});
