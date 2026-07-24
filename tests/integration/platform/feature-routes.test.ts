/**
 * Integration tests for the feature-bundle route contracts that need a
 * CONTROLLED manifest and AI data dir (unlike feature-install-queue.test.ts,
 * which points at the real docker manifest): uninstall's protected-model
 * bookkeeping, install short-circuits driven by model verification, the
 * disk-usage walker, native (non-Docker) GET /features OCR capability shapes,
 * offline OCR import success/failure mapping, install-queue failure paths when
 * the shared lease dir is corrupt, and the deferred OCR generation-cleanup
 * timer.
 *
 * The installer child (spawn), the AI dispatcher surface (@snapotter/ai), and
 * the OCR runtime install helpers are mocked; Postgres comes from the per-fork
 * testcontainer, and the routes run on a bespoke Fastify app with real auth.
 */
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks (spawn + AI dispatcher + OCR runtime helpers) ───
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
    stdout: ReturnType<typeof makeEmitter>;
    stderr: ReturnType<typeof makeEmitter>;
    kill: ReturnType<typeof vi.fn>;
    on: (event: string, cb: (...a: unknown[]) => void) => unknown;
    emit: (event: string, ...args: unknown[]) => void;
  }

  const spawnCalls: FakeChild[] = [];
  const spawnMock = vi.fn((_cmd: string, args: string[]) => {
    const base = makeEmitter() as unknown as FakeChild;
    base.bundleId = args[1];
    base.stdout = makeEmitter();
    base.stderr = makeEmitter();
    base.kill = vi.fn();
    spawnCalls.push(base);
    return base;
  });

  const offlineRuntimeIndex = {
    artifact: { target: "linux-amd64-cpu-py312", version: "test-version" },
    canonicalIndex: Buffer.from("index"),
    archiveFile: "ocr.tar.gz",
    archiveSha256: "a".repeat(64),
    archiveSize: 7,
    archiveExpandedSize: 7,
    minimumMemoryBytes: 4 * 1024 ** 3,
  };

  return {
    spawnCalls,
    spawnMock,
    offlineRuntimeIndex,
    ocrCapability: { current: null as unknown },
    acquireVenvLockMock: vi.fn(async () => () => {}),
    shutdownDispatcherMock: vi.fn(),
    drainOcrDispatcherMock: vi.fn(async () => {}),
    probeOcrDispatcherMock: vi.fn(async () => ({
      result: { provider: "CPUExecutionProvider" },
    })),
    handoffOcrDispatcherMock: vi.fn(async () => ({
      result: { provider: "CPUExecutionProvider" },
    })),
    rotateOcrDispatcherMock: vi.fn(async () => ({
      result: { provider: "CPUExecutionProvider" },
    })),
    selectOcrRuntimeTargetMock: vi.fn(() => "linux-amd64-cpu-py312"),
    getOcrRuntimeEffectiveMemoryBytesMock: vi.fn(() => 8 * 1024 ** 3),
    loadOcrRuntimeTrustKeysMock: vi.fn(() => [
      { keyId: "test", algorithm: "ed25519", publicKey: "test" },
    ]),
    assertOcrRuntimeInstallDiskSpaceMock: vi.fn(async () => {}),
    downloadVerifiedRuntimeReleaseMock: vi.fn(async () => ({
      ...offlineRuntimeIndex,
      indexPath: "/tmp/index.json",
      archivePath: "/tmp/archive.tar.gz",
    })),
    prepareOfflineRuntimeIndexMock: vi.fn(async () => ({
      ...offlineRuntimeIndex,
      canonicalIndexBytes: offlineRuntimeIndex.canonicalIndex.byteLength,
    })),
    prepareOfflineRuntimeReleaseMock: vi.fn(async () => ({
      ...offlineRuntimeIndex,
      indexPath: "/tmp/offline-index.json",
      archivePath: "/tmp/offline-archive.tar.gz",
    })),
    runOcrRuntimeInstallerMock: vi.fn(async () => ({
      family: "ocr",
      generation: "test-generation",
    })),
    runOcrRuntimeMaintenanceMock: vi.fn(async (_action: string) => ({ removed: [] })),
    purgeOcrRuntimeDownloadsMock: vi.fn(async () => {}),
    cleanupInterruptedMock: vi.fn(() => true),
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
    drainOcrDispatcher: hoisted.drainOcrDispatcherMock,
    getOcrRuntimeCapability: (options?: unknown) =>
      hoisted.ocrCapability.current ??
      (actual.getOcrRuntimeCapability as (options?: unknown) => unknown)(options),
    getOcrRuntimeEffectiveMemoryBytes: hoisted.getOcrRuntimeEffectiveMemoryBytesMock,
    handoffOcrDispatcher: hoisted.handoffOcrDispatcherMock,
    probeOcrDispatcher: hoisted.probeOcrDispatcherMock,
    rotateOcrDispatcher: hoisted.rotateOcrDispatcherMock,
    selectOcrRuntimeTarget: hoisted.selectOcrRuntimeTargetMock,
    shutdownDispatcher: hoisted.shutdownDispatcherMock,
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
    purgeOcrRuntimeDownloads: hoisted.purgeOcrRuntimeDownloadsMock,
    runOcrRuntimeInstaller: hoisted.runOcrRuntimeInstallerMock,
    runOcrRuntimeMaintenance: hoisted.runOcrRuntimeMaintenanceMock,
    waitWithOcrRuntimeHeartbeat: async <T>(operation: Promise<T>) => operation,
  };
});

