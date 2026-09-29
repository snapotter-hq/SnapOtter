/**
 * Unit tests for lib/multipart-parts.ts, the keep-alive-safe replacement for
 * @fastify/multipart's request.parts().
 *
 * The scenario that broke the plugin: the whole request body is already
 * buffered (request "end"/"close" fire immediately once piped) while the
 * consumer awaits slow storage writes between parts. The plugin's iterator
 * queued its end marker on request "close" and dropped every part emitted
 * after it; the busboy-driven iterator must deliver all parts regardless of
 * consumer pacing.
 */

import { PassThrough } from "node:stream";
import { SafeError } from "@snapotter/shared";
import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import {
  multipartFailure,
  multipartParts,
  readFilePart,
} from "../../../apps/api/src/lib/multipart-parts.js";

const BOUNDARY = "----UnitBoundary1234";

function multipartBody(
  parts: Array<{ name: string; filename?: string; content: string | Buffer }>,
): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    let header = `--${BOUNDARY}\r\n`;
    if (part.filename) {
      header += `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n`;
      header += "Content-Type: application/octet-stream\r\n\r\n";
    } else {
      header += `Content-Disposition: form-data; name="${part.name}"\r\n\r\n`;
    }
    chunks.push(Buffer.from(header), Buffer.from(part.content), Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}

