/**
 * Integration tests for offline AI bundle import.
 *
 * Sets DATA_DIR to a temp directory BEFORE importing feature-status (which
 * reads it at module load time), then exercises the importBundleArchive
 * helper and the POST /api/v1/admin/features/import endpoint.
 */
import { randomUUID } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// tar lives in apps/api/node_modules; resolve via createRequire (same
// pattern as tests/global-setup.ts for pg/drizzle).
const apiRequire = createRequire(join(process.cwd(), "apps/api/package.json"));
const tar = apiRequire("tar") as typeof import("tar");

// ── Temp environment for isolated DATA_DIR ───────────────────────
const testRoot = join(tmpdir(), `snapotter-import-test-${randomUUID()}`);
const aiDir = join(testRoot, "ai");
const modelsDir = join(aiDir, "models");
const installedPath = join(aiDir, "installed.json");

// Must be set BEFORE any feature-status import
process.env.DATA_DIR = testRoot;
// Point at the real manifest so bundleId validation passes
process.env.FEATURE_MANIFEST_PATH = join(process.cwd(), "docker/feature-manifest.json");

mkdirSync(modelsDir, { recursive: true });
writeFileSync(installedPath, JSON.stringify({ bundles: {} }), "utf-8");

// ── Dynamic imports (after env is set) ───────────────────────────

const {
  importBundleArchive,
  acquireInstallLock,
  releaseInstallLock,
  invalidateCache,
  ImportLockError,
  ImportValidationError,
} = await import("../../../apps/api/src/lib/feature-status.js");

// Test helpers from test-server
const { createMultipartPayload, loginAsAdmin } = await import("../test-server.js");

// Use face-detection as smallest bundle from the manifest
const testBundleId = "face-detection";
const testVersion = "1.0.0-test";

// ── Helpers ──────────────────────────────────────────────────────

async function buildArchive(
  bundleJson: Record<string, unknown>,
  modelFiles: Array<{ path: string; content: Buffer }>,
): Promise<string> {
  const stagingDir = join(tmpdir(), `snapotter-archive-build-${randomUUID()}`);
  mkdirSync(stagingDir, { recursive: true });

  writeFileSync(join(stagingDir, "bundle.json"), JSON.stringify(bundleJson), "utf-8");

  const entries = ["bundle.json"];
  for (const mf of modelFiles) {
    const dest = join(stagingDir, "models", mf.path);
    mkdirSync(join(dest, ".."), { recursive: true });
    writeFileSync(dest, mf.content);
    entries.push(`models/${mf.path}`);
  }

  const archivePath = join(tmpdir(), `test-bundle-${randomUUID()}.tar.gz`);

  await tar.create({ gzip: true, file: archivePath, cwd: stagingDir }, entries);

  return archivePath;
}

/**
 * Build a traversal archive by creating a file at `../evil/pwned.txt` path.
 * We achieve this by creating the file inside a directory that we then
 * reference with prefix to get `..` in the path.
 */
async function buildTraversalArchive(): Promise<string> {
  const stagingDir = join(tmpdir(), `snapotter-traversal-build-${randomUUID()}`);
  // Create the directory structure: evil/pwned.txt
  // Then tar with prefix "../" so entries become ../evil/pwned.txt
  mkdirSync(join(stagingDir, "evil"), { recursive: true });
  writeFileSync(join(stagingDir, "evil", "pwned.txt"), "hacked");

  const archivePath = join(tmpdir(), `test-traversal-${randomUUID()}.tar.gz`);

  // Use preservePaths to allow ".." in generated paths
  await tar.create(
    {
      gzip: true,
      file: archivePath,
      cwd: stagingDir,
      prefix: "..",
      preservePaths: true,
    },
    ["evil/pwned.txt"],
  );

  return archivePath;
}

/**
 * Build an archive containing a SymbolicLink entry under models/.
 * tar.create preserves symlinks as SymbolicLink entries by default
 * (follow defaults to false).
 */
async function buildSymlinkArchive(): Promise<string> {
  const stagingDir = join(tmpdir(), `snapotter-symlink-build-${randomUUID()}`);
  mkdirSync(join(stagingDir, "models"), { recursive: true });

  // Valid bundle.json so extraction reaches the filter
  writeFileSync(
    join(stagingDir, "bundle.json"),
    JSON.stringify({
      bundleId: testBundleId,
      version: testVersion,
      models: ["evil"],
    }),
    "utf-8",
  );

  // Create a symlink: models/evil -> ../bundle.json
  symlinkSync("../bundle.json", join(stagingDir, "models", "evil"));

  const archivePath = join(tmpdir(), `test-symlink-${randomUUID()}.tar.gz`);
  await tar.create({ gzip: true, file: archivePath, cwd: stagingDir }, [
    "bundle.json",
    "models/evil",
  ]);

  return archivePath;
}

