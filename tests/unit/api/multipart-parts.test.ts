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
import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { multipartParts } from "../../../apps/api/src/lib/multipart-parts.js";

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
});
