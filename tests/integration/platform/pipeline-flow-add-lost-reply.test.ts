/**
 * Pipeline flows whose FlowProducer.add() rejects after Redis stored them
 * (#4715, the pipeline side of #4714).
 *
 * add() sends the whole flow as one MULTI, and ioredis rejects a pipeline
 * whose connection closed after a partial reply even when Redis already ran
 * EXEC. Both pipeline routes treated every rejection as "nothing was
 * enqueued" and deleted the uploads the queued steps still needed. Here add()
 * really writes the flow to the test Redis and then throws, and the pipeline
 * has to finish.
 */
import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getFlowProducer } from "../../../apps/api/src/jobs/enqueue.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const JPG = readFixture(fixtures.image.base.jpg100);
const RESIZE = JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] });

describe("a pipeline flow add that fails after Redis stored the flow (#4715)", () => {
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

  function failAfterWrite() {
    const producer = getFlowProducer();
    const realAdd = producer.add;
    return vi.spyOn(producer, "add").mockImplementationOnce(async (...args) => {
      await realAdd.apply(producer, args);
      throw Object.assign(new Error("Command aborted due to connection close"), {
        name: "AbortError",
      });
    });
  }

  it("/execute runs the stored flow to its result instead of deleting its input", async () => {
    const add = failAfterWrite();
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "pipeline", content: RESIZE },
    ]);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/pipeline/execute",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(add).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ stepsCompleted: 1 });
    expect(res.json().downloadUrl).toEqual(expect.any(String));
  });

  it("/batch runs the stored flow to a full ZIP instead of deleting its inputs", async () => {
    const add = failAfterWrite();
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "pipeline", content: RESIZE },
    ]);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/pipeline/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(add).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(new AdmZip(res.rawPayload).getEntries()).toHaveLength(2);
  });
});