async function createBundleTarWithSitePackages(
  bundleId: string,
  version: string,
  modelFiles: Record<string, string>,
  sitePackageFiles: Record<string, string>,
): Promise<string> {
  const tarDir = join(testRoot, `tar-src-${randomUUID()}`);
  mkdirSync(tarDir, { recursive: true });

  writeFileSync(
    join(tarDir, "bundle.json"),
    JSON.stringify({ bundleId, version, models: Object.keys(modelFiles) }),
  );

  const modelsSubdir = join(tarDir, "models");
  mkdirSync(modelsSubdir, { recursive: true });
  for (const [name, content] of Object.entries(modelFiles)) {
    const modelPath = join(modelsSubdir, name);
    mkdirSync(join(modelPath, ".."), { recursive: true });
    writeFileSync(modelPath, content);
  }

  const spSubdir = join(tarDir, "site-packages");
  mkdirSync(spSubdir, { recursive: true });
  for (const [name, content] of Object.entries(sitePackageFiles)) {
    const spPath = join(spSubdir, name);
    mkdirSync(join(spPath, ".."), { recursive: true });
    writeFileSync(spPath, content);
  }

  const tarPath = join(testRoot, `bundle-${randomUUID()}.tar.gz`);
  await tar.create({ gzip: true, file: tarPath, cwd: tarDir }, ["."]);
  return tarPath;
}

function resetState(): void {
  writeFileSync(installedPath, JSON.stringify({ bundles: {} }), "utf-8");
  invalidateCache();
  try {
    releaseInstallLock();
  } catch {
    // no lock to release
  }
}

// ── Tests ────────────────────────────────────────────────────────

describe("importBundleArchive", () => {
  beforeEach(resetState);

  it("imports a valid bundle archive", async () => {
    const fakeModel = Buffer.alloc(64, 0xab);
    const archivePath = await buildArchive(
      {
        bundleId: testBundleId,
        version: testVersion,
        models: ["fake.bin"],
      },
      [{ path: "fake.bin", content: fakeModel }],
    );

    const stream = createReadStream(archivePath);
    const result = await importBundleArchive(stream);

    expect(result.bundleId).toBe(testBundleId);
    expect(result.version).toBe(testVersion);
    expect(result.models).toEqual(["fake.bin"]);

    // Verify installed.json was updated
    const installed = JSON.parse(readFileSync(installedPath, "utf-8"));
    expect(installed.bundles[testBundleId]).toBeDefined();
    expect(installed.bundles[testBundleId].version).toBe(testVersion);

    // Verify the model file landed in MODELS_DIR
    const modelPath = join(modelsDir, "fake.bin");
    expect(existsSync(modelPath)).toBe(true);
    expect(readFileSync(modelPath)).toEqual(fakeModel);
  });

  it("rejects archive with path traversal", async () => {
    const traversalPath = await buildTraversalArchive();
    const stream = createReadStream(traversalPath);

    await expect(importBundleArchive(stream)).rejects.toThrow(/unsafe archive entry|Blocked/);

    // Verify nothing was written outside the staging dir
    const escapeDest = join(testRoot, "evil", "pwned.txt");
    expect(existsSync(escapeDest)).toBe(false);
  });

  it("rejects archive with unknown bundleId", async () => {
    const archivePath = await buildArchive(
      { bundleId: "nonexistent-bundle", version: "1.0.0", models: [] },
      [],
    );

    const stream = createReadStream(archivePath);
    await expect(importBundleArchive(stream)).rejects.toThrow(/Unknown bundleId/);
  });

  it("rejects archive without bundle.json", async () => {
    const stagingDir = join(tmpdir(), `snapotter-no-bundle-${randomUUID()}`);
    mkdirSync(stagingDir, { recursive: true });
    writeFileSync(join(stagingDir, "random.txt"), "nothing useful");

    const archivePath = join(tmpdir(), `no-bundle-${randomUUID()}.tar.gz`);
    await tar.create({ gzip: true, file: archivePath, cwd: stagingDir }, ["random.txt"]);

    const stream = createReadStream(archivePath);
    await expect(importBundleArchive(stream)).rejects.toThrow(/missing bundle\.json/);
  });

  it("throws ImportLockError when lock is held", async () => {
    const locked = acquireInstallLock("some-bundle");
    expect(locked).toBe(true);

    try {
      const archivePath = await buildArchive(
        { bundleId: testBundleId, version: testVersion, models: [] },
        [],
      );

      const stream = createReadStream(archivePath);
      await expect(importBundleArchive(stream)).rejects.toThrow(ImportLockError);
    } finally {
      releaseInstallLock();
    }
  });

  it("rejects archive containing a SymbolicLink entry", async () => {
    const archivePath = await buildSymlinkArchive();
    const stream = createReadStream(archivePath);

    await expect(importBundleArchive(stream)).rejects.toThrow(/Unsupported entry type/);

    // Verify no symlink landed in MODELS_DIR
    expect(existsSync(join(modelsDir, "evil"))).toBe(false);
  });

  it("rejects bundle.json with traversal in models array", async () => {
    const archivePath = await buildArchive(
      {
        bundleId: testBundleId,
        version: testVersion,
        models: ["../escape.bin"],
      },
      [{ path: "legit.bin", content: Buffer.alloc(16, 0xaa) }],
    );

    const stream = createReadStream(archivePath);
    await expect(importBundleArchive(stream)).rejects.toThrow(ImportValidationError);
    await expect(importBundleArchive(createReadStream(archivePath))).rejects.toThrow(
      /invalid model path/,
    );
  });
});

