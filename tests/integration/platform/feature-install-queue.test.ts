/**
 * Integration tests for the server-side feature-install queue at the HTTP route
 * level.
 *
 * The installer child process (spawn) and the venv lock (@snapotter/ai) are
 * mocked so no real Python runs: spawn returns a controllable fake child we can
 * drive with emit("close"). This lets us assert the route contract
 * deterministically -- a second concurrent install is queued (202 { queued:
 * true }) instead of rejected, the next queued bundle auto-starts when the
 * running one finishes, and a bundle queued while an import holds the lock
 * starts once the import route releases it.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    stdout: ReturnType<typeof makeEmitter>;
    stderr: ReturnType<typeof makeEmitter>;
    on: (event: string, cb: (...a: unknown[]) => void) => unknown;
    emit: (event: string, ...args: unknown[]) => void;
  }

  const spawnCalls: FakeChild[] = [];
  const spawnMock = vi.fn((_cmd: string, args: string[]) => {
    const base = makeEmitter() as unknown as FakeChild;
    base.bundleId = args[1];
    base.stdout = makeEmitter();
    base.stderr = makeEmitter();
    spawnCalls.push(base);
    return base;
  });

  const acquireVenvLockMock = vi.fn(async () => () => {});
  const shutdownDispatcherMock = vi.fn();

  return { spawnCalls, spawnMock, acquireVenvLockMock, shutdownDispatcherMock };
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
    shutdownDispatcher: hoisted.shutdownDispatcherMock,
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
const { acquireInstallLock, releaseInstallLock, invalidateCache } = await import(
  "../../../apps/api/src/lib/feature-status.js"
);
const queue = await import("../../../apps/api/src/lib/feature-install-queue.js");
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
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  async function postInstall(bundleId: string) {
    return app.inject({
      method: "POST",
      url: `/api/v1/admin/features/${bundleId}/install`,
      headers: auth(),
    });
  }

  async function getFeatures() {
    const res = await app.inject({ method: "GET", url: "/api/v1/features", headers: auth() });
    return JSON.parse(res.body).bundles as Array<{ id: string; status: string }>;
  }

  it("first install starts immediately (queued: false) and spawns once", async () => {
    const res = await postInstall("ocr");
    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.queued).toBe(false);
    expect(typeof body.jobId).toBe("string");

    await waitFor(() => hoisted.spawnCalls.length === 1);
    expect(hoisted.spawnCalls[0].bundleId).toBe("ocr");
  });

  it("a concurrent install is queued (202 queued: true) and does NOT spawn a second process", async () => {
    const r1 = await postInstall("ocr");
    expect(JSON.parse(r1.body).queued).toBe(false);
    await waitFor(() => hoisted.spawnCalls.length === 1);

    const r2 = await postInstall("face-detection");
    expect(r2.statusCode).toBe(202);
    expect(JSON.parse(r2.body).queued).toBe(true);

    // Give any (incorrect) spawn a chance to fire; it must not.
    await tick();
    expect(hoisted.spawnCalls.length).toBe(1);

    const bundles = await getFeatures();
    expect(bundles.find((b) => b.id === "ocr")?.status).toBe("installing");
    expect(bundles.find((b) => b.id === "face-detection")?.status).toBe("queued");
  });

  it("dedups a duplicate install POST of the active bundle (no second entry, same job)", async () => {
    const r1 = await postInstall("ocr");
    const jobId1 = JSON.parse(r1.body).jobId;
    await waitFor(() => hoisted.spawnCalls.length === 1);

    // POST the SAME bundle again while it is active.
    const r2 = await postInstall("ocr");
    expect(r2.statusCode).toBe(202);
    const body2 = JSON.parse(r2.body);
    expect(body2.queued).toBe(false);
    // Returns the in-flight job id, not a new one.
    expect(body2.jobId).toBe(jobId1);

    await tick();
    expect(hoisted.spawnCalls.length).toBe(1);
  });

  it("auto-starts the next queued bundle when the running install finishes", async () => {
    await postInstall("ocr");
    await waitFor(() => hoisted.spawnCalls.length === 1);
    const r2 = await postInstall("face-detection");
    expect(JSON.parse(r2.body).queued).toBe(true);

    // The running install (ocr) finishes successfully.
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

  it("a bundle queued while an import holds the lock starts after the import route releases it", async () => {
    // Simulate an offline import in progress by holding the install lock.
    expect(acquireInstallLock("__import__")).toBe(true);

    const res = await postInstall("ocr");
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).queued).toBe(true);

    // pump() could not acquire the held lock, so nothing spawned.
    await tick();
    expect(hoisted.spawnCalls.length).toBe(0);
    const queuedBundles = await getFeatures();
    expect(queuedBundles.find((b) => b.id === "ocr")?.status).toBe("queued");

    // The import finishes and releases the lock; a subsequent import request's
    // `finally { pump() }` then picks up the still-queued bundle.
    releaseInstallLock();

    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "bad.tar.gz",
        contentType: "application/gzip",
        content: Buffer.from("not a real tarball"),
      },
    ]);
    const importRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/features/import",
      headers: { ...auth(), "content-type": contentType },
      payload: body,
    });
    expect(importRes.statusCode).toBeGreaterThanOrEqual(400);

    // The import route's finally pumped the queue -> ocr now installs.
    await waitFor(() => hoisted.spawnCalls.length === 1);
    expect(hoisted.spawnCalls[0].bundleId).toBe("ocr");

    // Cleanup.
    hoisted.spawnCalls[0].emit("close", 0);
    await waitFor(() => queue.getActiveBundleId() === null);
  });
});
