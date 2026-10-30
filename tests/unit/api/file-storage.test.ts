import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { SafeError } from "@snapotter/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  FILES_STORAGE_PATH: "",
  STORAGE_MODE: "local" as "local" | "s3",
  S3_BUCKET: "snap-bucket",
  S3_REGION: "us-east-1",
  S3_ENDPOINT: "http://localhost:19000",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_FORCE_PATH_STYLE: true,
  S3_PREFIX: "",
}));

const s3Mocks = vi.hoisted(() => ({
  load: vi.fn<() => Promise<unknown>>(),
  configure: vi.fn(),
  checkConnection: vi.fn(),
  putObject: vi.fn(),
  putThumbnail: vi.fn(),
  deleteObject: vi.fn(),
  deleteThumbnail: vi.fn(),
  isMissingObjectError: vi.fn<(_err: unknown) => boolean>(() => false),
}));

vi.mock("@snapotter/enterprise", () => ({
  loadS3Storage: () => s3Mocks.load(),
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: config,
}));

// Passthrough fs mock. statfs can report a full disk. Opening a file for
// writing can fail outright (failOpenWith), or succeed and then have the write
// through its handle stop halfway (the disk filling after the free-space check
// passed), recording where it wrote. unlink can fail with EBUSY.
const diskState = vi.hoisted(() => ({
  lowDisk: false,
  statfsOverride: null as { bfree: number; bavail: number; bsize: number } | null,
  failStatfsWith: "",
  failMkdirWith: "",
  failOpenWith: "",
  failReadFileWith: "",
  failWriteMidway: false as boolean | string,
  failCloseWith: "",
  closeCalls: 0,
  failRenameWith: "",
  failUnlink: false as boolean | string,
  partialPath: "",
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const errno = (code: string) =>
    Object.assign(new Error(`${code}: simulated`), { code, syscall: "open" });
  return {
    ...actual,
    statfs: (path: string) => {
      if (diskState.failStatfsWith) return Promise.reject(errno(diskState.failStatfsWith));
      if (diskState.statfsOverride) return Promise.resolve(diskState.statfsOverride);
      return diskState.lowDisk
        ? Promise.resolve({ bfree: 0, bavail: 0, bsize: 4096 })
        : actual.statfs(path);
    },
    mkdir: async (...args: Parameters<typeof actual.mkdir>) => {
      if (diskState.failMkdirWith) throw errno(diskState.failMkdirWith);
      return actual.mkdir(...args);
    },
    readFile: async (...args: Parameters<typeof actual.readFile>) => {
      if (diskState.failReadFileWith) throw errno(diskState.failReadFileWith);
      return actual.readFile(...args);
    },
    open: async (...args: Parameters<typeof actual.open>) => {
      const [path, flags] = args;
      const forWriting = typeof flags === "string" && /[wax]/.test(flags);
      if (forWriting && diskState.failOpenWith) throw errno(diskState.failOpenWith);
      const handle = await actual.open(...args);
      if (forWriting && diskState.failWriteMidway) {
        const writeCode =
          typeof diskState.failWriteMidway === "string" ? diskState.failWriteMidway : "ENOSPC";
        const write = handle.writeFile.bind(handle);
        const close = handle.close.bind(handle);
        Object.assign(handle, {
          writeFile: async (data: Buffer) => {
            diskState.partialPath = String(path);
            await write(data.subarray(0, Math.floor(data.length / 2)));
            throw errno(writeCode);
          },
          close: async () => {
            diskState.closeCalls += 1;
            await close();
          },
        });
      }
      if (forWriting && diskState.failCloseWith) {
        const closeCode = diskState.failCloseWith;
        const close = handle.close.bind(handle);
        Object.assign(handle, {
          close: async () => {
            diskState.closeCalls += 1;
            diskState.partialPath = String(path);
            await close();
            throw errno(closeCode);
          },
        });
      }
      return handle;
    },
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (diskState.failRenameWith) throw errno(diskState.failRenameWith);
      return actual.rename(...args);
    },
    unlink: (path: Parameters<typeof actual.unlink>[0]) => {
      if (diskState.failUnlink) {
        const unlinkCode =
          typeof diskState.failUnlink === "string" ? diskState.failUnlink : "EBUSY";
        return Promise.reject(errno(unlinkCode));
      }
      return actual.unlink(path);
    },
  };
});

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `snapotter-fs-test-${randomUUID().slice(0, 8)}`);
  await mkdir(testDir, { recursive: true });
  config.FILES_STORAGE_PATH = testDir;
  config.STORAGE_MODE = "local";
  s3Mocks.configure.mockReset();
  s3Mocks.checkConnection.mockReset();
  s3Mocks.checkConnection.mockResolvedValue(undefined);
  s3Mocks.putObject.mockReset();
  s3Mocks.putObject.mockResolvedValue(undefined);
  s3Mocks.putThumbnail.mockReset();
  s3Mocks.putThumbnail.mockResolvedValue(undefined);
  s3Mocks.deleteObject.mockReset();
  s3Mocks.deleteObject.mockResolvedValue(undefined);
  s3Mocks.deleteThumbnail.mockReset();
  s3Mocks.deleteThumbnail.mockResolvedValue(undefined);
  s3Mocks.isMissingObjectError.mockReset();
  s3Mocks.isMissingObjectError.mockReturnValue(false);
  s3Mocks.load.mockReset();
  s3Mocks.load.mockResolvedValue({
    configureS3: s3Mocks.configure,
    checkConnection: s3Mocks.checkConnection,
    putObject: s3Mocks.putObject,
    putThumbnail: s3Mocks.putThumbnail,
    deleteObject: s3Mocks.deleteObject,
    deleteThumbnail: s3Mocks.deleteThumbnail,
    isMissingObjectError: s3Mocks.isMissingObjectError,
  });
  vi.resetModules();
});

afterEach(async () => {
  diskState.lowDisk = false;
  diskState.statfsOverride = null;
  diskState.failStatfsWith = "";
  diskState.failMkdirWith = "";
  diskState.failOpenWith = "";
  diskState.failReadFileWith = "";
  diskState.failWriteMidway = false;
  diskState.failCloseWith = "";
  diskState.closeCalls = 0;
  diskState.failRenameWith = "";
  diskState.failUnlink = false;
  diskState.partialPath = "";
  vi.restoreAllMocks();
  await rm(testDir, { recursive: true, force: true });
});

async function importModule() {
  return await import("../../../apps/api/src/lib/file-storage.js");
}

type StorageError = Error & {
  isSafeMessage?: unknown;
  kind?: string;
  code?: string;
  statusCode?: number;
};

const NOT_WRITABLE_MSG =
  "The server can't write to its storage: it's read-only or not allowed to write there.";
const FULL_MSG = "The server's storage is full.";

describe("saveFile", () => {
  it("saves buffer and returns UUID-based filename with correct extension", async () => {
    const { saveFile } = await importModule();
    const buf = Buffer.from("fake png data");
    const name = await saveFile(buf, "photo.png");
    expect(name).toMatch(/^[0-9a-f-]{36}\.png$/);
    const saved = await readFile(join(testDir, name));
    expect(saved.toString()).toBe("fake png data");
  });

  it("sanitizes dangerous extensions to .bin", async () => {
    const { saveFile } = await importModule();
    const buf = Buffer.from("evil");
    const name = await saveFile(buf, "payload.exe");
    expect(name).toMatch(/\.bin$/);
  });

  it("uses .bin for files with no extension", async () => {
    const { saveFile } = await importModule();
    const buf = Buffer.from("data");
    const name = await saveFile(buf, "noext");
    expect(name).toMatch(/\.bin$/);
  });

  it("creates storage directory on first call", async () => {
    await rm(testDir, { recursive: true, force: true });
    const freshDir = join(tmpdir(), `snapotter-fs-fresh-${randomUUID().slice(0, 8)}`);
    config.FILES_STORAGE_PATH = freshDir;
    try {
      expect(existsSync(freshDir)).toBe(false);
      const { saveFile } = await importModule();
      await saveFile(Buffer.from("x"), "img.jpg");
      expect(existsSync(freshDir)).toBe(true);
    } finally {
      await rm(freshDir, { recursive: true, force: true });
    }
  });

  it("returns different filenames for same input (UUID-based)", async () => {
    const { saveFile } = await importModule();
    const buf = Buffer.from("same");
    const name1 = await saveFile(buf, "a.png");
    const name2 = await saveFile(buf, "a.png");
    expect(name1).not.toBe(name2);
  });

  it("accepts known image extensions", async () => {
    const { saveFile } = await importModule();
    const extensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".gif",
      ".svg",
      ".heic",
      ".tiff",
      ".avif",
    ];
    for (const ext of extensions) {
      const name = await saveFile(Buffer.from("x"), `file${ext}`);
      expect(name).toMatch(new RegExp(`\\${ext}$`));
    }
  });

  it("preserves every supported camera RAW extension", async () => {
    const { CAMERA_RAW_INPUTS } = await import("@snapotter/shared");
    const { saveFile } = await importModule();
    for (const ext of CAMERA_RAW_INPUTS) {
      const name = await saveFile(Buffer.from("x"), `photo${ext}`);
      expect(name).toMatch(new RegExp(`\\${ext}$`));
    }
  });

  it("lowercases extensions", async () => {
    const { saveFile } = await importModule();
    const name = await saveFile(Buffer.from("x"), "PHOTO.PNG");
    expect(name).toMatch(/\.png$/);
  });
});

