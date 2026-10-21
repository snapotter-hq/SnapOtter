import { EventEmitter } from "node:events";
import { SafeError } from "@snapotter/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  writeFile: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  readFile: vi.fn<(_path: string) => Promise<Buffer>>(() =>
    Promise.resolve(Buffer.from("preview")),
  ),
  rm: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: fsMocks.mkdir,
  writeFile: fsMocks.writeFile,
  readFile: fsMocks.readFile,
  rm: fsMocks.rm,
}));

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: spawnMock,
}));

const mediaMocks = vi.hoisted(() => ({
  ffmpegAvailable: vi.fn(() => true),
  runFfmpeg: vi.fn<() => Promise<string>>(() => Promise.resolve("")),
}));

vi.mock("@snapotter/media-engine", () => ({
  ffmpegAvailable: mediaMocks.ffmpegAvailable,
  runFfmpeg: mediaMocks.runFfmpeg,
}));

const docMocks = vi.hoisted(() => ({
  resolveGs: vi.fn<() => string | null>(() => "/usr/bin/gs"),
}));

vi.mock("@snapotter/doc-engine", () => ({
  resolveGs: docMocks.resolveGs,
}));

const loggerMocks = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("../../../apps/api/src/lib/logger.js", () => ({
  logger: loggerMocks,
}));

import {
  isPreviewServerFault,
  pdfFirstPagePreview,
  videoPosterPreview,
} from "../../../apps/api/src/modality/preview.js";

function makeFakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

