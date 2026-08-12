/**
 * Pipeline sync-wait expiry answers the async contract (#766).
 *
 * Both pipeline routes used to answer a fake 422 "timed out" while the flow
 * kept running. Since #750 the terminal SSE frame carries everything a client
 * needs to settle (the single frame's result for /execute, the durable ZIP's
 * downloadUrl for /batch), so expiry now degrades to `202 {jobId, async}`
 * exactly like the tool routes. The real windows (10 and 30 minutes) cannot
 * be reached in a test, so waitForJob is swapped for a passthrough that
 * returns null for designated job ids.
 */

import { randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sharedRedis } from "../../../apps/api/src/jobs/connection.js";
import { getQueue } from "../../../apps/api/src/jobs/queues.js";
import { bullPrefix } from "../../../apps/api/src/jobs/types.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

// /execute waits under a server-generated job id the test cannot know, so
// the expiry is keyed on the pool the wait runs against instead: "image" for
// a resize pipeline's finalize, "system" for the batch finalize. Each test
// arms its pool inside try/finally; the file is isolated, so nothing else
// waits on those pools meanwhile.
const enqueueMock = vi.hoisted(() => ({ timeoutPools: new Set<string>() }));

vi.mock("../../../apps/api/src/jobs/enqueue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/jobs/enqueue.js")>();
  return {
    ...actual,
    waitForJob: async (...args: Parameters<typeof actual.waitForJob>) => {
      if (enqueueMock.timeoutPools.has(args[0])) return null;
      return actual.waitForJob(...args);
    },
  };
});

const PNG = readFixture(fixtures.image.base.png200);
const JPG = readFixture(fixtures.image.base.jpg100);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

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

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("pipeline sync-wait expiry (#766)", () => {
  it("execute answers 202 and the terminal single frame still delivers the result", async () => {
    const clientJobId = randomUUID();
    enqueueMock.timeoutPools.add("image");
    try {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
        {
          name: "pipeline",
          content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
        },
        { name: "clientJobId", content: clientJobId },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
        body,
      });

      expect(res.statusCode).toBe(202);
      expect(JSON.parse(res.body)).toEqual({ jobId: clientJobId, async: true });

      // The flow does not care about the response: the finalize publishes
      // the terminal single frame whose result the client settles from.
      const frame = await waitForTerminalFrame(clientJobId);
      expect(frame.type).toBe("single");
      expect(frame.phase).toBe("complete");
      const result = frame.result as Record<string, unknown>;
      const download = await app.inject({
        method: "GET",
        url: String(result.downloadUrl),
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(download.statusCode).toBe(200);
      expect(download.rawPayload.length).toBeGreaterThan(0);
    } finally {
      enqueueMock.timeoutPools.delete("image");
    }
  }, 60_000);

  it("batch answers 202 and the terminal batch frame still delivers the durable ZIP", async () => {
    const clientJobId = randomUUID();
    enqueueMock.timeoutPools.add("system");
    try {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
        { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
        {
          name: "pipeline",
          content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
        },
        { name: "clientJobId", content: clientJobId },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/batch",
        headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
        body,
      });

      expect(res.statusCode).toBe(202);
      expect(JSON.parse(res.body)).toEqual({ jobId: clientJobId, async: true });

      const frame = await waitForTerminalFrame(clientJobId);
      expect(frame.type).toBe("batch");
      expect(frame.status).toBe("completed");
      const result = frame.result as Record<string, unknown>;
      const download = await app.inject({
        method: "GET",
        url: String(result.downloadUrl),
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(download.statusCode).toBe(200);
      expect(new AdmZip(download.rawPayload).getEntries()).toHaveLength(2);

      // Drift pin for ignoreDependencyOnFailure: its behavior (a stall-
      // evicted node not wedging its parent) needs an evicted lock-holder,
      // which an in-process test cannot produce, so pin the wiring instead.
      // Steps and per-file finalize roots carry the flag; the batch parent
      // does not (it has no parent to unwedge).
      const step = await getQueue("image").getJob(`${clientJobId}-f0-s0`);
      expect(step?.opts.ignoreDependencyOnFailure).toBe(true);
      const perFileFinalize = await getQueue("image").getJob(`${clientJobId}-f0`);
      expect(perFileFinalize?.opts.ignoreDependencyOnFailure).toBe(true);
      const batchParent = await getQueue("system").getJob(clientJobId);
      expect(batchParent?.opts.ignoreDependencyOnFailure ?? false).toBe(false);
    } finally {
      enqueueMock.timeoutPools.delete("system");
    }
  }, 60_000);

  it("execute without a clientJobId answers 202 under the id its frames publish on", async () => {
    enqueueMock.timeoutPools.add("image");
    try {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
        {
          name: "pipeline",
          content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
        },
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/pipeline/execute",
        headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
        body,
      });

      expect(res.statusCode).toBe(202);
      const parsed = JSON.parse(res.body) as { jobId: string; async: boolean };
      expect(parsed.async).toBe(true);
      expect(parsed.jobId.length).toBeGreaterThan(0);

      // The two `clientJobId ?? jobId` sites (frame channel and 202 body)
      // must never drift apart: an API consumer subscribes to the body's id.
      const frame = await waitForTerminalFrame(parsed.jobId);
      expect(frame.type).toBe("single");
      expect(frame.phase).toBe("complete");
    } finally {
      enqueueMock.timeoutPools.delete("image");
    }
  }, 60_000);
});
