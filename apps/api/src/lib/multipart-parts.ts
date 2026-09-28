import type { Readable } from "node:stream";
import { Busboy, type BusboyHeaders } from "@fastify/busboy";
import type { FastifyRequest } from "fastify";
import { env } from "../config.js";
import { stripInternalPaths } from "./errors.js";

export interface MultipartFilePart {
  type: "file";
  fieldname: string;
  filename: string;
  encoding: string;
  mimetype: string;
  file: Readable & { truncated?: boolean };
}

export interface MultipartFieldPart {
  type: "field";
  fieldname: string;
  value: string;
}

export type MultipartPart = MultipartFilePart | MultipartFieldPart;

/**
 * Caps on multipart text fields, shared with the plugin registration in
 * plugins/upload.ts so the two limit sets cannot drift. fieldSize restates
 * busboy's implicit 1 MB per-field default; fields bounds the per-request
 * field count, which busboy otherwise leaves unlimited (issue #821).
 */
export const MULTIPART_FIELD_SIZE_BYTES = 1024 * 1024;
export const MULTIPART_MAX_FIELDS = 100;

const DONE = Symbol("multipart-done");

/**
 * The error an over-limit file part fails with. It carries a 413, and the code
 * @fastify/multipart uses for the same condition, so a route that lets it
 * escape answers 413 through the error handler instead of a bare-Error 500
 * (#1280). Routes that catch it answer through multipartFailure below.
 * limitBytes is the cap that fired, so the answer names it (#1341).
 */
function fileTooLargeError(limitBytes: number): Error {
  return Object.assign(new Error("request file too large"), {
    statusCode: 413,
    code: "FST_REQ_FILE_TOO_LARGE",
    limitBytes,
  });
}

const MIB = 1024 * 1024;

function formatLimit(bytes: number): string {
  if (bytes < MIB) return `${Math.ceil(bytes / 1024)} KB`;
  const mb = bytes / MIB;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/**
 * The response for a multipart read that threw: 413 naming the limit that
 * fired when a file was over it, 400 for anything else. Routes that catch
 * around their read loop answer with this rather than a hard-coded 400, so a
 * client can tell "too big" from "malformed" (#1341). The limit comes from the
 * error (busboy's and putObjectStream's both carry it), falling back to
 * MAX_UPLOAD_SIZE_MB.
 */
export function multipartFailure(
  err: unknown,
):
  | { status: 413; body: { error: string } }
  | { status: 400; body: { error: string; details: string } } {
  const e = err as { statusCode?: unknown; limitBytes?: unknown } | null;
  if (e?.statusCode === 413) {
    const limitBytes =
      typeof e.limitBytes === "number" ? e.limitBytes : env.MAX_UPLOAD_SIZE_MB * MIB;
    return {
      status: 413,
      body: { error: `File exceeds the ${formatLimit(limitBytes)} upload limit` },
    };
  }
  return {
    status: 400,
    body: {
      error: "Failed to parse multipart request",
      details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
    },
  };
}

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
export async function* multipartParts(
  request: FastifyRequest,
  limits: { fileSize?: number; files?: number } = {},
): AsyncGenerator<MultipartPart> {
  const raw = request.raw;
  const fileSizeLimit =
    limits.fileSize ?? (env.MAX_UPLOAD_SIZE_MB > 0 ? env.MAX_UPLOAD_SIZE_MB * MIB : undefined);
  const bb = new Busboy({
    headers: raw.headers as BusboyHeaders,
    limits: {
      fileSize: fileSizeLimit,
      files: limits.files ?? (env.MAX_BATCH_SIZE > 0 ? env.MAX_BATCH_SIZE : undefined),
      fieldSize: MULTIPART_FIELD_SIZE_BYTES,
      fields: MULTIPART_MAX_FIELDS,
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
    // "limit" only fires when a fileSize limit is set, so fileSizeLimit is defined.
    stream.on("limit", () => stream.destroy(fileTooLargeError(fileSizeLimit ?? 0)));
    push({
      type: "file",
      fieldname,
      filename: filename || "upload",
      encoding,
      mimetype,
      file: stream,
    });
  });
  bb.on("field", (fieldname, value, _fieldnameTruncated, valueTruncated) => {
    // Busboy clips a field value at fieldSize and keeps going; a clipped
    // settings payload must fail loudly here, not parse as garbage downstream.
    if (valueTruncated) {
      push(new Error(`field value too large: ${fieldname}`));
      return;
    }
    push({ type: "field", fieldname, value });
  });
  bb.on("filesLimit", () => push(new Error("reached files limit")));
  bb.on("fieldsLimit", () => push(new Error("reached fields limit")));
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