describe("deleteStoredFile", () => {
  it("deletes existing file", async () => {
    const { saveFile, deleteStoredFile } = await importModule();
    const name = await saveFile(Buffer.from("del"), "del.png");
    expect(existsSync(join(testDir, name))).toBe(true);
    await deleteStoredFile(name);
    expect(existsSync(join(testDir, name))).toBe(false);
  });

  it("does not throw for non-existent file", async () => {
    const { deleteStoredFile } = await importModule();
    await expect(deleteStoredFile("nonexistent.png")).resolves.toBeUndefined();
  });
});

describe("getStoredFilePath", () => {
  it("returns correct joined path", async () => {
    const { getStoredFilePath } = await importModule();
    const result = getStoredFilePath("abc-123.png");
    expect(result).toBe(join(testDir, "abc-123.png"));
  });
});

// Regression guard for #899: createReadStream defers the open, so a missing
// blob used to surface as an async "error" event after the caller's try/catch
// had already exited (the download route then 500ed instead of 404ing). The
// local branch must reject the promise itself so callers can catch it.
describe("streamStoredFile", () => {
  it("rejects with ENOENT when the stored file is missing", async () => {
    const { streamStoredFile } = await importModule();
    const err = (await streamStoredFile("00000000-dead-beef-0000-000000000000.png").then(
      () => null,
      (e: unknown) => e,
    )) as NodeJS.ErrnoException | null;
    expect(err).toBeInstanceOf(Error);
    expect(err?.code).toBe("ENOENT");
  });

  it("streams back a saved file", async () => {
    const { saveFile, streamStoredFile } = await importModule();
    const name = await saveFile(Buffer.from("stream me"), "photo.png");
    const stream = await streamStoredFile(name);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe("stream me");
  });

  // A blob that exists but can't be opened must also reject up front, so the
  // download route can tell a storage fault (rethrow, 500) from a missing
  // blob (404) instead of the EACCES escaping as an async stream error.
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  it.skipIf(isRoot)("rejects with EACCES when the stored file is unreadable", async () => {
    const { saveFile, streamStoredFile } = await importModule();
    const name = await saveFile(Buffer.from("locked"), "photo.png");
    await chmod(join(testDir, name), 0o000);
    const err = (await streamStoredFile(name).then(
      () => null,
      (e: unknown) => e,
    )) as NodeJS.ErrnoException | null;
    expect(err).toBeInstanceOf(Error);
    expect(err?.code).toBe("EACCES");
  });
});

// Regression guard for the path-traversal report: stored names are generated
// basenames, so any separator/parent-reference/absolute name must be rejected
// before it is joined onto FILES_STORAGE_PATH. Without the guard a poisoned
// user_files.stored_name (planted via the 1.x SQLite import, which copies it
// verbatim) lets these helpers read or delete files anywhere the API user can.
describe("path traversal containment", () => {
  const TRAVERSAL_NAMES = [
    "../escape.txt",
    "../../../../etc/passwd",
    "..\\escape.txt",
    "subdir/escape.txt",
    "nested/../../escape.txt",
    "..",
    ".",
    "/etc/passwd",
    "with\0nul.png",
  ];

  it("readStoredFile refuses to read a file outside the storage root", async () => {
    const { readStoredFile } = await importModule();
    // Plant a secret directly in tmpdir, one level above testDir.
    const secretName = `snapotter-secret-${randomUUID().slice(0, 8)}.txt`;
    const secretPath = join(tmpdir(), secretName);
    await writeFile(secretPath, "TOP SECRET");
    try {
      await expect(readStoredFile(join("..", secretName))).rejects.toThrow();
    } finally {
      await rm(secretPath, { force: true });
    }
  });

  it("deleteStoredFile refuses a traversal name and leaves the outside file intact", async () => {
    const { deleteStoredFile } = await importModule();
    const secretName = `snapotter-secret-${randomUUID().slice(0, 8)}.txt`;
    const secretPath = join(tmpdir(), secretName);
    await writeFile(secretPath, "TOP SECRET");
    try {
      await expect(deleteStoredFile(join("..", secretName))).rejects.toThrow();
      expect(existsSync(secretPath)).toBe(true);
    } finally {
      await rm(secretPath, { force: true });
    }
  });

  it.each(TRAVERSAL_NAMES)("streamStoredFile rejects %j", async (name) => {
    const { streamStoredFile } = await importModule();
    await expect(streamStoredFile(name)).rejects.toThrow();
  });

  it.each(TRAVERSAL_NAMES)("getStoredFilePath rejects %j", async (name) => {
    const { getStoredFilePath } = await importModule();
    expect(() => getStoredFilePath(name)).toThrow();
  });

  it.each(TRAVERSAL_NAMES)("getCachedThumbnail rejects %j", async (name) => {
    const { getCachedThumbnail } = await importModule();
    await expect(getCachedThumbnail(name)).rejects.toThrow();
  });

  it.each(TRAVERSAL_NAMES)("deleteThumbnail rejects %j", async (name) => {
    const { deleteThumbnail } = await importModule();
    await expect(deleteThumbnail(name)).rejects.toThrow();
  });

  it.each(TRAVERSAL_NAMES)("saveThumbnail rejects %j", async (name) => {
    const { saveThumbnail } = await importModule();
    await expect(saveThumbnail(name, Buffer.from("t"))).rejects.toThrow();
  });

  it("still serves and deletes a normally-stored file", async () => {
    const { saveFile, readStoredFile, deleteStoredFile } = await importModule();
    const name = await saveFile(Buffer.from("hello"), "photo.png");
    expect((await readStoredFile(name)).toString()).toBe("hello");
    await expect(deleteStoredFile(name)).resolves.toBeUndefined();
    expect(existsSync(join(testDir, name))).toBe(false);
  });
});