/** Fake request whose raw stream has the whole body buffered up front. */
function fakeRequest(body: Buffer): FastifyRequest {
  const raw = new PassThrough();
  Object.assign(raw, {
    headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
  });
  // Whole body available immediately: "end"/"close" fire as soon as the
  // pipe drains the stream, exactly like a warm keep-alive socket.
  raw.end(body);
  return { raw } as unknown as FastifyRequest;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function drain(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe("multipartParts", () => {
  it("yields every part when the consumer is slower than the body arrival", async () => {
    const body = multipartBody([
      { name: "file", filename: "photo.jpg", content: Buffer.alloc(256 * 1024, 7) },
      { name: "mask", filename: "mask.png", content: Buffer.alloc(8 * 1024, 9) },
      { name: "clientJobId", content: "abc-123" },
      { name: "format", content: "png" },
      { name: "quality", content: "95" },
    ]);

    const seen: string[] = [];
    const sizes: Record<string, number> = {};
    for await (const part of multipartParts(fakeRequest(body))) {
      if (part.type === "file") {
        const buf = await drain(part.file);
        sizes[part.fieldname] = buf.length;
        seen.push(`file:${part.fieldname}`);
        // Slow consumer: the raw stream has long since closed by now.
        await sleep(25);
      } else {
        seen.push(`field:${part.fieldname}=${part.value}`);
      }
    }

    expect(seen).toEqual([
      "file:file",
      "file:mask",
      "field:clientJobId=abc-123",
      "field:format=png",
      "field:quality=95",
    ]);
    expect(sizes.file).toBe(256 * 1024);
    expect(sizes.mask).toBe(8 * 1024);
  });

  it("propagates malformed multipart as an error", async () => {
    const raw = new PassThrough();
    Object.assign(raw, {
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    });
    raw.end(Buffer.from("this is not multipart at all"));
    const request = { raw } as unknown as FastifyRequest;

    await expect(async () => {
      for await (const part of multipartParts(request)) {
        if (part.type === "file") await drain(part.file);
      }
    }).rejects.toThrow();
  });

  it("never leaves an over-limit file stream with zero error listeners", async () => {
    // env.MAX_UPLOAD_SIZE_MB is "10" for all vitest runs (vitest.config.ts), so
    // busboy's fileSize limit is 10MB here — same as production with that setting.
    // A caller that inspects a part but doesn't immediately drain it (e.g. a
    // route that rejects on some other check first, such as wrong file type)
    // must not leave the file stream's eventual "limit" -> destroy(error) as an
    // unhandled "error" event, which crashes the process (Node's default
    // behavior for an EventEmitter error with no listener attached).
    const oversized = Buffer.alloc(11 * 1024 * 1024, 1); // 11MB > the 10MB limit
    const body = multipartBody([{ name: "file", filename: "big.bin", content: oversized }]);

    const generator = multipartParts(fakeRequest(body));
    const { value: part } = await generator.next();
    if (part?.type !== "file") throw new Error("expected a file part");

    // Deliberately do NOT drain part.file here — this is the abandoned-stream
    // scenario. The stream must already be safe against an unhandled "limit"
    // error the moment it's handed to the caller, not only once something
    // starts reading it.
    expect(part.file.listenerCount("error")).toBeGreaterThan(0);

    await generator.return(undefined);
  });

  it("fails an over-limit file with a 413 error, not a bare Error (#1280)", async () => {
    // A bare Error has no status, so a route that lets it escape (the on-demand
    // preview did) answered 500. The status must travel with the error. The
    // message keeps "file too large" because ocrUploadErrorStatus matches on it.
    const body = multipartBody([
      { name: "file", filename: "big.bin", content: Buffer.alloc(4096, 1) },
    ]);

    let caught: unknown;
    try {
      for await (const part of multipartParts(fakeRequest(body), { fileSize: 1024 })) {
        if (part.type === "file") await drain(part.file);
      }
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).toMatchObject({ statusCode: 413, code: "FST_REQ_FILE_TOO_LARGE" });
    expect((caught as Error).message).toMatch(/file too large/i);
  });

  it("rejects a request with more than 100 text fields", async () => {
    const body = multipartBody(
      Array.from({ length: 101 }, (_, i) => ({ name: `field${i}`, content: "x" })),
    );

    await expect(async () => {
      for await (const part of multipartParts(fakeRequest(body))) {
        if (part.type === "file") await drain(part.file);
      }
    }).rejects.toThrow("fields limit");
  });

  it("rejects a text field over the 1 MB cap instead of silently truncating it", async () => {
    const body = multipartBody([
      { name: "settings", content: Buffer.alloc(1024 * 1024 + 1, 0x61) },
    ]);

    await expect(async () => {
      for await (const part of multipartParts(fakeRequest(body))) {
        if (part.type === "file") await drain(part.file);
      }
    }).rejects.toThrow("field value too large");
  });

  it.each([
    [
      "too many text fields",
      multipartBody(Array.from({ length: 101 }, (_, i) => ({ name: `f${i}`, content: "x" }))),
    ],
    [
      "a text field over the cap",
      multipartBody([{ name: "settings", content: Buffer.alloc(1024 * 1024 + 1, 0x61) }]),
    ],
    [
      "more files than MAX_BATCH_SIZE",
      multipartBody(
        Array.from({ length: 11 }, (_, i) => ({
          name: "file",
          filename: `${i}.bin`,
          content: "x",
        })),
      ),
    ],
    ["a body that isn't multipart", Buffer.from("this is not multipart at all")],
  ])("marks %s as the client's error, a 400 (#1473)", async (_label, body) => {
    // A bare Error reaches the error handler as a reported 500. These are all
    // the request's fault, so the status travels with the error.
    let caught: unknown;
    try {
      for await (const part of multipartParts(fakeRequest(body))) {
        if (part.type === "file") await drain(part.file);
      }
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).toMatchObject({ statusCode: 400 });
  });

  it("marks a multipart header with no boundary as a 400 (#1473)", async () => {
    // A client that sets Content-Type by hand on a FormData body sends this.
    const raw = new PassThrough();
    Object.assign(raw, { headers: { "content-type": "multipart/form-data" } });
    raw.end("anything");

    await expect(async () => {
      for await (const part of multipartParts({ raw } as unknown as FastifyRequest)) {
        if (part.type === "file") await drain(part.file);
      }
    }).rejects.toMatchObject({ statusCode: 400 });
  });

  it("honors a route-specific two-file limit", async () => {
    const body = multipartBody([
      { name: "index", filename: "ocr-runtime-index.json", content: "index" },
      { name: "archive", filename: "ocr-runtime.tar.gz", content: "archive" },
      { name: "extra", filename: "extra.bin", content: "unexpected" },
    ]);

    await expect(async () => {
      for await (const part of multipartParts(fakeRequest(body), { files: 2 })) {
        if (part.type === "file") await drain(part.file);
      }
    }).rejects.toThrow("files limit");
  });
});

describe("readFilePart (#1473)", () => {
  it("reads a file part into memory", async () => {
    const body = multipartBody([{ name: "file", filename: "a.bin", content: "hello" }]);
    for await (const part of multipartParts(fakeRequest(body))) {
      if (part.type === "file") expect((await readFilePart(part.file)).toString()).toBe("hello");
    }
  });

  it("keeps the 413 of a part over the size limit", async () => {
    const body = multipartBody([
      { name: "file", filename: "big.bin", content: Buffer.alloc(4096, 1) },
    ]);
    const generator = multipartParts(fakeRequest(body), { fileSize: 1024 });
    const { value: part } = await generator.next();
    if (part?.type !== "file") throw new Error("expected a file part");

    await expect(readFilePart(part.file)).rejects.toMatchObject({ statusCode: 413 });
    await generator.return(undefined);
  });

  /** A request whose body so far is half of one file part, and the part. */
  async function halfSentFile() {
    const raw = new PassThrough();
    Object.assign(raw, {
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    });
    raw.write(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="a.bin"\r\n` +
        "Content-Type: application/octet-stream\r\n\r\npartial content",
    );
    const generator = multipartParts({ raw } as unknown as FastifyRequest);
    const { value: part } = await generator.next();
    if (part?.type !== "file") throw new Error("expected a file part");
    return { raw, generator, file: part.file };
  }

  it("marks a part the body ends in the middle of as a 400", async () => {
    // The reader is already waiting on the part when the body stops.
    const { raw, generator, file } = await halfSentFile();

    const reading = readFilePart(file);
    await sleep(10);
    raw.end();

    await expect(reading).rejects.toMatchObject({ statusCode: 400 });
    await generator.return(undefined);
  });

  it("fails a part the body stopped in even when nothing was reading it yet", async () => {
    // Busboy reports the cut on itself and ends the part as if it were
    // complete. Reading it later must fail, not hand back the truncated bytes
    // as if they were the whole file.
    const { raw, generator, file } = await halfSentFile();
    raw.end();
    await sleep(10);

    await expect(readFilePart(file)).rejects.toMatchObject({ statusCode: 400 });
    await generator.return(undefined);
  });

  it("fails the part being read with a 400 when the client drops the connection", async () => {
    // A dropped connection errors the request stream and never ends it, so
    // busboy never notices. The reader used to wait on the part forever, and
    // the upload never got to discard what it had already staged.
    const { raw, generator, file } = await halfSentFile();

    const reading = readFilePart(file).then(
      () => "resolved",
      (err: unknown) => err,
    );
    await sleep(10);
    raw.emit("error", Object.assign(new Error("aborted"), { code: "ECONNRESET" }));

    const outcome = await Promise.race([reading, sleep(1000).then(() => "still waiting")]);
    expect(outcome).toMatchObject({ statusCode: 400, code: "ECONNRESET" });
    await generator.return(undefined);
  });

  it("fails the next part with a 400 when the client drops the connection between parts", async () => {
    const raw = new PassThrough();
    Object.assign(raw, {
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    });
    // A whole field, then the start of the next part: busboy only emits the
    // field once it sees the boundary after it.
    raw.write(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="toolId"\r\n\r\nresize\r\n--${BOUNDARY}\r\n`,
    );
    const generator = multipartParts({ raw } as unknown as FastifyRequest);
    expect((await generator.next()).value).toMatchObject({ type: "field", value: "resize" });

    const next = generator.next().then(
      () => "resolved",
      (err: unknown) => err,
    );
    raw.emit("error", Object.assign(new Error("aborted"), { code: "ECONNRESET" }));

    expect(await next).toMatchObject({ statusCode: 400, code: "ECONNRESET" });
  });
});

describe("multipartFailure (#1341)", () => {
  async function limitError(): Promise<unknown> {
    const body = multipartBody([
      { name: "file", filename: "big.bin", content: Buffer.alloc(4096, 1) },
    ]);
    try {
      for await (const part of multipartParts(fakeRequest(body), { fileSize: 1024 })) {
        if (part.type === "file") await drain(part.file);
      }
    } catch (err) {
      return err;
    }
    throw new Error("expected the over-limit read to fail");
  }

  it("answers an over-limit file with 413, naming the limit that fired", async () => {
    // limitError() reads with a route-specific 1024-byte cap, not the global one.
    expect(multipartFailure(await limitError())).toEqual({
      status: 413,
      body: { error: "File exceeds the 1 KB upload limit" },
    });
  });

  it("names a storage-side limit carried on the error", () => {
    // putObjectStream's maxBytes error (object-storage.ts) carries limitBytes too.
    const err = Object.assign(new Error("Object exceeds the maximum allowed size"), {
      statusCode: 413,
      limitBytes: 25 * 1024 * 1024,
    });
    expect(multipartFailure(err).body).toEqual({ error: "File exceeds the 25 MB upload limit" });
  });

  it("falls back to MAX_UPLOAD_SIZE_MB when a 413 doesn't say its limit", () => {
    // vitest runs with MAX_UPLOAD_SIZE_MB=10 (vitest.config.ts).
    const err = Object.assign(new Error("too large"), { statusCode: 413 });
    expect(multipartFailure(err)).toEqual({
      status: 413,
      body: { error: "File exceeds the 10 MB upload limit" },
    });
  });

  it("keeps any other parse failure a 400, with internal paths stripped", () => {
    const failure = multipartFailure(new Error("Unexpected end of form at /tmp/uploads/abc"));
    expect(failure.status).toBe(400);
    expect(failure.body).toEqual({
      error: "Failed to parse multipart request",
      details: "Unexpected end of form at [internal]",
    });
  });

  it("treats a non-Error throw as a 400", () => {
    expect(multipartFailure("boom")).toEqual({
      status: 400,
      body: { error: "Failed to parse multipart request", details: "boom" },
    });
  });

  // #1421: a storage fault while the upload streams in (the workspace cap,
  // the disk floor, a full or read-only volume, an S3 outage) is the server's,
  // not a malformed request. It goes back to the route's caller unchanged, so
  // the global error handler answers with its status, message and code, and
  // reports it.
  it("rethrows a server-side fault instead of calling it a malformed request", () => {
    const cap = new SafeError("Workspace storage limit reached", {
      kind: "operational",
      code: "workspace-cap",
      statusCode: 503,
    });
    expect(() => multipartFailure(cap)).toThrow(cap);

    const other = Object.assign(new Error("storage exploded"), { statusCode: 500 });
    expect(() => multipartFailure(other)).toThrow(other);
  });
});
