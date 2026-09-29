/**
 * A storage fault partway through a multi-file pdf-to-image run (#1443).
 *
 * The inline batch route publishes `processing` frames to a progress row the
 * client watches over SSE, then rethrows any status-bearing error (today the
 * local workspace-cap and disk-free-floor SafeErrors) so it is answered with
 * its own status. That rethrow skipped the route's terminal frame, so the row
 * stayed `processing` and the SSE stream never ended; only the boot-time
 * placeholder cleanup ever settled it.
 */
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../../apps/api/src/db/index.js";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const faults = vi.hoisted(() => ({
  /** Object keys (or key prefixes) whose putObject fails with a 503. */
  poison: new Set<string>(),
  /** When set, the route's failBatchJob call rejects. */
  settleFails: false,
}));

vi.mock("../../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../apps/api/src/lib/object-storage.js")>();
  const { SafeError } = await import("@snapotter/shared");
  return {
    ...actual,
    putObject: async (key: string, data: Buffer) => {
      for (const prefix of faults.poison) {
        if (key.startsWith(prefix)) {
          throw new SafeError("Workspace storage limit reached", {
            kind: "operational",
            code: "workspace-cap",
            statusCode: 503,
          });
        }
      }
      return actual.putObject(key, data);
    },
  };
});

vi.mock("../../../../apps/api/src/routes/progress.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../apps/api/src/routes/progress.js")>();
  return {
    ...actual,
    failBatchJob: async (...args: Parameters<typeof actual.failBatchJob>) => {
      if (faults.settleFails) throw new Error("settle write failed");
      return actual.failBatchJob(...args);
    },
  };
});

const PDF_3PAGE = readFixture(fixtures.document.pdf3);
const PDF_2PAGE = readFixture(fixtures.document.pdf2);

let testApp: TestApp;
let token: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  token = await loginAsAdmin(testApp.app);
}, 30_000);

afterEach(() => {
  faults.poison.clear();
  faults.settleFails = false;
});

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

function postBatch(clientJobId: string) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "a.pdf", contentType: "application/pdf", content: PDF_3PAGE },
    { name: "file", filename: "b.pdf", contentType: "application/pdf", content: PDF_2PAGE },
    { name: "settings", content: JSON.stringify({ dpi: 72 }) },
    { name: "clientJobId", content: clientJobId },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/pdf/pdf-to-jpg/batch",
    body,
    headers: { "content-type": contentType, authorization: `Bearer ${token}` },
  });
}

async function readRow(id: string) {
  const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  return row;
}

async function objectsUnder(prefix: string) {
  const { listObjects } = await import("../../../../apps/api/src/lib/object-storage.js");
  return listObjects(prefix);
}

describe("pdf-to-image batch storage fault (#1443)", () => {
  it("settles the progress row as failed before answering with the fault's status", async () => {
    const clientJobId = "batch-1443-storage-fault";
    // The second document's first write fails; the first document succeeds.
    faults.poison.add(`outputs/${clientJobId}-f1/`);

    const res = await postBatch(clientJobId);

    // Still answered with the fault's own status and code.
    expect(res.statusCode, res.body.slice(0, 300)).toBe(503);
    expect(res.json()).toMatchObject({ code: "workspace-cap" });

    // The settle is awaited before the rethrow, so the row a client replays
    // over SSE is already terminal when the response arrives.
    const row = await readRow(clientJobId);
    expect(row?.status, "the progress row was left non-terminal").toBe("failed");
    expect(row?.completedAt).not.toBeNull();
    expect(row?.error).toMatchObject({
      message: "Workspace storage limit reached",
      code: "workspace-cap",
    });

    // Nothing is sent on a fault, so the first document's rendered output is
    // only stranded storage; it's removed before the rethrow.
    expect(await objectsUnder(`outputs/${clientJobId}-f0/`)).toEqual([]);
  });

  it("also removes the faulting document's own pages when the fault hits after they were written", async () => {
    const clientJobId = "batch-1443-first-doc-fault";
    // Pages 1-3 of the first document are written; only its ZIP write fails.
    faults.poison.add(`outputs/${clientJobId}-f0/a-pages.zip`);

    const res = await postBatch(clientJobId);

    expect(res.statusCode).toBe(503);
    expect((await readRow(clientJobId))?.status).toBe("failed");
    expect(await objectsUnder(`outputs/${clientJobId}-f0/`)).toEqual([]);
  });

  it("keeps the fault's status and still cleans up when settling the row itself fails", async () => {
    const clientJobId = "batch-1443-settle-fails";
    faults.poison.add(`outputs/${clientJobId}-f1/`);
    faults.settleFails = true;

    const res = await postBatch(clientJobId);

    // The settle error is logged, never answered in place of the real fault.
    expect(res.statusCode, res.body.slice(0, 300)).toBe(503);
    expect(res.json()).toMatchObject({ code: "workspace-cap" });
    expect(await objectsUnder(`outputs/${clientJobId}-f0/`)).toEqual([]);
  });
});