describe("readStoredFile abort signal (#1497)", () => {
  it("reads the file when passed a live AbortSignal (options object or bare signal)", async () => {
    const { saveFile, readStoredFile } = await importModule();
    const name = await saveFile(Buffer.from("hello"), "photo.png");
    const ac = new AbortController();

    expect((await readStoredFile(name, { signal: ac.signal })).toString()).toBe("hello");
    expect((await readStoredFile(name, ac.signal)).toString()).toBe("hello");
  });

  it("rejects when the passed AbortSignal is already aborted", async () => {
    const { saveFile, readStoredFile } = await importModule();
    const name = await saveFile(Buffer.from("hello"), "photo.png");
    const ac = new AbortController();
    ac.abort();

    await expect(readStoredFile(name, { signal: ac.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(readStoredFile(name, ac.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("ensureStorageDir", () => {
  it("creates directory if not exists", async () => {
    await rm(testDir, { recursive: true, force: true });
    const freshDir = join(tmpdir(), `snapotter-fs-ensure-${randomUUID().slice(0, 8)}`);
    config.FILES_STORAGE_PATH = freshDir;
    try {
      const { ensureStorageDir } = await importModule();
      await ensureStorageDir();
      expect(existsSync(freshDir)).toBe(true);
    } finally {
      await rm(freshDir, { recursive: true, force: true });
    }
  });

  it("is idempotent (second call does not throw)", async () => {
    const { ensureStorageDir } = await importModule();
    await ensureStorageDir();
    await expect(ensureStorageDir()).resolves.toBeUndefined();
  });
});

describe("thumbnail functions", () => {
  it("saveThumbnail creates .thumbs subdirectory", async () => {
    const { saveThumbnail } = await importModule();
    await saveThumbnail("test.png", Buffer.from("thumb"));
    expect(existsSync(join(testDir, ".thumbs"))).toBe(true);
  });

  it("saveThumbnail writes to correct path", async () => {
    const { saveThumbnail } = await importModule();
    await saveThumbnail("test.png", Buffer.from("thumb-data"));
    const content = await readFile(join(testDir, ".thumbs", "test.png.thumb.jpg"));
    expect(content.toString()).toBe("thumb-data");
  });

  it("getCachedThumbnail reads back saved thumbnail", async () => {
    const { saveThumbnail, getCachedThumbnail } = await importModule();
    const data = Buffer.from("my-thumb");
    await saveThumbnail("pic.jpg", data);
    const result = await getCachedThumbnail("pic.jpg");
    expect(result).not.toBeNull();
    expect(result?.toString()).toBe("my-thumb");
  });

  it("getCachedThumbnail returns null for non-existent thumbnail", async () => {
    const { getCachedThumbnail } = await importModule();
    const result = await getCachedThumbnail("nope.png");
    expect(result).toBeNull();
  });

  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  it.skipIf(isRoot)(
    "getCachedThumbnail rejects with EACCES when the cached thumbnail is unreadable (#2836)",
    async () => {
      const { saveThumbnail, getCachedThumbnail } = await importModule();
      await saveThumbnail("photo.png", Buffer.from("jpg"));
      const thumbFile = join(testDir, ".thumbs", "photo.png.thumb.jpg");
      await chmod(thumbFile, 0o000);
      try {
        const err = (await getCachedThumbnail("photo.png").then(
          () => null,
          (e: unknown) => e,
        )) as NodeJS.ErrnoException | null;
        expect(err).toBeInstanceOf(Error);
        expect(err?.code).toBe("EACCES");
      } finally {
        await chmod(thumbFile, 0o644).catch(() => {});
      }
    },
  );

  it("getCachedThumbnail rejects with EISDIR when the cached thumbnail path is a directory (#2836)", async () => {
    const { getCachedThumbnail } = await importModule();
    await mkdir(join(testDir, ".thumbs", "photo.png.thumb.jpg"), { recursive: true });
    const err = (await getCachedThumbnail("photo.png").then(
      () => null,
      (e: unknown) => e,
    )) as NodeJS.ErrnoException | null;
    expect(err).toBeInstanceOf(Error);
    expect(err?.code).toBe("EISDIR");
  });

  it.each(["EACCES", "EPERM", "EIO", "EISDIR", "ENOTDIR"] as const)(
    "getCachedThumbnail rethrows %s from readFile instead of returning null (#2836)",
    async (code) => {
      diskState.failReadFileWith = code;
      const { getCachedThumbnail } = await importModule();
      const err = (await getCachedThumbnail("photo.png").then(
        () => null,
        (e: unknown) => e,
      )) as NodeJS.ErrnoException | null;
      expect(err).toBeInstanceOf(Error);
      expect(err?.code).toBe(code);
    },
  );

  it("deleteThumbnail removes the file", async () => {
    const { saveThumbnail, deleteThumbnail } = await importModule();
    await saveThumbnail("rm.png", Buffer.from("x"));
    const thumbFile = join(testDir, ".thumbs", "rm.png.thumb.jpg");
    expect(existsSync(thumbFile)).toBe(true);
    await deleteThumbnail("rm.png");
    expect(existsSync(thumbFile)).toBe(false);
  });

  it("deleteThumbnail does not throw for non-existent", async () => {
    const { deleteThumbnail } = await importModule();
    await expect(deleteThumbnail("ghost.png")).resolves.toBeUndefined();
  });

  it("saveThumbnail delegates to s3.putThumbnail when STORAGE_MODE is s3", async () => {
    config.STORAGE_MODE = "s3";
    const { saveThumbnail } = await importModule();
    const buf = Buffer.from("RIFF\x10\x00\x00\x00WEBPVP8 ");
    await saveThumbnail("video.mp4", buf);
    expect(s3Mocks.putThumbnail).toHaveBeenCalledWith("video.mp4", buf);
  });
});

describe("storage not writable (EACCES)", () => {
  // chmod-based EACCES does not apply to root, which bypasses permission checks
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

  it.skipIf(isRoot)("ensureStorageDir throws a SafeError carrying statusCode 503", async () => {
    const roParent = join(tmpdir(), `snapotter-fs-ro-${randomUUID().slice(0, 8)}`);
    await mkdir(roParent, { recursive: true });
    config.FILES_STORAGE_PATH = join(roParent, "sub");
    try {
      await chmod(roParent, 0o555);
      const { ensureStorageDir } = await importModule();
      const err = (await ensureStorageDir().then(
        () => null,
        (e: unknown) => e,
      )) as StorageError | null;
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe(NOT_WRITABLE_MSG);
      expect(err?.isSafeMessage).toBe(true);
      expect(err?.kind).toBe("operational");
      expect(err?.code).toBe("storage-not-writable");
      expect(err?.statusCode).toBe(503);
      expect(err?.cause).toMatchObject({ code: "EACCES" });
    } finally {
      await chmod(roParent, 0o755).catch(() => {});
      await rm(roParent, { recursive: true, force: true });
    }
  });

  it.each(["EACCES", "EPERM", "EROFS"] as const)(
    "ensureStorageDir maps %s from mkdir to a 503 SafeError with cause (#1634, #2839)",
    async (code) => {
      diskState.failMkdirWith = code;
      const { ensureStorageDir } = await importModule();
      const err = (await ensureStorageDir().then(
        () => null,
        (e: unknown) => e,
      )) as (StorageError & { cause?: unknown }) | null;
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe(NOT_WRITABLE_MSG);
      expect(err?.isSafeMessage).toBe(true);
      expect(err?.kind).toBe("operational");
      expect(err?.code).toBe("storage-not-writable");
      expect(err?.statusCode).toBe(503);
      expect(err?.cause).toMatchObject({ code });
    },
  );

  it.each(["ENOSPC", "EDQUOT"] as const)(
    "ensureStorageDir maps %s from mkdir to a 503 storage-full SafeError with cause (#2839)",
    async (code) => {
      diskState.failMkdirWith = code;
      const { ensureStorageDir } = await importModule();
      const err = (await ensureStorageDir().then(
        () => null,
        (e: unknown) => e,
      )) as (StorageError & { cause?: unknown }) | null;
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe(FULL_MSG);
      expect(err?.isSafeMessage).toBe(true);
      expect(err?.kind).toBe("operational");
      expect(err?.code).toBe("storage-full");
      expect(err?.statusCode).toBe(503);
      expect(err?.cause).toMatchObject({ code });
    },
  );

  it.each(["EACCES", "EPERM", "EROFS"] as const)(
    "saveFile maps %s on open to a 503 SafeError with cause (#1634, #2839)",
    async (code) => {
      diskState.failOpenWith = code;
      const { saveFile } = await importModule();
      const err = (await saveFile(Buffer.from("x"), "a.png").then(
        () => null,
        (e: unknown) => e,
      )) as (StorageError & { cause?: unknown }) | null;
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe(NOT_WRITABLE_MSG);
      expect(err?.isSafeMessage).toBe(true);
      expect(err?.kind).toBe("operational");
      expect(err?.code).toBe("storage-not-writable");
      expect(err?.statusCode).toBe(503);
      expect(err?.cause).toMatchObject({ code });
    },
  );

  it.each(["ENOSPC", "EDQUOT"] as const)(
    "saveFile maps %s on open to a 503 storage-full SafeError with cause (#2839)",
    async (code) => {
      diskState.failOpenWith = code;
      const { saveFile } = await importModule();
      const err = (await saveFile(Buffer.from("x"), "a.png").then(
        () => null,
        (e: unknown) => e,
      )) as (StorageError & { cause?: unknown }) | null;
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe(FULL_MSG);
      expect(err?.isSafeMessage).toBe(true);
      expect(err?.kind).toBe("operational");
      expect(err?.code).toBe("storage-full");
      expect(err?.statusCode).toBe(503);
      expect(err?.cause).toMatchObject({ code });
    },
  );

  it.each(["EACCES", "EPERM", "EROFS"] as const)(
    "saveThumbnail maps %s from mkdir (.thumbs) to a 503 SafeError with cause (#1634, #2839)",
    async (code) => {
      diskState.failMkdirWith = code;
      const { saveThumbnail } = await importModule();
      const err = (await saveThumbnail("pic.png", Buffer.from("t")).then(
        () => null,
        (e: unknown) => e,
      )) as (StorageError & { cause?: unknown }) | null;
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe(NOT_WRITABLE_MSG);
      expect(err?.isSafeMessage).toBe(true);
      expect(err?.kind).toBe("operational");
      expect(err?.code).toBe("storage-not-writable");
      expect(err?.statusCode).toBe(503);
      expect(err?.cause).toMatchObject({ code });
    },
  );

  it.each(["ENOSPC", "EDQUOT"] as const)(
    "saveThumbnail maps %s from mkdir (.thumbs) to a 503 storage-full SafeError with cause (#2839)",
    async (code) => {
      diskState.failMkdirWith = code;
      const { saveThumbnail } = await importModule();
      const err = (await saveThumbnail("pic.png", Buffer.from("t")).then(
        () => null,
        (e: unknown) => e,
      )) as (StorageError & { cause?: unknown }) | null;
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe(FULL_MSG);
      expect(err?.isSafeMessage).toBe(true);
      expect(err?.kind).toBe("operational");
      expect(err?.code).toBe("storage-full");
      expect(err?.statusCode).toBe(503);
      expect(err?.cause).toMatchObject({ code });
    },
  );

  it.each(["EACCES", "EPERM", "EROFS"] as const)(
    "deleteStoredFile and deleteThumbnail map %s from unlink to a 503 SafeError with cause (#1634, #2839)",
    async (code) => {
      diskState.failUnlink = code;
      const { deleteStoredFile, deleteThumbnail } = await importModule();
      for (const fn of [() => deleteStoredFile("pic.png"), () => deleteThumbnail("pic.png")]) {
        const err = (await fn().then(
          () => null,
          (e: unknown) => e,
        )) as (StorageError & { cause?: unknown }) | null;
        expect(err).toBeInstanceOf(Error);
        expect(err?.message).toBe(NOT_WRITABLE_MSG);
        expect(err?.isSafeMessage).toBe(true);
        expect(err?.kind).toBe("operational");
        expect(err?.code).toBe("storage-not-writable");
        expect(err?.statusCode).toBe(503);
        expect(err?.cause).toMatchObject({ code });
      }
    },
  );

  it.each(["ENOSPC", "EDQUOT"] as const)(
    "deleteStoredFile and deleteThumbnail map %s from unlink to a 503 storage-full SafeError with cause (#2839)",
    async (code) => {
      diskState.failUnlink = code;
      const { deleteStoredFile, deleteThumbnail } = await importModule();
      for (const fn of [() => deleteStoredFile("pic.png"), () => deleteThumbnail("pic.png")]) {
        const err = (await fn().then(
          () => null,
          (e: unknown) => e,
        )) as (StorageError & { cause?: unknown }) | null;
        expect(err).toBeInstanceOf(Error);
        expect(err?.message).toBe(FULL_MSG);
        expect(err?.isSafeMessage).toBe(true);
        expect(err?.kind).toBe("operational");
        expect(err?.code).toBe("storage-full");
        expect(err?.statusCode).toBe(503);
        expect(err?.cause).toMatchObject({ code });
      }
    },
  );

  it("deleteStoredFile and deleteThumbnail rethrow non-permission unlink errors untouched", async () => {
    diskState.failUnlink = "EBUSY";
    const { deleteStoredFile, deleteThumbnail } = await importModule();
    for (const fn of [() => deleteStoredFile("pic.png"), () => deleteThumbnail("pic.png")]) {
      const err = (await fn().then(
        () => null,
        (e: unknown) => e,
      )) as StorageError | null;
      expect(err?.code).toBe("EBUSY");
      expect(err?.isSafeMessage).toBeUndefined();
      expect(err?.statusCode).toBeUndefined();
    }
  });

  it.skipIf(isRoot)("saveFile throws a SafeError when the directory is read-only", async () => {
    const { logger } = await import("../../../apps/api/src/lib/logger.js");
    const logError = vi.spyOn(logger, "error").mockImplementation(() => {});
    const { saveFile } = await importModule();
    try {
      await chmod(testDir, 0o555);
      const err = (await saveFile(Buffer.from("x"), "a.png").then(
        () => null,
        (e: unknown) => e,
      )) as StorageError | null;
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe(NOT_WRITABLE_MSG);
      expect(err?.isSafeMessage).toBe(true);
      expect(err?.code).toBe("storage-not-writable");
      expect(err?.statusCode).toBe(503);
      // Nothing was created, so there's no orphan to report (#1472).
      expect(logError).not.toHaveBeenCalled();
    } finally {
      await chmod(testDir, 0o755).catch(() => {});
    }
  });

  // #1472: with no search permission even the cleanup's unlink fails with
  // EACCES, which used to log an orphan that was never created.
  it.skipIf(isRoot)("saveFile logs no orphan when the directory can't be entered", async () => {
    const { logger } = await import("../../../apps/api/src/lib/logger.js");
    const logError = vi.spyOn(logger, "error").mockImplementation(() => {});
    const { saveFile } = await importModule();
    try {
      await chmod(testDir, 0o000);
      const err = (await saveFile(Buffer.from("x"), "a.png").then(
        () => null,
        (e: unknown) => e,
      )) as StorageError | null;
      expect(err?.message).toBe(NOT_WRITABLE_MSG);
      expect(err?.code).toBe("storage-not-writable");
      expect(err?.statusCode).toBe(503);
      expect(logError).not.toHaveBeenCalled();
    } finally {
      await chmod(testDir, 0o755).catch(() => {});
    }
  });

  // #1455: a delete that can't happen must not look like one that did.
  it.skipIf(isRoot)(
    "deleteStoredFile throws a SafeError when the file can't be removed",
    async () => {
      const { saveFile, deleteStoredFile } = await importModule();
      const name = await saveFile(Buffer.from("keep"), "stuck.png");
      try {
        await chmod(testDir, 0o555);
        const err = (await deleteStoredFile(name).then(
          () => null,
          (e: unknown) => e,
        )) as StorageError | null;
        expect(err).toBeInstanceOf(Error);
        expect(err?.message).toBe(NOT_WRITABLE_MSG);
        expect(err?.isSafeMessage).toBe(true);
        expect(err?.kind).toBe("operational");
        expect(err?.code).toBe("storage-not-writable");
        expect(err?.statusCode).toBe(503);
        expect(err?.cause).toMatchObject({ code: "EACCES" });
      } finally {
        await chmod(testDir, 0o755).catch(() => {});
      }
      expect(existsSync(join(testDir, name)), "the file is still there").toBe(true);
    },
  );

  it.skipIf(isRoot)(
    "deleteThumbnail throws a SafeError when the thumbnail can't be removed",
    async () => {
      const { saveThumbnail, deleteThumbnail } = await importModule();
      await saveThumbnail("stuck.png", Buffer.from("t"));
      const thumbDir = join(testDir, ".thumbs");
      try {
        await chmod(thumbDir, 0o555);
        const err = (await deleteThumbnail("stuck.png").then(
          () => null,
          (e: unknown) => e,
        )) as StorageError | null;
        expect(err?.message).toBe(NOT_WRITABLE_MSG);
        expect(err?.code).toBe("storage-not-writable");
        expect(err?.statusCode).toBe(503);
      } finally {
        await chmod(thumbDir, 0o755).catch(() => {});
      }
    },
  );

  it.skipIf(isRoot)(
    "saveThumbnail throws a SafeError when the directory is read-only",
    async () => {
      const { saveThumbnail } = await importModule();
      try {
        await chmod(testDir, 0o555);
        const err = (await saveThumbnail("pic.png", Buffer.from("t")).then(
          () => null,
          (e: unknown) => e,
        )) as StorageError | null;
        expect(err).toBeInstanceOf(Error);
        expect(err?.message).toBe(NOT_WRITABLE_MSG);
        expect(err?.isSafeMessage).toBe(true);
        expect(err?.kind).toBe("operational");
        expect(err?.code).toBe("storage-not-writable");
        expect(err?.statusCode).toBe(503);
        expect(err?.cause).toMatchObject({ code: "EACCES" });
      } finally {
        await chmod(testDir, 0o755).catch(() => {});
      }
    },
  );

  it.skipIf(isRoot)(
    "saveThumbnail throws a SafeError when .thumbs becomes read-only after initialization",
    async () => {
      const { logger } = await import("../../../apps/api/src/lib/logger.js");
      const logError = vi.spyOn(logger, "error").mockImplementation(() => {});
      const { saveThumbnail } = await importModule();
      await saveThumbnail("first.png", Buffer.from("t"));
      const thumbDir = join(testDir, ".thumbs");
      try {
        await chmod(thumbDir, 0o555);
        const err = (await saveThumbnail("second.png", Buffer.from("t")).then(
          () => null,
          (e: unknown) => e,
        )) as StorageError | null;
        expect(err).toBeInstanceOf(Error);
        expect(err?.message).toBe(NOT_WRITABLE_MSG);
        expect(err?.isSafeMessage).toBe(true);
        expect(err?.kind).toBe("operational");
        expect(err?.code).toBe("storage-not-writable");
        expect(err?.statusCode).toBe(503);
        expect(err?.cause).toMatchObject({ code: "EACCES" });
        expect(logError).not.toHaveBeenCalled();
      } finally {
        await chmod(thumbDir, 0o755).catch(() => {});
      }
    },
  );
});

describe("disk space floor", () => {
  it("saveFile throws a SafeError with statusCode 503 and code disk-free-floor when free space is below the floor (#2839)", async () => {
    const { saveFile } = await importModule();
    diskState.lowDisk = true;
    const err = (await saveFile(Buffer.from("x"), "a.png").then(
      () => null,
      (e: unknown) => e,
    )) as StorageError | null;
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toBe("Insufficient disk space");
    expect(err?.isSafeMessage).toBe(true);
    expect(err?.kind).toBe("operational");
    expect(err?.code).toBe("disk-free-floor");
    expect(err?.statusCode).toBe(503);
  });

  it("checks non-root available blocks (bavail) rather than total free blocks (bfree) (#2839)", async () => {
    const { saveFile } = await importModule();
    // bfree is 200 MiB (>= 100 MiB floor), but bavail is 0 (ext4 root-reserved blocks).
    diskState.statfsOverride = {
      bfree: (200 * 1024 * 1024) / 4096,
      bavail: 0,
      bsize: 4096,
    };
    const err = (await saveFile(Buffer.from("x"), "a.png").then(
      () => null,
      (e: unknown) => e,
    )) as StorageError | null;
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toBe("Insufficient disk space");
    expect(err?.isSafeMessage).toBe(true);
    expect(err?.kind).toBe("operational");
    expect(err?.code).toBe("disk-free-floor");
    expect(err?.statusCode).toBe(503);
  });

  it("enforces the exact 100 MiB boundary on bavail * bsize (#2839)", async () => {
    const { saveFile } = await importModule();
    const minBlocks = (100 * 1024 * 1024) / 4096;

    // One 4 KiB block below 100 MiB rejects and writes nothing.
    diskState.statfsOverride = {
      bfree: minBlocks * 2,
      bavail: minBlocks - 1,
      bsize: 4096,
    };
    const err = (await saveFile(Buffer.from("x"), "a.png").then(
      () => null,
      (e: unknown) => e,
    )) as StorageError | null;
    expect(err?.code).toBe("disk-free-floor");
    expect(err?.statusCode).toBe(503);
    expect(await readdir(testDir)).toEqual([]);

    // Exactly 100 MiB available succeeds.
    diskState.statfsOverride = {
      bfree: minBlocks * 2,
      bavail: minBlocks,
      bsize: 4096,
    };
    const saved = await saveFile(Buffer.from("ok"), "a.png");
    expect((await readFile(join(testDir, saved))).toString()).toBe("ok");
  });

  it("logs a warning once and allows writes when statfs fails (#1634)", async () => {
    const { logger } = await import("../../../apps/api/src/lib/logger.js");
    const logWarn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const { saveFile } = await importModule();
    diskState.failStatfsWith = "EIO";

    const first = await saveFile(Buffer.from("first"), "a.png");
    const second = await saveFile(Buffer.from("second"), "b.png");

    expect((await readFile(join(testDir, first))).toString()).toBe("first");
    expect((await readFile(join(testDir, second))).toString()).toBe("second");
    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: testDir,
        err: expect.objectContaining({ code: "EIO" }),
      }),
      expect.any(String),
    );
  });
});

// #1472: a write that fails partway leaves a partial file whose name never
// reaches the caller, so only saveFile can remove it.
describe("saveFile after a failed write", () => {
  /** Files in the storage root, ignoring the thumbnail folder. */
  async function storedFiles(): Promise<string[]> {
    return (await readdir(testDir)).filter((name) => name !== ".thumbs");
  }

  it.each(["ENOSPC", "EDQUOT"] as const)(
    "removes the partly written file and maps %s mid-write to a 503 storage-full SafeError with cause (#2839)",
    async (code) => {
      const { saveFile } = await importModule();
      diskState.failWriteMidway = code;

      const err = (await saveFile(Buffer.alloc(4096, 7), "photo.png").then(
        () => null,
        (e: unknown) => e,
      )) as (StorageError & { cause?: unknown }) | null;

      expect(err?.message).toBe(FULL_MSG);
      expect(err?.isSafeMessage).toBe(true);
      expect(err?.kind).toBe("operational");
      expect(err?.code).toBe("storage-full");
      expect(err?.statusCode).toBe(503);
      expect(err?.cause).toMatchObject({ code });
      expect(diskState.closeCalls).toBe(1);
      // The half-write really happened in the storage root, and is gone.
      expect(dirname(diskState.partialPath)).toBe(testDir);
      expect(existsSync(diskState.partialPath)).toBe(false);
      expect(await storedFiles()).toEqual([]);
    },
  );

  it.each(["ENOSPC", "EDQUOT"] as const)(
    "removes the written file and maps %s on close to a 503 storage-full SafeError with cause (#2839)",
    async (code) => {
      const { saveFile } = await importModule();
      diskState.failCloseWith = code;

      const err = (await saveFile(Buffer.alloc(4096, 7), "photo.png").then(
        () => null,
        (e: unknown) => e,
      )) as (StorageError & { cause?: unknown }) | null;

      expect(err?.message).toBe(FULL_MSG);
      expect(err?.isSafeMessage).toBe(true);
      expect(err?.kind).toBe("operational");
      expect(err?.code).toBe("storage-full");
      expect(err?.statusCode).toBe(503);
      expect(err?.cause).toMatchObject({ code });
      expect(diskState.closeCalls).toBe(1);
      expect(dirname(diskState.partialPath)).toBe(testDir);
      expect(existsSync(diskState.partialPath)).toBe(false);
      expect(await storedFiles()).toEqual([]);
    },
  );

  it("removes the partly written file and rethrows an unclassified write error untouched", async () => {
    const { saveFile } = await importModule();
    diskState.failWriteMidway = "EIO";

    const err = (await saveFile(Buffer.alloc(4096, 7), "photo.png").then(
      () => null,
      (e: unknown) => e,
    )) as StorageError | null;

    expect(err?.code).toBe("EIO");
    expect(err?.isSafeMessage).toBeUndefined();
    expect(err?.statusCode).toBeUndefined();
    expect(dirname(diskState.partialPath)).toBe(testDir);
    expect(existsSync(diskState.partialPath)).toBe(false);
    expect(await storedFiles()).toEqual([]);
  });

  it.each(["EACCES", "EPERM", "EROFS"] as const)(
    "removes the partly written file and maps %s mid-write to a 503 SafeError with cause (#1634, #2839)",
    async (code) => {
      const { saveFile } = await importModule();
      diskState.failWriteMidway = code;

      const err = (await saveFile(Buffer.alloc(4096, 7), "photo.png").then(
        () => null,
        (e: unknown) => e,
      )) as (StorageError & { cause?: unknown }) | null;

      expect(err?.message).toBe(NOT_WRITABLE_MSG);
      expect(err?.isSafeMessage).toBe(true);
      expect(err?.kind).toBe("operational");
      expect(err?.code).toBe("storage-not-writable");
      expect(err?.statusCode).toBe(503);
      expect(err?.cause).toMatchObject({ code });
      expect(existsSync(diskState.partialPath)).toBe(false);
      expect(await storedFiles()).toEqual([]);
    },
  );

  it("cleans up nothing, and logs nothing, when the file was never created", async () => {
    const { logger } = await import("../../../apps/api/src/lib/logger.js");
    const logError = vi.spyOn(logger, "error").mockImplementation(() => {});
    const { saveFile } = await importModule();
    // A read-only volume: creating fails, and so would any unlink.
    diskState.failOpenWith = "EROFS";
    diskState.failUnlink = true;

    const err = (await saveFile(Buffer.alloc(16), "photo.png").then(
      () => null,
      (e: unknown) => e,
    )) as (StorageError & { cause?: unknown }) | null;

    expect(err?.message).toBe(NOT_WRITABLE_MSG);
    expect(err?.isSafeMessage).toBe(true);
    expect(err?.kind).toBe("operational");
    expect(err?.code).toBe("storage-not-writable");
    expect(err?.statusCode).toBe(503);
    expect(err?.cause).toMatchObject({ code: "EROFS" });
    expect(logError).not.toHaveBeenCalled();
    expect(await storedFiles()).toEqual([]);
  });

  it("logs the file it couldn't remove, and still throws the classified write error", async () => {
    const { logger } = await import("../../../apps/api/src/lib/logger.js");
    const logError = vi.spyOn(logger, "error").mockImplementation(() => {});
    const { saveFile } = await importModule();
    diskState.failWriteMidway = true;
    diskState.failUnlink = true;

    const err = (await saveFile(Buffer.alloc(4096, 7), "photo.png").then(
      () => null,
      (e: unknown) => e,
    )) as (StorageError & { cause?: unknown }) | null;

    expect(err?.message).toBe(FULL_MSG);
    expect(err?.isSafeMessage).toBe(true);
    expect(err?.kind).toBe("operational");
    expect(err?.code).toBe("storage-full");
    expect(err?.statusCode).toBe(503);
    expect(err?.cause).toMatchObject({ code: "ENOSPC" });
    const [leftover, ...rest] = await storedFiles();
    expect(rest).toEqual([]);
    expect(diskState.partialPath).toBe(join(testDir, leftover));
    expect((await readFile(join(testDir, leftover))).length).toBe(2048);
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        storedName: leftover,
        err: expect.objectContaining({ code: "EBUSY" }),
        writeErr: "ENOSPC: simulated",
      }),
      expect.any(String),
    );
  });
});

// #1633: a thumbnail write must stage to a temporary file in .thumbs and
// rename into place, removing the temp file on failure so a partial write is
// never cached or served by getCachedThumbnail.
describe("saveThumbnail after a failed write (#1633)", () => {
  async function thumbFiles(): Promise<string[]> {
    const dir = join(testDir, ".thumbs");
    return existsSync(dir) ? readdir(dir) : [];
  }

  it.each(["ENOSPC", "EDQUOT"] as const)(
    "removes the partly written temp file, leaves getCachedThumbnail null, and maps %s mid-write to a 503 storage-full SafeError with cause (#2839)",
    async (code) => {
      const { saveThumbnail, getCachedThumbnail } = await importModule();
      diskState.failWriteMidway = code;

      const err = (await saveThumbnail("photo.png", Buffer.alloc(4096, 7)).then(
        () => null,
        (e: unknown) => e,
      )) as (StorageError & { cause?: unknown }) | null;

      expect(err?.message).toBe(FULL_MSG);
      expect(err?.isSafeMessage).toBe(true);
      expect(err?.kind).toBe("operational");
      expect(err?.code).toBe("storage-full");
      expect(err?.statusCode).toBe(503);
      expect(err?.cause).toMatchObject({ code });
      expect(diskState.closeCalls).toBe(1);
      expect(dirname(diskState.partialPath)).toBe(join(testDir, ".thumbs"));
      expect(diskState.partialPath).not.toBe(join(testDir, ".thumbs", "photo.png.thumb.jpg"));
      expect(existsSync(diskState.partialPath)).toBe(false);
      expect(await thumbFiles()).toEqual([]);
      expect(await getCachedThumbnail("photo.png")).toBeNull();
    },
  );

  it.each(["ENOSPC", "EDQUOT"] as const)(
    "removes the temp file, preserves an existing thumbnail, and maps %s on close to a 503 storage-full SafeError with cause (#2839)",
    async (code) => {
      const { saveThumbnail, getCachedThumbnail } = await importModule();
      await saveThumbnail("photo.png", Buffer.from("intact-thumb"));
      diskState.failCloseWith = code;

      const err = (await saveThumbnail("photo.png", Buffer.alloc(4096, 7)).then(
        () => null,
        (e: unknown) => e,
      )) as (StorageError & { cause?: unknown }) | null;

      expect(err?.message).toBe(FULL_MSG);
      expect(err?.isSafeMessage).toBe(true);
      expect(err?.kind).toBe("operational");
      expect(err?.code).toBe("storage-full");
      expect(err?.statusCode).toBe(503);
      expect(err?.cause).toMatchObject({ code });
      expect(diskState.closeCalls).toBe(1);
      expect(dirname(diskState.partialPath)).toBe(join(testDir, ".thumbs"));
      expect(existsSync(diskState.partialPath)).toBe(false);
      expect(await thumbFiles()).toEqual(["photo.png.thumb.jpg"]);
      expect((await getCachedThumbnail("photo.png"))?.toString()).toBe("intact-thumb");
    },
  );

  it("replaces an existing cached thumbnail without leaving temp files behind", async () => {
    const { saveThumbnail, getCachedThumbnail } = await importModule();
    await saveThumbnail("photo.png", Buffer.from("first-thumb"));
    await saveThumbnail("photo.png", Buffer.from("second-thumb"));

    expect(await thumbFiles()).toEqual(["photo.png.thumb.jpg"]);
    expect((await getCachedThumbnail("photo.png"))?.toString()).toBe("second-thumb");
  });

  it("preserves an existing cached thumbnail when a later write fails partway", async () => {
    const { saveThumbnail, getCachedThumbnail } = await importModule();
    await saveThumbnail("photo.png", Buffer.from("intact-thumb"));
    diskState.failWriteMidway = true;

    const err = (await saveThumbnail("photo.png", Buffer.alloc(4096, 7)).then(
      () => null,
      (e: unknown) => e,
    )) as (StorageError & { cause?: unknown }) | null;

    expect(err?.code).toBe("storage-full");
    expect(err?.statusCode).toBe(503);
    expect(err?.cause).toMatchObject({ code: "ENOSPC" });
    expect(await thumbFiles()).toEqual(["photo.png.thumb.jpg"]);
    expect((await getCachedThumbnail("photo.png"))?.toString()).toBe("intact-thumb");
  });

  it("removes the temp file and leaves the cache empty when rename fails", async () => {
    const { saveThumbnail, getCachedThumbnail } = await importModule();
    diskState.failRenameWith = "EIO";

    const err = (await saveThumbnail("photo.png", Buffer.from("thumb-bytes")).then(
      () => null,
      (e: unknown) => e,
    )) as StorageError | null;

    expect(err?.code).toBe("EIO");
    expect(err?.isSafeMessage).toBeUndefined();
    expect(err?.statusCode).toBeUndefined();
    expect(await thumbFiles()).toEqual([]);
    expect(await getCachedThumbnail("photo.png")).toBeNull();
  });

  it.each(["EACCES", "EPERM", "EROFS"] as const)(
    "removes the temp file and maps %s on rename to a 503 SafeError with cause (#1634, #2839)",
    async (code) => {
      const { saveThumbnail, getCachedThumbnail } = await importModule();
      diskState.failRenameWith = code;

      const err = (await saveThumbnail("photo.png", Buffer.from("thumb-bytes")).then(
        () => null,
        (e: unknown) => e,
      )) as (StorageError & { cause?: unknown }) | null;

      expect(err?.message).toBe(NOT_WRITABLE_MSG);
      expect(err?.isSafeMessage).toBe(true);
      expect(err?.kind).toBe("operational");
      expect(err?.code).toBe("storage-not-writable");
      expect(err?.statusCode).toBe(503);
      expect(err?.cause).toMatchObject({ code });
      expect(await thumbFiles()).toEqual([]);
      expect(await getCachedThumbnail("photo.png")).toBeNull();
    },
  );

  it.each(["ENOSPC", "EDQUOT"] as const)(
    "removes the temp file and maps %s on rename to a 503 storage-full SafeError with cause (#2839)",
    async (code) => {
      const { saveThumbnail, getCachedThumbnail } = await importModule();
      diskState.failRenameWith = code;

      const err = (await saveThumbnail("photo.png", Buffer.from("thumb-bytes")).then(
        () => null,
        (e: unknown) => e,
      )) as (StorageError & { cause?: unknown }) | null;

      expect(err?.message).toBe(FULL_MSG);
      expect(err?.isSafeMessage).toBe(true);
      expect(err?.kind).toBe("operational");
      expect(err?.code).toBe("storage-full");
      expect(err?.statusCode).toBe(503);
      expect(err?.cause).toMatchObject({ code });
      expect(await thumbFiles()).toEqual([]);
      expect(await getCachedThumbnail("photo.png")).toBeNull();
    },
  );

  it.each(["EACCES", "EPERM", "EROFS"] as const)(
    "cleans up nothing, and logs nothing, when the temp file open fails with %s",
    async (code) => {
      const { logger } = await import("../../../apps/api/src/lib/logger.js");
      const logError = vi.spyOn(logger, "error").mockImplementation(() => {});
      const { saveThumbnail, getCachedThumbnail } = await importModule();
      diskState.failOpenWith = code;
      diskState.failUnlink = true;

      const err = (await saveThumbnail("photo.png", Buffer.alloc(16)).then(
        () => null,
        (e: unknown) => e,
      )) as (StorageError & { cause?: unknown }) | null;

      expect(err?.message).toBe(NOT_WRITABLE_MSG);
      expect(err?.isSafeMessage).toBe(true);
      expect(err?.kind).toBe("operational");
      expect(err?.code).toBe("storage-not-writable");
      expect(err?.statusCode).toBe(503);
      expect(err?.cause).toMatchObject({ code });
      expect(logError).not.toHaveBeenCalled();
      expect(await thumbFiles()).toEqual([]);
      expect(await getCachedThumbnail("photo.png")).toBeNull();
    },
  );

  it.each(["ENOSPC", "EDQUOT"] as const)(
    "cleans up nothing, and logs nothing, when the temp file open fails with %s (#2839)",
    async (code) => {
      const { logger } = await import("../../../apps/api/src/lib/logger.js");
      const logError = vi.spyOn(logger, "error").mockImplementation(() => {});
      const { saveThumbnail, getCachedThumbnail } = await importModule();
      diskState.failOpenWith = code;
      diskState.failUnlink = true;

      const err = (await saveThumbnail("photo.png", Buffer.alloc(16)).then(
        () => null,
        (e: unknown) => e,
      )) as (StorageError & { cause?: unknown }) | null;

      expect(err?.message).toBe(FULL_MSG);
      expect(err?.isSafeMessage).toBe(true);
      expect(err?.kind).toBe("operational");
      expect(err?.code).toBe("storage-full");
      expect(err?.statusCode).toBe(503);
      expect(err?.cause).toMatchObject({ code });
      expect(logError).not.toHaveBeenCalled();
      expect(await thumbFiles()).toEqual([]);
      expect(await getCachedThumbnail("photo.png")).toBeNull();
    },
  );

  it("logs the temp file it couldn't remove, and still leaves getCachedThumbnail null", async () => {
    const { logger } = await import("../../../apps/api/src/lib/logger.js");
    const logError = vi.spyOn(logger, "error").mockImplementation(() => {});
    const { saveThumbnail, getCachedThumbnail } = await importModule();
    diskState.failWriteMidway = true;
    diskState.failUnlink = true;

    const err = (await saveThumbnail("photo.png", Buffer.alloc(4096, 7)).then(
      () => null,
      (e: unknown) => e,
    )) as (StorageError & { cause?: unknown }) | null;

    expect(err?.message).toBe(FULL_MSG);
    expect(err?.isSafeMessage).toBe(true);
    expect(err?.kind).toBe("operational");
    expect(err?.code).toBe("storage-full");
    expect(err?.statusCode).toBe(503);
    expect(err?.cause).toMatchObject({ code: "ENOSPC" });
    expect(await getCachedThumbnail("photo.png")).toBeNull();
    const [leftover, ...rest] = await thumbFiles();
    expect(rest).toEqual([]);
    expect(leftover).not.toBe("photo.png.thumb.jpg");
    expect(diskState.partialPath).toBe(join(testDir, ".thumbs", leftover));
    expect((await readFile(join(testDir, ".thumbs", leftover))).length).toBe(2048);
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        storedName: join(".thumbs", leftover),
        err: expect.objectContaining({ code: "EBUSY" }),
        writeErr: "ENOSPC: simulated",
      }),
      expect.any(String),
    );
  });
});