describe("videoPosterPreview and pdfFirstPagePreview fault handling (#2870)", () => {
  beforeEach(() => {
    fsMocks.mkdir.mockReset().mockResolvedValue(undefined);
    fsMocks.writeFile.mockReset().mockResolvedValue(undefined);
    fsMocks.readFile.mockReset().mockResolvedValue(Buffer.from("preview-bytes"));
    fsMocks.rm.mockReset().mockResolvedValue(undefined);
    spawnMock.mockReset();
    mediaMocks.ffmpegAvailable.mockReset().mockReturnValue(true);
    mediaMocks.runFfmpeg.mockReset().mockResolvedValue("");
    docMocks.resolveGs.mockReset().mockReturnValue("/usr/bin/gs");
    loggerMocks.warn.mockReset();
  });

  it.each(["ENOSPC", "EACCES"] as const)(
    "videoPosterPreview rethrows scratch mkdir %s and still runs finally rm cleanup",
    async (code) => {
      const err = Object.assign(new Error(`${code}: mkdir scratch failed`), {
        code,
        syscall: "mkdir",
      });
      fsMocks.mkdir.mockRejectedValueOnce(err);

      await expect(videoPosterPreview(Buffer.from("mp4"))).rejects.toBe(err);
      expect(fsMocks.writeFile).not.toHaveBeenCalled();
      expect(fsMocks.rm).toHaveBeenCalledOnce();
      expect(loggerMocks.warn).not.toHaveBeenCalled();
    },
  );

  it.each(["ENOSPC", "EACCES", "EMFILE"] as const)(
    "videoPosterPreview rethrows scratch writeFile %s instead of returning null",
    async (code) => {
      const err = Object.assign(new Error(`${code}: writeFile scratch failed`), {
        code,
        syscall: "open",
      });
      fsMocks.writeFile.mockRejectedValueOnce(err);

      await expect(videoPosterPreview(Buffer.from("mp4"))).rejects.toBe(err);
      expect(mediaMocks.runFfmpeg).not.toHaveBeenCalled();
      expect(fsMocks.rm).toHaveBeenCalledOnce();
      expect(loggerMocks.warn).not.toHaveBeenCalled();
    },
  );

  it("rethrows plain staging errors before subprocess launch via !scratchStaged in both preview helpers", async () => {
    const plainStagingErr = new Error("unexpected staging failure without errno");
    fsMocks.writeFile.mockRejectedValueOnce(plainStagingErr);
    await expect(videoPosterPreview(Buffer.from("mp4"))).rejects.toBe(plainStagingErr);
    expect(loggerMocks.warn).not.toHaveBeenCalled();

    fsMocks.writeFile.mockRejectedValueOnce(plainStagingErr);
    await expect(pdfFirstPagePreview(Buffer.from("%PDF"))).rejects.toBe(plainStagingErr);
    expect(loggerMocks.warn).not.toHaveBeenCalled();
  });

  it.each(["EMFILE", "ENOMEM", "EACCES", "ENOENT"] as const)(
    "videoPosterPreview rethrows ffmpeg spawn %s instead of returning null",
    async (code) => {
      const err = Object.assign(new Error(`spawn ffmpeg ${code}`), {
        code,
        syscall: "spawn ffmpeg",
      });
      mediaMocks.runFfmpeg.mockRejectedValueOnce(err);

      await expect(videoPosterPreview(Buffer.from("mp4"))).rejects.toBe(err);
      expect(fsMocks.rm).toHaveBeenCalledOnce();
      expect(loggerMocks.warn).not.toHaveBeenCalled();
    },
  );

  it("videoPosterPreview logs a warning and returns null when ffmpeg exits non-zero, exits via non-SIGKILL signal, or times out", async () => {
    const exitErr = new Error("ffmpeg exited 1: Invalid data found when processing input");
    mediaMocks.runFfmpeg.mockRejectedValueOnce(exitErr);

    await expect(videoPosterPreview(Buffer.from("corrupt-mp4"))).resolves.toBeNull();
    expect(loggerMocks.warn).toHaveBeenCalledWith({ err: exitErr }, "video poster preview failed");

    loggerMocks.warn.mockReset();
    const segvErr = Object.assign(new Error("ffmpeg exited SIGSEGV: "), { signal: "SIGSEGV" });
    mediaMocks.runFfmpeg.mockRejectedValueOnce(segvErr);

    await expect(videoPosterPreview(Buffer.from("segv-mp4"))).resolves.toBeNull();
    expect(loggerMocks.warn).toHaveBeenCalledWith({ err: segvErr }, "video poster preview failed");

    loggerMocks.warn.mockReset();
    const timeoutErr = new SafeError("ffmpeg timed out", { kind: "operational", code: "timeout" });
    mediaMocks.runFfmpeg.mockRejectedValueOnce(timeoutErr);

    await expect(videoPosterPreview(Buffer.from("slow-mp4"))).resolves.toBeNull();
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      { err: timeoutErr },
      "video poster preview failed",
    );
  });

  it("videoPosterPreview converts a SIGKILL ffmpeg exit or readFile V8 RangeError into a 503 DecoderOutOfMemoryError (#3353)", async () => {
    const sigkillErr = Object.assign(new Error("ffmpeg exited SIGKILL: "), {
      signal: "SIGKILL",
    });
    mediaMocks.runFfmpeg.mockRejectedValueOnce(sigkillErr);

    await expect(videoPosterPreview(Buffer.from("oom-mp4"))).rejects.toMatchObject({
      name: "DecoderOutOfMemoryError",
      code: "ENGINE_UNAVAILABLE",
      statusCode: 503,
      message: expect.stringContaining("video preview engine ran out of memory"),
      cause: sigkillErr,
    });
    expect(fsMocks.rm).toHaveBeenCalledOnce();
    expect(loggerMocks.warn).not.toHaveBeenCalled();

    const rangeErr = new RangeError("Array buffer allocation failed");
    fsMocks.readFile.mockRejectedValueOnce(rangeErr);
    await expect(videoPosterPreview(Buffer.from("huge-poster-mp4"))).rejects.toMatchObject({
      name: "DecoderOutOfMemoryError",
      code: "ENGINE_UNAVAILABLE",
      statusCode: 503,
      message: expect.stringContaining("video preview engine ran out of memory"),
      cause: rangeErr,
    });
  });

  it("videoPosterPreview logs a warning and returns null when ffmpeg produces no output file (readFile ENOENT), but rethrows readFile EIO", async () => {
    fsMocks.readFile.mockImplementationOnce(async (path: string) => {
      throw Object.assign(new Error("ENOENT: no such file or directory"), {
        code: "ENOENT",
        syscall: "open",
        path,
      });
    });

    await expect(videoPosterPreview(Buffer.from("audio-only-mp4"))).resolves.toBeNull();
    expect(loggerMocks.warn).toHaveBeenCalledOnce();

    const eio = Object.assign(new Error("EIO: i/o error, read"), {
      code: "EIO",
      syscall: "read",
    });
    fsMocks.readFile.mockRejectedValueOnce(eio);
    await expect(videoPosterPreview(Buffer.from("mp4"))).rejects.toBe(eio);
  });

  it.each(["ENOSPC", "EACCES"] as const)(
    "pdfFirstPagePreview rethrows scratch mkdir %s and still runs finally rm cleanup",
    async (code) => {
      const err = Object.assign(new Error(`${code}: mkdir scratch failed`), {
        code,
        syscall: "mkdir",
      });
      fsMocks.mkdir.mockRejectedValueOnce(err);

      await expect(pdfFirstPagePreview(Buffer.from("%PDF"))).rejects.toBe(err);
      expect(fsMocks.writeFile).not.toHaveBeenCalled();
      expect(fsMocks.rm).toHaveBeenCalledOnce();
    },
  );

  it.each(["ENOSPC", "EACCES", "EMFILE"] as const)(
    "pdfFirstPagePreview rethrows scratch writeFile %s instead of returning null",
    async (code) => {
      const err = Object.assign(new Error(`${code}: writeFile scratch failed`), {
        code,
        syscall: "write",
      });
      fsMocks.writeFile.mockRejectedValueOnce(err);

      await expect(pdfFirstPagePreview(Buffer.from("%PDF"))).rejects.toBe(err);
      expect(spawnMock).not.toHaveBeenCalled();
      expect(fsMocks.rm).toHaveBeenCalledOnce();
    },
  );

  it.each(["EMFILE", "ENOMEM", "EACCES", "ENOENT"] as const)(
    "pdfFirstPagePreview rethrows ghostscript spawn %s instead of returning null",
    async (code) => {
      spawnMock.mockImplementationOnce(() => {
        const child = makeFakeChild();
        queueMicrotask(() => {
          child.emit(
            "error",
            Object.assign(new Error(`spawn gs ${code}`), {
              code,
              syscall: "spawn /usr/bin/gs",
            }),
          );
        });
        return child;
      });

      await expect(pdfFirstPagePreview(Buffer.from("%PDF"))).rejects.toMatchObject({
        code,
        syscall: "spawn /usr/bin/gs",
      });
      expect(fsMocks.rm).toHaveBeenCalledOnce();
    },
  );

  it("pdfFirstPagePreview logs a warning and returns null when ghostscript exits non-zero", async () => {
    spawnMock.mockImplementationOnce(() => {
      const child = makeFakeChild();
      queueMicrotask(() => {
        child.stderr.emit("data", Buffer.from("Error: /syntaxerror"));
        child.emit("close", 1, null);
      });
      return child;
    });

    await expect(pdfFirstPagePreview(Buffer.from("corrupt-pdf"))).resolves.toBeNull();
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      { err: expect.objectContaining({ message: expect.stringContaining("gs exited 1") }) },
      "pdf first-page preview failed",
    );
    expect(fsMocks.rm).toHaveBeenCalledOnce();
  });

  it("pdfFirstPagePreview kills ghostscript after 30s timeout, logs a warning, and returns null", async () => {
    vi.useFakeTimers();
    try {
      let spawnedChild: ReturnType<typeof makeFakeChild> | undefined;
      spawnMock.mockImplementationOnce(() => {
        spawnedChild = makeFakeChild();
        return spawnedChild;
      });

      const pending = pdfFirstPagePreview(Buffer.from("%PDF-hang"));
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(pending).resolves.toBeNull();

      expect(spawnedChild?.kill).toHaveBeenCalledWith("SIGKILL");
      spawnedChild?.emit("close", null, "SIGKILL");
      spawnedChild?.emit("error", new Error("late error"));
      expect(loggerMocks.warn).toHaveBeenCalledOnce();
      expect(loggerMocks.warn).toHaveBeenCalledWith(
        {
          err: expect.objectContaining({
            message: "ghostscript preview timed out",
          }),
        },
        "pdf first-page preview failed",
      );
      expect(fsMocks.rm).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("pdfFirstPagePreview logs signal name when ghostscript exits via a non-SIGKILL signal", async () => {
    spawnMock.mockImplementationOnce(() => {
      const child = makeFakeChild();
      queueMicrotask(() => {
        child.emit("close", null, "SIGSEGV");
      });
      return child;
    });

    await expect(pdfFirstPagePreview(Buffer.from("%PDF-segv"))).resolves.toBeNull();
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      {
        err: expect.objectContaining({
          message: expect.stringContaining("gs exited SIGSEGV"),
          signal: "SIGSEGV",
        }),
      },
      "pdf first-page preview failed",
    );
  });

  it("pdfFirstPagePreview converts a SIGKILL ghostscript exit or readFile V8 RangeError into a 503 DecoderOutOfMemoryError (#3353)", async () => {
    spawnMock.mockImplementationOnce(() => {
      const child = makeFakeChild();
      queueMicrotask(() => {
        child.stderr.emit("data", Buffer.from("Rendering page 1..."));
        child.emit("close", null, "SIGKILL");
      });
      return child;
    });

    await expect(pdfFirstPagePreview(Buffer.from("%PDF-killed"))).rejects.toMatchObject({
      name: "DecoderOutOfMemoryError",
      code: "ENGINE_UNAVAILABLE",
      statusCode: 503,
      message: expect.stringContaining("PDF preview engine ran out of memory"),
      cause: expect.objectContaining({
        message: "gs exited SIGKILL: Rendering page 1...",
        signal: "SIGKILL",
      }),
    });
    expect(fsMocks.rm).toHaveBeenCalledOnce();
    expect(loggerMocks.warn).not.toHaveBeenCalled();

    spawnMock.mockImplementationOnce(() => {
      const child = makeFakeChild();
      queueMicrotask(() => {
        child.emit("close", 0, null);
      });
      return child;
    });
    const rangeErr = new RangeError("Array buffer allocation failed");
    fsMocks.readFile.mockRejectedValueOnce(rangeErr);
    await expect(pdfFirstPagePreview(Buffer.from("%PDF-huge"))).rejects.toMatchObject({
      name: "DecoderOutOfMemoryError",
      code: "ENGINE_UNAVAILABLE",
      statusCode: 503,
      message: expect.stringContaining("PDF preview engine ran out of memory"),
      cause: rangeErr,
    });
  });

  it("pdfFirstPagePreview logs a warning and returns null when ghostscript produces no output file (readFile ENOENT), but rethrows readFile EIO", async () => {
    spawnMock.mockImplementation(() => {
      const child = makeFakeChild();
      queueMicrotask(() => {
        child.emit("close", 0, null);
      });
      return child;
    });
    fsMocks.readFile.mockImplementationOnce(async (path: string) => {
      throw Object.assign(new Error("ENOENT: no such file or directory"), {
        code: "ENOENT",
        syscall: "open",
        path,
      });
    });

    await expect(pdfFirstPagePreview(Buffer.from("%PDF-empty"))).resolves.toBeNull();
    expect(loggerMocks.warn).toHaveBeenCalledOnce();

    const eio = Object.assign(new Error("EIO: i/o error, read"), {
      code: "EIO",
      syscall: "read",
    });
    fsMocks.readFile.mockRejectedValueOnce(eio);
    await expect(pdfFirstPagePreview(Buffer.from("%PDF"))).rejects.toBe(eio);
  });

  it("returns null without creating a scratch directory or logging when ffmpeg or ghostscript is unavailable", async () => {
    mediaMocks.ffmpegAvailable.mockReturnValueOnce(false);
    await expect(videoPosterPreview(Buffer.from("mp4"))).resolves.toBeNull();
    expect(fsMocks.mkdir).not.toHaveBeenCalled();
    expect(loggerMocks.warn).not.toHaveBeenCalled();

    docMocks.resolveGs.mockReturnValueOnce(null);
    await expect(pdfFirstPagePreview(Buffer.from("%PDF"))).resolves.toBeNull();
    expect(fsMocks.mkdir).not.toHaveBeenCalled();
    expect(loggerMocks.warn).not.toHaveBeenCalled();
  });

  it("isPreviewServerFault classifies operational errnos, syscalls, 5xx errors, and runtime errors", () => {
    for (const code of [
      "ENOSPC",
      "EDQUOT",
      "EACCES",
      "EPERM",
      "EROFS",
      "EMFILE",
      "ENFILE",
      "ENOMEM",
      "EIO",
    ]) {
      expect(isPreviewServerFault(Object.assign(new Error(code), { code })), code).toBe(true);
    }
    expect(
      isPreviewServerFault(Object.assign(new Error("spawn failed"), { syscall: "spawn gs" })),
    ).toBe(true);
    expect(
      isPreviewServerFault(
        new SafeError("The server's storage is full.", {
          kind: "operational",
          code: "storage-full",
          statusCode: 503,
        }),
      ),
    ).toBe(true);
    expect(isPreviewServerFault(new TypeError("bad arg"))).toBe(true);
    expect(isPreviewServerFault(new ReferenceError("missing ref"))).toBe(true);
    expect(isPreviewServerFault(new SyntaxError("unexpected token"))).toBe(true);
    expect(isPreviewServerFault(new RangeError("Array buffer allocation failed"))).toBe(true);
    expect(
      isPreviewServerFault(
        Object.assign(new Error("ffmpeg exited SIGKILL: "), { signal: "SIGKILL" }),
      ),
    ).toBe(true);

    expect(isPreviewServerFault(new Error("corrupt input"))).toBe(false);
    expect(
      isPreviewServerFault(
        Object.assign(new Error("ffmpeg exited SIGSEGV: "), { signal: "SIGSEGV" }),
      ),
    ).toBe(false);
    expect(
      isPreviewServerFault(
        Object.assign(new RangeError("File size is greater than 2 GiB"), {
          code: "ERR_FS_FILE_TOO_LARGE",
        }),
      ),
    ).toBe(false);
    expect(
      isPreviewServerFault(
        Object.assign(new Error("ENOENT: no such file or directory, open"), {
          code: "ENOENT",
          syscall: "open",
        }),
      ),
    ).toBe(false);
    expect(
      isPreviewServerFault(
        new SafeError("ffmpeg timed out", { kind: "operational", code: "timeout" }),
      ),
    ).toBe(false);
    expect(isPreviewServerFault(Object.assign(new Error("bad request"), { statusCode: 400 }))).toBe(
      false,
    );
    expect(isPreviewServerFault(null)).toBe(false);
    expect(isPreviewServerFault(undefined)).toBe(false);
  });
});
