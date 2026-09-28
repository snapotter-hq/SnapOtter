/**
 * Async (202 + terminal SSE frame) result URLs under a subpath deployment
 * (#1297).
 *
 * base-path.test.ts covers the sync tool envelope, but a 202 client settles
 * from the terminal frame, whose URLs the worker builds: the legacy result
 * payload for single-file tools and the batch ZIP finalize. per-fork-env
 * floors SYNC_WAIT_MS at 30s, so no fast tool takes this path on its own.
 * waitForJob is swapped for a pool-keyed passthrough (the #766 pattern) that
 * degrades the route to 202 while the real worker still runs and publishes
 * the terminal frame.
 *
 * Result URLs are persisted with the job, so they stay root-relative
 * (/api/v1/download/<jobId>/...) whatever BASE_PATH is (#1274), and the
 * prefixed deployment path must resolve them to the real bytes.
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

// Each test arms its pool inside try/finally; the file is isolated, so
// nothing else waits on those pools meanwhile.
const syncWaitMock = vi.hoisted(() => ({ timeoutPools: new Set<string>() }));
vi.mock("../../../apps/api/src/jobs/enqueue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/jobs/enqueue.js")>();
  return {
    ...actual,
    waitForJob: async (...args: Parameters<typeof actual.waitForJob>) => {
      if (syncWaitMock.timeoutPools.has(args[0])) return null;
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
let originalBasePath: string;

beforeAll(async () => {
  originalBasePath = env.BASE_PATH;
  env.BASE_PATH = basePath;
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  try {
    await testApp?.cleanup();
  } finally {
    env.BASE_PATH = originalBasePath;
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

describe("202 result URLs under a deployment prefix", () => {
  it("settles a 202 tool run with a root-relative downloadUrl that resolves under the prefix", async () => {
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
      expect(accepted.async).toBe(true);
      expect(accepted.jobId).toEqual(expect.any(String));

      // A PNG result is browser-previewable, so no previewUrl is made here;
      // worker.behavior.test.ts pins previewUrl under a prefix.
      const frame = await waitForTerminalFrame(accepted.jobId);
      expect(frame.phase).toBe("complete");
      const result = frame.result as Record<string, unknown>;
      expect(String(result.downloadUrl)).toMatch(
        new RegExp(`^/api/v1/download/${accepted.jobId}/[^/]+$`),
      );

      const download = await app.inject(`${basePath}${result.downloadUrl}`);
      expect(download.statusCode).toBe(200);
      expect(download.headers["content-type"]).toContain("image/png");
      expect(download.rawPayload.length).toBeGreaterThan(0);
    } finally {
      syncWaitMock.timeoutPools.delete("image");
    }
  }, 60_000);

  it("settles a 202 batch with a root-relative ZIP downloadUrl that resolves under the prefix", async () => {
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
      expect(accepted.async).toBe(true);
      expect(accepted.jobId).toEqual(expect.any(String));

      const frame = await waitForTerminalFrame(accepted.jobId);
      expect(frame.type).toBe("batch");
      expect(frame.status).toBe("completed");
      const result = frame.result as Record<string, unknown>;
      expect(String(result.downloadUrl)).toMatch(
        new RegExp(`^/api/v1/download/${accepted.jobId}/[^/]+\\.zip$`),
      );

      const download = await app.inject(`${basePath}${result.downloadUrl}`);
      expect(download.statusCode).toBe(200);
      expect(new AdmZip(download.rawPayload).getEntries()).toHaveLength(2);
    } finally {
      syncWaitMock.timeoutPools.delete("system");
    }
  }, 60_000);
});
