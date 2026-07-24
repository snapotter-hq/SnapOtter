import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { resolveBenchmarkResponse } from "./lib/job-aware.mjs";

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32, 1),
]);
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("resolves a synchronous JSON download and validates its PNG artifact", async () => {
  await withServer(
    (request, response) => {
      assert.equal(request.url, "/output.png");
      response.writeHead(200, { "content-type": "image/png" });
      response.end(PNG);
    },
    async (baseUrl) => {
      const result = await resolveBenchmarkResponse({
        baseUrl,
        token: "token",
        admissionStatus: 200,
        admissionMime: "application/json",
        admissionBody: Buffer.from('{"downloadUrl":"/output.png"}'),
        timeoutMs: 1_000,
      });

      assert.equal(result.admissionStatus, 200);
      assert.equal(result.completionStatus, "completed");
      assert.equal(result.outputMime, "image/png");
      assert.equal(result.outputSize, PNG.length);
      assert.deepEqual(result.output, PNG);
    },
  );
});

test("waits for a 202 job, downloads the terminal result, and reports completion latency", async () => {
  await withServer(
    (request, response) => {
      if (request.url === "/api/v1/jobs/job-1/progress") {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          'data: {"phase":"processing","percent":50}\n\n' +
            'data: {"phase":"complete","result":{"downloadUrl":"/result.pdf"}}\n\n',
        );
        return;
      }
      assert.equal(request.url, "/result.pdf");
      response.writeHead(200, { "content-type": "application/pdf" });
      response.end(PDF);
    },
    async (baseUrl) => {
      const result = await resolveBenchmarkResponse({
        baseUrl,
        token: "token",
        admissionStatus: 202,
        admissionMime: "application/json",
        admissionBody: Buffer.from('{"jobId":"job-1"}'),
        timeoutMs: 1_000,
      });

      assert.equal(result.completionStatus, "completed");
      assert.equal(result.outputMime, "application/pdf");
      assert.equal(result.outputSize, PDF.length);
      assert.ok(result.completionLatencyS >= 0);
    },
  );
});

test("uses artifactJobId for output metadata when progress uses a client job id", async () => {
  await withServer(
    (request, response) => {
      if (request.url === "/api/v1/jobs/client-job/progress") {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end('data: {"status":"completed","type":"batch"}\n\n');
        return;
      }
      if (request.url === "/api/v1/download/artifact-job/output-meta.json") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"filename":"batch.zip"}');
        return;
      }
      assert.equal(request.url, "/api/v1/download/artifact-job/batch.zip");
      response.writeHead(200, { "content-type": "application/zip" });
      response.end(Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(32, 1)]));
    },
    async (baseUrl) => {
      const result = await resolveBenchmarkResponse({
        baseUrl,
        token: "token",
        admissionStatus: 202,
        admissionMime: "application/json",
        admissionBody: Buffer.from(
          '{"jobId":"client-job","progressJobId":"client-job","artifactJobId":"artifact-job"}',
        ),
        timeoutMs: 1_000,
      });

      assert.equal(result.completionStatus, "completed");
      assert.equal(result.outputMime, "application/zip");
    },
  );
});

test("fails when an asynchronous job emits a terminal error", async () => {
  await withServer(
    (_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end('data: {"phase":"failed","error":"decoder exploded"}\n\n');
    },
    async (baseUrl) => {
      await assert.rejects(
        resolveBenchmarkResponse({
          baseUrl,
          token: "token",
          admissionStatus: 202,
          admissionMime: "application/json",
          admissionBody: Buffer.from('{"jobId":"job-2"}'),
          timeoutMs: 1_000,
        }),
        /job job-2 failed: decoder exploded/,
      );
    },
  );
});

test("fails a job that does not complete before the bounded timeout", async () => {
  await withServer(
    (_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(": keepalive\n\n");
    },
    async (baseUrl) => {
      await assert.rejects(
        resolveBenchmarkResponse({
          baseUrl,
          token: "token",
          admissionStatus: 202,
          admissionMime: "application/json",
          admissionBody: Buffer.from('{"jobId":"job-timeout"}'),
          timeoutMs: 30,
        }),
        /job job-timeout timed out/,
      );
    },
  );
});

test("rejects cross-origin artifact URLs before downloading", async () => {
  await assert.rejects(
    resolveBenchmarkResponse({
      baseUrl: "http://127.0.0.1:1349",
      token: "token",
      admissionStatus: 200,
      admissionMime: "application/json",
      admissionBody: Buffer.from('{"downloadUrl":"https://example.com/output.png"}'),
      timeoutMs: 1_000,
    }),
    /cross-origin artifact URL/,
  );
});

test("rejects an artifact whose bytes do not match its MIME type", async () => {
  await withServer(
    (_request, response) => {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(Buffer.alloc(64, 1));
    },
    async (baseUrl) => {
      await assert.rejects(
        resolveBenchmarkResponse({
          baseUrl,
          token: "token",
          admissionStatus: 200,
          admissionMime: "application/json",
          admissionBody: Buffer.from('{"downloadUrl":"/corrupt.png"}'),
          timeoutMs: 1_000,
        }),
        /PNG magic mismatch/,
      );
    },
  );
});

test("rejects a trivial direct artifact", async () => {
  await assert.rejects(
    resolveBenchmarkResponse({
      baseUrl: "http://127.0.0.1:1349",
      token: "token",
      admissionStatus: 200,
      admissionMime: "text/plain",
      admissionBody: Buffer.from("tiny"),
      timeoutMs: 1_000,
    }),
    /artifact is trivial/,
  );
});
