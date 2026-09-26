/**
 * Async (202 + SSE-terminal) result URLs under a subpath deployment (#1297).
 *
 * The sync tool envelope is covered by base-path.test.ts, but the download
 * URLs in the payloads a 202 client settles from are built by the WORKER
 * (the legacy result payload for single-file tools, the batch ZIP finalize),
 * so only the static drift guard covered them. per-fork-env floors
 * SYNC_WAIT_MS at 30s, so no fast tool takes the async path naturally:
 * waitForJob is swapped for a pool-keyed passthrough (the #766 pattern) that
 * degrades the route to 202 while the REAL worker still runs and publishes
 * the terminal frame.
 *
 * Result URLs are root-relative (#1274): the completion payload is persisted
 * in jobs.result, so it must carry /api/v1/download/<jobId>/... with no baked
 * prefix -- and the prefixed deployment path must resolve it to the bytes.
 */
import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { sharedRedis } from "../../../apps/api/src/jobs/connection.js";
import { bullPrefix } from "../../../apps/api/src/jobs/types.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

// Arm the sync-wait expiry per pool: waitForJob returning null degrades the
// route to 202 {jobId, async} without slowing the job down. File-scoped, so
// each test unarms its pool in finally.
const syncWaitMock = vi.hoisted(() => ({ timeoutPools: new Set<string>() }));
vi.mock("../../../apps/api/src/jobs/enqueue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/jobs/enqueue.js")>();
  return {
    ...actual,
    waitForJob: async (...args: Parameters<typeof actual.waitForJob>) => {
      if (syncWaitMock.timeoutPools.has(String(args[0]))) return null;
      return actual.waitForJob(...args);
    },
  };
});

const basePath = "/snapotter";
const PNG = readFixture(fixtures.image.base.png200);
const JPG = readFixture(fixtures.image.base.jpg100);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  env.BASE_PATH = basePath;
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  try {
    await testApp?.cleanup();
  } finally {
    env.BASE_PATH = "";
  }
}, 10_000);

/** Poll the Redis terminal replay key until the terminal frame appears. */
async function waitForTerminalFrame(
  jobId: string,
  timeoutMs = 30_000,
): Promise<Record<string, unknown>> {
  const key = `${bullPrefix()}:terminal:${jobId}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const raw = await sharedRedis().get(key);
    if (raw) return JSON.parse(raw) as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`No terminal frame for ${jobId} within ${timeoutMs}ms`);
}

// The worker's completion payload must be root-relative AND actually fetch
// through the prefixed deployment path: a baked (or doubled) prefix lands the
// join at a nonexistent route, which the static handler answers with
// index.html -- a 200 status alone would hide that.
describe("202/SSE result URLs under a prefix", () => {
  it("settles a 202 tool run from a terminal frame with a root-relative downloadUrl", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ width: 60 }) },
    ]);
    syncWaitMock.timeoutPools.add("image");
    try {
      const res = await app.inject({
        method: "POST",
        url: `${basePath}/api/v1/tools/image/resize`,
        headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
        body,
      });
      expect(res.statusCode, res.body).toBe(202);
      const accepted = res.json();
      expect(accepted).toEqual({ jobId: accepted.jobId, async: true });

      const frame = await waitForTerminalFrame(accepted.jobId);
      expect(frame.phase).toBe("complete");
      const result = frame.result as Record<string, unknown>;
      // Root-relative (#1274): a prefix baked into the persisted payload
      // strands the stored row when BASE_PATH changes.
      expect(result.downloadUrl).toMatch(/^\/api\/v1\/download\/[^/]+\/[^/]+$/);
      if (result.previewUrl !== undefined) {
        expect(result.previewUrl).toMatch(/^\/api\/v1\/download\/[^/]+\/[^/]+$/);
      }

      // The prefixed deployment path resolves it to actual bytes (not the
      // static index.html a doubled prefix would fall through to).
      const dl = await app.inject({
        method: "GET",
        url: `${basePath}${result.downloadUrl}`,
      });
      expect(dl.statusCode).toBe(200);
      expect(dl.headers["content-type"]).toContain("image/png");
      expect(dl.rawPayload.length).toBeGreaterThan(0);
    } finally {
      syncWaitMock.timeoutPools.delete("image");
    }
  }, 60_000);

  it("anchors the 202 batch ZIP's downloadUrl at the deployment root", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      {
        name: "pipeline",
        content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
      },
    ]);
    syncWaitMock.timeoutPools.add("system");
    try {
      const res = await app.inject({
        method: "POST",
        url: `${basePath}/api/v1/pipeline/batch`,
        headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
        body,
      });
      expect(res.statusCode, res.body).toBe(202);
      const accepted = res.json();
      expect(accepted).toEqual({ jobId: accepted.jobId, async: true });

      const frame = await waitForTerminalFrame(accepted.jobId);
      expect(frame.type).toBe("batch");
      expect(frame.status).toBe("completed");
      const result = frame.result as Record<string, unknown>;
      // The durable ZIP URL is built by the batch finalize: root-relative,
      // never prefixed (#1274/#1297).
      expect(result.downloadUrl).toMatch(/^\/api\/v1\/download\/[^/]+\/[^/]+$/);

      const dl = await app.inject({
        method: "GET",
        url: `${basePath}${result.downloadUrl}`,
      });
      expect(dl.statusCode).toBe(200);
      expect(new AdmZip(dl.rawPayload).getEntries()).toHaveLength(2);
    } finally {
      syncWaitMock.timeoutPools.delete("system");
    }
  }, 60_000);
});
