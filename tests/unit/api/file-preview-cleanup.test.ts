import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsState = vi.hoisted(() => ({
  failMkdirWith: "",
  failRmWith: "",
  failRmSuffix: "",
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const errno = (code: string) =>
    Object.assign(new Error(`${code}: simulated`), { code, syscall: "open" });
  return {
    ...actual,
    mkdir: async (...args: Parameters<typeof actual.mkdir>) => {
      const target = String(args[0]);
      if (fsState.failMkdirWith && target.endsWith(".previews")) {
        throw errno(fsState.failMkdirWith);
      }
      return actual.mkdir(...args);
    },
    rm: async (...args: Parameters<typeof actual.rm>) => {
      const target = String(args[0]);
      if (fsState.failRmWith && (!fsState.failRmSuffix || target.endsWith(fsState.failRmSuffix))) {
        throw errno(fsState.failRmWith);
      }
      return actual.rm(...args);
    },
  };
});

const config = vi.hoisted(() => ({
  FILES_STORAGE_PATH: "",
  PREVIEW_TIMEOUT_S: 300,
  LIBREOFFICE_TIMEOUT_S: 120,
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: config,
}));

const loggerMock = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("../../../apps/api/src/lib/logger.js", () => ({ logger: loggerMock }));

interface FileRow {
  id: string;
  userId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
}

const fileRows = vi.hoisted(() => new Map<string, FileRow>());
const previewMocks = vi.hoisted(() => ({
  convertDocument: vi.fn(),
  sofficeAvailable: vi.fn(() => true),
  runFfmpeg: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, val: string) => val,
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (id: string) => {
          const row = fileRows.get(id);
          return Promise.resolve(row ? [row] : []);
        },
      }),
    }),
  },
  schema: { userFiles: { id: "id" } },
}));

vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  requireAuth: () => ({ id: "user-1", role: "admin" }),
}));

vi.mock("../../../apps/api/src/permissions.js", () => ({
  hasEffectivePermission: async () => true,
  requirePermission: () => async () => true,
}));

vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/error-report.js")>();
  return {
    ...actual,
    reportError: previewMocks.reportError,
  };
});

vi.mock("@snapotter/doc-engine", () => ({
  convertDocument: previewMocks.convertDocument,
  sofficeAvailable: previewMocks.sofficeAvailable,
}));

vi.mock("@snapotter/media-engine", () => ({
  runFfmpeg: previewMocks.runFfmpeg,
  softwareEncoder: vi.fn((x) => x),
}));

let testDir: string;
let previewDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `snapotter-preview-test-${randomUUID().slice(0, 8)}`);
  previewDir = join(testDir, ".previews");
  await mkdir(previewDir, { recursive: true });
  config.FILES_STORAGE_PATH = testDir;
  fileRows.clear();
  previewMocks.convertDocument.mockReset();
  previewMocks.sofficeAvailable.mockReset().mockReturnValue(true);
  previewMocks.runFfmpeg.mockReset();
  previewMocks.reportError.mockReset();
  vi.resetModules();
});

afterEach(async () => {
  fsState.failMkdirWith = "";
  fsState.failRmWith = "";
  fsState.failRmSuffix = "";
  await rm(testDir, { recursive: true, force: true });
});

const NOT_WRITABLE_MSG =
  "The server can't write to its storage: it's read-only or not allowed to write there.";
const FULL_MSG = "The server's storage is full.";

