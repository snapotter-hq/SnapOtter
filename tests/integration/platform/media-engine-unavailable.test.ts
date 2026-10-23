import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable } from "@snapotter/media-engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureRoot } from "../../fixtures/index.js";

/**
 * A container missing ffmpeg is an operator problem, not a bad upload.
 *
 * media-input caught every probe failure and reported "may be corrupt or in an
 * unsupported format", so an operator whose image lacks ffprobe was told their
 * perfectly good MP4 was broken, with nothing pointing at the real cause. The
 * CI integration shards ship without ffmpeg by design, which is where this
 * surfaced: every media tool failed there for a reason no caller could see.
 *
 * These run without the ffmpegAvailable() gate the sibling media specs use,
 * because the whole point is the behaviour when the binary is gone.
 */
const MP4 = readFileSync(join(fixtureRoot, "video", "formats", "tiny.mp4"));
const scratchDirs: string[] = [];

function scratch(): { scratchDir: string } {
  const scratchDir = mkdtempSync(join(tmpdir(), "media-unavailable-"));
  scratchDirs.push(scratchDir);
  return { scratchDir };
}

const originalFfprobe = process.env.FFPROBE_PATH;
const originalMemLimit = process.env.SUBPROCESS_MEMORY_LIMIT_MB;

afterEach(() => {
  while (scratchDirs.length > 0) {
    const dir = scratchDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
  if (originalFfprobe === undefined) delete process.env.FFPROBE_PATH;
  else process.env.FFPROBE_PATH = originalFfprobe;
  if (originalMemLimit === undefined) delete process.env.SUBPROCESS_MEMORY_LIMIT_MB;
  else process.env.SUBPROCESS_MEMORY_LIMIT_MB = originalMemLimit;
  vi.resetModules();
});

/**
 * media-engine resolves the binary once and caches it in a module variable, so
 * changing FFPROBE_PATH after any earlier call has no effect. Re-import through
 * a fresh module graph so each case actually gets the environment it sets.
 */
async function freshHandler(kind: "video") {
  vi.resetModules();
  const { MediaInputHandler } = await import("../../../apps/api/src/modality/media-input.js");
  return new MediaInputHandler(kind);
}

describe("media validation when the engine is unavailable", () => {
  it.each([
    ["off", undefined],
    ["on", "64"],
  ])(
    "reports the missing engine instead of blaming the upload with memory limit %s",
    async (_label, limit) => {
      const missingPath = join(tmpdir(), "definitely-not-ffprobe");
      process.env.FFPROBE_PATH = missingPath;
      if (limit === undefined) delete process.env.SUBPROCESS_MEMORY_LIMIT_MB;
      else process.env.SUBPROCESS_MEMORY_LIMIT_MB = limit;
      const handler = await freshHandler("video");

      const error = await handler.prepare(MP4, "clip.mp4", scratch()).then(
        () => null,
        (caught: unknown) => caught,
      );

      // Shape, not instanceof: vi.resetModules() gives the handler a different
      // copy of the error class than a static import here would hold.
      const failure = error as {
        name?: string;
        message: string;
        statusCode?: number;
        code?: string;
        cause?: NodeJS.ErrnoException;
      };
      expect(failure.name, "a missing engine must still reject the request").toBe(
        "InputValidationError",
      );

      // The upload is fine. Saying otherwise sends the operator looking at their
      // file instead of their container.
      expect(failure.message).not.toMatch(/corrupt/i);
      expect(failure.message).toMatch(/ffprobe|ffmpeg|unavailable|not installed/i);

      // 400 tells the caller to fix their request, which cannot help here. This
      // is the server missing a dependency, so it belongs in the 5xx range.
      expect(failure.statusCode).toBeGreaterThanOrEqual(500);
      expect(failure.code).toBe("ENGINE_UNAVAILABLE");
      expect(failure.cause).toMatchObject({
        code: "ENOENT",
        syscall: expect.stringMatching(/^spawn/),
      });
    },
  );

  it.each([
    ["off", undefined],
    ["on", "64"],
  ])(
    "reports a non-executable or directory FFPROBE_PATH (EACCES) as 503 ENGINE_UNAVAILABLE with memory limit %s (#3716)",
    async (_label, limit) => {
      const dir = mkdtempSync(join(tmpdir(), "media-nonexec-ffprobe-"));
      scratchDirs.push(dir);
      const nonExec = join(dir, "ffprobe");
      writeFileSync(nonExec, "#!/bin/sh\nexit 0\n");
      chmodSync(nonExec, 0o644);
      if (limit === undefined) delete process.env.SUBPROCESS_MEMORY_LIMIT_MB;
      else process.env.SUBPROCESS_MEMORY_LIMIT_MB = limit;

      for (const candidatePath of [nonExec, dir]) {
        process.env.FFPROBE_PATH = candidatePath;
        const handler = await freshHandler("video");
        const error = await handler.prepare(MP4, "clip.mp4", { scratchDir: dir }).then(
          () => null,
          (caught: unknown) => caught,
        );

        const failure = error as {
          name?: string;
          message: string;
          statusCode?: number;
          code?: string;
          cause?: NodeJS.ErrnoException;
        };
        expect(failure?.name).toBe("InputValidationError");
        expect(failure.statusCode).toBe(503);
        expect(failure.code).toBe("ENGINE_UNAVAILABLE");
        expect(failure.message).not.toMatch(/corrupt/i);
        expect(failure.cause).toMatchObject({
          code: "EACCES",
          syscall: expect.stringMatching(/^spawn/),
        });
      }
    },
  );

  // Needs a working ffprobe to reach the parse failure at all. CI shards ship
  // without ffmpeg, where every media input is an engine gap instead.
  it.skipIf(!ffmpegAvailable())(
    "still rejects a genuinely corrupt upload as a client error",
    async () => {
      delete process.env.FFPROBE_PATH;
      const handler = await freshHandler("video");
      const notMedia = Buffer.from("this is not a video file, it is prose");

      const error = await handler.prepare(notMedia, "clip.mp4", scratch()).then(
        () => null,
        (caught: unknown) => caught,
      );

      const failure = error as { name?: string; message: string; statusCode?: number };
      expect(failure.name).toBe("InputValidationError");
      expect(failure.statusCode).toBe(400);
      expect(failure.message).toMatch(/corrupt|unsupported/i);
    },
  );
});
