/**
 * Integration tests for the server-side feature-install queue at the HTTP route
 * level.
 *
 * The installer child process (spawn) and the venv lock (@snapotter/ai) are
 * mocked so no real Python runs: spawn returns a controllable fake child we can
 * drive with emit("close"). This lets us assert the route contract
 * deterministically: a second concurrent install is queued (202 { queued:
 * true }) instead of rejected, the next queued bundle auto-starts when the
 * running one finishes, and a bundle queued while an import holds the lock
 * starts once the import route releases it.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks (spawn + venv lock) ────────────────────────────
const hoisted = vi.hoisted(() => {
  // Minimal event emitter (no node:events import; vi.hoisted runs pre-import).
  function makeEmitter() {
    const listeners: Record<string, Array<(...a: unknown[]) => void>> = {};
    return {
      on(event: string, cb: (...a: unknown[]) => void) {
        listeners[event] ??= [];
        listeners[event].push(cb);
        return this;
      },
      emit(event: string, ...args: unknown[]) {
        for (const cb of listeners[event] ?? []) cb(...args);
      },
    };
  }

  interface FakeChild {
    bundleId: string;
    spawnOptions: { stdio?: unknown[] };
    stdout: ReturnType<typeof makeEmitter>;
    stderr: ReturnType<typeof makeEmitter>;
    on: (event: string, cb: (...a: unknown[]) => void) => unknown;
    emit: (event: string, ...args: unknown[]) => void;
  }

  const spawnCalls: FakeChild[] = [];
  const spawnMock = vi.fn((_cmd: string, args: string[], options: { stdio?: unknown[] }) => {
    const base = makeEmitter() as unknown as FakeChild;
    base.bundleId = args[1];
    base.spawnOptions = options;
    base.stdout = makeEmitter();
    base.stderr = makeEmitter();
    spawnCalls.push(base);
    return base;
  });

  const acquireVenvLockMock = vi.fn(async () => () => {});
  const shutdownDispatcherMock = vi.fn();
  const drainOcrDispatcherMock = vi.fn(async () => {});
  const probeOcrDispatcherMock = vi.fn(async () => ({
    result: { provider: "CPUExecutionProvider" },
  }));
  const handoffOcrDispatcherMock = vi.fn(async () => ({
    result: { provider: "CPUExecutionProvider" },
  }));
  const rotateOcrDispatcherMock = vi.fn(async () => ({
    result: { provider: "CPUExecutionProvider" },
  }));
  const selectOcrRuntimeTargetMock = vi.fn(() => "linux-amd64-cpu-py312");
  const getOcrRuntimeEffectiveMemoryBytesMock = vi.fn(() => 8 * 1024 ** 3);
  const downloadVerifiedRuntimeReleaseMock = vi.fn(async () => ({
    artifact: { target: "linux-amd64-cpu-py312" },
    canonicalIndex: Buffer.from("index"),
    archiveFile: "ocr.tar.gz",
    archiveSha256: "a".repeat(64),
    archiveSize: 1,
    archiveExpandedSize: 1,
    indexPath: "/tmp/index.json",
    archivePath: "/tmp/archive.tar.gz",
  }));
  const loadOcrRuntimeTrustKeysMock = vi.fn(() => [
    { keyId: "test", algorithm: "ed25519", publicKey: "test" },
  ]);
  const offlineRuntimeIndex = {
    artifact: { target: "linux-amd64-cpu-py312", version: "test-version" },
    canonicalIndex: Buffer.from("index"),
    archiveFile: "ocr.tar.gz",
    archiveSha256: "a".repeat(64),
    archiveSize: 7,
    archiveExpandedSize: 7,
    minimumMemoryBytes: 4 * 1024 ** 3,
  };
  const prepareOfflineRuntimeIndexMock = vi.fn(async () => ({
    ...offlineRuntimeIndex,
    canonicalIndexBytes: offlineRuntimeIndex.canonicalIndex.byteLength,
  }));
  const prepareOfflineRuntimeReleaseMock = vi.fn(async () => ({
    ...offlineRuntimeIndex,
    indexPath: "/tmp/offline-index.json",
    archivePath: "/tmp/offline-archive.tar.gz",
  }));
  const assertOcrRuntimeInstallDiskSpaceMock = vi.fn(async () => {});
  const runOcrRuntimeInstallerMock = vi.fn(async () => ({
    family: "ocr",
    generation: "test-generation",
  }));
  const runOcrRuntimeMaintenanceMock = vi.fn(async (action: string) =>
    action === "rollback" ? { restoredGeneration: "previous-generation" } : { removed: [] },
  );

  return {
    spawnCalls,
    spawnMock,
    acquireVenvLockMock,
    shutdownDispatcherMock,
    drainOcrDispatcherMock,
    probeOcrDispatcherMock,
    handoffOcrDispatcherMock,
    rotateOcrDispatcherMock,
    selectOcrRuntimeTargetMock,
    getOcrRuntimeEffectiveMemoryBytesMock,
    downloadVerifiedRuntimeReleaseMock,
    loadOcrRuntimeTrustKeysMock,
    prepareOfflineRuntimeIndexMock,
    prepareOfflineRuntimeReleaseMock,
    assertOcrRuntimeInstallDiskSpaceMock,
    runOcrRuntimeInstallerMock,
    runOcrRuntimeMaintenanceMock,
  };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("node:child_process");
  return { ...actual, spawn: hoisted.spawnMock };
});

vi.mock("@snapotter/ai", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    acquireVenvLock: hoisted.acquireVenvLockMock,
    getOcrRuntimeEffectiveMemoryBytes: hoisted.getOcrRuntimeEffectiveMemoryBytesMock,
    selectOcrRuntimeTarget: hoisted.selectOcrRuntimeTargetMock,
    shutdownDispatcher: hoisted.shutdownDispatcherMock,
    drainOcrDispatcher: hoisted.drainOcrDispatcherMock,
    probeOcrDispatcher: hoisted.probeOcrDispatcherMock,
    handoffOcrDispatcher: hoisted.handoffOcrDispatcherMock,
    rotateOcrDispatcher: hoisted.rotateOcrDispatcherMock,
  };
});

vi.mock("../../../apps/api/src/lib/ocr-runtime-install.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/ocr-runtime-install.js")>();
  return {
    ...actual,
    assertOcrRuntimeInstallDiskSpace: hoisted.assertOcrRuntimeInstallDiskSpaceMock,
    cleanupDownloadedRuntimeRelease: vi.fn(),
    downloadVerifiedRuntimeRelease: hoisted.downloadVerifiedRuntimeReleaseMock,
    loadOcrRuntimeTrustKeys: hoisted.loadOcrRuntimeTrustKeysMock,
    prepareOfflineRuntimeIndex: hoisted.prepareOfflineRuntimeIndexMock,
    prepareOfflineRuntimeRelease: hoisted.prepareOfflineRuntimeReleaseMock,
    purgeOcrRuntimeDownloads: vi.fn(),
    runOcrRuntimeInstaller: hoisted.runOcrRuntimeInstallerMock,
    runOcrRuntimeMaintenance: hoisted.runOcrRuntimeMaintenanceMock,
    waitWithOcrRuntimeHeartbeat: async <T>(operation: Promise<T>) => operation,
  };
});

// ── Temp DATA_DIR before importing feature-status ────────────────
const testRoot = join(tmpdir(), `snapotter-install-queue-${randomUUID()}`);
const aiDir = join(testRoot, "ai");
const modelsDir = join(aiDir, "models");
const installedPath = join(aiDir, "installed.json");

process.env.DATA_DIR = testRoot;
// Point at the real manifest so isDockerEnvironment() is true (GET /features
// then goes through getFeatureStates instead of the native "all installed"
// short-circuit) and import bundleId validation has a manifest to read.
process.env.FEATURE_MANIFEST_PATH = join(process.cwd(), "docker/feature-manifest.json");

mkdirSync(modelsDir, { recursive: true });
writeFileSync(installedPath, JSON.stringify({ bundles: {} }), "utf-8");

// ── Dynamic imports (after env + mocks) ──────────────────────────
const {
  acquireInstallLock,
  advanceAiMutationEpoch,
  releaseInstallLock,
  invalidateCache,
  markInstalled,
} = await import("../../../apps/api/src/lib/feature-status.js");
const queue = await import("../../../apps/api/src/lib/feature-install-queue.js");
const { OcrRuntimeImportValidationError } = await import(
  "../../../apps/api/src/lib/ocr-runtime-install.js"
);
const { env } = await import("../../../apps/api/src/config.js");
const { createMultipartPayload, loginAsAdmin } = await import("../test-server.js");

// ── Helpers ──────────────────────────────────────────────────────

async function waitFor(cond: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor: condition not met in time");
    await new Promise((r) => setTimeout(r, 5));
  }
}

async function tick(): Promise<void> {
  await new Promise((r) => setTimeout(r, 40));
}

describe("POST /api/v1/admin/features/:bundleId/install queue", () => {
  let app: Awaited<ReturnType<typeof import("fastify")>>["default"] extends (
    ...args: infer _A
  ) => infer R
    ? R
    : never;
  let token: string;

  beforeAll(async () => {
    const Fastify = (await import("fastify")).default;
    const multipartPlugin = (await import("@fastify/multipart")).default;
    const cookie = (await import("@fastify/cookie")).default;
    const cors = (await import("@fastify/cors")).default;

    app = Fastify({ logger: false, bodyLimit: 100 * 1024 * 1024 });

    await app.register(cors, { origin: true });
    await app.register(multipartPlugin, { limits: { fileSize: 100 * 1024 * 1024 } });
    await app.register(cookie, { secret: "test-cookie-secret", hook: "onRequest" });

    const { authMiddleware, authRoutes, ensureBuiltinRoles, ensureDefaultAdmin } = await import(
      "../../../apps/api/src/plugins/auth.js"
    );
    await authMiddleware(app);
    await authRoutes(app);
    await ensureBuiltinRoles();
    await ensureDefaultAdmin();

    const { db, schema } = await import("../../../apps/api/src/db/index.js");
    const { eq } = await import("drizzle-orm");
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "admin"));

    const { registerFeatureRoutes } = await import("../../../apps/api/src/routes/features.js");
    await registerFeatureRoutes(app);

    token = await loginAsAdmin(app);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    queue.resetQueueState();
    try {
      releaseInstallLock();
    } catch {
      // no lock held
    }
    writeFileSync(installedPath, JSON.stringify({ bundles: {} }), "utf-8");
    invalidateCache();
    hoisted.spawnCalls.length = 0;
    hoisted.spawnMock.mockClear();
    hoisted.acquireVenvLockMock.mockClear();
    hoisted.getOcrRuntimeEffectiveMemoryBytesMock.mockReset();
    hoisted.getOcrRuntimeEffectiveMemoryBytesMock.mockReturnValue(8 * 1024 ** 3);
    hoisted.downloadVerifiedRuntimeReleaseMock.mockClear();
    hoisted.prepareOfflineRuntimeIndexMock.mockClear();
    hoisted.prepareOfflineRuntimeReleaseMock.mockClear();
    hoisted.assertOcrRuntimeInstallDiskSpaceMock.mockClear();
    hoisted.runOcrRuntimeInstallerMock.mockReset();
    hoisted.runOcrRuntimeInstallerMock.mockResolvedValue({
      family: "ocr",
      generation: "test-generation",
    });
    hoisted.runOcrRuntimeMaintenanceMock.mockReset();
    hoisted.runOcrRuntimeMaintenanceMock.mockImplementation(async (action: string) =>
      action === "rollback"
        ? { committed: false, restoredGeneration: "previous-generation" }
        : { removed: [] },
    );
    hoisted.drainOcrDispatcherMock.mockClear();
    hoisted.probeOcrDispatcherMock.mockReset();
    hoisted.probeOcrDispatcherMock.mockResolvedValue({
      result: { provider: "CPUExecutionProvider" },
    });
    hoisted.handoffOcrDispatcherMock.mockReset();
    hoisted.handoffOcrDispatcherMock.mockResolvedValue({
      result: { provider: "CPUExecutionProvider" },
    });
    hoisted.rotateOcrDispatcherMock.mockReset();
    hoisted.rotateOcrDispatcherMock.mockResolvedValue({
      result: { provider: "CPUExecutionProvider" },
    });
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  async function postInstall(bundleId: string) {
    return app.inject({
      method: "POST",
      url: `/api/v1/admin/features/${bundleId}/install`,
      headers: auth(),
    });
  }

  async function postToolInstall(toolId: string) {
    return app.inject({
      method: "POST",
      url: `/api/v1/admin/tools/${toolId}/features/install`,
      headers: auth(),
    });
  }

  async function postOcrImport() {
    const { body, contentType } = createMultipartPayload([
      {
        name: "index",
        filename: "ocr-runtime-index.json",
        contentType: "application/json",
        content: Buffer.from("index"),
      },
      {
        name: "archive",
        filename: "ocr-runtime.tar.gz",
        contentType: "application/gzip",
        content: Buffer.from("archive"),
      },
    ]);
    return app.inject({
      method: "POST",
      url: "/api/v1/admin/features/import",
      headers: { ...auth(), "content-type": contentType },
      payload: body,
    });
  }

  async function getFeatures() {
    const res = await app.inject({ method: "GET", url: "/api/v1/features", headers: auth() });
    return JSON.parse(res.body).bundles as Array<{ id: string; status: string }>;
  }

  it("first install starts immediately (queued: false) and spawns once", async () => {
    const res = await postInstall("transcription");
    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.queued).toBe(false);
    expect(typeof body.jobId).toBe("string");

    await waitFor(() => hoisted.spawnCalls.length === 1);
    expect(hoisted.spawnCalls[0].bundleId).toBe("transcription");
    expect(hoisted.spawnCalls[0].spawnOptions.stdio).toEqual([
      "ignore",
      "pipe",
      "pipe",
      expect.any(Number),
    ]);
  });

  it("routes OCR through the isolated v3 installer without taking the shared venv lock", async () => {
    const res = await postInstall("ocr");
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).queued).toBe(false);

    await waitFor(() => hoisted.runOcrRuntimeInstallerMock.mock.calls.length === 1);
    expect(hoisted.downloadVerifiedRuntimeReleaseMock).toHaveBeenCalledTimes(1);
    expect(hoisted.runOcrRuntimeInstallerMock).toHaveBeenCalledWith(
      expect.objectContaining({ installLockFd: expect.any(Number) }),
    );
    expect(hoisted.handoffOcrDispatcherMock).toHaveBeenCalledWith(
      expect.objectContaining({ aiDataDir: aiDir }),
    );
    expect(hoisted.runOcrRuntimeMaintenanceMock).toHaveBeenCalledWith(
      "commit",
      expect.objectContaining({
        aiDataDir: aiDir,
        expectedGeneration: "test-generation",
        installLockFd: expect.any(Number),
      }),
    );
    const rotationOrder = hoisted.handoffOcrDispatcherMock.mock.invocationCallOrder[0];
    const commitCall = hoisted.runOcrRuntimeMaintenanceMock.mock.calls.findIndex(
      ([action]) => action === "commit",
    );
    expect(commitCall).toBeGreaterThanOrEqual(0);
    expect(rotationOrder).toBeLessThan(
      hoisted.runOcrRuntimeMaintenanceMock.mock.invocationCallOrder[commitCall],
    );
    expect(hoisted.spawnMock).not.toHaveBeenCalled();
    expect(hoisted.acquireVenvLockMock).not.toHaveBeenCalled();
  });

  it("shares one monotonic deadline across OCR download and activation", async () => {
    const originalMaxMs = env.INSTALL_MAX_MS;
    const wallClock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const monotonicClock = vi.spyOn(performance, "now").mockReturnValue(5_000);
    env.INSTALL_MAX_MS = 100;
    hoisted.downloadVerifiedRuntimeReleaseMock.mockImplementationOnce(async () => {
      wallClock.mockReturnValue(-85_400_000);
      monotonicClock.mockReturnValue(5_040);
      return {
        artifact: { target: "linux-amd64-cpu-py312" },
        canonicalIndex: Buffer.from("index"),
        archiveFile: "ocr.tar.gz",
        archiveSha256: "a".repeat(64),
        archiveSize: 1,
        archiveExpandedSize: 1,
        indexPath: "/tmp/index.json",
        archivePath: "/tmp/archive.tar.gz",
      };
    });

    let timeoutMs: number | undefined;
    try {
      const response = await postInstall("ocr");
      expect(response.statusCode).toBe(202);
      await waitFor(() => hoisted.runOcrRuntimeInstallerMock.mock.calls.length === 1);
      timeoutMs = hoisted.runOcrRuntimeInstallerMock.mock.calls[0]?.[0]?.timeoutMs;
    } finally {
      env.INSTALL_MAX_MS = originalMaxMs;
      wallClock.mockRestore();
      monotonicClock.mockRestore();
    }

    expect(timeoutMs).toBe(60);
  });

  it("rejects an accurate OCR install before queueing when configured memory is too small", async () => {
    hoisted.getOcrRuntimeEffectiveMemoryBytesMock.mockReturnValue(3 * 1024 ** 3);

    const res = await postInstall("ocr");

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toMatch(/4 GiB.*3 GiB.*Fast OCR remains available/i);
    expect(hoisted.downloadVerifiedRuntimeReleaseMock).not.toHaveBeenCalled();
    expect(queue.getQueuedBundleIds()).not.toContain("ocr");
  });

  it("rolls back when the post-handoff activation commit cannot be recorded", async () => {
    hoisted.runOcrRuntimeMaintenanceMock.mockImplementation(async (action: string) => {
      if (action === "commit") throw new Error("commit write failed");
      if (action === "rollback") return { restoredGeneration: "previous-generation" };
      return { removed: [] };
    });

    const res = await postInstall("ocr");
    expect(res.statusCode).toBe(202);
    await waitFor(() =>
      hoisted.runOcrRuntimeMaintenanceMock.mock.calls.some(([action]) => action === "rollback"),
    );

    expect(hoisted.handoffOcrDispatcherMock).toHaveBeenCalledTimes(1);
    expect(
      hoisted.runOcrRuntimeMaintenanceMock.mock.calls.filter(([action]) => action === "commit"),
    ).toHaveLength(2);
    expect(hoisted.runOcrRuntimeMaintenanceMock).toHaveBeenCalledWith(
      "rollback",
      expect.objectContaining({
        expectedGeneration: "test-generation",
        installLockFd: expect.any(Number),
      }),
    );
  });

  it("accepts exact committed rollback resolution after both commit results are lost", async () => {
    hoisted.runOcrRuntimeMaintenanceMock.mockImplementation(async (action: string) => {
      if (action === "commit") throw new Error("commit result was lost");
      if (action === "rollback") {
        return {
          committed: true,
          committedGeneration: "test-generation",
          restoredGeneration: "must-not-be-probed",
        };
      }
      return { removed: [] };
    });

    const res = await postInstall("ocr");
    expect(res.statusCode).toBe(202);
    await waitFor(() =>
      hoisted.runOcrRuntimeMaintenanceMock.mock.calls.some(([action]) => action === "rollback"),
    );

    expect(hoisted.handoffOcrDispatcherMock).toHaveBeenCalledTimes(1);
    expect(
      hoisted.runOcrRuntimeMaintenanceMock.mock.calls.filter(([action]) => action === "commit"),
    ).toHaveLength(2);
    expect(hoisted.probeOcrDispatcherMock).not.toHaveBeenCalled();
    expect(hoisted.rotateOcrDispatcherMock).not.toHaveBeenCalled();
  });

  it("restores and re-probes the prior generation when persistent handoff fails", async () => {
    hoisted.handoffOcrDispatcherMock.mockRejectedValueOnce(new Error("candidate readiness failed"));
    hoisted.probeOcrDispatcherMock.mockRejectedValueOnce(
      new Error("no ready published dispatcher"),
    );

    const res = await postInstall("ocr");
    expect(res.statusCode).toBe(202);
    await waitFor(() =>
      hoisted.runOcrRuntimeMaintenanceMock.mock.calls.some(([action]) => action === "rollback"),
    );

    expect(hoisted.runOcrRuntimeMaintenanceMock).toHaveBeenCalledWith(
      "rollback",
      expect.objectContaining({
        aiDataDir: aiDir,
        expectedGeneration: "test-generation",
        installLockFd: expect.any(Number),
      }),
    );
    expect(hoisted.probeOcrDispatcherMock).toHaveBeenCalledWith(
      expect.objectContaining({ aiDataDir: aiDir }),
    );
    expect(hoisted.handoffOcrDispatcherMock).toHaveBeenCalledTimes(1);
    expect(hoisted.rotateOcrDispatcherMock).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when the offline OCR installer fails after validation", async () => {
    hoisted.runOcrRuntimeInstallerMock.mockRejectedValueOnce(
      new Error("installer process could not start"),
    );

    const response = await postOcrImport();

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error).toMatch(/installer process could not start/i);
  });

  it("returns 400 when the offline OCR signed index fails validation", async () => {
    hoisted.prepareOfflineRuntimeIndexMock.mockRejectedValueOnce(
      new OcrRuntimeImportValidationError("OCR runtime index signature verification failed"),
    );

    const response = await postOcrImport();

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/signature verification failed/i);
    expect(hoisted.runOcrRuntimeInstallerMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the offline OCR archive fails signed size or digest validation", async () => {
    hoisted.prepareOfflineRuntimeReleaseMock.mockRejectedValueOnce(
      new OcrRuntimeImportValidationError(
        "Offline OCR runtime archive does not match the signed index",
      ),
    );

    const response = await postOcrImport();

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/does not match the signed index/i);
    expect(hoisted.runOcrRuntimeInstallerMock).not.toHaveBeenCalled();
  });

  it("returns 500 when OCR trust-store configuration cannot be loaded", async () => {
    hoisted.loadOcrRuntimeTrustKeysMock.mockImplementationOnce(() => {
      throw new Error("Unable to read the OCR runtime trust store");
    });

    const response = await postOcrImport();

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error).toMatch(/trust store/i);
    expect(hoisted.prepareOfflineRuntimeIndexMock).not.toHaveBeenCalled();
  });

  it("returns 500 when offline OCR dispatcher handoff fails", async () => {
    hoisted.handoffOcrDispatcherMock.mockRejectedValueOnce(
      new Error("candidate readiness probe failed"),
    );

    const response = await postOcrImport();

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error).toMatch(/readiness handoff failed/i);
    expect(hoisted.runOcrRuntimeMaintenanceMock).toHaveBeenCalledWith(
      "rollback",
      expect.objectContaining({ expectedGeneration: "test-generation" }),
    );
  });

  it("returns 500 when offline OCR commit and rollback infrastructure fail", async () => {
    hoisted.runOcrRuntimeMaintenanceMock.mockRejectedValue(new Error("runtime state unavailable"));

    const response = await postOcrImport();

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error).toMatch(/handoff failed.*rollback also failed/i);
    expect(
      hoisted.runOcrRuntimeMaintenanceMock.mock.calls.filter(([action]) => action === "commit"),
    ).toHaveLength(2);
    expect(hoisted.runOcrRuntimeMaintenanceMock).toHaveBeenCalledWith(
      "rollback",
      expect.objectContaining({ expectedGeneration: "test-generation" }),
    );
  });

  it("a concurrent install is queued (202 queued: true) and does NOT spawn a second process", async () => {
    const r1 = await postInstall("transcription");
    expect(JSON.parse(r1.body).queued).toBe(false);
    await waitFor(() => hoisted.spawnCalls.length === 1);

    const r2 = await postInstall("face-detection");
    expect(r2.statusCode).toBe(202);
    expect(JSON.parse(r2.body).queued).toBe(true);

    // Give any (incorrect) spawn a chance to fire; it must not.
    await tick();
    expect(hoisted.spawnCalls.length).toBe(1);

    const bundles = await getFeatures();
    expect(bundles.find((b) => b.id === "transcription")?.status).toBe("installing");
    expect(bundles.find((b) => b.id === "face-detection")?.status).toBe("queued");
  });

  it("tool install enqueues every missing hard dependency in one request", async () => {
    const res = await postToolInstall("passport-photo");
    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body) as {
      bundles: Array<{ bundleId: string; jobId: string; queued: boolean }>;
    };

    expect(body.bundles.map((b) => b.bundleId)).toEqual(["background-removal", "face-detection"]);
    expect(body.bundles[0].queued).toBe(false);
    expect(body.bundles[1].queued).toBe(true);

    await waitFor(() => hoisted.spawnCalls.length === 1);
    expect(hoisted.spawnCalls[0].bundleId).toBe("background-removal");

    const queuedBundles = await getFeatures();
    expect(queuedBundles.find((b) => b.id === "background-removal")?.status).toBe("installing");
    expect(queuedBundles.find((b) => b.id === "face-detection")?.status).toBe("queued");

    hoisted.spawnCalls[0].emit("close", 0);
    await waitFor(() => hoisted.spawnCalls.length === 2);
    expect(hoisted.spawnCalls[1].bundleId).toBe("face-detection");
  });

  it("keeps the OCR tool install alias for its optional accurate runtime", async () => {
    const res = await postToolInstall("ocr");

    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body)).toEqual({
      bundles: [
        {
          bundleId: "ocr",
          jobId: expect.any(String),
          queued: false,
        },
      ],
    });
    await waitFor(() => hoisted.runOcrRuntimeInstallerMock.mock.calls.length === 1);
    expect(hoisted.downloadVerifiedRuntimeReleaseMock).toHaveBeenCalledTimes(1);
  });

  it("applies the accurate OCR preflight to the tool install alias", async () => {
    hoisted.getOcrRuntimeEffectiveMemoryBytesMock.mockReturnValue(3 * 1024 ** 3);

    const res = await postToolInstall("ocr");

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toMatch(/Fast OCR remains available/i);
    expect(queue.getQueuedBundleIds()).not.toContain("ocr");
  });

  it("dedups a duplicate install POST of the active bundle (no second entry, same job)", async () => {
    const r1 = await postInstall("transcription");
    const jobId1 = JSON.parse(r1.body).jobId;
    await waitFor(() => hoisted.spawnCalls.length === 1);

    // POST the SAME bundle again while it is active.
    const r2 = await postInstall("transcription");
    expect(r2.statusCode).toBe(202);
    const body2 = JSON.parse(r2.body);
    expect(body2.queued).toBe(false);
    // Returns the in-flight job id, not a new one.
    expect(body2.jobId).toBe(jobId1);

    await tick();
    expect(hoisted.spawnCalls.length).toBe(1);
  });

  it("auto-starts the next queued bundle when the running install finishes", async () => {
    await postInstall("transcription");
    await waitFor(() => hoisted.spawnCalls.length === 1);
    const r2 = await postInstall("face-detection");
    expect(JSON.parse(r2.body).queued).toBe(true);

    // The running install finishes successfully.
    hoisted.spawnCalls[0].emit("close", 0);

    // The queued face-detection install auto-starts.
    await waitFor(() => hoisted.spawnCalls.length === 2);
    expect(hoisted.spawnCalls[1].bundleId).toBe("face-detection");

    const bundles = await getFeatures();
    expect(bundles.find((b) => b.id === "face-detection")?.status).toBe("installing");

    // Cleanup: let the second install finish too.
    hoisted.spawnCalls[1].emit("close", 0);
    await waitFor(() => queue.getActiveBundleId() === null);
  });

  it("retries a queued install after another replica releases the shared lease", async () => {
    // Simulate an offline import in progress by holding the install lock.
    expect(acquireInstallLock("__import__")).toBe(true);

    const res = await postInstall("transcription");
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).queued).toBe(true);

    // pump() could not acquire the held lock, so nothing spawned.
    await tick();
    expect(hoisted.spawnCalls.length).toBe(0);
    const queuedBundles = await getFeatures();
    expect(queuedBundles.find((b) => b.id === "transcription")?.status).toBe("queued");

    // The other owner finishes. No request-local callback runs in this API
    // process, so its bounded retry must notice the released shared lease.
    releaseInstallLock();

    await waitFor(() => hoisted.spawnCalls.length === 1, 3_000);
    expect(hoisted.spawnCalls[0].bundleId).toBe("transcription");

    // Cleanup.
    hoisted.spawnCalls[0].emit("close", 0);
    await waitFor(() => queue.getActiveBundleId() === null);
  });

  it("cancels pre-mutation queued work on every replica but allows a new request", async () => {
    // Hold the shared lease as reset/uninstall would on another API replica.
    expect(acquireInstallLock("__reset__")).toBe(true);
    const staleRequest = await postInstall("transcription");
    expect(staleRequest.statusCode).toBe(202);
    expect(JSON.parse(staleRequest.body).queued).toBe(true);

    advanceAiMutationEpoch();
    releaseInstallLock();

    await waitFor(() => queue.peekQueue() === null, 3_000);
    expect(hoisted.spawnCalls).toHaveLength(0);

    // A request submitted after the epoch publication is intentionally new
    // work and must be allowed to run once the destructive owner is gone.
    const freshRequest = await postInstall("transcription");
    expect(freshRequest.statusCode).toBe(202);
    await waitFor(() => hoisted.spawnCalls.length === 1);
    expect(hoisted.spawnCalls[0].bundleId).toBe("transcription");

    hoisted.spawnCalls[0].emit("close", 0);
    await waitFor(() => queue.getActiveBundleId() === null);
  });

  it("completes without duplicate work when another replica installed the queued bundle", async () => {
    expect(acquireInstallLock("__other_replica__")).toBe(true);
    const response = await postInstall("transcription");
    expect(JSON.parse(response.body).queued).toBe(true);

    markInstalled("transcription", "2.1.0", []);
    releaseInstallLock();

    await waitFor(() => queue.peekQueue() === null, 3_000);
    expect(hoisted.spawnCalls).toHaveLength(0);
  });
});
