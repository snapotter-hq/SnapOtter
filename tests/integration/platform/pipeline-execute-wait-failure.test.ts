/**
 * #2179: POST /api/v1/pipeline/execute answered 422 with the raw message of
 * any rejection of its wait on the finalize job (Redis down, a crashed
 * finalize). BullMQ's text can carry internal paths, and a server fault read
 * as the client's. The rejection now reaches the error handler, which masks
 * it, logs it and reports it. The test app keeps Fastify's default handler
 * (#1243), so what this pins is the status and the old reply shape; the
 * masking itself is plugins/error-handler.ts's.
 */
import { SafeError } from "@snapotter/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const waitMock = vi.hoisted(() => ({ rejectWith: null as Error | null }));
const putMock = vi.hoisted(() => ({ rejectFinalizeWith: null as Error | null }));
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
vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: async (...args: Parameters<typeof actual.putObject>) => {
      const [key] = args;
      if (
        putMock.rejectFinalizeWith &&
        key.startsWith("outputs/") &&
        !/^outputs\/[^/]+-s\d+\//.test(key)
      ) {
        throw putMock.rejectFinalizeWith;
      }
      return actual.putObject(...args);
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
});

beforeEach(() => {
  waitMock.rejectWith = null;
  putMock.rejectFinalizeWith = null;
});

async function execute(clientJobId?: string) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "one.png", contentType: "image/png", content: PNG },
    {
      name: "pipeline",
      content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
    },
    ...(clientJobId ? [{ name: "clientJobId", content: clientJobId }] : []),
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/pipeline/execute",
    body,
    headers: { "content-type": contentType, authorization: `Bearer ${token}` },
  });
}

describe("pipeline execute when the wait on the finalize job rejects (#2179, #3479)", () => {
  it("answers a 500 from the error handler instead of a 422 blaming the request", async () => {
    waitMock.rejectWith = new Error(
      "connect ECONNREFUSED /var/run/redis/redis.sock at /app/node_modules/bullmq/dist/cjs/classes/job.js:431",
    );
    const res = await execute();

    expect(res.statusCode, res.body).toBe(500);
    // The route used to send `{ error: err.message }` itself.
    expect(res.json().completedSteps).toBeUndefined();
  });

  it("answers 503 with code and settles schema.jobs when processPipelineFinalize fails on a 503 storage fault (#3479)", async () => {
    putMock.rejectFinalizeWith = new SafeError("The server's storage service is unavailable.", {
      kind: "operational",
      code: "storage-unavailable",
      statusCode: 503,
    });
    const clientJobId = "pipeline-finalize-storage-503";
    const res = await execute(clientJobId);

    expect(res.statusCode, res.body).toBe(503);
    expect(res.json()).toEqual({
      error: "The server's storage service is unavailable.",
      code: "storage-unavailable",
    });

    const [aliasRow] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, clientJobId));
    expect(aliasRow?.status).toBe("failed");
    expect(aliasRow?.error).toEqual({
      message: "The server's storage service is unavailable.",
      code: "storage-unavailable",
      httpStatus: 503,
    });
    const flowId = (aliasRow?.settings as { pipelineFlowId?: string } | null)?.pipelineFlowId;
    expect(flowId).toBeTruthy();
    if (flowId) {
      const [flowRow] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, flowId));
      expect(flowRow?.status).toBe("failed");
      expect(flowRow?.error).toEqual({
        message: "The server's storage service is unavailable.",
        code: "storage-unavailable",
        httpStatus: 503,
      });
    }
  });

  it("still completes a run whose wait does not reject", async () => {
    const res = await execute();

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().stepsCompleted).toBe(1);
  });
});
