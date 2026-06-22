/**
 * Deterministic integration tests for the passport-photo feature guard.
 *
 * passport-photo needs TWO bundles: background-removal (its primary) and
 * face-detection (for face-landmark detection). Installing only one must not
 * let the request through to a late "feature_not_installed" from the Python
 * dispatcher gate. This is the bug from issue #327.
 *
 * DATA_DIR is set to an isolated temp dir BEFORE importing feature-status (it
 * reads DATA_DIR at module load), so we can control exactly which bundles are
 * "installed" by writing installed.json. All app/feature-status imports are
 * dynamic so the env is set first.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// ── Isolated DATA_DIR (must be set before any feature-status import) ──
const testRoot = join(tmpdir(), `snapotter-passport-guard-${randomUUID()}`);
const aiDir = join(testRoot, "ai");
const installedPath = join(aiDir, "installed.json");

process.env.DATA_DIR = testRoot;
process.env.FEATURE_MANIFEST_PATH = join(process.cwd(), "docker/feature-manifest.json");

mkdirSync(join(aiDir, "models"), { recursive: true });
writeFileSync(installedPath, JSON.stringify({ bundles: {} }), "utf-8");

// ── Dynamic imports (after env is set) ───────────────────────────────
const { invalidateCache } = await import("../../../../apps/api/src/lib/feature-status.js");
const { fixtures, readFixture } = await import("../../../fixtures/index.js");
const { buildTestApp, createMultipartPayload, loginAsAdmin } = await import("../../test-server.js");

type TestAppType = Awaited<ReturnType<typeof buildTestApp>>;

const PNG = readFixture(fixtures.image.base.png200);

let testApp: TestAppType;
let app: TestAppType["app"];
let adminToken: string;

/** Overwrite installed.json so exactly the given bundles read as installed. */
function setInstalled(bundleIds: string[]): void {
  const bundles: Record<string, { version: string; installedAt: string; models: string[] }> = {};
  for (const id of bundleIds) {
    bundles[id] = { version: "1.0.0-test", installedAt: "2026-01-01T00:00:00.000Z", models: [] };
  }
  writeFileSync(installedPath, JSON.stringify({ bundles }), "utf-8");
  invalidateCache();
}

async function postAnalyze() {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/tools/image/passport-photo/analyze",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
  rmSync(testRoot, { recursive: true, force: true });
}, 10_000);

describe("passport-photo feature guard (#327)", () => {
  it("returns 501 naming the primary bundle when nothing is installed", async () => {
    setInstalled([]);
    const res = await postAnalyze();
    expect(res.statusCode).toBe(501);
    const json = JSON.parse(res.body);
    expect(json.code).toBe("FEATURE_NOT_INSTALLED");
    expect(json.feature).toBe("background-removal");
  });

  it("returns 501 naming face-detection when only background-removal is installed", async () => {
    // The exact reporter scenario: Background Removal installed, the analyze
    // step still needs Face Detection for face landmarks.
    setInstalled(["background-removal"]);
    const res = await postAnalyze();
    expect(res.statusCode).toBe(501);
    const json = JSON.parse(res.body);
    expect(json.code).toBe("FEATURE_NOT_INSTALLED");
    expect(json.feature).toBe("face-detection");
    expect(json.featureName).toBe("Face Detection");
  });

  it("does not 501 once both required bundles are installed", async () => {
    setInstalled(["background-removal", "face-detection"]);
    const res = await postAnalyze();
    // With both bundles marked installed the guard passes; the request then
    // succeeds (200) or fails downstream in the sidecar (422), but never 501.
    expect(res.statusCode).not.toBe(501);
    expect([200, 422]).toContain(res.statusCode);
  }, 60_000);

  it("base route also reports face-detection when only background-removal is installed", async () => {
    setInstalled(["background-removal"]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(501);
    const json = JSON.parse(res.body);
    expect(json.feature).toBe("face-detection");
  });
});