describe("saveFile in S3 mode (#1643)", () => {
  beforeEach(() => {
    config.STORAGE_MODE = "s3";
  });

  it.each([
    [
      "S3 refusing access",
      Object.assign(new Error("Access Denied"), {
        name: "AccessDenied",
        $metadata: { httpStatusCode: 403 },
      }),
    ],
    [
      "S3 throttling the write",
      Object.assign(new Error("Please reduce your request rate."), {
        name: "SlowDown",
        $metadata: { httpStatusCode: 503 },
      }),
    ],
    [
      "S3 resetting the connection",
      Object.assign(new Error("socket hang up"), {
        name: "TimeoutError",
        code: "ECONNRESET",
        $metadata: { attempts: 3 },
      }),
    ],
    [
      "an unmodeled S3 404 on write",
      Object.assign(new Error("NotFound"), {
        name: "NotFound",
        $metadata: { httpStatusCode: 404 },
      }),
    ],
    [
      "the S3 endpoint unreachable",
      Object.assign(new Error("connect ECONNREFUSED 10.0.0.9:9000"), { code: "ECONNREFUSED" }),
    ],
  ])("classifies %s as a 503 storage-unavailable SafeError", async (_case, cause) => {
    s3Mocks.putObject.mockRejectedValueOnce(cause);
    const { saveFile } = await importModule();

    await expect(saveFile(Buffer.from("x"), "photo.png")).rejects.toMatchObject({
      isSafeMessage: true,
      kind: "operational",
      code: "storage-unavailable",
      statusCode: 503,
      cause,
    });
  });

  it("classifies a getS3() initialization failure through s3WriteFault", async () => {
    const netCause = Object.assign(new Error("connect ECONNREFUSED 10.0.0.9:9000"), {
      code: "ECONNREFUSED",
    });
    s3Mocks.load.mockRejectedValueOnce(netCause);
    const { saveFile } = await importModule();

    await expect(saveFile(Buffer.from("x"), "photo.png")).rejects.toMatchObject({
      isSafeMessage: true,
      kind: "operational",
      code: "storage-unavailable",
      statusCode: 503,
      cause: netCause,
    });

    const initBug = new TypeError("Invalid S3 configuration");
    s3Mocks.load.mockRejectedValueOnce(initBug);
    await expect(saveFile(Buffer.from("x"), "photo.png")).rejects.toBe(initBug);
    expect((initBug as TypeError & { statusCode?: number }).statusCode).toBe(500);
  });

  it("stamps 500 on an unexpected non-S3 error during saveFile", async () => {
    const bug = new TypeError("unexpected failure");
    s3Mocks.putObject.mockRejectedValueOnce(bug);
    const { saveFile } = await importModule();

    await expect(saveFile(Buffer.from("x"), "photo.png")).rejects.toBe(bug);
    expect((bug as TypeError & { statusCode?: number }).statusCode).toBe(500);
  });
});

