/**
 * A client-supplied clientJobId must never become a batch's storage or
 * download key. GET /api/v1/download/:jobId/:filename is public (the id is the
 * capability), so a batch keyed by a client-chosen id let anyone who guessed
 * or learned that id fetch the result ZIP. The parent id is server-generated;
 * the client id is only an alias the owner's SSE stream and cancel follow.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { listObjects } from "../../../apps/api/src/lib/object-storage.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import { batchJobIdFor } from "../batch-alias.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  loginAsUser,
  type TestApp,
} from "../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;
let userToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
  userToken = await loginAsUser(app);
});

afterAll(async () => {
  await testApp.cleanup();
});

function postToolBatch(clientJobId: string, token: string) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
    { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    { name: "settings", content: JSON.stringify({ width: 50 }) },
    { name: "clientJobId", content: clientJobId },
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/tools/image/resize/batch",
    headers: { "content-type": contentType, authorization: `Bearer ${token}` },
    body,
  });
}

function postPipelineBatch(clientJobId: string, token: string) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
    { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
    {
      name: "pipeline",
      content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
    },
    { name: "clientJobId", content: clientJobId },
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/pipeline/batch",
    headers: { "content-type": contentType, authorization: `Bearer ${token}` },
    body,
  });
}

function zipFilenameOf(res: { headers: Record<string, unknown> }): string {
  const match = /filename="([^"]+)"/.exec(String(res.headers["content-disposition"]));
  if (!match) throw new Error("no Content-Disposition filename");
  return match[1];
}

/** First batch frame the owner's stream on `id` delivers. */
async function firstBatchFrame(id: string, token: string) {
  const sse = await app.inject({
    method: "GET",
    url: `/api/v1/jobs/${id}/progress`,
    headers: { authorization: `Bearer ${token}` },
    payloadAsStream: true,
  });
  if (sse.statusCode !== 200) return { statusCode: sse.statusCode, frame: null };
  for await (const chunk of sse.stream()) {
    for (const line of Buffer.from(chunk).toString().split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = JSON.parse(line.slice(6)) as Record<string, unknown>;
      // Leaving the loop closes the stream.
      if (data.type === "batch" && data.status === "completed") {
        return { statusCode: 200, frame: data };
      }
    }
  }
  return { statusCode: 200, frame: null };
}

describe.each([
  ["tool batch", postToolBatch],
  ["pipeline batch", postPipelineBatch],
])("%s with a clientJobId", (label, post) => {
  it("stores and serves the result under a server id, not the client's", async () => {
    const clientJobId = `guessable-${label.replace(" ", "-")}-1`;

    const res = await post(clientJobId, adminToken);
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
    // The client keeps correlating by its own id.
    expect(res.headers["x-job-id"]).toBe(clientJobId);

    const batchJobId = await batchJobIdFor(clientJobId);
    expect(batchJobId).toMatch(UUID_RE);
    expect(batchJobId).not.toBe(clientJobId);

    // Nothing is stored under the client's id, so the public download route
    // has nothing to hand to whoever knows it.
    expect(await listObjects(`outputs/${clientJobId}`)).toEqual([]);
    expect(await listObjects(`uploads/${clientJobId}`)).toEqual([]);
    const zipFilename = zipFilenameOf(res);
    const byClientId = await app.inject({
      method: "GET",
      url: `/api/v1/download/${clientJobId}/${encodeURIComponent(zipFilename)}`,
    });
    expect(byClientId.statusCode).toBe(404);

    const [parent] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, batchJobId));
    expect(parent?.type).toBe("batch");
    expect(parent?.outputRefs?.[0]).toBe(`outputs/${batchJobId}/${zipFilename}`);

    // The owner's stream on the client id follows the alias to the result,
    // whose download link names the server id.
    const { frame } = await firstBatchFrame(clientJobId, adminToken);
    const downloadUrl = String((frame?.result as Record<string, unknown>)?.downloadUrl);
    expect(downloadUrl).toBe(`/api/v1/download/${batchJobId}/${encodeURIComponent(zipFilename)}`);
    const download = await app.inject({ method: "GET", url: downloadUrl });
    expect(download.statusCode).toBe(200);
    expect(download.rawPayload.equals(res.rawPayload)).toBe(true);

    // Another user can neither watch the run through the client id nor take it.
    expect((await firstBatchFrame(clientJobId, userToken)).statusCode).toBe(404);
    const foreign = await post(clientJobId, userToken);
    expect(foreign.statusCode, foreign.body.slice(0, 300)).toBe(409);
    expect(foreign.json()).toEqual({ error: "Job ID already in use", code: "CONFLICT" });

    // The owner resending the same POST attaches instead of running twice.
    const replay = await post(clientJobId, adminToken);
    expect(replay.statusCode, replay.body.slice(0, 300)).toBe(202);
    expect(replay.json()).toEqual({
      jobId: clientJobId,
      async: true,
      statusUrl: `/api/v1/jobs/${clientJobId}`,
      progressUrl: `/api/v1/jobs/${clientJobId}/progress`,
    });
    expect(await batchJobIdFor(clientJobId)).toBe(batchJobId);
  });
});