describe("site-packages import", () => {
  beforeEach(resetState);

  it("extracts site-packages into venv site-packages directory", async () => {
    const venvSitePackages = join(aiDir, "venv", "lib", "python3.12", "site-packages");
    mkdirSync(venvSitePackages, { recursive: true });
    process.env.PYTHON_VENV_PATH = join(aiDir, "venv");

    const tarPath = await createBundleTarWithSitePackages(
      testBundleId,
      testVersion,
      { "mediapipe/face.tflite": "model-data" },
      { "fakepkg/__init__.py": "# fake package" },
    );

    invalidateCache();
    const result = await importBundleArchive(createReadStream(tarPath));
    expect(result.bundleId).toBe(testBundleId);
    expect(existsSync(join(venvSitePackages, "fakepkg", "__init__.py"))).toBe(true);

    delete process.env.PYTHON_VENV_PATH;
  });
});

describe("POST /api/v1/admin/features/import", () => {
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
    await app.register(multipartPlugin, {
      limits: { fileSize: 100 * 1024 * 1024 },
    });
    await app.register(cookie, { secret: "test-cookie-secret", hook: "onRequest" });

    const { authMiddleware, authRoutes, ensureBuiltinRoles, ensureDefaultAdmin } = await import(
      "../../../apps/api/src/plugins/auth.js"
    );
    await authMiddleware(app);
    await authRoutes(app);
    await ensureBuiltinRoles();
    await ensureDefaultAdmin();

    // Clear mustChangePassword for admin
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

  beforeEach(resetState);

  afterAll(async () => {
    if (app) await app.close();
  });

  it("imports a valid bundle via multipart POST", async () => {
    const fakeModel = Buffer.alloc(128, 0xcd);
    const archivePath = await buildArchive(
      {
        bundleId: testBundleId,
        version: testVersion,
        models: ["fake-endpoint.bin"],
      },
      [{ path: "fake-endpoint.bin", content: fakeModel }],
    );

    const archiveBuffer = readFileSync(archivePath);
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test-bundle.tar.gz",
        contentType: "application/gzip",
        content: archiveBuffer,
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/features/import",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${token}`,
      },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const resBody = JSON.parse(res.body);
    expect(resBody.bundleId).toBe(testBundleId);
    expect(resBody.version).toBe(testVersion);

    // Verify installed.json
    const installed = JSON.parse(readFileSync(installedPath, "utf-8"));
    expect(installed.bundles[testBundleId]).toBeDefined();

    // Verify model file
    expect(existsSync(join(modelsDir, "fake-endpoint.bin"))).toBe(true);
  });

  it("returns 400 for invalid archive", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "bad.tar.gz",
        contentType: "application/gzip",
        content: Buffer.from("not a real tarball"),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/features/import",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${token}`,
      },
      payload: body,
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("returns 409 when lock is held", async () => {
    const locked = acquireInstallLock("blocking-bundle");
    expect(locked).toBe(true);

    try {
      const archivePath = await buildArchive(
        { bundleId: testBundleId, version: testVersion, models: [] },
        [],
      );

      const archiveBuffer = readFileSync(archivePath);
      const { body, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "locked.tar.gz",
          contentType: "application/gzip",
          content: archiveBuffer,
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/features/import",
        headers: {
          "content-type": contentType,
          authorization: `Bearer ${token}`,
        },
        payload: body,
      });

      expect(res.statusCode).toBe(409);
    } finally {
      releaseInstallLock();
    }
  });
});
