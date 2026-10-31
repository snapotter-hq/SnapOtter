/**
 * Unit tests for utility functions in the features route (apps/api/src/routes/features.ts).
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import multipartPlugin from "@fastify/multipart";
import Fastify from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const offlineRuntimeIndex = {
    artifact: { target: "linux-amd64-cpu-py312" as const, version: "test-version" },
    canonicalIndex: Buffer.from("index"),
    canonicalIndexBytes: 5,
    archiveFile: "ocr.tar.gz",
    archiveSha256: "a".repeat(64),
    archiveSize: 7,
    archiveExpandedSize: 7,
    minimumMemoryBytes: 4 * 1024 ** 3,
  };
  return {
    offlineRuntimeIndex,
    handleWriteFailure: { next: null as Error | null, targetSuffix: null as string | null },
    handleSyncFailure: { next: null as Error | null, targetSuffix: null as string | null },
    handleCloseFailure: { next: null as Error | null, targetSuffix: null as string | null },
    openedStagingPaths: [] as string[],
    closedStagingPaths: new Set<string>(),
    unlinkedStagingPaths: [] as string[],
    closedBeforeUnlink: new Map<string, boolean>(),
    stagedFileExistedAtDirCleanup: new Map<string, boolean>(),
    assertDiskSpaceMock: vi.fn(async () => {}),
    prepareOfflineRuntimeIndexMock: vi.fn(async () => ({ ...offlineRuntimeIndex })),
    reportErrorMock: vi.fn(async () => {}),
  };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: (async (path: unknown, flags?: unknown, ...rest: unknown[]) => {
      const handle = await (
        actual.open as (
          p: unknown,
          f?: unknown,
          ...r: unknown[]
        ) => Promise<Awaited<ReturnType<typeof actual.open>>>
      )(path, flags, ...rest);
      const pathStr = String(path);
      if (!pathStr.includes(".offline-import-v2-")) {
        return handle;
      }
      hoisted.openedStagingPaths.push(pathStr);
      const matchesSuffix = (suffix: string | null) => suffix === null || pathStr.endsWith(suffix);
      const origWrite = handle.write.bind(handle);
      const origSync = handle.sync.bind(handle);
      const origClose = handle.close.bind(handle);
      return new Proxy(handle, {
        get(target, prop, receiver) {
          if (prop === "write") {
            return async (...args: Parameters<typeof origWrite>) => {
              if (
                hoisted.handleWriteFailure.next &&
                matchesSuffix(hoisted.handleWriteFailure.targetSuffix)
              ) {
                const err = hoisted.handleWriteFailure.next;
                hoisted.handleWriteFailure.next = null;
                hoisted.handleWriteFailure.targetSuffix = null;
                throw err;
              }
              return origWrite(...args);
            };
          }
          if (prop === "sync") {
            return async () => {
              if (
                hoisted.handleSyncFailure.next &&
                matchesSuffix(hoisted.handleSyncFailure.targetSuffix)
              ) {
                const err = hoisted.handleSyncFailure.next;
                hoisted.handleSyncFailure.next = null;
                hoisted.handleSyncFailure.targetSuffix = null;
                throw err;
              }
              return origSync();
            };
          }
          if (prop === "close") {
            return async () => {
              await origClose();
              hoisted.closedStagingPaths.add(pathStr);
              if (
                hoisted.handleCloseFailure.next &&
                matchesSuffix(hoisted.handleCloseFailure.targetSuffix)
              ) {
                const err = hoisted.handleCloseFailure.next;
                hoisted.handleCloseFailure.next = null;
                hoisted.handleCloseFailure.targetSuffix = null;
                throw err;
              }
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });
    }) as typeof actual.open,
    rm: (async (path: unknown, options?: Parameters<typeof actual.rm>[1]) => {
      const pathStr = String(path);
      if (pathStr.includes(".offline-import-v2-")) {
        if (options?.recursive) {
          for (const stagedPath of hoisted.openedStagingPaths) {
            if (stagedPath.startsWith(`${pathStr}/`)) {
              hoisted.stagedFileExistedAtDirCleanup.set(stagedPath, existsSync(stagedPath));
            }
          }
        } else {
          hoisted.unlinkedStagingPaths.push(pathStr);
          hoisted.closedBeforeUnlink.set(pathStr, hoisted.closedStagingPaths.has(pathStr));
        }
      }
      return actual.rm(path as Parameters<typeof actual.rm>[0], options);
    }) as typeof actual.rm,
  };
});

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {},
  pool: {},
  closeDb: async () => {},
  schema: {},
}));

vi.mock("../../../apps/api/src/permissions.js", () => ({
  requirePermission: () => async () => ({ id: "admin-1", username: "admin", role: "admin" }),
}));

vi.mock("../../../apps/api/src/lib/error-report.js", () => ({
  reportError: hoisted.reportErrorMock,
}));

vi.mock("@snapotter/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@snapotter/ai")>();
  return {
    ...actual,
    selectOcrRuntimeTarget: () => "linux-amd64-cpu-py312" as const,
    getOcrRuntimeEffectiveMemoryBytes: () => 8 * 1024 ** 3,
  };
});

vi.mock("../../../apps/api/src/lib/feature-status.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/feature-status.js")>();
  return {
    ...actual,
    getAiDir: () => AI_DIR,
    acquireInstallLock: () => true,
    releaseInstallLock: () => {},
    getInstallLockFdForChild: () => 3,
    cleanupInterruptedFeatureImports: () => true,
  };
});

vi.mock("../../../apps/api/src/lib/ocr-runtime-install.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/ocr-runtime-install.js")>();
  return {
    ...actual,
    assertOcrRuntimeInstallDiskSpace: hoisted.assertDiskSpaceMock,
    loadOcrRuntimeTrustKeys: () => [{ keyId: "test", algorithm: "ed25519", publicKey: "test" }],
    prepareOfflineRuntimeIndex: hoisted.prepareOfflineRuntimeIndexMock,
  };
});

import { OcrRuntimeDiskSpaceError } from "../../../apps/api/src/lib/ocr-runtime-install.js";
import {
  collectProtectedBundleTargets,
  getDirSize,
  type Manifest,
  readManifest,
  registerFeatureRoutes,
} from "../../../apps/api/src/routes/features.js";

// ── Test fixtures ────────────────────────────────────────────────────────

const TEST_DIR = join(tmpdir(), `snapotter-features-test-${process.pid}-${Date.now()}`);
const AI_DIR = join(TEST_DIR, "ai");
const MANIFEST_DIR = join(TEST_DIR, "manifests");
const SIZE_DIR = join(TEST_DIR, "size-test");

beforeAll(() => {
  mkdirSync(MANIFEST_DIR, { recursive: true });
  mkdirSync(SIZE_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// ── readManifest tests ───────────────────────────────────────────────────

describe("readManifest", () => {
  it("returns null for non-existent file", () => {
    const result = readManifest(join(MANIFEST_DIR, "nonexistent.json"));
    expect(result).toBeNull();
  });

  it("parses valid manifest JSON", () => {
    const manifest = {
      bundles: {
        "ai-rembg": {
          models: [{ id: "u2net", path: "rembg/u2net.onnx" }],
        },
      },
    };
    const filePath = join(MANIFEST_DIR, "valid.json");
    writeFileSync(filePath, JSON.stringify(manifest));

    const result = readManifest(filePath);
    expect(result).not.toBeNull();
    expect(result?.bundles["ai-rembg"]).toBeDefined();
    expect(result?.bundles["ai-rembg"].models).toHaveLength(1);
    expect(result?.bundles["ai-rembg"].models[0].id).toBe("u2net");
    expect(result?.bundles["ai-rembg"].models[0].path).toBe("rembg/u2net.onnx");
  });

  it("returns null for invalid JSON", () => {
    const filePath = join(MANIFEST_DIR, "invalid.json");
    writeFileSync(filePath, "not valid json {{{");

    const result = readManifest(filePath);
    expect(result).toBeNull();
  });

  it("handles manifest with empty bundles", () => {
    const filePath = join(MANIFEST_DIR, "empty-bundles.json");
    writeFileSync(filePath, JSON.stringify({ bundles: {} }));

    const result = readManifest(filePath);
    expect(result).not.toBeNull();
    expect(Object.keys(result?.bundles ?? {})).toHaveLength(0);
  });

  it("handles manifest with models without paths", () => {
    const filePath = join(MANIFEST_DIR, "no-paths.json");
    writeFileSync(
      filePath,
      JSON.stringify({
        bundles: {
          "ai-test": {
            models: [{ id: "model1" }],
          },
        },
      }),
    );

    const result = readManifest(filePath);
    expect(result?.bundles["ai-test"].models[0].path).toBeUndefined();
  });

  it("handles manifest with multiple bundles", () => {
    const filePath = join(MANIFEST_DIR, "multi.json");
    writeFileSync(
      filePath,
      JSON.stringify({
        bundles: {
          "ai-rembg": { models: [{ id: "u2net", path: "rembg/u2net.onnx" }] },
          "ai-esrgan": { models: [{ id: "realesrgan", path: "esrgan/model.pth" }] },
        },
      }),
    );

    const result = readManifest(filePath);
    expect(Object.keys(result?.bundles ?? {})).toHaveLength(2);
  });

  describe("unreadable manifest logging (#1668)", () => {
    async function spyOnWarn() {
      const { logger } = await import("../../../apps/api/src/lib/logger.js");
      return vi.spyOn(logger, "warn").mockImplementation(() => {});
    }

    it("does not log when the manifest is absent", async () => {
      const warn = await spyOnWarn();
      readManifest(join(MANIFEST_DIR, "absent-for-logging.json"));
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it("logs the path and parse error once for a manifest that does not parse", async () => {
      const warn = await spyOnWarn();
      const filePath = join(MANIFEST_DIR, "broken-logged.json");
      writeFileSync(filePath, "{ not json");

      expect(readManifest(filePath)).toBeNull();
      expect(readManifest(filePath)).toBeNull();

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatchObject({ path: filePath });
      expect(warn.mock.calls[0][0]).toHaveProperty("err");
      warn.mockRestore();
    });

    it("logs again after a good read in between", async () => {
      const warn = await spyOnWarn();
      const filePath = join(MANIFEST_DIR, "flapping.json");
      writeFileSync(filePath, "{ not json");
      readManifest(filePath);

      writeFileSync(filePath, JSON.stringify({ bundles: {} }));
      expect(readManifest(filePath)).not.toBeNull();

      writeFileSync(filePath, "{ not json");
      readManifest(filePath);
      expect(warn).toHaveBeenCalledTimes(2);
      warn.mockRestore();
    });
  });
});

// ── getDirSize tests ────────────────────────────────────────────────────

describe("getDirSize", () => {
  it("returns 0 for non-existent directory", () => {
    expect(getDirSize(join(TEST_DIR, "does-not-exist"))).toBe(0);
  });

  it("returns 0 for empty directory", () => {
    const emptyDir = join(SIZE_DIR, "empty");
    mkdirSync(emptyDir, { recursive: true });
    expect(getDirSize(emptyDir)).toBe(0);
  });

  it("returns correct size for a single file", () => {
    const singleDir = join(SIZE_DIR, "single");
    mkdirSync(singleDir, { recursive: true });
    const content = "hello world"; // 11 bytes
    writeFileSync(join(singleDir, "test.txt"), content);
    expect(getDirSize(singleDir)).toBe(11);
  });

  it("sums sizes of multiple files", () => {
    const multiDir = join(SIZE_DIR, "multi");
    mkdirSync(multiDir, { recursive: true });
    writeFileSync(join(multiDir, "a.txt"), "aaa"); // 3 bytes
    writeFileSync(join(multiDir, "b.txt"), "bbbbb"); // 5 bytes
    expect(getDirSize(multiDir)).toBe(8);
  });

  it("recurses into subdirectories", () => {
    const nestedDir = join(SIZE_DIR, "nested");
    const subDir = join(nestedDir, "sub");
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(nestedDir, "root.txt"), "root"); // 4 bytes
    writeFileSync(join(subDir, "child.txt"), "child"); // 5 bytes
    expect(getDirSize(nestedDir)).toBe(9);
  });

  it("handles deeply nested directories", () => {
    const deepDir = join(SIZE_DIR, "deep");
    const level1 = join(deepDir, "a");
    const level2 = join(level1, "b");
    const level3 = join(level2, "c");
    mkdirSync(level3, { recursive: true });
    writeFileSync(join(level3, "deep.txt"), "xx"); // 2 bytes
    expect(getDirSize(deepDir)).toBe(2);
  });
});

// ── Shared model path logic ─────────────────────────────────────────────

describe("shared model path deduplication (collectProtectedBundleTargets)", () => {
  it("identifies models, rembg sessions, and hf_snapshot dirs shared with installed bundles", () => {
    const manifest: Manifest = {
      bundles: {
        "ai-rembg": {
          models: [
            { id: "u2net", path: "shared/common-model.onnx" },
            { id: "rembg-specific", path: "rembg/only.onnx" },
          ],
        },
        "ai-esrgan": {
          models: [
            { id: "common", path: "shared/common-model.onnx" },
            { id: "esrgan-specific", path: "esrgan/only.pth" },
            { id: "isnet", downloadFn: "rembg_session", args: ["isnet-general-use"] },
            { id: "whisper", downloadFn: "hf_snapshot", args: ["repo/id", "whisper-tiny"] },
          ],
        },
        "ai-uninstalled": {
          models: [{ id: "unused", path: "uninstalled/model.onnx" }],
        },
      },
    };

    const { protectedFiles, protectedDirs } = collectProtectedBundleTargets(
      manifest,
      "ai-rembg",
      (id) => id === "ai-esrgan",
    );

    expect(protectedFiles.has("shared/common-model.onnx")).toBe(true);
    expect(protectedFiles.has("esrgan/only.pth")).toBe(true);
    expect(protectedFiles.has("rembg/isnet-general-use.onnx")).toBe(true);
    expect(protectedFiles.has("rembg/only.onnx")).toBe(false);
    expect(protectedFiles.has("uninstalled/model.onnx")).toBe(false);
    expect(protectedDirs.has("whisper-tiny")).toBe(true);

    const bundleModels = manifest.bundles["ai-rembg"].models;
    const deletable = bundleModels.filter((m) => m.path && !protectedFiles.has(m.path));
    expect(deletable).toHaveLength(1);
    expect(deletable[0].path).toBe("rembg/only.onnx");
  });

  it("handles bundle with empty models array", () => {
    const manifest: Manifest = {
      bundles: {
        "ai-rembg": { models: [{ id: "m1", path: "a.onnx" }] },
        "ai-empty": { models: [] },
      },
    };

    const { protectedFiles, protectedDirs } = collectProtectedBundleTargets(
      manifest,
      "ai-rembg",
      () => true,
    );

    expect(protectedFiles.size).toBe(0);
    expect(protectedDirs.size).toBe(0);
  });
});

// ── writeBoundedUpload close faults (#3739) ─────────────────────────────

function buildMultipartBody(fields: Array<{ name: string; filename: string; content: Buffer }>): {
  body: Buffer;
  contentType: string;
} {
  const boundary = "----SnapOtterFeatureImportBoundary3739";
  const parts: Buffer[] = [];
  for (const field of fields) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"; filename="${field.filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      field.content,
      Buffer.from("\r\n"),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe("POST /api/v1/admin/features/import writeBoundedUpload close faults (#3739)", () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify({ logger: false, bodyLimit: 32 * 1024 * 1024 });
    await app.register(multipartPlugin, {
      limits: { fileSize: 32 * 1024 * 1024 },
    });
    await registerFeatureRoutes(app);
  });

  beforeEach(() => {
    hoisted.handleWriteFailure.next = null;
    hoisted.handleWriteFailure.targetSuffix = null;
    hoisted.handleSyncFailure.next = null;
    hoisted.handleSyncFailure.targetSuffix = null;
    hoisted.handleCloseFailure.next = null;
    hoisted.handleCloseFailure.targetSuffix = null;
    hoisted.openedStagingPaths.length = 0;
    hoisted.closedStagingPaths.clear();
    hoisted.unlinkedStagingPaths.length = 0;
    hoisted.closedBeforeUnlink.clear();
    hoisted.stagedFileExistedAtDirCleanup.clear();
    hoisted.assertDiskSpaceMock.mockReset();
    hoisted.assertDiskSpaceMock.mockResolvedValue(undefined);
    hoisted.prepareOfflineRuntimeIndexMock.mockReset();
    hoisted.prepareOfflineRuntimeIndexMock.mockResolvedValue({ ...hoisted.offlineRuntimeIndex });
    hoisted.reportErrorMock.mockReset();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("preserves 400 on ImportValidationError (maximumBytes exceeded) and unlinks the staged file when file.close() also rejects with EIO", async () => {
    hoisted.handleCloseFailure.next = Object.assign(new Error("EIO: close failed"), {
      code: "EIO",
      syscall: "close",
    });
    hoisted.handleCloseFailure.targetSuffix = "ocr-runtime.tar.gz";

    const { body, contentType } = buildMultipartBody([
      { name: "index", filename: "ocr-index.json", content: Buffer.from("index") },
      {
        name: "archive",
        filename: "ocr-runtime.tar.gz",
        content: Buffer.from("oversized-archive-payload"),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/features/import",
      headers: { "content-type": contentType },
      payload: body,
    });

    expect(res.statusCode, res.body).toBe(400);
    expect(res.json()).toEqual({ error: "OCR runtime archive is too large" });
    expect(hoisted.handleCloseFailure.next).toBeNull();
    expect(hoisted.reportErrorMock).not.toHaveBeenCalled();

    const archivePath = hoisted.openedStagingPaths.find((p) => p.endsWith("ocr-runtime.tar.gz"));
    expect(archivePath).toBeDefined();
    expect(hoisted.unlinkedStagingPaths).toContain(archivePath);
    expect(hoisted.closedBeforeUnlink.get(archivePath as string)).toBe(true);
    expect(hoisted.stagedFileExistedAtDirCleanup.get(archivePath as string)).toBe(false);
  });

  it("preserves 400 on ImportValidationError (expectedBytes mismatch) and unlinks the staged file when file.close() also rejects with EIO", async () => {
    hoisted.handleCloseFailure.next = Object.assign(new Error("EIO: close failed"), {
      code: "EIO",
      syscall: "close",
    });
    hoisted.handleCloseFailure.targetSuffix = "ocr-runtime.tar.gz";

    const { body, contentType } = buildMultipartBody([
      { name: "index", filename: "ocr-index.json", content: Buffer.from("index") },
      { name: "archive", filename: "ocr-runtime.tar.gz", content: Buffer.from("shrt") },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/features/import",
      headers: { "content-type": contentType },
      payload: body,
    });

    expect(res.statusCode, res.body).toBe(400);
    expect(res.json()).toEqual({
      error:
        "OCR runtime archive size does not match the signed index: expected 7 bytes, received 4",
    });
    expect(hoisted.handleCloseFailure.next).toBeNull();
    expect(hoisted.reportErrorMock).not.toHaveBeenCalled();

    const archivePath = hoisted.openedStagingPaths.find((p) => p.endsWith("ocr-runtime.tar.gz"));
    expect(archivePath).toBeDefined();
    expect(hoisted.unlinkedStagingPaths).toContain(archivePath);
    expect(hoisted.closedBeforeUnlink.get(archivePath as string)).toBe(true);
    expect(hoisted.stagedFileExistedAtDirCleanup.get(archivePath as string)).toBe(false);
  });

  it("preserves 507 on OcrRuntimeDiskSpaceError from beforeWrite and unlinks the staged file when file.close() also rejects with EIO", async () => {
    hoisted.assertDiskSpaceMock.mockRejectedValueOnce(
      new OcrRuntimeDiskSpaceError("insufficient disk space before OCR runtime import"),
    );
    hoisted.handleCloseFailure.next = Object.assign(new Error("EIO: close failed"), {
      code: "EIO",
      syscall: "close",
    });
    hoisted.handleCloseFailure.targetSuffix = "ocr-runtime.tar.gz";

    const { body, contentType } = buildMultipartBody([
      { name: "index", filename: "ocr-index.json", content: Buffer.from("index") },
      { name: "archive", filename: "ocr-runtime.tar.gz", content: Buffer.from("archive") },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/features/import",
      headers: { "content-type": contentType },
      payload: body,
    });

    expect(res.statusCode, res.body).toBe(507);
    expect(res.json()).toEqual({
      error: "insufficient disk space before OCR runtime import",
    });
    expect(hoisted.handleCloseFailure.next).toBeNull();
    expect(hoisted.reportErrorMock).not.toHaveBeenCalled();

    const archivePath = hoisted.openedStagingPaths.find((p) => p.endsWith("ocr-runtime.tar.gz"));
    expect(archivePath).toBeDefined();
    expect(hoisted.unlinkedStagingPaths).toContain(archivePath);
    expect(hoisted.closedBeforeUnlink.get(archivePath as string)).toBe(true);
    expect(hoisted.stagedFileExistedAtDirCleanup.get(archivePath as string)).toBe(false);
  });

  it.each([
    ["ENOSPC on write", "write", "ENOSPC"],
    ["EDQUOT on write", "write", "EDQUOT"],
    ["ENOSPC on sync", "sync", "ENOSPC"],
  ] as const)(
    "preserves 507 on %s and unlinks the staged file when file.close() also rejects with EIO",
    async (_label, op, errno) => {
      const storageErr = Object.assign(new Error(`${errno}: storage full during ${op}`), {
        code: errno,
        syscall: op,
      });
      if (op === "write") {
        hoisted.handleWriteFailure.next = storageErr;
        hoisted.handleWriteFailure.targetSuffix = "legacy-bundle.tar.gz";
      } else {
        hoisted.handleSyncFailure.next = storageErr;
        hoisted.handleSyncFailure.targetSuffix = "legacy-bundle.tar.gz";
      }
      hoisted.handleCloseFailure.next = Object.assign(new Error("EIO: close failed"), {
        code: "EIO",
        syscall: "close",
      });
      hoisted.handleCloseFailure.targetSuffix = "legacy-bundle.tar.gz";

      const { body, contentType } = buildMultipartBody([
        { name: "file", filename: "bundle.tar.gz", content: Buffer.from("bundle-bytes") },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/features/import",
        headers: { "content-type": contentType },
        payload: body,
      });

      expect(res.statusCode, res.body).toBe(507);
      expect(res.json()).toEqual({ error: `${errno}: storage full during ${op}` });
      expect(hoisted.handleCloseFailure.next).toBeNull();
      expect(hoisted.reportErrorMock).not.toHaveBeenCalled();

      const legacyPath = hoisted.openedStagingPaths.find((p) => p.endsWith("legacy-bundle.tar.gz"));
      expect(legacyPath).toBeDefined();
      expect(hoisted.unlinkedStagingPaths).toContain(legacyPath);
      expect(hoisted.closedBeforeUnlink.get(legacyPath as string)).toBe(true);
      expect(hoisted.stagedFileExistedAtDirCleanup.get(legacyPath as string)).toBe(false);
    },
  );

  it("propagates a standalone file.close() ENOSPC error as 507 when the write and sync succeeded", async () => {
    hoisted.handleCloseFailure.next = Object.assign(new Error("ENOSPC: flush on close failed"), {
      code: "ENOSPC",
      syscall: "close",
    });
    hoisted.handleCloseFailure.targetSuffix = "legacy-bundle.tar.gz";

    const { body, contentType } = buildMultipartBody([
      { name: "file", filename: "bundle.tar.gz", content: Buffer.from("bundle-bytes") },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/features/import",
      headers: { "content-type": contentType },
      payload: body,
    });

    expect(res.statusCode, res.body).toBe(507);
    expect(res.json()).toEqual({ error: "ENOSPC: flush on close failed" });
    expect(hoisted.handleCloseFailure.next).toBeNull();
    expect(hoisted.reportErrorMock).not.toHaveBeenCalled();

    const legacyPath = hoisted.openedStagingPaths.find((p) => p.endsWith("legacy-bundle.tar.gz"));
    expect(legacyPath).toBeDefined();
    expect(hoisted.unlinkedStagingPaths).toContain(legacyPath);
    expect(hoisted.closedBeforeUnlink.get(legacyPath as string)).toBe(true);
    expect(hoisted.stagedFileExistedAtDirCleanup.get(legacyPath as string)).toBe(false);
  });

  it("propagates a standalone file.close() EIO error as 500 and reports it when the write and sync succeeded", async () => {
    hoisted.handleCloseFailure.next = Object.assign(new Error("EIO: close failed"), {
      code: "EIO",
      syscall: "close",
    });
    hoisted.handleCloseFailure.targetSuffix = "legacy-bundle.tar.gz";

    const { body, contentType } = buildMultipartBody([
      { name: "file", filename: "bundle.tar.gz", content: Buffer.from("bundle-bytes") },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/features/import",
      headers: { "content-type": contentType },
      payload: body,
    });

    expect(res.statusCode, res.body).toBe(500);
    expect(res.json()).toEqual({ error: "EIO: close failed" });
    expect(hoisted.handleCloseFailure.next).toBeNull();
    expect(hoisted.reportErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "EIO: close failed", code: "EIO" }),
      expect.objectContaining({
        source: "http",
        route: "/api/v1/admin/features/import",
        method: "POST",
        statusCode: 500,
      }),
    );

    const legacyPath = hoisted.openedStagingPaths.find((p) => p.endsWith("legacy-bundle.tar.gz"));
    expect(legacyPath).toBeDefined();
    expect(hoisted.unlinkedStagingPaths).toContain(legacyPath);
    expect(hoisted.closedBeforeUnlink.get(legacyPath as string)).toBe(true);
    expect(hoisted.stagedFileExistedAtDirCleanup.get(legacyPath as string)).toBe(false);
  });
});