describe("deleteStoredFile and deleteThumbnail in S3 mode (#2647)", () => {
  const UNAVAILABLE_MSG = "The server's storage service is unavailable.";

  beforeEach(() => {
    config.STORAGE_MODE = "s3";
  });

  it("delegates deleteStoredFile to s3.deleteObject and deleteThumbnail to s3.deleteThumbnail", async () => {
    const { deleteStoredFile, deleteThumbnail } = await importModule();
    await deleteStoredFile("photo.png");
    await deleteThumbnail("photo.png");
    expect(s3Mocks.deleteObject).toHaveBeenCalledWith("photo.png");
    expect(s3Mocks.deleteThumbnail).toHaveBeenCalledWith("photo.png");
  });

  it.each([
    [
      "S3 refusing access",
      Object.assign(new Error("Access Denied"), {
        name: "AccessDenied",
        $metadata: { httpStatusCode: 403 },
      }),
    ],
    [
      "S3 throttling the delete",
      Object.assign(new Error("Please reduce your request rate."), {
        name: "SlowDown",
        $metadata: { httpStatusCode: 503 },
      }),
    ],
    [
      "S3 reporting a missing bucket",
      Object.assign(new Error("The specified bucket does not exist"), {
        name: "NoSuchBucket",
        $metadata: { httpStatusCode: 404 },
      }),
    ],
    [
      "S3 resetting the connection",
      Object.assign(new Error("socket hang up"), {
        name: "TimeoutError",
        code: "ECONNRESET",
        $metadata: { attempts: 3 },
      }),
    ],
    [
      "an S3 request timing out without $metadata",
      Object.assign(new Error("Request timed out"), {
        name: "TimeoutError",
      }),
    ],
    [
      "the S3 endpoint unreachable",
      Object.assign(new Error("connect ECONNREFUSED 10.0.0.9:9000"), { code: "ECONNREFUSED" }),
    ],
  ])(
    "deleteStoredFile and deleteThumbnail classify %s as a 503 storage-unavailable SafeError",
    async (_case, cause) => {
      const { deleteStoredFile, deleteThumbnail } = await importModule();

      s3Mocks.deleteObject.mockRejectedValueOnce(cause);
      await expect(deleteStoredFile("photo.png")).rejects.toMatchObject({
        message: UNAVAILABLE_MSG,
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause,
      });

      s3Mocks.deleteThumbnail.mockRejectedValueOnce(cause);
      await expect(deleteThumbnail("photo.png")).rejects.toMatchObject({
        message: UNAVAILABLE_MSG,
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause,
      });
    },
  );

  it("classifies a getS3() initialization failure through s3WriteFault in deleteStoredFile and deleteThumbnail", async () => {
    const netCause = Object.assign(new Error("connect ECONNREFUSED 10.0.0.9:9000"), {
      code: "ECONNREFUSED",
    });
    const { deleteStoredFile, deleteThumbnail } = await importModule();

    s3Mocks.load.mockRejectedValueOnce(netCause);
    await expect(deleteStoredFile("photo.png")).rejects.toMatchObject({
      isSafeMessage: true,
      kind: "operational",
      code: "storage-unavailable",
      statusCode: 503,
      cause: netCause,
    });

    s3Mocks.load.mockRejectedValueOnce(netCause);
    await expect(deleteThumbnail("photo.png")).rejects.toMatchObject({
      isSafeMessage: true,
      kind: "operational",
      code: "storage-unavailable",
      statusCode: 503,
      cause: netCause,
    });

    const fileInitBug = new TypeError("Invalid S3 configuration for deleteStoredFile");
    s3Mocks.load.mockRejectedValueOnce(fileInitBug);
    await expect(deleteStoredFile("photo.png")).rejects.toBe(fileInitBug);
    expect((fileInitBug as TypeError & { statusCode?: number }).statusCode).toBe(500);

    const thumbInitBug = new TypeError("Invalid S3 configuration for deleteThumbnail");
    s3Mocks.load.mockRejectedValueOnce(thumbInitBug);
    await expect(deleteThumbnail("photo.png")).rejects.toBe(thumbInitBug);
    expect((thumbInitBug as TypeError & { statusCode?: number }).statusCode).toBe(500);
  });

  it("stamps 500 on an unexpected non-S3 error during deleteStoredFile or deleteThumbnail", async () => {
    const { deleteStoredFile, deleteThumbnail } = await importModule();

    const fileBug = new TypeError("unexpected deleteObject failure");
    s3Mocks.deleteObject.mockRejectedValueOnce(fileBug);
    await expect(deleteStoredFile("photo.png")).rejects.toBe(fileBug);
    expect((fileBug as TypeError & { statusCode?: number }).statusCode).toBe(500);

    const thumbBug = new TypeError("unexpected deleteThumbnail failure");
    s3Mocks.deleteThumbnail.mockRejectedValueOnce(thumbBug);
    await expect(deleteThumbnail("photo.png")).rejects.toBe(thumbBug);
    expect((thumbBug as TypeError & { statusCode?: number }).statusCode).toBe(500);
  });

  it("rejects traversal stored names with 400 INVALID_STORED_NAME before calling S3", async () => {
    const { deleteStoredFile, deleteThumbnail } = await importModule();

    await expect(deleteStoredFile("../escape.png")).rejects.toMatchObject({
      isSafeMessage: true,
      kind: "operational",
      code: "INVALID_STORED_NAME",
      statusCode: 400,
    });
    await expect(deleteThumbnail("../escape.png")).rejects.toMatchObject({
      isSafeMessage: true,
      kind: "operational",
      code: "INVALID_STORED_NAME",
      statusCode: 400,
    });
    expect(s3Mocks.load).not.toHaveBeenCalled();
    expect(s3Mocks.deleteObject).not.toHaveBeenCalled();
    expect(s3Mocks.deleteThumbnail).not.toHaveBeenCalled();
  });
});