describe("deletePreview (#1320, #2647)", () => {
  it("unlinks .mp4, .mp3, and .pdf preview files for the file id", async () => {
    const { deletePreview } = await import("../../../apps/api/src/routes/file-preview.js");
    const fileId = "test-file-123";

    await writeFile(join(previewDir, `${fileId}.mp4`), "video-data");
    await writeFile(join(previewDir, `${fileId}.mp3`), "audio-data");
    await writeFile(join(previewDir, `${fileId}.pdf`), "pdf-data");
    await writeFile(join(previewDir, "other-file.mp4"), "other-data");

    await deletePreview(fileId);

    expect(existsSync(join(previewDir, `${fileId}.mp4`))).toBe(false);
    expect(existsSync(join(previewDir, `${fileId}.mp3`))).toBe(false);
    expect(existsSync(join(previewDir, `${fileId}.pdf`))).toBe(false);
    expect(existsSync(join(previewDir, "other-file.mp4"))).toBe(true);
  });

  it("rejects when a preview can't be removed (#1455)", async () => {
    const { deletePreview } = await import("../../../apps/api/src/routes/file-preview.js");
    // A non-empty directory where the preview should be: rm without recursive fails.
    await mkdir(join(previewDir, "stuck-file.pdf"));
    await writeFile(join(previewDir, "stuck-file.pdf", "x"), "x");
    await expect(deletePreview("stuck-file")).rejects.toThrow();
  });

  it("is idempotent when preview files do not exist", async () => {
    const { deletePreview } = await import("../../../apps/api/src/routes/file-preview.js");
    await expect(deletePreview("nonexistent-file-id")).resolves.toBeUndefined();
  });

  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  it.skipIf(isRoot)(
    "throws a 503 storage-not-writable SafeError when .previews is read-only (#2647)",
    async () => {
      const { deletePreview } = await import("../../../apps/api/src/routes/file-preview.js");
      const cachedPdf = join(previewDir, "locked-file.pdf");
      await writeFile(cachedPdf, "pdf-preview");
      await chmod(previewDir, 0o555);
      try {
        await expect(deletePreview("locked-file")).rejects.toMatchObject({
          message: NOT_WRITABLE_MSG,
          isSafeMessage: true,
          kind: "operational",
          code: "storage-not-writable",
          statusCode: 503,
          cause: expect.objectContaining({
            code: expect.stringMatching(/^(EACCES|EPERM)$/),
          }),
        });
      } finally {
        await chmod(previewDir, 0o755).catch(() => {});
      }
      expect(existsSync(cachedPdf)).toBe(true);
    },
  );

  it.each(["EACCES", "EPERM", "EROFS"] as const)(
    "maps %s from rm to a 503 storage-not-writable SafeError with cause (#2647)",
    async (code) => {
      fsState.failRmWith = code;
      const { deletePreview } = await import("../../../apps/api/src/routes/file-preview.js");
      await expect(deletePreview("file-123")).rejects.toMatchObject({
        message: NOT_WRITABLE_MSG,
        isSafeMessage: true,
        kind: "operational",
        code: "storage-not-writable",
        statusCode: 503,
        cause: expect.objectContaining({ code }),
      });
    },
  );

  it.each(["ENOSPC", "EDQUOT"] as const)(
    "maps %s from rm to a 503 storage-full SafeError with cause (#2647)",
    async (code) => {
      fsState.failRmWith = code;
      const { deletePreview } = await import("../../../apps/api/src/routes/file-preview.js");
      await expect(deletePreview("file-123")).rejects.toMatchObject({
        message: FULL_MSG,
        isSafeMessage: true,
        kind: "operational",
        code: "storage-full",
        statusCode: 503,
        cause: expect.objectContaining({ code }),
      });
    },
  );

  it("rethrows non-operational rm errors untouched (#2647)", async () => {
    fsState.failRmWith = "EBUSY";
    const { deletePreview } = await import("../../../apps/api/src/routes/file-preview.js");
    const err = (await deletePreview("file-123").then(
      () => null,
      (e: unknown) => e,
    )) as { code?: string; isSafeMessage?: unknown; statusCode?: number } | null;
    expect(err?.code).toBe("EBUSY");
    expect(err?.isSafeMessage).toBeUndefined();
    expect(err?.statusCode).toBeUndefined();
  });

  it("classifications apply when a later extension (.pdf) in the preview loop fails (#2647)", async () => {
    const { deletePreview } = await import("../../../apps/api/src/routes/file-preview.js");
    const fileId = "partial-preview-123";
    await writeFile(join(previewDir, `${fileId}.mp4`), "video-data");
    await writeFile(join(previewDir, `${fileId}.pdf`), "pdf-data");
    fsState.failRmWith = "EPERM";
    fsState.failRmSuffix = ".pdf";

    await expect(deletePreview(fileId)).rejects.toMatchObject({
      message: NOT_WRITABLE_MSG,
      isSafeMessage: true,
      kind: "operational",
      code: "storage-not-writable",
      statusCode: 503,
      cause: expect.objectContaining({ code: "EPERM" }),
    });
    expect(existsSync(join(previewDir, `${fileId}.mp4`))).toBe(false);
    expect(existsSync(join(previewDir, `${fileId}.pdf`))).toBe(true);
  });
});

