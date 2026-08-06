import { randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

/**
 * #722 contracts. The client now degrades a dead POST socket to the async
 * path, which is only sound while two server behaviors hold:
 *
 * 1. A job whose upload request dies AFTER the body arrived keeps running
 *    (the sync wait is an observer; nothing couples request close to job
 *    cancellation) and its terminal frame is deliverable over SSE.
 * 2. Connecting to the progress SSE for a queued or processing job replays a
 *    nonterminal frame, so a reconnecting client gets evidence the job
 *    exists instead of bare heartbeats.
 *
 * app.inject cannot express either (it buffers whole responses and cannot
 * kill a socket mid-request), so both run over a real TCP socket.
 */
describe("job survival and progress replay across client disconnects (#722)", () => {
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

  it("keeps running a job whose upload socket died after the body was sent", async () => {
    const clientJobId = randomUUID();
    const png = readFixture(fixtures.image.base.png200);

    const boundary = `----survive${Date.now()}`;
    const parts: Buffer[] = [];
    const push = (s: string) => parts.push(Buffer.from(s));
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="file"; filename="input.png"\r\n`);
    push(`Content-Type: image/png\r\n\r\n`);
    parts.push(png);
    push(`\r\n--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="settings"\r\n\r\n`);
    push(JSON.stringify({ angle: 90 }));
    push(`\r\n--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="clientJobId"\r\n\r\n`);
    push(clientJobId);
    push(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat(parts);

    const req = http.request(`${baseUrl}/api/v1/tools/image/rotate`, {
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
        // Body flushed to the kernel; give the server a beat to start the
        // job, then kill the socket the way a proxy idle timeout would.
        setTimeout(() => {
          req.destroy();
          resolve();
        }, 150);
      });
    });

    const terminal = await waitForFrame(
      clientJobId,
      (f) => f.type === "single" && (f.phase === "complete" || f.phase === "failed"),
      20_000,
    );
    expect(terminal.phase).toBe("complete");
    const result = terminal.result as Record<string, unknown>;
    expect(String(result.downloadUrl)).toContain("/api/v1/download/");
  }, 30_000);

  it("replays a nonterminal frame for a processing job on SSE connect", async () => {
    const jobId = `tp-live-${randomUUID()}`;
    await db.insert(schema.jobs).values({
      id: jobId,
      type: "single",
      status: "processing",
      progress: { percent: 37, stage: "Processing" },
      inputRefs: [],
    });

    try {
      // Must arrive well before the 20s heartbeat cadence: it is a replay,
      // not a live event.
      const frame = await waitForFrame(
        jobId,
        (f) => f.type === "single" && f.phase === "processing",
        5_000,
      );
      expect(frame.percent).toBe(37);
      expect(frame.stage).toBe("Processing");
    } finally {
      await db.delete(schema.jobs).where(eq(schema.jobs.id, jobId));
    }
  }, 15_000);

  it("replays a nonterminal frame for a queued job on SSE connect", async () => {
    const jobId = `tp-queued-${randomUUID()}`;
    await db.insert(schema.jobs).values({
      id: jobId,
      type: "single",
      status: "queued",
      progress: { percent: 0 },
      inputRefs: [],
    });

    try {
      const frame = await waitForFrame(
        jobId,
        (f) => f.type === "single" && f.phase === "processing",
        5_000,
      );
      expect(frame.percent).toBe(0);
    } finally {
      await db.delete(schema.jobs).where(eq(schema.jobs.id, jobId));
    }
  }, 15_000);
});