// Keep every real feature-status behavior (ledger, locks, epoch) but make the
// interrupted-import sweep controllable so its failure branch is reachable.
vi.mock("../../../apps/api/src/lib/feature-status.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, cleanupInterruptedFeatureImports: hoisted.cleanupInterruptedMock };
});

// ── Temp DATA_DIR + crafted manifest before importing feature-status ──
const testRoot = join(tmpdir(), `snapotter-feature-routes-${randomUUID()}`);
const aiDir = join(testRoot, "ai");
const modelsDir = join(aiDir, "models");
const installedPath = join(aiDir, "installed.json");
const manifestPath = join(testRoot, "feature-manifest.json");

process.env.DATA_DIR = testRoot;
// A crafted manifest (instead of the real docker one) so the tests control
// exactly which model files each bundle owns and which are shared. While the
// file exists, isDockerEnvironment() is true; deleting it flips the GET
// /api/v1/features handler into its native (non-Docker) branch.
process.env.FEATURE_MANIFEST_PATH = manifestPath;

const craftedManifest = {
  bundleRepo: "snapotter-test/bundles",
  bundles: {
    "background-removal": {
      models: [
        { id: "u2net", downloadFn: "rembg_session", args: ["u2net"] },
        { id: "shared-file", path: "shared/shared.onnx" },
        { id: "solo-file", path: "solo/solo.onnx" },
        { id: "br-snap", downloadFn: "hf_snapshot", args: ["org/repo", "hf-shared"] },
      ],
    },
    transcription: {
      models: [
        { id: "u2net-too", downloadFn: "rembg_session", args: ["u2net"] },
        { id: "shared-file-too", path: "shared/shared.onnx" },
        { id: "tr-snap", downloadFn: "hf_snapshot", args: ["org/repo2", "hf-shared"] },
      ],
    },
    "face-detection": {
      models: [{ id: "fd-model", path: "fd/detector.tflite" }],
    },
    ocr: {
      models: [],
      targets: { "linux-amd64-cpu-py312": { minimumMemoryBytes: 4 * 1024 ** 3 } },
    },
  },
};

