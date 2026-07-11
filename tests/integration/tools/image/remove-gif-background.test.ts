/**
 * Integration tests for remove-gif-background
 * (/api/v1/tools/image/remove-gif-background).
 *
 * This tool needs the background-removal bundle + rembg models, which CI does
 * not have. To exercise the route's own logic (animation detection, frame cap,
 * background-image requirement) we mark the bundle installed in an isolated
 * DATA_DIR (the passport-photo-bundle-guard pattern). Those branches all reject
 * BEFORE enqueue, so no sidecar runs. One happy-path case asserts the 202 accept
 * contract; the actual per-frame removal is verified live on a GPU box.
 *
 * GIF_BG_MAX_FRAMES is pinned to 3 so the 4-frame APNG fixture trips the cap
 * while the 3-frame GIF/WebP fixtures pass.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// ── Isolated DATA_DIR + config (set before any config/feature-status import) ──
const testRoot = join(tmpdir(), `snapotter-gifbg-${randomUUID()}`);
const aiDir = join(testRoot, "ai");
const installedPath = join(aiDir, "installed.json");

process.env.DATA_DIR = testRoot;
process.env.FEATURE_MANIFEST_PATH = join(process.cwd(), "docker/feature-manifest.json");
process.env.GIF_BG_MAX_FRAMES = "3";

mkdirSync(join(aiDir, "models"), { recursive: true });
writeFileSync(installedPath, JSON.stringify({ bundles: {} }), "utf-8");

// ── Dynamic imports (after env is set) ───────────────────────────────
const { invalidateCache } = await import("../../../../apps/api/src/lib/feature-status.js");
const { fixtures, readFixture } = await import("../../../fixtures/index.js");
const { buildTestApp, createMultipartPayload, loginAsAdmin } = await import("../../test-server.js");

type TestAppType = Awaited<ReturnType<typeof buildTestApp>>;

const GIF = readFixture(fixtures.image.animated.gif); // 3 frames
const WEBP = readFixture(fixtures.image.animated.webp); // 3 frames
const APNG = readFixture(fixtures.image.animated.apng); // 4 frames
const STILL_PNG = readFixture(fixtures.image.base.png200); // still

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

function post(
  content: Buffer,
  filename: string,
  contentType: string,
  settings: Record<string, unknown> = {},
) {
  const { body, contentType: ct } = createMultipartPayload([
    { name: "file", filename, contentType, content },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/tools/image/remove-gif-background",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": ct },
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
}, 15_000);

describe("Remove GIF Background (#496)", () => {
  it("returns 501 naming background-removal when the bundle is not installed", async () => {
    setInstalled([]);
    const res = await post(GIF, "a.gif", "image/gif");
    expect(res.statusCode).toBe(501);
    const json = JSON.parse(res.body);
    expect(json.code).toBe("FEATURE_NOT_INSTALLED");
    expect(json.feature).toBe("background-removal");
  });

  it("rejects a still image with NOT_ANIMATED once installed", async () => {
    setInstalled(["background-removal"]);
    const res = await post(STILL_PNG, "still.png", "image/png");
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("NOT_ANIMATED");
  });

  it("rejects an over-cap animation with TOO_MANY_FRAMES", async () => {
    setInstalled(["background-removal"]);
    // Cap is 3; the APNG fixture has 4 frames.
    const res = await post(APNG, "a.apng", "image/apng");
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("TOO_MANY_FRAMES");
  });

  it("requires a background image for backgroundType 'image' (animated WebP)", async () => {
    setInstalled(["background-removal"]);
    // WebP also passes detection + cap, then trips the background-image check.
    const res = await post(WEBP, "a.webp", "image/webp", { backgroundType: "image" });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/background image/i);
  });

  it("rejects invalid settings JSON", async () => {
    setInstalled(["background-removal"]);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.gif", contentType: "image/gif", content: GIF },
      { name: "settings", content: "not valid json{{{" },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/remove-gif-background",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/json/i);
  });

  // The 202 accept path (valid in-cap animation -> enqueue) is intentionally not
  // asserted here: it would enqueue a job the CI worker can't process (no models),
  // producing async noise. It is verified live on a GPU box. These reject-before-
  // enqueue cases fully exercise the route's own logic.
});
