import type { Readable } from "node:stream";
import { Busboy, type BusboyHeaders } from "@fastify/busboy";
import type { FastifyRequest } from "fastify";
import { env } from "../config.js";

export interface MultipartFilePart {
  type: "file";
  fieldname: string;
  filename: string;
  encoding: string;
  mimetype: string;
  file: Readable;
}

export interface MultipartFieldPart {
  type: "field";
  fieldname: string;
  value: string;
}

export type MultipartPart = MultipartFilePart | MultipartFieldPart;

const DONE = Symbol("multipart-done");

/**
 * Iterate multipart parts by driving busboy directly.
 *
 * Replaces @fastify/multipart's request.parts(): that iterator treats the
 * REQUEST stream's "close" event as end-of-parts, and on a reused keep-alive
 * connection the whole body can be read (firing "close") while the consumer
 * is still streaming an earlier part to storage. Every part busboy emits
 * after that moment lands behind the end marker and is silently dropped; in
 * practice the second multipart POST on a warm connection lost its trailing
 * parts (the object eraser's mask file, then the settings fields). Verified
 * against @fastify/multipart 9.4.0 and 10.0.0. Busboy's own "finish" fires
 * only after every part has been emitted, so iteration ends there instead,
 * and the request stream's "close" is deliberately not treated as an end
 * signal (a client abort surfaces as an "error" on the stream and as a
 * truncated-part error from busboy).
 */
export async function* multipartParts(request: FastifyRequest): AsyncGenerator<MultipartPart> {
  const raw = request.raw;
  const bb = new Busboy({
    headers: raw.headers as BusboyHeaders,
    limits: {
      fileSize: env.MAX_UPLOAD_SIZE_MB > 0 ? env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 : undefined,
      files: env.MAX_BATCH_SIZE > 0 ? env.MAX_BATCH_SIZE : undefined,
    },
  });

  const queue: Array<MultipartPart | Error | typeof DONE> = [];
  let wake: (() => void) | null = null;
  const push = (value: MultipartPart | Error | typeof DONE) => {
    queue.push(value);
    wake?.();
    wake = null;
  };

  bb.on("file", (fieldname, stream, filename, encoding, mimetype) => {
    // Parity with @fastify/multipart's throwFileSizeLimit default: a stream
    // that hit the fileSize limit fails its consumer instead of silently
    // truncating the stored object.
    //
    // A file part can be destroyed before any consumer starts draining it: on
    // a fast enough connection (or with a fully-buffered body, e.g. Fastify's
    // inject()), busboy can process enough bytes to hit the limit before the
    // route handler's `await receiveUpload(part, ...)` has attached its own
    // stream listener. Readable.destroy(error) emits "error" on the stream
    // itself, and Node crashes the process if that event has zero listeners
    // at emit time. This baseline listener guarantees one is always present
    // from the moment the stream exists; the real consumer (async iteration
    // in receiveUpload -> putObjectStream) still receives the same event and
    // throws it normally, since EventEmitter delivers "error" to every
    // registered listener, not just the first.
    stream.on("error", () => {});
    stream.on("limit", () => stream.destroy(new Error("request file too large")));
    push({
      type: "file",
      fieldname,
      filename: filename || "upload",
      encoding,
      mimetype,
      file: stream,
    });
  });
  bb.on("field", (fieldname, value) => push({ type: "field", fieldname, value }));
  bb.on("filesLimit", () => push(new Error("reached files limit")));
  bb.on("partsLimit", () => push(new Error("reached parts limit")));
  bb.on("error", (err: unknown) => push(err instanceof Error ? err : new Error(String(err))));
  bb.on("finish", () => push(DONE));
  raw.on("error", (err: Error) => push(err));

  raw.pipe(bb);

  try {
    while (true) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      const value = queue.shift();
      if (value === undefined) continue;
      if (value === DONE) return;
      if (value instanceof Error) throw value;
      yield value;
    }
  } finally {
    raw.unpipe(bb);
    bb.removeAllListeners();
  }
}
