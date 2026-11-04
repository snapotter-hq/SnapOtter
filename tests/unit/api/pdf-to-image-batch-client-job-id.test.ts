/**
 * The pdf-to-image batch route stores each document's pages and page ZIP under
 * `outputs/<jobId>-f<n>/`, and GET /api/v1/download/:jobId/:filename serves
 * outputs by id alone. A client-supplied clientJobId used to become that
 * jobId, so a caller who chose the id (or anyone who learned it) could fetch
 * the rendered pages while the batch ran. The storage key must be a server id;
 * the client id only names an alias row that the progress stream follows.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import multipart from "@fastify/multipart";
import { apiToolPath } from "@snapotter/shared";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  putObject: vi.fn(),
  getObjectBuffer: vi.fn(),
  getObjectStream: vi.fn(),
  deletePrefix: vi.fn(),
  inserted: [] as Array<Record<string, unknown>>,
  // Rows that already exist: an insert of one of these ids fails on the
  // primary key, and a select returns it.
  existing: new Map<string, Record<string, unknown>>(),
  deleted: vi.fn(),
  updateJobProgress: vi.fn(),
  failBatchJob: vi.fn(),
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        if (mocks.existing.has(String(row.id))) {
          throw Object.assign(new Error("duplicate key"), { code: "23505" });
        }
        mocks.inserted.push(row);
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [...mocks.existing.values()],
        }),
      }),
    }),
    delete: () => ({ where: async (w: unknown) => mocks.deleted(w) }),
  },
  pool: {},
  closeDb: async () => {},
  schema: { jobs: { id: "jobs.id" } },
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: (...args: unknown[]) => mocks.putObject(...args),
    getObjectBuffer: (...args: unknown[]) => mocks.getObjectBuffer(...args),
    getObjectStream: (...args: unknown[]) => mocks.getObjectStream(...args),
    deletePrefix: (...args: unknown[]) => mocks.deletePrefix(...args),
  };
});

vi.mock("../../../apps/api/src/routes/progress.js", () => ({
  updateJobProgress: (...args: unknown[]) => mocks.updateJobProgress(...args),
  failBatchJob: (...args: unknown[]) => mocks.failBatchJob(...args),
}));

vi.mock("../../../apps/api/src/lib/tool-audit.js", () => ({
  emitInlineBatchAudit: async () => {},
}));

vi.mock("../../../apps/api/src/permissions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/permissions.js")>();
  return { ...actual, requireToolAccess: async () => ({ id: "user-1", role: "user" }) };
});

import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { registerPdfToImage } from "../../../apps/api/src/routes/tools/pdf-to-image.js";

const PDF = readFileSync(join(__dirname, "../../fixtures/document/valid/test-3page.pdf"));
const CLIENT_JOB_ID = "guessable-client-id";

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(multipart);
  registerErrorHandler(app);
  registerPdfToImage(app);
  await app.ready();
  return app;
}

function batchBody(clientJobId: string | null) {
  const boundary = "----clientid";
  const parts: Buffer[] = [];
  for (const name of ["a.pdf", "b.pdf"]) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/pdf\r\n\r\n`,
      ),
      PDF,
      Buffer.from("\r\n"),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="settings"\r\n\r\n${JSON.stringify({ dpi: 36 })}\r\n`,
    ),
  );
  if (clientJobId !== null) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="clientJobId"\r\n\r\n${clientJobId}\r\n`,
      ),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

function storedKeys(): string[] {
  return mocks.putObject.mock.calls.map(([key]) => String(key));
}

function progressJobIds(): string[] {
  return mocks.updateJobProgress.mock.calls.map(([arg]) => (arg as { jobId: string }).jobId);
}

describe("pdf-to-image batch never keys storage by a client-chosen id", () => {
  beforeEach(() => {
    mocks.inserted.length = 0;
    mocks.existing.clear();
    mocks.deleted.mockReset();
    mocks.putObject.mockReset().mockResolvedValue(undefined);
    mocks.getObjectBuffer.mockReset().mockResolvedValue(Buffer.from("page"));
    mocks.getObjectStream
      .mockReset()
      .mockImplementation(async () => Readable.from([Buffer.from("zip")]));
    mocks.deletePrefix.mockReset().mockResolvedValue(undefined);
    mocks.updateJobProgress.mockReset().mockResolvedValue(undefined);
    mocks.failBatchJob.mockReset().mockResolvedValue(true);
  });

  it("stores outputs under a server id and points an alias row at it", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: `${apiToolPath("pdf-to-image")}/batch`,
      ...batchBody(CLIENT_JOB_ID),
    });

    expect(res.statusCode).toBe(200);
    const keys = storedKeys();
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).not.toContain(CLIENT_JOB_ID);
      expect(key).toMatch(/^outputs\/[0-9a-f-]{36}-f[01]\//);
    }

    const batchRow = mocks.inserted.find((row) => row.type === "batch");
    expect(batchRow?.id).toMatch(/^[0-9a-f-]{36}$/);
    const alias = mocks.inserted.find((row) => row.id === CLIENT_JOB_ID);
    expect(alias).toMatchObject({
      type: "batch-alias",
      userId: "user-1",
      settings: { batchJobId: batchRow?.id },
    });

    // Progress runs under the server id; the alias redirects the client's SSE.
    expect(new Set(progressJobIds())).toEqual(new Set([batchRow?.id]));
    // The client still gets its own id back.
    expect(res.headers["x-job-id"]).toBe(CLIENT_JOB_ID);
    await app.close();
  });

  it("answers 409 and writes nothing when another user holds the client id", async () => {
    mocks.existing.set(CLIENT_JOB_ID, {
      userId: "someone-else",
      toolId: null,
      type: "batch",
      settings: null,
    });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: `${apiToolPath("pdf-to-image")}/batch`,
      ...batchBody(CLIENT_JOB_ID),
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: "Job ID already in use",
      code: "CONFLICT",
      requestId: expect.any(String),
    });
    expect(mocks.putObject).not.toHaveBeenCalled();
    expect(mocks.updateJobProgress).not.toHaveBeenCalled();
    await app.close();
  });

  it("uses a server id when no client id is sent", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: `${apiToolPath("pdf-to-image")}/batch`,
      ...batchBody(null),
    });

    expect(res.statusCode).toBe(200);
    expect(mocks.inserted.some((row) => row.type === "batch-alias")).toBe(false);
    const batchRow = mocks.inserted.find((row) => row.type === "batch");
    expect(res.headers["x-job-id"]).toBe(batchRow?.id);
    await app.close();
  });
});