mkdirSync(modelsDir, { recursive: true });
writeFileSync(installedPath, JSON.stringify({ bundles: {} }), "utf-8");
writeFileSync(manifestPath, JSON.stringify(craftedManifest, null, 2), "utf-8");

// ── Dynamic imports (after env + mocks) ──────────────────────────
const {
  acquireInstallLock,
  invalidateCache,
  markInstalled,
  releaseInstallLock,
  setInstallProgress,
} = await import("../../../apps/api/src/lib/feature-status.js");
const queue = await import("../../../apps/api/src/lib/feature-install-queue.js");
const { OcrRuntimeDiskSpaceError } = await import(
  "../../../apps/api/src/lib/ocr-runtime-install.js"
);
const { FEATURE_BUNDLES } = await import("@snapotter/shared");
const { createMultipartPayload, loginAsAdmin } = await import("../test-server.js");

// ── Helpers ──────────────────────────────────────────────────────

async function waitFor(cond: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor: condition not met in time");
    await new Promise((r) => setTimeout(r, 5));
  }
}

const runningInDocker = existsSync("/.dockerenv");
const runningAsRoot = typeof process.getuid === "function" && process.getuid() === 0;

interface FeatureRow {
  id: string;
  status: string;
  installedVersion: string | null;
  downloadBytes: number | null;
  installedBytes: number | null;
  progress: { percent: number; stage: string } | null;
  error: string | null;
  compatibility?: string;
  compatibilityReason?: string | null;
  selectedTarget?: string | null;
  missingDownloadBytes?: number | null;
  healthyGeneration?: string | null;
  availableQualities?: string[];
}

