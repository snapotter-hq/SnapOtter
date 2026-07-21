import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as objectStorage from "../../../apps/api/src/lib/object-storage.js";
import { deletePrefix, putObject } from "../../../apps/api/src/lib/object-storage.js";
import { buildTestApp, type TestApp } from "../test-server.js";

// Every other download test exercises the route through app.inject, which
// buffers the whole body and so can never observe a stream that stalls or
// under-delivers over a real connection. That blind spot is why #590 shipped:
// the bug only surfaces on a live socket. #604 closed the gap for the
// image-to-pdf route; this covers the generic
// GET /api/v1/download/:jobId/:filename route every tool shares, by serving
// over a real TCP socket (app.listen) and reading with fetch.
describe("download endpoint over a real socket (#590)", () => {
  let testApp: TestApp;
  let baseUrl: string;
  const jobId = `dlsock-${process.pid}`;
  // 1 MiB spans many fs.ReadStream chunks and several TCP writes, so the parity
  // assertion exercises real multi-chunk streaming, not a one-shot body that
  // would pass trivially.
  const SIZE = 1024 * 1024;

  beforeAll(async () => {
    testApp = await buildTestApp();
    await putObject(`outputs/${jobId}/result.bin`, Buffer.alloc(SIZE, 0x61));
    // Bind a real port so the download travels over TCP instead of app.inject.
    await testApp.app.listen({ port: 0, host: "127.0.0.1" });
    const addr = testApp.app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }, 30_000);

  afterAll(async () => {
    await deletePrefix(`outputs/${jobId}/`);
    await testApp.cleanup();
  }, 10_000);

  // Force the route's declared Content-Length (from getObjectSize) to exceed the
  // bytes the stream yields: #590 "cause 2", a stat/stream size disagreement.
  function mockOverReportedSize() {
    const realGetObjectSize = objectStorage.getObjectSize;
    return vi.spyOn(objectStorage, "getObjectSize").mockImplementation(async (key: string) => {
      const actual = await realGetObjectSize(key);
      return key.includes("result.bin") ? actual + 4096 : actual;
    });
  }

  // Drive a download that should be reset mid-stream and report how it settled.
  // A 10s deadline is the trip wire: a regression that lets the route hang aborts
  // via the deadline instead, which the callers assert against.
  async function fetchUnderDeadline(init: { headers?: Record<string, string> } = {}) {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 10_000);
    let status = 0;
    let threw = false;
    try {
      const res = await fetch(`${baseUrl}/api/v1/download/${jobId}/result.bin`, {
        ...init,
        signal: controller.signal,
      });
      status = res.status;
      await res.arrayBuffer();
    } catch {
      threw = true;
    } finally {
      clearTimeout(deadline);
    }
    return { status, threw, aborted: controller.signal.aborted };
  }

  it("delivers exactly Content-Length bytes over TCP", async () => {
    // A complete 1 MiB body proves the multi-chunk stream finishes and sets
    // X-Accel-Buffering. Shortfall detection is covered by the reset tests
    // below; a truncated body never reaches the parity check here, because the
    // client's read hangs or rejects first. The deadline turns a success-path
    // hang regression into a fast failure instead of a 30s timeout.
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(`${baseUrl}/api/v1/download/${jobId}/result.bin`, {
        signal: controller.signal,
      });
      expect(res.status).toBe(200);
      // #604: reverse proxies must not buffer the download.
      expect(res.headers.get("x-accel-buffering")).toBe("no");
      const declared = Number(res.headers.get("content-length"));
      expect(declared).toBe(SIZE);
      const body = Buffer.from(await res.arrayBuffer());
      expect(body.length).toBe(declared);
    } finally {
      clearTimeout(deadline);
    }
  }, 30_000);

  it("resets the connection instead of hanging when the stream is short (full body)", async () => {
    const spy = mockOverReportedSize();
    try {
      const { status, threw, aborted } = await fetchUnderDeadline();
      expect(status).toBe(200);
      // The client observed the reset (a premature-close read error)...
      expect(threw).toBe(true);
      // ...and it was the guard that reset it, not our deadline firing on a hang.
      expect(aborted).toBe(false);
    } finally {
      spy.mockRestore();
    }
  }, 30_000);

  it("resets a ranged (206) download instead of hanging when the stream is short", async () => {
    // The guard wraps the range branch too, with its own byte math
    // (clampedEnd - start + 1); exercise that path over the socket.
    const spy = mockOverReportedSize();
    try {
      const { status, threw, aborted } = await fetchUnderDeadline({
        headers: { range: "bytes=0-" },
      });
      expect(status).toBe(206);
      expect(threw).toBe(true);
      expect(aborted).toBe(false);
    } finally {
      spy.mockRestore();
    }
  }, 30_000);
});
