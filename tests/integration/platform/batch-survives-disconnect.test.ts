import { randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import AdmZip from "adm-zip";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

/**
 * #750 contracts, the batch counterpart of job-survives-disconnect (#722).
 * The client degrades a dead batch POST to the async path, which is only
 * sound while three server behaviors hold:
 *
 * 1. A batch whose upload request dies AFTER the body arrived keeps running,
 *    and its terminal SSE frame carries the durable result (downloadUrl +
 *    fileResults) because the ZIP was persisted, not only streamed.
 * 2. The download URL in that frame serves a complete ZIP.
 * 3. SSE connect replays batch parent rows: nonterminal for live batches
 *    (evidence the batch exists), terminal-with-result for finished ones.
 *
 * app.inject cannot kill a socket mid-request, so the upload runs over a
 * real TCP socket.
 */
describe("batch survival and progress replay across client disconnects (#750)", () => {
  let testApp: TestApp;
  let baseUrl: string;
  let adminToken: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
    adminToken = await loginAsAdmin(testApp.app);
    await testApp.app.listen({ port: 0, host: "127.0.0.1" });
    const addr = testApp.app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  }, 10_000);

  /** Collect SSE frames for a job until the predicate matches or time runs out. */
  function waitForFrame(
    jobId: string,
    match: (frame: Record<string, unknown>) => boolean,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `${baseUrl}/api/v1/jobs/${jobId}/progress`,
        { headers: { authorization: `Bearer ${adminToken}`, accept: "text/event-stream" } },
        (res) => {
          let buf = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => {
            buf += chunk;
            let idx = buf.indexOf("\n\n");
            while (idx !== -1) {
              const frame = buf.slice(0, idx);
              buf = buf.slice(idx + 2);
              const line = frame.split("\n").find((l) => l.startsWith("data: "));
              if (line) {
                const data = JSON.parse(line.slice(6)) as Record<string, unknown>;
                if (match(data)) {
                  clearTimeout(deadline);
                  req.destroy();
                  resolve(data);
                  return;
                }
              }
              idx = buf.indexOf("\n\n");
            }
          });
        },
      );
      const deadline = setTimeout(() => {
        req.destroy();
        reject(new Error("No matching SSE frame before the deadline"));
      }, timeoutMs);
      req.on("error", () => {
        // Socket destroyed by resolve/timeout paths; errors there are expected.
      });
    });
  }

  it("finishes a batch whose upload socket died and delivers the ZIP via the terminal frame", async () => {
    const clientJobId = randomUUID();
    const png = readFixture(fixtures.image.base.png200);
    const jpg = readFixture(fixtures.image.base.jpg100);

    const boundary = `----survive${Date.now()}`;
    const parts: Buffer[] = [];
    const push = (s: string) => parts.push(Buffer.from(s));
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="file"; filename="first.png"\r\n`);
    push(`Content-Type: image/png\r\n\r\n`);
    parts.push(png);
    push(`\r\n--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="file"; filename="second.jpg"\r\n`);
    push(`Content-Type: image/jpeg\r\n\r\n`);
    parts.push(jpg);
    push(`\r\n--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="settings"\r\n\r\n`);
    push(JSON.stringify({ width: 50 }));
    push(`\r\n--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="clientJobId"\r\n\r\n`);
    push(clientJobId);
    push(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat(parts);

    const req = http.request(`${baseUrl}/api/v1/tools/image/resize/batch`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": body.length,
      },
    });
    req.on("error", () => {
      // ECONNRESET from our own destroy is the point of the test.
    });
    await new Promise<void>((resolve) => {
      req.end(body, () => {
        // Body flushed to the kernel; give the server a beat to finish the
        // multipart parse, then kill the socket the way a proxy would.
        setTimeout(() => {
          req.destroy();
          resolve();
        }, 250);
      });
    });

    const terminal = await waitForFrame(
      clientJobId,
      (f) => f.type === "batch" && (f.status === "completed" || f.status === "failed"),
      30_000,
    );
    expect(terminal.status).toBe("completed");
    expect(terminal.completedFiles).toBe(terminal.totalFiles);

    const result = terminal.result as Record<string, unknown>;
    const fileResults = result.fileResults as Record<string, string>;
    expect(fileResults["0"]).toContain("first");
    expect(fileResults["1"]).toContain("second");

    // The durable ZIP behind the frame's URL is complete and downloadable.
    const download = await testApp.app.inject({
      method: "GET",
      url: String(result.downloadUrl),
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(download.statusCode).toBe(200);
    const zip = new AdmZip(download.rawPayload);
    expect(zip.getEntries().length).toBe(2);
  }, 45_000);

  it("replays a nonterminal frame with counts for a live batch on SSE connect", async () => {
    const jobId = `batch-live-${randomUUID()}`;
    await db.insert(schema.jobs).values({
      id: jobId,
      type: "batch",
      status: "processing",
      progress: { percent: 40, totalFiles: 5, completedFiles: 2, failedFiles: 0 },
      inputRefs: [],
    });

    try {
      // Must arrive well before the 20s heartbeat cadence: it is a replay,
      // not a live event.
      const frame = await waitForFrame(
        jobId,
        (f) => f.type === "batch" && f.status === "processing",
        5_000,
      );
      expect(frame.totalFiles).toBe(5);
      expect(frame.completedFiles).toBe(2);
    } finally {
      await db.delete(schema.jobs).where(eq(schema.jobs.id, jobId));
    }
  }, 15_000);

  it("replays the terminal result for a completed batch row on SSE connect", async () => {
    const jobId = `batch-done-${randomUUID()}`;
    await db.insert(schema.jobs).values({
      id: jobId,
      type: "batch",
      status: "completed",
      progress: {
        percent: 100,
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 0,
        result: {
          downloadUrl: `/api/v1/download/${jobId}/batch-resize-abc.zip`,
          fileResults: { "0": "a.png", "1": "b.png" },
        },
      },
      inputRefs: [],
    });

    try {
      const frame = await waitForFrame(
        jobId,
        (f) => f.type === "batch" && f.status !== "processing",
        5_000,
      );
      expect(frame.status).toBe("completed");
      const result = frame.result as Record<string, unknown>;
      expect(result.downloadUrl).toBe(`/api/v1/download/${jobId}/batch-resize-abc.zip`);
    } finally {
      await db.delete(schema.jobs).where(eq(schema.jobs.id, jobId));
    }
  }, 15_000);
});
