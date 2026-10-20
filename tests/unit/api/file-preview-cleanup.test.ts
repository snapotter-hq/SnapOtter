import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsState = vi.hoisted(() => ({
  failRmWith: "",
  failRmSuffix: "",
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const errno = (code: string) => Object.assign(new Error(`${code}: simulated`), { code });
  return {
    ...actual,
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

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: { select: vi.fn() },
  schema: { userFiles: {} },
}));

vi.mock("@snapotter/doc-engine", () => ({
  convertDocument: vi.fn(),
  sofficeAvailable: vi.fn(),
}));

vi.mock("@snapotter/media-engine", () => ({
  runFfmpeg: vi.fn(),
  softwareEncoder: vi.fn((x) => x),
}));

let testDir: string;
let previewDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `snapotter-preview-test-${randomUUID().slice(0, 8)}`);
  previewDir = join(testDir, ".previews");
  await mkdir(previewDir, { recursive: true });
  config.FILES_STORAGE_PATH = testDir;
  vi.resetModules();
});

afterEach(async () => {
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
});
