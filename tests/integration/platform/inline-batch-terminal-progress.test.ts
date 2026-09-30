/**
 * The inline batch routes (pdf-to-image, svg-to-raster) own their jobs row and
 * settle it with a terminal progress frame (#1688).
 *
 * That frame was published fire and forget, and the batch persist swallowed
 * every DB error. The response could go out while the row still read
 * `processing`, which counts against `maxConcurrentJobsPerUser`, and a lost
 * write left it there until the next restart with nothing logged.
 */
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const terminal = vi.hoisted(() => ({
  /** Delay before a terminal frame reaches the real persist, in ms. */
  delayMs: 0,
  /** When set, a terminal frame's persist rejects instead of writing. */
  fails: false,
  /** Job ids whose terminal persist has finished writing. */
  persisted: new Set<string>(),
}));

vi.mock("../../../apps/api/src/routes/progress.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/routes/progress.js")>();
  return {
    ...actual,
    updateJobProgress: (progress: Parameters<typeof actual.updateJobProgress>[0]) => {
      if (progress.status !== "completed" && progress.status !== "failed") {
        return actual.updateJobProgress(progress);
      }
      return (async () => {
        await new Promise((resolve) => setTimeout(resolve, terminal.delayMs));
        if (terminal.fails) throw new Error("terminal progress write failed");
        await actual.updateJobProgress(progress);
        terminal.persisted.add(progress.jobId);
      })();
    },
  };
});

const PDF = readFixture(fixtures.document.pdf2);
const SVG = readFixture(fixtures.image.base.svg100);

let testApp: TestApp;
let token: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  token = await loginAsAdmin(testApp.app);
}, 30_000);

afterEach(() => {
  terminal.delayMs = 0;
  terminal.fails = false;
  terminal.persisted.clear();
});

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

const ROUTES = [
  {
    name: "pdf-to-image",
    url: "/api/v1/tools/pdf/pdf-to-jpg/batch",
    file: { filename: "a.pdf", contentType: "application/pdf", content: PDF },
    settings: { dpi: 72 },
  },
  {
    name: "svg-to-raster",
    url: "/api/v1/tools/image/svg-to-raster/batch",
    file: { filename: "a.svg", contentType: "image/svg+xml", content: SVG },
    settings: { outputFormat: "png" },
  },
] as const;

function postBatch(route: (typeof ROUTES)[number], clientJobId: string) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", ...route.file },
    { name: "settings", content: JSON.stringify(route.settings) },
    { name: "clientJobId", content: clientJobId },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: route.url,
    body,
    headers: { "content-type": contentType, authorization: `Bearer ${token}` },
  });
}

async function readRow(id: string) {
  const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  return row;
}

describe.each(ROUTES)("$name inline batch terminal progress (#1688)", (route) => {
  it("settles the row before answering, so the slot is free when the client gets the result", async () => {
    const clientJobId = `batch-1688-${route.name}-ordering`;
    // A slow terminal write: unawaited, the response wins the race.
    terminal.delayMs = 150;

    const res = await postBatch(route, clientJobId);

    expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
    expect(terminal.persisted.has(clientJobId), "answered before the terminal write").toBe(true);
    expect((await readRow(clientJobId))?.status).toBe("completed");
  });

  it("still answers with the result when the terminal write fails, without an unhandled rejection", async () => {
    const clientJobId = `batch-1688-${route.name}-lost-write`;
    terminal.fails = true;
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const res = await postBatch(route, clientJobId);

      expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
