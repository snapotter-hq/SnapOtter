import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deletePrefix, putObject } from "../../../apps/api/src/lib/object-storage.js";
import { buildTestApp, type TestApp } from "../test-server.js";

describe("download endpoint (object storage + Range)", () => {
  let testApp: TestApp;
  const jobId = `dltest-${process.pid}`;

  beforeAll(async () => {
    testApp = await buildTestApp();
    await putObject(`outputs/${jobId}/result.txt`, Buffer.from("0123456789"));
  });

  afterAll(async () => {
    await deletePrefix(`outputs/${jobId}/`);
    await testApp.cleanup();
  });

  it("serves full content with Accept-Ranges", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/result.txt`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["accept-ranges"]).toBe("bytes");
    expect(res.headers["content-length"]).toBe("10");
    expect(res.body).toBe("0123456789");
  });

  it("serves a byte range as 206 with Content-Range", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/result.txt`,
      headers: { range: "bytes=2-5" },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers["content-range"]).toBe("bytes 2-5/10");
    expect(res.body).toBe("2345");
  });

  it("rejects unsatisfiable ranges with 416", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/result.txt`,
      headers: { range: "bytes=50-60" },
    });
    expect(res.statusCode).toBe(416);
  });

  it("404s for missing objects and rejects traversal", async () => {
    expect(
      (await testApp.app.inject({ method: "GET", url: `/api/v1/download/${jobId}/nope.txt` }))
        .statusCode,
    ).toBe(404);
    expect(
      (await testApp.app.inject({ method: "GET", url: `/api/v1/download/..%2F..%2Fetc/passwd` }))
        .statusCode,
    ).toBe(400);
  });

  // ── Range edge cases ───────────────────────────────────────────

  it("bytes=0-0 returns single first byte", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/result.txt`,
      headers: { range: "bytes=0-0" },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers["content-range"]).toBe("bytes 0-0/10");
    expect(res.headers["content-length"]).toBe("1");
    expect(res.body).toBe("0");
  });

  it("bytes=9-9 returns single last byte", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/result.txt`,
      headers: { range: "bytes=9-9" },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers["content-range"]).toBe("bytes 9-9/10");
    expect(res.headers["content-length"]).toBe("1");
    expect(res.body).toBe("9");
  });

  it("bytes=9-50 clamps end to file size", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/result.txt`,
      headers: { range: "bytes=9-50" },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers["content-range"]).toBe("bytes 9-9/10");
    expect(res.headers["content-length"]).toBe("1");
    expect(res.body).toBe("9");
  });

  it("bytes=10- returns 416 when start equals size", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/result.txt`,
      headers: { range: "bytes=10-" },
    });
    expect(res.statusCode).toBe(416);
    expect(res.headers["content-range"]).toBe("bytes */10");
    expect(JSON.parse(res.body).error).toBe("Range not satisfiable");
  });

  it("open-ended bytes=5- returns remaining bytes", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/result.txt`,
      headers: { range: "bytes=5-" },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers["content-range"]).toBe("bytes 5-9/10");
    expect(res.headers["content-length"]).toBe("5");
    expect(res.body).toBe("56789");
  });

  it("multi-range bytes=0-1,3-4 returns 416", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/result.txt`,
      headers: { range: "bytes=0-1,3-4" },
    });
    expect(res.statusCode).toBe(416);
    expect(res.headers["content-range"]).toBe("bytes */10");
  });

  it("416 omits Content-Disposition and returns JSON error", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/result.txt`,
      headers: { range: "bytes=50-60" },
    });
    expect(res.statusCode).toBe(416);
    expect(res.headers["content-disposition"]).toBeUndefined();
    expect(JSON.parse(res.body)).toEqual({ error: "Range not satisfiable" });
  });
});