describe("feature bundle route contracts", () => {
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
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(installedPath, JSON.stringify({ bundles: {} }), "utf-8");
    writeFileSync(manifestPath, JSON.stringify(craftedManifest, null, 2), "utf-8");
    invalidateCache();
    setInstallProgress(null, null, null);
    hoisted.spawnCalls.length = 0;
    hoisted.spawnMock.mockClear();
    hoisted.acquireVenvLockMock.mockClear();
    hoisted.shutdownDispatcherMock.mockClear();
    hoisted.drainOcrDispatcherMock.mockClear();
    hoisted.ocrCapability.current = null;
    hoisted.selectOcrRuntimeTargetMock.mockReset();
    hoisted.selectOcrRuntimeTargetMock.mockReturnValue("linux-amd64-cpu-py312");
    hoisted.getOcrRuntimeEffectiveMemoryBytesMock.mockReset();
    hoisted.getOcrRuntimeEffectiveMemoryBytesMock.mockReturnValue(8 * 1024 ** 3);
    hoisted.loadOcrRuntimeTrustKeysMock.mockClear();
    hoisted.assertOcrRuntimeInstallDiskSpaceMock.mockReset();
    hoisted.assertOcrRuntimeInstallDiskSpaceMock.mockResolvedValue(undefined);
    hoisted.prepareOfflineRuntimeIndexMock.mockReset();
    hoisted.prepareOfflineRuntimeIndexMock.mockResolvedValue({
      ...hoisted.offlineRuntimeIndex,
      canonicalIndexBytes: hoisted.offlineRuntimeIndex.canonicalIndex.byteLength,
    });
    hoisted.prepareOfflineRuntimeReleaseMock.mockReset();
    hoisted.prepareOfflineRuntimeReleaseMock.mockResolvedValue({
      ...hoisted.offlineRuntimeIndex,
      indexPath: "/tmp/offline-index.json",
      archivePath: "/tmp/offline-archive.tar.gz",
    });
    hoisted.runOcrRuntimeInstallerMock.mockReset();
    hoisted.runOcrRuntimeInstallerMock.mockResolvedValue({
      family: "ocr",
      generation: "test-generation",
    });
    hoisted.runOcrRuntimeMaintenanceMock.mockReset();
    hoisted.runOcrRuntimeMaintenanceMock.mockResolvedValue({ removed: [] });
    hoisted.handoffOcrDispatcherMock.mockReset();
    hoisted.handoffOcrDispatcherMock.mockResolvedValue({
      result: { provider: "CPUExecutionProvider" },
    });
    hoisted.purgeOcrRuntimeDownloadsMock.mockReset();
    hoisted.purgeOcrRuntimeDownloadsMock.mockResolvedValue(undefined);
    hoisted.cleanupInterruptedMock.mockReset();
    hoisted.cleanupInterruptedMock.mockReturnValue(true);
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  async function postInstall(bundleId: string) {
    return app.inject({
      method: "POST",
      url: `/api/v1/admin/features/${bundleId}/install`,
      headers: auth(),
    });
  }

  async function postUninstall(bundleId: string) {
    return app.inject({
      method: "POST",
      url: `/api/v1/admin/features/${bundleId}/uninstall`,
      headers: auth(),
    });
  }

  async function getBundles(): Promise<FeatureRow[]> {
    const res = await app.inject({ method: "GET", url: "/api/v1/features", headers: auth() });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body).bundles as FeatureRow[];
  }

  async function getBundleRow(bundleId: string): Promise<FeatureRow | undefined> {
    const bundles = await getBundles();
    return bundles.find((b) => b.id === bundleId);
  }

  async function getDiskUsage(): Promise<number> {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/features/disk-usage",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body).totalBytes as number;
  }

  async function postImport(fields: Array<{ name: string; content: Buffer }>) {
    const { body, contentType } = createMultipartPayload(
      fields.map((field) => ({
        name: field.name,
        filename: `${field.name}.bin`,
        contentType: "application/octet-stream",
        content: field.content,
      })),
    );
    return app.inject({
      method: "POST",
      url: "/api/v1/admin/features/import",
      headers: { ...auth(), "content-type": contentType },
      payload: body,
    });
  }

  async function withNativeMode<T>(run: () => Promise<T>): Promise<T> {
    rmSync(manifestPath, { force: true });
    try {
      return await run();
    } finally {
      writeFileSync(manifestPath, JSON.stringify(craftedManifest, null, 2), "utf-8");
    }
  }

  async function waitForLeaseFree(): Promise<void> {
    await waitFor(() => {
      if (!acquireInstallLock("__lease_probe__")) return false;
      releaseInstallLock();
      return true;
    });
  }

  const readyOcrCapability = {
    available: true,
    status: "ready",
    qualities: ["balanced"],
    providers: ["CPUExecutionProvider"],
    descriptor: {
      generation: "gen-1",
      artifact: { target: "linux-amd64-cpu-py312", version: "3.0.0" },
    },
  };

  // ── Install short-circuits ───────────────────────────────────────

  it("returns 409 when the bundle is already installed and its models verify", async () => {
    mkdirSync(join(modelsDir, "fd"), { recursive: true });
    writeFileSync(join(modelsDir, "fd", "detector.tflite"), "detector weights");
    markInstalled("face-detection", "2.1.0", []);

    const res = await postInstall("face-detection");

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toBe('Bundle "face-detection" is already installed');
    expect(hoisted.spawnMock).not.toHaveBeenCalled();
  });

  it("returns 409 for an OCR install when the runtime capability is already active", async () => {
    hoisted.ocrCapability.current = readyOcrCapability;

    const res = await postInstall("ocr");

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toBe('Bundle "ocr" is already installed');
    expect(hoisted.downloadVerifiedRuntimeReleaseMock).not.toHaveBeenCalled();
    expect(queue.getQueuedBundleIds()).toHaveLength(0);
  });

  // ── Uninstall ────────────────────────────────────────────────────

  it("returns 409 when uninstalling a bundle that is not installed", async () => {
    const res = await postUninstall("face-detection");

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toBe('Bundle "face-detection" is not installed');
  });

  it("returns 409 for uninstall while another install or import holds the lease", async () => {
    markInstalled("transcription", "2.1.0", []);
    expect(acquireInstallLock("__hold__")).toBe(true);
    try {
      const res = await postUninstall("transcription");

      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body).error).toBe("Another AI install or import is in progress");
      const ledger = JSON.parse(readFileSync(installedPath, "utf-8"));
      expect(ledger.bundles).toHaveProperty("transcription");
    } finally {
      releaseInstallLock();
    }
  });

  it("uninstall deletes only models no other installed bundle still needs", async () => {
    mkdirSync(join(modelsDir, "rembg"), { recursive: true });
    mkdirSync(join(modelsDir, "shared"), { recursive: true });
    mkdirSync(join(modelsDir, "solo"), { recursive: true });
    mkdirSync(join(modelsDir, "hf-shared"), { recursive: true });
    writeFileSync(join(modelsDir, "rembg", "u2net.onnx"), "u2net weights");
    writeFileSync(join(modelsDir, "shared", "shared.onnx"), "shared weights");
    writeFileSync(join(modelsDir, "solo", "solo.onnx"), "solo weights");
    writeFileSync(join(modelsDir, "hf-shared", "weights.bin"), "hf weights");
    markInstalled("background-removal", "2.1.0", []);
    markInstalled("transcription", "2.1.0", []);

    const res = await postUninstall("background-removal");

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    // Only the model no other installed bundle references is gone.
    expect(existsSync(join(modelsDir, "solo", "solo.onnx"))).toBe(false);
    expect(existsSync(join(modelsDir, "rembg", "u2net.onnx"))).toBe(true);
    expect(existsSync(join(modelsDir, "shared", "shared.onnx"))).toBe(true);
    expect(existsSync(join(modelsDir, "hf-shared", "weights.bin"))).toBe(true);
    const ledger = JSON.parse(readFileSync(installedPath, "utf-8"));
    expect(ledger.bundles).not.toHaveProperty("background-removal");
    expect(ledger.bundles).toHaveProperty("transcription");
    expect(hoisted.shutdownDispatcherMock).toHaveBeenCalled();
  });

  it("uninstalling the last owner removes rembg, path, and snapshot models", async () => {
    mkdirSync(join(modelsDir, "rembg"), { recursive: true });
    mkdirSync(join(modelsDir, "shared"), { recursive: true });
    mkdirSync(join(modelsDir, "hf-shared"), { recursive: true });
    writeFileSync(join(modelsDir, "rembg", "u2net.onnx"), "u2net weights");
    writeFileSync(join(modelsDir, "shared", "shared.onnx"), "shared weights");
    writeFileSync(join(modelsDir, "hf-shared", "weights.bin"), "hf weights");
    markInstalled("transcription", "2.1.0", []);

    const res = await postUninstall("transcription");

    expect(res.statusCode).toBe(200);
    expect(existsSync(join(modelsDir, "rembg", "u2net.onnx"))).toBe(false);
    expect(existsSync(join(modelsDir, "shared", "shared.onnx"))).toBe(false);
    expect(existsSync(join(modelsDir, "hf-shared"))).toBe(false);
    const ledger = JSON.parse(readFileSync(installedPath, "utf-8"));
    expect(ledger.bundles).toEqual({});
  });

  // ── Disk usage ───────────────────────────────────────────────────

  it("disk usage sums nested files and grows by exactly what gets written", async () => {
    const before = await getDiskUsage();

    mkdirSync(join(aiDir, "depth1", "depth2"), { recursive: true });
    writeFileSync(join(aiDir, "depth1", "depth2", "weights.bin"), Buffer.alloc(1500));
    writeFileSync(join(aiDir, "top.bin"), Buffer.alloc(300));

    const after = await getDiskUsage();
    expect(after).toBe(before + 1800);
  });

  it("disk usage reports zero when the AI dir does not exist", async () => {
    rmSync(aiDir, { recursive: true, force: true });
    try {
      const total = await getDiskUsage();
      expect(total).toBe(0);
    } finally {
      mkdirSync(modelsDir, { recursive: true });
      writeFileSync(installedPath, JSON.stringify({ bundles: {} }), "utf-8");
      invalidateCache();
    }
  });

  it.skipIf(runningAsRoot)("disk usage skips directories it cannot read", async () => {
    const lockedDir = join(aiDir, "locked");
    mkdirSync(lockedDir, { recursive: true });
    writeFileSync(join(lockedDir, "secret.bin"), Buffer.alloc(64));
    const readable = await getDiskUsage();

    chmodSync(lockedDir, 0o000);
    try {
      const withUnreadable = await getDiskUsage();
      expect(withUnreadable).toBe(readable - 64);
    } finally {
      chmodSync(lockedDir, 0o700);
    }
  });

  // ── GET /api/v1/features in native (non-Docker) mode ─────────────

  it.skipIf(runningInDocker)("native mode reports every bundle installed", async () => {
    await withNativeMode(async () => {
      hoisted.ocrCapability.current = readyOcrCapability;

      const bundles = await getBundles();
      expect(bundles).toHaveLength(Object.keys(FEATURE_BUNDLES).length);

      const br = bundles.find((b) => b.id === "background-removal");
      expect(br).toMatchObject({
        status: "installed",
        installedVersion: null,
        downloadBytes: null,
        installedBytes: null,
        progress: null,
        error: null,
      });
      expect(br).not.toHaveProperty("compatibility");

      const ocr = bundles.find((b) => b.id === "ocr");
      expect(ocr).toMatchObject({
        status: "installed",
        installedVersion: "3.0.0",
        compatibility: "compatible",
        compatibilityReason: null,
        selectedTarget: "linux-amd64-cpu-py312",
        missingDownloadBytes: null,
        healthyGeneration: "gen-1",
        availableQualities: ["fast", "balanced"],
        error: null,
      });
    });
  });

  it.skipIf(runningInDocker)("native mode surfaces an invalid OCR descriptor", async () => {
    await withNativeMode(async () => {
      hoisted.ocrCapability.current = {
        available: false,
        status: "invalid",
        reason: "descriptor-invalid",
        qualities: [],
        providers: [],
      };

      const ocr = await getBundleRow("ocr");
      expect(ocr).toMatchObject({
        status: "error",
        installedVersion: null,
        compatibility: "invalid",
        compatibilityReason: "descriptor-invalid",
        selectedTarget: "linux-amd64-cpu-py312",
        healthyGeneration: null,
        availableQualities: ["fast"],
        error: "OCR runtime descriptor is invalid",
      });
    });
  });

  it.skipIf(runningInDocker)("native mode explains an unsupported OCR host", async () => {
    await withNativeMode(async () => {
      hoisted.ocrCapability.current = {
        available: false,
        status: "missing",
        reason: "unsupported-host",
        qualities: [],
        providers: [],
      };
      hoisted.selectOcrRuntimeTargetMock.mockReturnValue(null as never);

      const ocr = await getBundleRow("ocr");
      expect(ocr).toMatchObject({
        status: "not_installed",
        compatibility: "compatible",
        compatibilityReason: "unsupported-host",
        selectedTarget: null,
        availableQualities: ["fast"],
        error: "Accurate OCR is not supported on this host; Fast OCR remains available",
      });
    });
  });

  it.skipIf(runningInDocker)("native mode flags an incompatible OCR artifact", async () => {
    await withNativeMode(async () => {
      hoisted.ocrCapability.current = {
        available: false,
        status: "incompatible",
        reason: "artifact-incompatible",
        qualities: [],
        providers: [],
      };

      const ocr = await getBundleRow("ocr");
      expect(ocr).toMatchObject({
        status: "not_installed",
        compatibility: "incompatible",
        compatibilityReason: "artifact-incompatible",
        selectedTarget: "linux-amd64-cpu-py312",
        error: null,
      });
    });
  });

  // ── Offline OCR runtime import ───────────────────────────────────

  it("imports a signed offline OCR runtime end to end", async () => {
    const res = await postImport([
      { name: "index", content: Buffer.from("index") },
      { name: "archive", content: Buffer.from("archive") },
    ]);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ bundleId: "ocr", version: "test-version" });
    expect(hoisted.runOcrRuntimeInstallerMock).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "import", installLockFd: expect.any(Number) }),
    );
    expect(hoisted.handoffOcrDispatcherMock).toHaveBeenCalledWith(
      expect.objectContaining({ aiDataDir: aiDir }),
    );
    expect(hoisted.runOcrRuntimeMaintenanceMock).toHaveBeenCalledWith(
      "commit",
      expect.objectContaining({ expectedGeneration: "test-generation" }),
    );
    // The lease is released once the import settles.
    await waitForLeaseFree();
  });

  it("returns 400 when only the OCR index is uploaded", async () => {
    const res = await postImport([{ name: "index", content: Buffer.from("index") }]);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe(
      "OCR runtime import requires both index and archive file fields",
    );
    expect(hoisted.runOcrRuntimeInstallerMock).not.toHaveBeenCalled();
  });

  it("maps a staging disk-space failure to 507", async () => {
    hoisted.assertOcrRuntimeInstallDiskSpaceMock.mockRejectedValueOnce(
      new OcrRuntimeDiskSpaceError("Not enough free disk space to stage the OCR runtime"),
    );

    const res = await postImport([
      { name: "index", content: Buffer.from("index") },
      { name: "archive", content: Buffer.from("archive") },
    ]);

    expect(res.statusCode).toBe(507);
    expect(JSON.parse(res.body).error).toMatch(/free disk space/i);
    expect(hoisted.runOcrRuntimeInstallerMock).not.toHaveBeenCalled();
  });

  it("classifies an ENOSPC error from staging as 507", async () => {
    hoisted.prepareOfflineRuntimeIndexMock.mockRejectedValueOnce(
      Object.assign(new Error("write failed"), { code: "ENOSPC" }),
    );

    const res = await postImport([
      { name: "index", content: Buffer.from("index") },
      { name: "archive", content: Buffer.from("archive") },
    ]);

    expect(res.statusCode).toBe(507);
    expect(JSON.parse(res.body).error).toBe("write failed");
  });

  it("returns 500 when interrupted import staging cannot be cleaned up", async () => {
    hoisted.cleanupInterruptedMock.mockReturnValueOnce(false);

    const res = await postImport([{ name: "index", content: Buffer.from("index") }]);

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toBe(
      "Interrupted offline import staging could not be cleaned up safely",
    );
    // The lease taken before the failed sweep must not leak.
    await waitForLeaseFree();
  });

  // ── Queue failure paths ──────────────────────────────────────────

  it("fails the install POST with 500 when the shared lease cannot be created", async () => {
    rmSync(aiDir, { recursive: true, force: true });
    try {
      const res = await postInstall("transcription");

      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toMatch(/Unable to acquire the AI install lock/);
      expect(hoisted.spawnMock).not.toHaveBeenCalled();

      const row = await getBundleRow("transcription");
      expect(row?.status).toBe("error");
      expect(row?.error).toMatch(/Unable to acquire the AI install lock/);
      expect(queue.peekQueue()).toBeNull();
    } finally {
      mkdirSync(modelsDir, { recursive: true });
      writeFileSync(installedPath, JSON.stringify({ bundles: {} }), "utf-8");
      invalidateCache();
    }
  });

  it("fails a queued install when the mutation epoch becomes unreadable", async () => {
    const epochPath = join(aiDir, "install-mutation.epoch");
    const first = await postInstall("transcription");
    expect(first.statusCode).toBe(202);
    await waitFor(() => hoisted.spawnCalls.length === 1);

    const second = await postInstall("face-detection");
    expect(second.statusCode).toBe(202);
    expect(JSON.parse(second.body).queued).toBe(true);

    // Corrupt the epoch inode: O_NOFOLLOW refuses to open a symlink.
    rmSync(epochPath, { force: true });
    symlinkSync(join(testRoot, "missing-epoch-target"), epochPath);
    try {
      hoisted.spawnCalls[0].emit("close", 0);
      await waitFor(() => queue.getActiveBundleId() === null && queue.peekQueue() === null, 3_000);

      expect(hoisted.spawnCalls).toHaveLength(1);
      const row = await getBundleRow("face-detection");
      expect(row?.status).toBe("error");
      expect(row?.error).toMatch(/too many symbolic links|ELOOP/i);
      await waitForLeaseFree();
    } finally {
      rmSync(epochPath, { force: true });
    }
  });

  // ── Deferred OCR generation cleanup ──────────────────────────────

  it("defers OCR generation cleanup and retries until the shared lease frees", async () => {
    const captured: Array<{ handler: () => void; ms: number | undefined }> = [];
    const fakeTimer = { ref: () => {}, unref: () => {} } as unknown as NodeJS.Timeout;
    const realSetTimeout = globalThis.setTimeout.bind(globalThis) as (
      handler: (...cbArgs: unknown[]) => void,
      ms?: number,
      ...cbArgs: unknown[]
    ) => NodeJS.Timeout;
    // Intercept only the cleanup delays (6min sweep, 1s retry); everything
    // else (waitFor's polling and friends) keeps the real setTimeout.
    vi.stubGlobal(
      "setTimeout",
      (handler: (...cbArgs: unknown[]) => void, ms?: number, ...cbArgs: unknown[]) => {
        if (ms === 360_000 || ms === 1_000) {
          captured.push({ handler: handler as () => void, ms });
          return fakeTimer;
        }
        return realSetTimeout(handler, ms, ...cbArgs);
      },
    );

    try {
      const res = await postUninstall("ocr");
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true });
      expect(hoisted.drainOcrDispatcherMock).toHaveBeenCalled();
      expect(captured).toHaveLength(1);
      expect(captured[0].ms).toBe(360_000);

      // Sweep 1: lease held elsewhere, so the sweep reschedules a short retry.
      expect(acquireInstallLock("__hold__")).toBe(true);
      captured[0].handler();
      expect(captured).toHaveLength(2);
      expect(captured[1].ms).toBe(1_000);
      releaseInstallLock();

      // Sweep 2: lease acquisition blows up (AI dir vanished); the sweep
      // reschedules a full-delay retry instead of crashing.
      rmSync(aiDir, { recursive: true, force: true });
      captured[1].handler();
      expect(captured).toHaveLength(3);
      expect(captured[2].ms).toBe(360_000);
      mkdirSync(modelsDir, { recursive: true });
      writeFileSync(installedPath, JSON.stringify({ bundles: {} }), "utf-8");
      invalidateCache();

      // Sweep 3: maintenance fails; reschedule again and free the lease.
      const gcCalls = () =>
        hoisted.runOcrRuntimeMaintenanceMock.mock.calls.filter(([action]) => action === "gc")
          .length;
      const gcCallsBefore = gcCalls();
      hoisted.runOcrRuntimeMaintenanceMock.mockRejectedValueOnce(new Error("gc failed"));
      captured[2].handler();
      expect(gcCalls()).toBe(gcCallsBefore + 1);
      await waitFor(() => captured.length === 4);
      await waitForLeaseFree();

      // Sweep 4: maintenance succeeds; the lease frees and no retry remains.
      captured[3].handler();
      await waitFor(() => gcCalls() === gcCallsBefore + 2);
      await waitForLeaseFree();
      expect(captured).toHaveLength(4);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