describe("ensureStorageDir and saveThumbnail in S3 mode (#2882)", () => {
  const UNAVAILABLE_MSG = "The server's storage service is unavailable.";

  beforeEach(() => {
    config.STORAGE_MODE = "s3";
  });

  it("delegates ensureStorageDir to s3.checkConnection once and caches readiness", async () => {
    const { ensureStorageDir } = await importModule();
    await ensureStorageDir();
    await ensureStorageDir();
    expect(s3Mocks.checkConnection).toHaveBeenCalledTimes(1);
  });

  it("retries s3.checkConnection on a subsequent ensureStorageDir call after a probe failure", async () => {
    const { ensureStorageDir } = await importModule();
    const cause = Object.assign(new Error("Please reduce your request rate."), {
      name: "SlowDown",
      $metadata: { httpStatusCode: 503 },
    });
    s3Mocks.checkConnection.mockRejectedValueOnce(cause);

    await expect(ensureStorageDir()).rejects.toMatchObject({
      message: UNAVAILABLE_MSG,
      isSafeMessage: true,
      kind: "operational",
      code: "storage-unavailable",
      statusCode: 503,
      cause,
    });

    await expect(ensureStorageDir()).resolves.toBeUndefined();
    expect(s3Mocks.checkConnection).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      "S3 refusing access",
      Object.assign(new Error("Access Denied"), {
        name: "AccessDenied",
        $metadata: { httpStatusCode: 403 },
      }),
    ],
    [
      "S3 throttling the request",
      Object.assign(new Error("Please reduce your request rate."), {
        name: "SlowDown",
        $metadata: { httpStatusCode: 503 },
      }),
    ],
    [
      "S3 reporting a missing bucket",
      Object.assign(new Error("The specified bucket does not exist"), {
        name: "NoSuchBucket",
        $metadata: { httpStatusCode: 404 },
      }),
    ],
    [
      "an unmodeled S3 404",
      Object.assign(new Error("NotFound"), {
        name: "NotFound",
        $metadata: { httpStatusCode: 404 },
      }),
    ],
    [
      "S3 resetting the connection",
      Object.assign(new Error("socket hang up"), {
        name: "TimeoutError",
        code: "ECONNRESET",
        $metadata: { attempts: 3 },
      }),
    ],
    [
      "an S3 request timing out without $metadata",
      Object.assign(new Error("Request timed out"), {
        name: "TimeoutError",
      }),
    ],
    [
      "the S3 endpoint unreachable",
      Object.assign(new Error("connect ECONNREFUSED 10.0.0.9:9000"), { code: "ECONNREFUSED" }),
    ],
  ])(
    "ensureStorageDir and saveThumbnail classify %s as a 503 storage-unavailable SafeError",
    async (_case, cause) => {
      const { ensureStorageDir, saveThumbnail } = await importModule();

      s3Mocks.checkConnection.mockRejectedValueOnce(cause);
      await expect(ensureStorageDir()).rejects.toMatchObject({
        message: UNAVAILABLE_MSG,
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause,
      });

      s3Mocks.putThumbnail.mockRejectedValueOnce(cause);
      await expect(saveThumbnail("photo.png", Buffer.from("jpg"))).rejects.toMatchObject({
        message: UNAVAILABLE_MSG,
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause,
      });
    },
  );

  it("classifies a getS3() initialization failure through s3WriteFault in ensureStorageDir and saveThumbnail", async () => {
    const netCause = Object.assign(new Error("connect ECONNREFUSED 10.0.0.9:9000"), {
      code: "ECONNREFUSED",
    });
    const { ensureStorageDir, saveThumbnail } = await importModule();

    s3Mocks.load.mockRejectedValueOnce(netCause);
    await expect(ensureStorageDir()).rejects.toMatchObject({
      message: UNAVAILABLE_MSG,
      isSafeMessage: true,
      kind: "operational",
      code: "storage-unavailable",
      statusCode: 503,
      cause: netCause,
    });

    s3Mocks.load.mockRejectedValueOnce(netCause);
    await expect(saveThumbnail("photo.png", Buffer.from("jpg"))).rejects.toMatchObject({
      message: UNAVAILABLE_MSG,
      isSafeMessage: true,
      kind: "operational",
      code: "storage-unavailable",
      statusCode: 503,
      cause: netCause,
    });

    const dirInitBug = new TypeError("Invalid S3 configuration for ensureStorageDir");
    s3Mocks.load.mockRejectedValueOnce(dirInitBug);
    await expect(ensureStorageDir()).rejects.toBe(dirInitBug);
    expect((dirInitBug as TypeError & { statusCode?: number }).statusCode).toBe(500);

    const thumbInitBug = new TypeError("Invalid S3 configuration for saveThumbnail");
    s3Mocks.load.mockRejectedValueOnce(thumbInitBug);
    await expect(saveThumbnail("photo.png", Buffer.from("jpg"))).rejects.toBe(thumbInitBug);
    expect((thumbInitBug as TypeError & { statusCode?: number }).statusCode).toBe(500);
  });

  it("stamps 500 on an unexpected non-S3 error during ensureStorageDir or saveThumbnail", async () => {
    const { ensureStorageDir, saveThumbnail } = await importModule();

    const dirBug = new TypeError("unexpected checkConnection failure");
    s3Mocks.checkConnection.mockRejectedValueOnce(dirBug);
    await expect(ensureStorageDir()).rejects.toBe(dirBug);
    expect((dirBug as TypeError & { statusCode?: number }).statusCode).toBe(500);

    const thumbBug = new TypeError("unexpected putThumbnail failure");
    s3Mocks.putThumbnail.mockRejectedValueOnce(thumbBug);
    await expect(saveThumbnail("photo.png", Buffer.from("jpg"))).rejects.toBe(thumbBug);
    expect((thumbBug as TypeError & { statusCode?: number }).statusCode).toBe(500);
  });

  it("rejects traversal stored names in saveThumbnail with 400 INVALID_STORED_NAME before calling S3", async () => {
    const { saveThumbnail } = await importModule();

    await expect(saveThumbnail("../escape.png", Buffer.from("jpg"))).rejects.toMatchObject({
      isSafeMessage: true,
      kind: "operational",
      code: "INVALID_STORED_NAME",
      statusCode: 400,
    });
    expect(s3Mocks.load).not.toHaveBeenCalled();
    expect(s3Mocks.putThumbnail).not.toHaveBeenCalled();
  });
});

