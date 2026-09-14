/**
 * Integration tests for POST /api/v1/admin/features/reset at the HTTP route
 * level: wipes the AI venv/models/pip-cache and resets installed.json, so
 * existing installs stuck with a stale/conflicting venv (uninstall alone only
 * removes model weights, never the shared site-packages) have a reliable way
 * to get back to a clean slate rather than overlaying corrected files on top
 * of stale ones.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  shutdownDispatcherMock: vi.fn(),
  drainOcrDispatcherMock: vi.fn(async () => {}),
  runOcrRuntimeMaintenanceMock: vi.fn(async () => ({ deactivatedFamilies: 1 })),
  // null runs the real reset; a boolean stands in for an environment this
  // runner is not (the official image, which can reseed).
  venvReseededOverride: null as boolean | null,
}));

vi.mock("../../../apps/api/src/lib/feature-status.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/feature-status.js")>();
  return {
    ...actual,
    resetAiEnvironment: (options?: Parameters<typeof actual.resetAiEnvironment>[0]) => {
      const result = actual.resetAiEnvironment(options);
      return hoisted.venvReseededOverride === null
        ? result
        : { venvReseeded: hoisted.venvReseededOverride };
    },
  };
});

vi.mock("@snapotter/ai", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    shutdownDispatcher: hoisted.shutdownDispatcherMock,
    drainOcrDispatcher: hoisted.drainOcrDispatcherMock,
  };
});

vi.mock("../../../apps/api/src/lib/ocr-runtime-install.js", () => ({
  cleanupDownloadedRuntimeRelease: vi.fn(),
  downloadVerifiedRuntimeRelease: vi.fn(),
  loadOcrRuntimeTrustKeys: vi.fn(),
  purgeOcrRuntimeDownloads: vi.fn(),
  runOcrRuntimeInstaller: vi.fn(),
  runOcrRuntimeMaintenance: hoisted.runOcrRuntimeMaintenanceMock,
  waitWithOcrRuntimeHeartbeat: async <T>(operation: Promise<T>) => operation,
}));

// ── Temp DATA_DIR before importing feature-status ────────────────
const testRoot = join(tmpdir(), `snapotter-feature-reset-${randomUUID()}`);
const aiDir = join(testRoot, "ai");
const modelsDir = join(aiDir, "models");
const venvDir = join(aiDir, "venv");
const installedPath = join(aiDir, "installed.json");
const lockPath = join(aiDir, "install.lock");

process.env.DATA_DIR = testRoot;
// Point at the real manifest so isManagedAiEnvironment() is true and
// ensureAiDirs() actually recreates the skeleton after a reset.
process.env.FEATURE_MANIFEST_PATH = join(process.cwd(), "docker/feature-manifest.json");

mkdirSync(modelsDir, { recursive: true });
writeFileSync(installedPath, JSON.stringify({ bundles: {} }), "utf-8");

const {
  markInstalled,
  invalidateCache,
  releaseInstallLock,
  acquireInstallLock,
  getAiMutationEpoch,
} = await import("../../../apps/api/src/lib/feature-status.js");
const { loginAsAdmin } = await import("../test-server.js");

describe("POST /api/v1/admin/features/reset", () => {
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
    try {
      releaseInstallLock();
    } catch {
      // no lock held
    }
    writeFileSync(installedPath, JSON.stringify({ bundles: {} }), "utf-8");
    invalidateCache();
    hoisted.shutdownDispatcherMock.mockClear();
    hoisted.drainOcrDispatcherMock.mockClear();
    hoisted.runOcrRuntimeMaintenanceMock.mockClear();
  });

  afterEach(() => {
    try {
      releaseInstallLock();
    } catch {
      // no lock held
    }
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  async function postReset() {
    return app.inject({ method: "POST", url: "/api/v1/admin/features/reset", headers: auth() });
  }

  async function postOcrUninstall() {
    return app.inject({
      method: "POST",
      url: "/api/v1/admin/features/ocr/uninstall",
      headers: auth(),
    });
  }

  it("requires auth", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/admin/features/reset" });
    expect(res.statusCode).toBe(401);
  });

  it("wipes models and installed.json, and returns ok", async () => {
    markInstalled("ocr", "2.0.0", ["paddleocr-server-det"]);
    writeFileSync(join(modelsDir, "leftover.onnx"), "stale weights");

    const epochBefore = getAiMutationEpoch();
    const res = await postReset();

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, venvReseeded: false });
    expect(existsSync(join(modelsDir, "leftover.onnx"))).toBe(false);
    const installed = JSON.parse(readFileSync(installedPath, "utf-8"));
    expect(installed.bundles).toEqual({});
    expect(getAiMutationEpoch()).not.toBe(epochBefore);
  });

  it("reports a reseeded venv when the environment can rebuild one", async () => {
    // Guards the route wiring: without it, dropping the destructuring leaves
    // venvReseeded permanently false and every official-image reset reports
    // itself as partial.
    hoisted.venvReseededOverride = true;
    try {
      const res = await postReset();

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true, venvReseeded: true });
    } finally {
      hoisted.venvReseededOverride = null;
    }
  });

  it("keeps the shared venv when there is no baked base to reseed from", async () => {
    // Tests run outside the official image, so this is the native-install path
    // (issue #796): the interpreter the next install spawns has to survive a
    // reset, or that install dies with "spawn <venv>/bin/python3 ENOENT".
    const venvPython = join(venvDir, "bin", "python3");
    mkdirSync(join(venvDir, "bin"), { recursive: true });
    writeFileSync(venvPython, "#!/bin/sh\n");

    const res = await postReset();

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).venvReseeded).toBe(false);
    expect(existsSync(venvPython)).toBe(true);
  });

  it("drains accurate OCR before GC so in-flight work completes", async () => {
    await postReset();
    expect(hoisted.shutdownDispatcherMock).toHaveBeenCalled();
    expect(hoisted.drainOcrDispatcherMock).toHaveBeenCalled();
    expect(hoisted.runOcrRuntimeMaintenanceMock.mock.calls).toEqual([
      ["reset", expect.objectContaining({ aiDataDir: aiDir, installLockFd: expect.any(Number) })],
      ["gc", expect.objectContaining({ aiDataDir: aiDir, installLockFd: expect.any(Number) })],
    ]);
    expect(hoisted.runOcrRuntimeMaintenanceMock.mock.invocationCallOrder[0]).toBeLessThan(
      hoisted.drainOcrDispatcherMock.mock.invocationCallOrder[0],
    );
    expect(hoisted.drainOcrDispatcherMock.mock.invocationCallOrder[0]).toBeLessThan(
      hoisted.runOcrRuntimeMaintenanceMock.mock.invocationCallOrder[1],
    );
  });

  it("deactivates shared OCR routing before draining uninstall executions", async () => {
    const epochBefore = getAiMutationEpoch();
    const response = await postOcrUninstall();

    expect(response.statusCode).toBe(200);
    expect(hoisted.runOcrRuntimeMaintenanceMock.mock.calls).toEqual([
      [
        "deactivate",
        expect.objectContaining({ aiDataDir: aiDir, installLockFd: expect.any(Number) }),
      ],
      ["gc", expect.objectContaining({ aiDataDir: aiDir, installLockFd: expect.any(Number) })],
    ]);
    expect(hoisted.runOcrRuntimeMaintenanceMock.mock.invocationCallOrder[0]).toBeLessThan(
      hoisted.drainOcrDispatcherMock.mock.invocationCallOrder[0],
    );
    expect(hoisted.drainOcrDispatcherMock.mock.invocationCallOrder[0]).toBeLessThan(
      hoisted.runOcrRuntimeMaintenanceMock.mock.invocationCallOrder[1],
    );
    expect(getAiMutationEpoch()).not.toBe(epochBefore);
  });

  it("serializes legacy bundle uninstall and invalidates older queued work", async () => {
    markInstalled("transcription", "2.1.0", []);
    const epochBefore = getAiMutationEpoch();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/features/transcription/uninstall",
      headers: auth(),
    });

    expect(response.statusCode).toBe(200);
    expect(getAiMutationEpoch()).not.toBe(epochBefore);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("returns 409 instead of tearing anything down when a bundle install is in progress", async () => {
    markInstalled("ocr", "2.0.0", ["paddleocr-server-det"]);
    acquireInstallLock("ocr");

    const res = await postReset();

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/install.*progress/i);
    // Nothing torn down: the bundle is still marked installed.
    const installed = JSON.parse(readFileSync(installedPath, "utf-8"));
    expect(installed.bundles).toHaveProperty("ocr");
    expect(existsSync(lockPath)).toBe(true);
  });
});
