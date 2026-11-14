/**
 * A batch whose FlowProducer.add() rejects after Redis stored the flow (#4714).
 *
 * add() sends the whole flow as one MULTI, and ioredis rejects a pipeline
 * whose connection closed after a partial reply even when Redis already ran
 * EXEC. The route used to treat every rejection as "nothing was enqueued":
 * it deleted the uploads and child rows of jobs Redis had queued, and those
 * jobs then failed with "input no longer available". Here add() really writes
 * the flow to the test Redis and then throws, and the batch has to finish.
 */
import { randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { flowParentStored, getFlowProducer } from "../../../apps/api/src/jobs/enqueue.js";
import { queueName } from "../../../apps/api/src/jobs/types.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const JPG = readFixture(fixtures.image.base.jpg100);

describe("a batch flow add that fails after Redis stored the flow (#4714)", () => {
  let testApp: TestApp;
  let adminToken: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
    adminToken = await loginAsAdmin(testApp.app);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await testApp.cleanup();
  });

  it("runs the stored flow to a full ZIP instead of deleting its inputs", async () => {
    const producer = getFlowProducer();
    const realAdd = producer.add;
    const add = vi.spyOn(producer, "add").mockImplementationOnce(async (...args) => {
      await realAdd.apply(producer, args);
      throw Object.assign(new Error("Command aborted due to connection close"), {
        name: "AbortError",
      });
    });

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(add).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(new AdmZip(res.rawPayload).getEntries()).toHaveLength(2);
  });

  it("reports a stored flow parent as stored and an unknown id as absent", async () => {
    const parentId = randomUUID();
    await getFlowProducer().add({
      name: "probe-parent",
      queueName: queueName("system"),
      data: { kind: "probe" },
      opts: { jobId: parentId, delay: 60 * 60_000 },
      children: [],
    });

    expect(await flowParentStored("system", parentId)).toBe(true);
    expect(await flowParentStored("system", randomUUID())).toBe(false);
  });
});
