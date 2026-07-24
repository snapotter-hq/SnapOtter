import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import AdmZip from "adm-zip";
import { resolveBenchmarkResponse } from "./lib/job-aware.mjs";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");

function zipWithEntries(names) {
  const zip = new AdmZip();
  for (const name of names) zip.addFile(name, Buffer.from(`artifact:${name}`));
  return zip.toBuffer();
}

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
      response.end(zipWithEntries(["batch.png"]));
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

test("rejects a 200 JSON failure envelope instead of benchmarking it as an artifact", async () => {
  await assert.rejects(
    resolveBenchmarkResponse({
      baseUrl: "http://127.0.0.1:1349",
      admissionStatus: 200,
      admissionMime: "application/json",
      admissionBody: Buffer.from('{"success":false,"error":"decoder failed"}'),
    }),
    /200 response reported failure: decoder failed/,
  );
});

test("rejects unsupported error MIME even when the body reaches the byte floor", async () => {
  await assert.rejects(
    resolveBenchmarkResponse({
      baseUrl: "http://127.0.0.1:1349",
      admissionStatus: 200,
      admissionMime: "application/x-snapotter-error",
      admissionBody: Buffer.alloc(16),
    }),
    /unsupported artifact MIME: application\/x-snapotter-error/,
  );
});

test("rejects a truncated JPEG with a valid prefix but no terminal marker", async () => {
  await assert.rejects(
    resolveBenchmarkResponse({
      baseUrl: "http://127.0.0.1:1349",
      admissionStatus: 200,
      admissionMime: "image/jpeg",
      admissionBody: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(13)]),
    }),
    /JPEG is truncated or missing its end marker/,
  );
});

test("rejects a valid artifact that violates the operation output expectation", async () => {
  await assert.rejects(
    resolveBenchmarkResponse({
      baseUrl: "http://127.0.0.1:1349",
      admissionStatus: 200,
      admissionMime: "application/pdf",
      admissionBody: PDF,
      expectedMime: "image/png",
    }),
    /expected image\/png but received application\/pdf/,
  );
});

test("rejects a progress response that is not SSE", async () => {
  await withServer(
    (_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end('data: {"status":"completed","downloadUrl":"/result.pdf"}\n\n');
    },
    async (baseUrl) => {
      await assert.rejects(
        resolveBenchmarkResponse({
          baseUrl,
          admissionStatus: 202,
          admissionMime: "application/json",
          admissionBody: Buffer.from('{"jobId":"wrong-content-type"}'),
          timeoutMs: 1_000,
        }),
        /progress returned unsupported content-type text\/plain/,
      );
    },
  );
});

test("rejects an artifact fetch whose final redirect crosses origins", async () => {
  await withServer(
    (_request, artifactResponse) => {
      artifactResponse.writeHead(200, { "content-type": "application/pdf" });
      artifactResponse.end(PDF);
    },
    async (artifactOrigin) => {
      await withServer(
        (request, response) => {
          assert.equal(request.url, "/redirect");
          response.writeHead(302, { location: `${artifactOrigin}/stolen.pdf` });
          response.end();
        },
        async (baseUrl) => {
          await assert.rejects(
            resolveBenchmarkResponse({
              baseUrl,
              admissionStatus: 200,
              admissionMime: "application/json",
              admissionBody: Buffer.from('{"downloadUrl":"/redirect"}'),
              timeoutMs: 1_000,
            }),
            /cross-origin final artifact URL/,
          );
        },
      );
    },
  );
});

test("rejects a completed batch that reports failed files", async () => {
  const zip = zipWithEntries(["one.png"]);
  await withServer(
    (request, response) => {
      if (request.url === "/api/v1/jobs/batch-failed/progress") {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          'data: {"status":"completed","totalFiles":2,"completedFiles":2,"failedFiles":1,"errors":[{"filename":"two.png","error":"failed"}],"downloadUrl":"/partial.zip"}\n\n',
        );
        return;
      }
      response.writeHead(200, { "content-type": "application/zip" });
      response.end(zip);
    },
    async (baseUrl) => {
      await assert.rejects(
        resolveBenchmarkResponse({
          baseUrl,
          admissionStatus: 202,
          admissionMime: "application/json",
          admissionBody: Buffer.from('{"jobId":"batch-failed"}'),
          timeoutMs: 1_000,
        }),
        /batch batch-failed completed with 1 failed file/,
      );
    },
  );
});

test("rejects a ZIP that only has a PK prefix", async () => {
  await assert.rejects(
    resolveBenchmarkResponse({
      baseUrl: "http://127.0.0.1:1349",
      admissionStatus: 200,
      admissionMime: "application/zip",
      admissionBody: Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(32, 1)]),
    }),
    /ZIP is invalid/,
  );
});

test("rejects a valid ZIP whose entry count does not match the batch expectation", async () => {
  await assert.rejects(
    resolveBenchmarkResponse({
      baseUrl: "http://127.0.0.1:1349",
      admissionStatus: 200,
      admissionMime: "application/zip",
      admissionBody: zipWithEntries(["one.png"]),
      expectedZipEntries: 2,
    }),
    /expected 2 ZIP entries but received 1/,
  );
});