describe("isStorageServiceFault (#3410)", () => {
  it("returns false for a SafeError across a module reset boundary or a marker-copied error in S3 mode", async () => {
    config.STORAGE_MODE = "s3";
    const crossRealmInvalidName = new SafeError("Invalid stored file name", {
      kind: "operational",
      code: "INVALID_STORED_NAME",
      statusCode: 400,
    });
    const crossRealmUnavailable = new SafeError("The server's storage service is unavailable.", {
      kind: "operational",
      code: "storage-unavailable",
      statusCode: 503,
    });
    const markerCopiedError = Object.assign(new Error("Invalid stored file name"), {
      isSafeMessage: true as const,
      kind: "operational",
      code: "INVALID_STORED_NAME",
      statusCode: 400,
    });

    const { isStorageServiceFault, readStoredFile } = await importModule();
    const { SafeError: ReloadedSafeError } = await import("@snapotter/shared");

    expect(crossRealmInvalidName).not.toBeInstanceOf(ReloadedSafeError);
    expect(isStorageServiceFault(crossRealmInvalidName)).toBe(false);
    expect(isStorageServiceFault(crossRealmUnavailable)).toBe(false);
    expect(isStorageServiceFault(markerCopiedError)).toBe(false);

    const ownTraversalErr = await readStoredFile("../escape.png").catch((e: unknown) => e);
    expect(isStorageServiceFault(ownTraversalErr)).toBe(false);
  });

  it("returns false in local mode and delegates non-SafeError checks to s3Mod.isMissingObjectError in S3 mode", async () => {
    const { isStorageServiceFault, ensureStorageDir } = await importModule();
    const rawFault = new Error("S3 read failed");
    const noSuchKey = Object.assign(new Error("NoSuchKey"), {
      name: "NoSuchKey",
      $metadata: { httpStatusCode: 404 },
    });

    // Local mode always returns false
    expect(isStorageServiceFault(rawFault)).toBe(false);

    // S3 mode while s3Mod is still unloaded fails closed toward fault (true)
    config.STORAGE_MODE = "s3";
    expect(isStorageServiceFault(rawFault)).toBe(true);
    expect(isStorageServiceFault(noSuchKey)).toBe(true);

    // Once s3Mod is loaded, delegates to !s3Mod.isMissingObjectError(error)
    await ensureStorageDir();
    s3Mocks.isMissingObjectError.mockImplementation((err: unknown) => err === noSuchKey);
    expect(isStorageServiceFault(noSuchKey)).toBe(false);
    expect(isStorageServiceFault(rawFault)).toBe(true);
  });
});