describe("ensurePreviewDir startup sweep (#1320)", () => {
  async function makeStale(path: string): Promise<void> {
    const old = new Date(Date.now() - (config.PREVIEW_TIMEOUT_S + 60) * 1000);
    await utimes(path, old, old);
  }

  it("removes stale temp dirs and .part files but keeps cached previews", async () => {
    await mkdir(join(previewDir, "doc-abc123"));
    await writeFile(join(previewDir, "doc-abc123", "input.docx"), "x");
    await writeFile(join(previewDir, "vid.1234.part.mp4"), "partial");
    await writeFile(join(previewDir, "vid.mp4"), "cached");
    await makeStale(join(previewDir, "doc-abc123"));
    await makeStale(join(previewDir, "vid.1234.part.mp4"));
    await makeStale(join(previewDir, "vid.mp4"));

    const { ensurePreviewDir } = await import("../../../apps/api/src/routes/file-preview.js");
    await ensurePreviewDir();

    expect(existsSync(join(previewDir, "doc-abc123"))).toBe(false);
    expect(existsSync(join(previewDir, "vid.1234.part.mp4"))).toBe(false);
    expect(existsSync(join(previewDir, "vid.mp4"))).toBe(true);
  });

  it("leaves fresh temp work alone, since another replica may still be writing it", async () => {
    await mkdir(join(previewDir, "doc-live01"));
    await writeFile(join(previewDir, "aud.5678.part.mp3"), "partial");

    const { ensurePreviewDir } = await import("../../../apps/api/src/routes/file-preview.js");
    await ensurePreviewDir();

    expect(existsSync(join(previewDir, "doc-live01"))).toBe(true);
    expect(existsSync(join(previewDir, "aud.5678.part.mp3"))).toBe(true);
  });

  it("sweeps once per process, even for concurrent first calls", async () => {
    const { ensurePreviewDir } = await import("../../../apps/api/src/routes/file-preview.js");
    const first = ensurePreviewDir();
    const second = ensurePreviewDir();
    expect(second).toBe(first);
    await first;

    // Work created after the sweep survives a later call, stale or not.
    await mkdir(join(previewDir, "doc-after1"));
    await makeStale(join(previewDir, "doc-after1"));
    await ensurePreviewDir();
    expect(existsSync(join(previewDir, "doc-after1"))).toBe(true);
  });

  it.each(["EACCES", "EPERM", "EROFS"] as const)(
    "maps %s from mkdir to a 503 storage-not-writable SafeError with cause and resets previewDirReady (#3146)",
    async (code) => {
      await rm(previewDir, { recursive: true, force: true });
      fsState.failMkdirWith = code;
      const { ensurePreviewDir } = await import("../../../apps/api/src/routes/file-preview.js");
      const { classifyError } = await import("../../../apps/api/src/lib/error-report.js");

      const rejected = await ensurePreviewDir().then(
        () => null,
        (err: unknown) => err,
      );
      expect(rejected).toMatchObject({
        message: NOT_WRITABLE_MSG,
        isSafeMessage: true,
        kind: "operational",
        code: "storage-not-writable",
        statusCode: 503,
        cause: expect.objectContaining({ code }),
      });
      expect(classifyError(rejected, "http")).toBe("operational");

      fsState.failMkdirWith = "";
      await expect(ensurePreviewDir()).resolves.toBeUndefined();
      expect(existsSync(previewDir)).toBe(true);
    },
  );

  it.each(["ENOSPC", "EDQUOT"] as const)(
    "maps %s from mkdir to a 503 storage-full SafeError with cause and resets previewDirReady (#3146)",
    async (code) => {
      await rm(previewDir, { recursive: true, force: true });
      fsState.failMkdirWith = code;
      const { ensurePreviewDir } = await import("../../../apps/api/src/routes/file-preview.js");
      const { classifyError } = await import("../../../apps/api/src/lib/error-report.js");

      const rejected = await ensurePreviewDir().then(
        () => null,
        (err: unknown) => err,
      );
      expect(rejected).toMatchObject({
        message: FULL_MSG,
        isSafeMessage: true,
        kind: "operational",
        code: "storage-full",
        statusCode: 503,
        cause: expect.objectContaining({ code }),
      });
      expect(classifyError(rejected, "http")).toBe("operational");

      fsState.failMkdirWith = "";
      await expect(ensurePreviewDir()).resolves.toBeUndefined();
      expect(existsSync(previewDir)).toBe(true);
    },
  );

  it("rethrows non-operational mkdir errors untouched while resetting previewDirReady (#3146)", async () => {
    await rm(previewDir, { recursive: true, force: true });
    fsState.failMkdirWith = "EBUSY";
    const { ensurePreviewDir } = await import("../../../apps/api/src/routes/file-preview.js");

    const err = (await ensurePreviewDir().then(
      () => null,
      (e: unknown) => e,
    )) as { code?: string; isSafeMessage?: unknown; statusCode?: number } | null;
    expect(err?.code).toBe("EBUSY");
    expect(err?.isSafeMessage).toBeUndefined();
    expect(err?.statusCode).toBeUndefined();

    fsState.failMkdirWith = "";
    await expect(ensurePreviewDir()).resolves.toBeUndefined();
    expect(existsSync(previewDir)).toBe(true);
  });

  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  it.skipIf(isRoot)(
    "throws a 503 storage-not-writable SafeError when FILES_STORAGE_PATH is read-only and retries after chmod (#3146)",
    async () => {
      await rm(previewDir, { recursive: true, force: true });
      const { ensurePreviewDir } = await import("../../../apps/api/src/routes/file-preview.js");
      await chmod(testDir, 0o555);
      try {
        await expect(ensurePreviewDir()).rejects.toMatchObject({
          message: NOT_WRITABLE_MSG,
          isSafeMessage: true,
          kind: "operational",
          code: "storage-not-writable",
          statusCode: 503,
          cause: expect.objectContaining({
            code: expect.stringMatching(/^(EACCES|EPERM)$/),
          }),
        });
      } finally {
        await chmod(testDir, 0o755).catch(() => {});
      }

      await expect(ensurePreviewDir()).resolves.toBeUndefined();
      expect(existsSync(previewDir)).toBe(true);
    },
  );

  it("answers GET /api/v1/files/:id/preview with 503 SafeError for office docs and media when ensurePreviewDir fails, then recovers (#3146)", async () => {
    await rm(previewDir, { recursive: true, force: true });
    await writeFile(join(testDir, "stored-doc.docx"), "PK-docx");
    await writeFile(join(testDir, "stored-vid.mp4"), "mp4-bytes");

    fileRows.set("doc-1", {
      id: "doc-1",
      userId: "user-1",
      originalName: "report.docx",
      storedName: "stored-doc.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    fileRows.set("vid-1", {
      id: "vid-1",
      userId: "user-1",
      originalName: "clip.mp4",
      storedName: "stored-vid.mp4",
      mimeType: "video/mp4",
    });

    previewMocks.convertDocument.mockImplementation(async (_in: string, outDir: string) => {
      await writeFile(join(outDir, "input.pdf"), "%PDF-1.4 doc");
    });
    previewMocks.runFfmpeg.mockImplementation(async (args: string[]) => {
      const outPath = args.at(-1) ?? "";
      await writeFile(outPath, "encoded-mp4");
    });

    const { filePreviewRoutes } = await import("../../../apps/api/src/routes/file-preview.js");
    const { registerErrorHandler } = await import("../../../apps/api/src/plugins/error-handler.js");
    const { classifyError } = await import("../../../apps/api/src/lib/error-report.js");

    const app = Fastify();
    registerErrorHandler(app);
    await filePreviewRoutes(app);
    await app.ready();

    try {
      fsState.failMkdirWith = "EPERM";
      const docFail = await app.inject({ method: "GET", url: "/api/v1/files/doc-1/preview" });
      expect(docFail.statusCode).toBe(503);
      expect(docFail.json()).toEqual({
        error: NOT_WRITABLE_MSG,
        code: "storage-not-writable",
      });
      expect(previewMocks.convertDocument).not.toHaveBeenCalled();
      expect(previewMocks.reportError).toHaveBeenCalledTimes(1);
      expect(previewMocks.reportError.mock.calls[0][1]).toMatchObject({
        source: "http",
        statusCode: 503,
      });
      expect(
        classifyError(
          previewMocks.reportError.mock.calls[0][0],
          previewMocks.reportError.mock.calls[0][1].source,
        ),
      ).toBe("operational");

      previewMocks.reportError.mockReset();
      fsState.failMkdirWith = "EDQUOT";
      const vidFail = await app.inject({ method: "GET", url: "/api/v1/files/vid-1/preview" });
      expect(vidFail.statusCode).toBe(503);
      expect(vidFail.json()).toEqual({
        error: FULL_MSG,
        code: "storage-full",
      });
      expect(previewMocks.runFfmpeg).not.toHaveBeenCalled();
      expect(previewMocks.reportError).toHaveBeenCalledTimes(1);
      expect(previewMocks.reportError.mock.calls[0][1]).toMatchObject({
        source: "http",
        statusCode: 503,
      });
      expect(
        classifyError(
          previewMocks.reportError.mock.calls[0][0],
          previewMocks.reportError.mock.calls[0][1].source,
        ),
      ).toBe("operational");

      fsState.failMkdirWith = "";
      const docOk = await app.inject({ method: "GET", url: "/api/v1/files/doc-1/preview" });
      expect(docOk.statusCode).toBe(200);
      expect(docOk.body).toBe("%PDF-1.4 doc");

      const vidOk = await app.inject({ method: "GET", url: "/api/v1/files/vid-1/preview" });
      expect(vidOk.statusCode).toBe(200);
      expect(vidOk.body).toBe("encoded-mp4");
    } finally {
      await app.close();
    }
  });

  it("rejects extensionless and dotfile uploads on POST /api/v1/preview/generate with 400 (#3540)", async () => {
    const { Readable } = await import("node:stream");
    const { filePreviewRoutes } = await import("../../../apps/api/src/routes/file-preview.js");

    type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;
    let generateHandler: RouteHandler | undefined;
    const fakeApp = {
      log: loggerMock,
      get: vi.fn(),
      post: vi.fn((path: string, _opts: unknown, handler?: RouteHandler) => {
        if (path === "/api/v1/preview/generate") {
          generateHandler = (typeof _opts === "function" ? _opts : handler) as RouteHandler;
        }
      }),
    };
    await filePreviewRoutes(fakeApp as never);
    expect(generateHandler).toBeTypeOf("function");

    for (const filename of ["mp4", ".mp4", "wav", ".wav", "clip."]) {
      let statusCode = 200;
      let payload: unknown;
      const reply = {
        raw: {
          destroyed: false,
          writableEnded: false,
          on: vi.fn(),
          off: vi.fn(),
          once: vi.fn(),
          removeListener: vi.fn(),
        },
        status(code: number) {
          statusCode = code;
          return reply;
        },
        header() {
          return reply;
        },
        send(body: unknown) {
          payload = body;
          return reply;
        },
      };
      const req = {
        raw: {
          destroyed: false,
          socket: { destroyed: false },
          on: vi.fn(),
          off: vi.fn(),
          once: vi.fn(),
          removeListener: vi.fn(),
        },
        log: loggerMock,
        async *parts() {
          yield {
            type: "file" as const,
            fieldname: "file",
            filename,
            file: Readable.from([Buffer.from("not-media-bytes")]),
          };
        },
      };

      await generateHandler?.(req, reply);
      expect(statusCode, `${filename} should be rejected with 400`).toBe(400);
      expect(payload).toEqual({ error: "Unsupported file type for preview" });
    }
    expect(previewMocks.runFfmpeg).not.toHaveBeenCalled();

    previewMocks.runFfmpeg.mockImplementationOnce(async (args: string[]) => {
      const outPath = args.at(-1) ?? "";
      await writeFile(outPath, "encoded-mp4");
    });
    let okStatus = 200;
    let okPayload: unknown;
    const okReply = {
      raw: {
        destroyed: false,
        writableEnded: false,
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
      },
      status(code: number) {
        okStatus = code;
        return okReply;
      },
      header() {
        return okReply;
      },
      send(body: unknown) {
        okPayload = body;
        return okReply;
      },
    };
    const okReq = {
      raw: {
        destroyed: false,
        socket: { destroyed: false },
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
      },
      log: loggerMock,
      async *parts() {
        yield {
          type: "file" as const,
          fieldname: "file",
          filename: ".hidden.MP4",
          file: Readable.from([Buffer.from("mp4-bytes")]),
        };
      },
    };
    await generateHandler?.(okReq, okReply);
    expect(okStatus).toBe(200);
    expect(Buffer.isBuffer(okPayload) && okPayload.toString()).toBe("encoded-mp4");
    expect(previewMocks.runFfmpeg).toHaveBeenCalledTimes(1);
  });

  it("converts a V8 buffer allocation failure in Buffer.concat or part.file to DecoderOutOfMemoryError on POST /api/v1/preview/generate, while preserving non-OOM errors (#3903)", async () => {
    const { Readable } = await import("node:stream");
    const { DecoderOutOfMemoryError } = await import(
      "../../../apps/api/src/lib/format-decoders.js"
    );
    const { filePreviewRoutes } = await import("../../../apps/api/src/routes/file-preview.js");

    type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;
    let generateHandler: RouteHandler | undefined;
    const fakeApp = {
      log: loggerMock,
      get: vi.fn(),
      post: vi.fn((path: string, _opts: unknown, handler?: RouteHandler) => {
        if (path === "/api/v1/preview/generate") {
          generateHandler = (typeof _opts === "function" ? _opts : handler) as RouteHandler;
        }
      }),
    };
    await filePreviewRoutes(fakeApp as never);
    expect(generateHandler).toBeTypeOf("function");

    const v8Oom = new RangeError("Array buffer allocation failed");
    const concatSpy = vi.spyOn(Buffer, "concat").mockImplementationOnce(() => {
      throw v8Oom;
    });
    try {
      const reply = {
        raw: {
          destroyed: false,
          writableEnded: false,
          on: vi.fn(),
          off: vi.fn(),
          once: vi.fn(),
          removeListener: vi.fn(),
        },
        status: vi.fn().mockReturnThis(),
        header: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
      };
      const req = {
        raw: {
          destroyed: false,
          socket: { destroyed: false },
          on: vi.fn(),
          off: vi.fn(),
          once: vi.fn(),
          removeListener: vi.fn(),
        },
        log: loggerMock,
        async *parts() {
          yield {
            type: "file" as const,
            fieldname: "file",
            filename: "clip.mp4",
            file: Readable.from([Buffer.from("mp4-bytes")]),
          };
        },
      };

      const rejected = await generateHandler?.(req, reply).catch((err: unknown) => err);
      expect(rejected).toBeInstanceOf(DecoderOutOfMemoryError);
      expect(rejected).toMatchObject({
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        kind: "operational",
        cause: v8Oom,
      });
      expect(previewMocks.runFfmpeg).not.toHaveBeenCalled();
    } finally {
      concatSpy.mockRestore();
    }

    const streamOom = new RangeError("Array buffer allocation failed");
    const streamReply = {
      raw: {
        destroyed: false,
        writableEnded: false,
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
      },
      status: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    const streamReq = {
      raw: {
        destroyed: false,
        socket: { destroyed: false },
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
      },
      log: loggerMock,
      async *parts() {
        yield {
          type: "file" as const,
          fieldname: "file",
          filename: "clip.mp4",
          file: new Readable({
            read() {
              this.destroy(streamOom);
            },
          }),
        };
      },
    };
    const streamRejected = await generateHandler?.(streamReq, streamReply).catch(
      (err: unknown) => err,
    );
    expect(streamRejected).toBeInstanceOf(DecoderOutOfMemoryError);
    expect(streamRejected).toMatchObject({
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      kind: "operational",
      cause: streamOom,
    });
    expect(previewMocks.runFfmpeg).not.toHaveBeenCalled();

    const tooLarge = Object.assign(new Error("request file too large"), {
      statusCode: 413,
      code: "FST_REQ_FILE_TOO_LARGE",
    });
    const tooLargeReq = {
      ...streamReq,
      async *parts() {
        yield {
          type: "file" as const,
          fieldname: "file",
          filename: "clip.mp4",
          file: new Readable({
            read() {
              this.destroy(tooLarge);
            },
          }),
        };
      },
    };
    await expect(generateHandler?.(tooLargeReq, streamReply)).rejects.toBe(tooLarge);
  });
});

describe("media previews when ffmpeg is missing (#1576)", () => {
  const ENGINE_MSG =
    "Media processing is unavailable on this server because ffmpeg is not installed.";
  const ENGINE_HINT = "Install ffmpeg in the container or set FFMPEG_PATH.";
  const missingBinary = () =>
    Object.assign(new Error("ffmpeg binary not found (set FFMPEG_PATH or install ffmpeg)"), {
      code: "ENOENT",
      syscall: "spawn",
      path: "ffmpeg",
    });

  beforeEach(async () => {
    await writeFile(join(testDir, "stored-audio.mp3"), "mp3-bytes");
    fileRows.set("aud-1", {
      id: "aud-1",
      userId: "user-1",
      originalName: "song.mp3",
      storedName: "stored-audio.mp3",
      mimeType: "audio/mpeg",
    });
  });

  it("answers GET preview with 503 ENGINE_UNAVAILABLE when no ffmpeg is found, and reports it", async () => {
    previewMocks.runFfmpeg.mockRejectedValue(missingBinary());
    const { filePreviewRoutes } = await import("../../../apps/api/src/routes/file-preview.js");

    const app = Fastify();
    await filePreviewRoutes(app);
    await app.ready();
    try {
      const res = await app.inject({ method: "GET", url: "/api/v1/files/aud-1/preview" });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({
        error: ENGINE_MSG,
        details: ENGINE_HINT,
        code: "ENGINE_UNAVAILABLE",
      });
      expect(previewMocks.reportError).toHaveBeenCalledTimes(1);
      expect(previewMocks.reportError.mock.calls[0][1]).toMatchObject({
        source: "http",
        statusCode: 503,
      });
    } finally {
      await app.close();
    }
  });

  it("answers GET preview with 503 ENGINE_UNAVAILABLE when FFMPEG_PATH points at nothing (spawn ENOENT)", async () => {
    previewMocks.runFfmpeg.mockRejectedValue(
      Object.assign(new Error("spawn /nope/ffmpeg ENOENT"), {
        code: "ENOENT",
        syscall: "spawn",
        path: "/nope/ffmpeg",
      }),
    );
    const { filePreviewRoutes } = await import("../../../apps/api/src/routes/file-preview.js");

    const app = Fastify();
    await filePreviewRoutes(app);
    await app.ready();
    try {
      const res = await app.inject({ method: "GET", url: "/api/v1/files/aud-1/preview" });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ code: "ENGINE_UNAVAILABLE", details: ENGINE_HINT });
      expect(previewMocks.reportError).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it("answers POST preview/generate with 503 ENGINE_UNAVAILABLE when no ffmpeg is found", async () => {
    const { Readable } = await import("node:stream");
    previewMocks.runFfmpeg.mockRejectedValue(missingBinary());
    const { filePreviewRoutes } = await import("../../../apps/api/src/routes/file-preview.js");

    type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;
    let generateHandler: RouteHandler | undefined;
    const fakeApp = {
      log: loggerMock,
      get: vi.fn(),
      post: vi.fn((path: string, _opts: unknown, handler?: RouteHandler) => {
        if (path === "/api/v1/preview/generate") {
          generateHandler = (typeof _opts === "function" ? _opts : handler) as RouteHandler;
        }
      }),
    };
    await filePreviewRoutes(fakeApp as never);

    const reply = {
      raw: {
        destroyed: false,
        writableEnded: false,
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
      },
      status: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    const req = {
      raw: {
        destroyed: false,
        socket: { destroyed: false },
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
      },
      log: loggerMock,
      async *parts() {
        yield {
          type: "file" as const,
          fieldname: "file",
          filename: "song.mp3",
          file: Readable.from([Buffer.from("mp3-bytes")]),
        };
      },
    };

    await generateHandler?.(req, reply);
    expect(reply.status).toHaveBeenCalledWith(503);
    expect(reply.send).toHaveBeenCalledWith({
      error: ENGINE_MSG,
      details: ENGINE_HINT,
      code: "ENGINE_UNAVAILABLE",
    });
  });
});
