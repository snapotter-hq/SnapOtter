/**
 * Integration tests for the Object Eraser "High Quality" (diffusion) gate.
 *
 * erase-object always requires its base bundle (object-eraser-colorize, LaMa).
 * The optional qualityMode=hq additionally requires the inpaint-hq bundle. The
 * route must 501 loudly for the missing HQ pack (never silently fall back to
 * the fast path), while qualityMode=fast keeps working with only the base
 * bundle installed.
 *
 * DATA_DIR is set to an isolated temp dir BEFORE importing feature-status (it
 * reads DATA_DIR at module load) so we control which bundles read as installed.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testRoot = join(tmpdir(), `snapotter-erase-hq-guard-${randomUUID()}`);
const aiDir = join(testRoot, "ai");
const installedPath = join(aiDir, "installed.json");

process.env.DATA_DIR = testRoot;
process.env.FEATURE_MANIFEST_PATH = join(process.cwd(), "docker/feature-manifest.json");

mkdirSync(join(aiDir, "models"), { recursive: true });
writeFileSync(installedPath, JSON.stringify({ bundles: {} }), "utf-8");

const { invalidateCache } = await import("../../../../apps/api/src/lib/feature-status.js");
const { fixtures, readFixture } = await import("../../../fixtures/index.js");
const { buildTestApp, createMultipartPayload, loginAsAdmin } = await import("../../test-server.js");

type TestAppType = Awaited<ReturnType<typeof buildTestApp>>;

const PNG = readFixture(fixtures.image.base.png200);

let testApp: TestAppType;
let app: TestAppType["app"];
let adminToken: string;

function setInstalled(bundleIds: string[]): void {
  const bundles: Record<string, { version: string; installedAt: string; models: string[] }> = {};
  for (const id of bundleIds) {
    bundles[id] = { version: "1.0.0-test", installedAt: "2026-01-01T00:00:00.000Z", models: [] };
  }
  writeFileSync(installedPath, JSON.stringify({ bundles }), "utf-8");
  invalidateCache();
}

async function postErase(qualityMode: "fast" | "hq") {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    { name: "mask", filename: "mask.png", contentType: "image/png", content: PNG },
    { name: "qualityMode", content: qualityMode },
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/tools/image/erase-object",
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

describe("Object Eraser HQ (inpaint-hq) feature gate", () => {
  it("501s naming the base bundle when nothing is installed", async () => {
    setInstalled([]);
    const res = await postErase("fast");
    expect(res.statusCode).toBe(501);
    const json = JSON.parse(res.body);
    expect(json.code).toBe("FEATURE_NOT_INSTALLED");
    expect(json.feature).toBe("object-eraser-colorize");
  });

  it("501s naming inpaint-hq when HQ is requested but only the base is installed", async () => {
    setInstalled(["object-eraser-colorize"]);
    const res = await postErase("hq");
    expect(res.statusCode).toBe(501);
    const json = JSON.parse(res.body);
    expect(json.code).toBe("FEATURE_NOT_INSTALLED");
    expect(json.feature).toBe("inpaint-hq");
    expect(json.featureName).toBe("High-Quality Inpainting");
  });

  it("accepts fast mode with only the base bundle installed (no HQ needed)", async () => {
    setInstalled(["object-eraser-colorize"]);
    const res = await postErase("fast");
    // The route enqueues and returns 202; it never 501s in fast mode.
    expect(res.statusCode).not.toBe(501);
    expect(res.statusCode).toBe(202);
  });

  it("accepts HQ mode once both the base and inpaint-hq bundles are installed", async () => {
    setInstalled(["object-eraser-colorize", "inpaint-hq"]);
    const res = await postErase("hq");
    expect(res.statusCode).not.toBe(501);
    expect(res.statusCode).toBe(202);
  });
});
