/**
 * #2179: POST /api/v1/pipeline/execute answered 422 with the raw message of
 * any rejection of its wait on the finalize job (Redis down, a crashed
 * finalize). BullMQ's text can carry internal paths, and a server fault read
 * as the client's. The rejection now reaches the error handler, which masks
 * it, logs it and reports it. The test app keeps Fastify's default handler
 * (#1243), so what this pins is the status and the old reply shape; the
 * masking itself is plugins/error-handler.ts's.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const waitMock = vi.hoisted(() => ({ rejectWith: null as Error | null }));
vi.mock("../../../apps/api/src/jobs/enqueue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/jobs/enqueue.js")>();
  return {
    ...actual,
    waitForJob: async (...args: Parameters<typeof actual.waitForJob>) => {
      if (waitMock.rejectWith) throw waitMock.rejectWith;
      return actual.waitForJob(...args);
    },
  };
});

const PNG = readFixture(fixtures.image.base.png200);

let testApp: TestApp;
let app: TestApp["app"];
let token: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  token = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

beforeEach(() => {
  waitMock.rejectWith = null;
});

async function execute() {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "one.png", contentType: "image/png", content: PNG },
    {
      name: "pipeline",
      content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
    },
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/pipeline/execute",
    body,
    headers: { "content-type": contentType, authorization: `Bearer ${token}` },
  });
}

describe("pipeline execute when the wait on the finalize job rejects (#2179)", () => {
  it("answers a 500 from the error handler instead of a 422 blaming the request", async () => {
    waitMock.rejectWith = new Error(
      "connect ECONNREFUSED /var/run/redis/redis.sock at /app/node_modules/bullmq/dist/cjs/classes/job.js:431",
    );
    const res = await execute();

    expect(res.statusCode, res.body).toBe(500);
    // The route used to send `{ error: err.message }` itself.
    expect(res.json().completedSteps).toBeUndefined();
  });

  it("still completes a run whose wait does not reject", async () => {
    const res = await execute();

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().stepsCompleted).toBe(1);
  });
});
