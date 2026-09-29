/**
 * A storage fault partway through a multi-file pdf-to-image run (#1443).
 *
 * The inline batch route publishes `processing` frames to a progress row the
 * client watches over SSE, then rethrows any status-bearing error (a full
 * workspace, an S3 outage) so the global handler can answer with its status.
 * That rethrow skipped the route's terminal frame, so the row stayed
 * `processing` and the SSE stream never ended; only the boot-time placeholder
 * cleanup ever settled it.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../../apps/api/src/db/index.js";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

/** Object-key prefixes whose putObject fails with a 503, like a full workspace. */
const storageMock = vi.hoisted(() => ({ poison: new Set<string>() }));

vi.mock("../../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../apps/api/src/lib/object-storage.js")>();
  const { SafeError: Safe } = await import("@snapotter/shared");
  return {
    ...actual,
    putObject: async (key: string, data: Buffer) => {
      for (const prefix of storageMock.poison) {
        if (key.startsWith(prefix)) {
          throw new Safe("Workspace storage limit reached", {
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

const PDF_3PAGE = readFixture(fixtures.document.pdf3);
const PDF_2PAGE = readFixture(fixtures.document.pdf2);

let testApp: TestApp;
let token: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  token = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  storageMock.poison.clear();
  await testApp.cleanup();
}, 10_000);

async function readRow(id: string) {
  const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  return row;
}

describe("pdf-to-image batch storage fault (#1443)", () => {
  it("settles the progress row as failed before answering with the fault's status", async () => {
    const clientJobId = "batch-1443-storage-fault";
    // The second document's output write fails; the first one succeeds.
    storageMock.poison.add(`outputs/${clientJobId}-f1/`);

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.pdf", contentType: "application/pdf", content: PDF_3PAGE },
      { name: "file", filename: "b.pdf", contentType: "application/pdf", content: PDF_2PAGE },
      { name: "settings", content: JSON.stringify({ dpi: 72 }) },
      { name: "clientJobId", content: clientJobId },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/pdf-to-jpg/batch",
      body,
      headers: { "content-type": contentType, authorization: `Bearer ${token}` },
    });

    // The global handler still answers with the fault's own status.
    expect(res.statusCode, res.body.slice(0, 300)).toBe(503);

    // The row a client replays over SSE is terminal, carrying the reason and
    // the SafeError's code. The persist queue is async, so poll briefly.
    let row = await readRow(clientJobId);
    for (let i = 0; i < 50 && row?.status !== "failed"; i++) {
      await new Promise((r) => setTimeout(r, 50));
      row = await readRow(clientJobId);
    }
    expect(row?.status, "the progress row was left non-terminal").toBe("failed");
    expect(row?.completedAt).not.toBeNull();
    expect(row?.error).toMatchObject({
      message: "Workspace storage limit reached",
      code: "workspace-cap",
    });

    // Nothing is sent on a fault, so the first document's rendered pages and
    // ZIP are only stranded storage; they're removed before the rethrow.
    const { objectExists } = await import("../../../../apps/api/src/lib/object-storage.js");
    expect(await objectExists(`outputs/${clientJobId}-f0/page-1.jpg`)).toBe(false);
    expect(await objectExists(`outputs/${clientJobId}-f0/a-pages.zip`)).toBe(false);
  });
});
