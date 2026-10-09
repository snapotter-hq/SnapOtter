import { SafeError } from "@snapotter/shared";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reportError = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/error-report.js")>();
  return { ...actual, reportError };
});

import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";

beforeEach(() => {
  reportError.mockReset();
});

async function appThrowing(makeError: () => Error) {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  app.get("/boom", async () => {
    throw makeError();
  });
  await app.ready();
  return app;
}

/**
 * The production error handler (index.ts registers it) is the last place a
 * thrown error's message can be lost. The workspace cap's 503 used to reach
 * the client as "Internal server error", so nothing told the user why every
 * request had started failing (#1161).
 */
describe("registerErrorHandler", () => {
  it("shows a SafeError's message and code even at a 5xx status", async () => {
    const app = await appThrowing(
      () =>
        new SafeError("Workspace storage limit reached", {
          kind: "operational",
          code: "workspace-cap",
          statusCode: 503,
        }),
    );
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toEqual({
      error: "Workspace storage limit reached",
      code: "workspace-cap",
    });
    await app.close();
  });

  it("shows a SafeError's message without a code key when it carries none", async () => {
    const app = await appThrowing(
      () => new SafeError("Insufficient disk space for processing", { statusCode: 503 }),
    );
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toEqual({ error: "Insufficient disk space for processing" });
    await app.close();
  });

  it("masks a SafeError that carries no HTTP status, like the sidecar's", async () => {
    // packages/ai/src/bridge.ts builds SafeErrors whose message is Python's
    // stderr; only SafeErrors authored with a status are meant for a client.
    const app = await appThrowing(
      () => new SafeError("Traceback: /opt/venv/lib/rembg.py", { code: "exit-1" }),
    );
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: "Internal server error" });
    await app.close();
  });

  it("keeps details and code on a 4xx SafeError", async () => {
    const app = await appThrowing(
      () => new SafeError("Unsupported input", { code: "unsupported", statusCode: 415 }),
    );
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(415);
    expect(JSON.parse(res.body)).toEqual({
      error: "Unsupported input",
      details: "Unsupported input",
      code: "unsupported",
    });
    await app.close();
  });

  it("masks every other 5xx behind the generic message", async () => {
    const app = await appThrowing(() => new Error("ENOENT: /srv/data/secret.bin"));
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: "Internal server error" });
    await app.close();
  });

  it("passes a 4xx message through as error and details", async () => {
    const app = await appThrowing(() =>
      Object.assign(new Error("Malformed JSON in request body"), { statusCode: 400 }),
    );
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({
      error: "Malformed JSON in request body",
      details: "Malformed JSON in request body",
    });
    await app.close();
  });
});

// #1421: a storage fault during an upload now reaches this handler instead of
// being answered as a malformed request. It has to be shown and reported.
describe("a storage fault reaching the handler", () => {
  it("shows its message and code, and reports it once with the route's context", async () => {
    const fault = new SafeError("The server's storage is full.", {
      kind: "operational",
      code: "storage-full",
      statusCode: 503,
    });
    const app = await appThrowing(() => fault);
    const res = await app.inject({ method: "GET", url: "/boom" });

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toEqual({
      error: "The server's storage is full.",
      code: "storage-full",
    });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(
      fault,
      expect.objectContaining({ source: "http", method: "GET", statusCode: 503 }),
    );
    await app.close();
  });

  it("doesn't report a client's 4xx", async () => {
    const app = await appThrowing(() =>
      Object.assign(new Error("Unexpected end of form"), { statusCode: 400 }),
    );
    const res = await app.inject({ method: "GET", url: "/boom" });

    expect(res.statusCode).toBe(400);
    expect(reportError).not.toHaveBeenCalled();
    await app.close();
  });
});

// #2225: the library upload, save and preview routes let an over-limit file's
// error escape their multipart read to this handler, which passed busboy's
// "request file too large" through, while every route that catches the same
// error answers through multipartFailure() and names the limit. One condition,
// one wording: the handler answers the way multipartFailure() does.
describe("an over-limit multipart file reaching the handler", () => {
  const fileTooLarge = (extra: Record<string, unknown> = {}) =>
    Object.assign(new Error("request file too large"), {
      statusCode: 413,
      code: "FST_REQ_FILE_TOO_LARGE",
      ...extra,
    });

  it("answers 413 with multipartFailure()'s body, naming the limit that fired", async () => {
    // multipartParts() puts the cap that fired on the error (#1341).
    const app = await appThrowing(() => fileTooLarge({ limitBytes: 5 * 1024 * 1024 }));
    const res = await app.inject({ method: "GET", url: "/boom" });

    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body)).toEqual({ error: "File exceeds the 5 MB upload limit" });
    expect(reportError).not.toHaveBeenCalled();
    await app.close();
  });

  it("names MAX_UPLOAD_SIZE_MB for the plugin's own error, which carries no limit", async () => {
    // @fastify/multipart's RequestFileTooLargeError, which request.file()
    // callers still get, has the code and status but no limitBytes. The
    // plugin's fileSize is MAX_UPLOAD_SIZE_MB, 10 here (vitest.config.ts).
    const app = await appThrowing(() => fileTooLarge());
    const res = await app.inject({ method: "GET", url: "/boom" });

    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body)).toEqual({ error: "File exceeds the 10 MB upload limit" });
    await app.close();
  });

  it("leaves a 413 that isn't the file-size one alone", async () => {
    // The storage quota answers 413 with its own code; the panel keys on it.
    const app = await appThrowing(() =>
      Object.assign(new Error("Storage quota exceeded"), { statusCode: 413 }),
    );
    const res = await app.inject({ method: "GET", url: "/boom" });

    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body)).toEqual({
      error: "Storage quota exceeded",
      details: "Storage quota exceeded",
    });
    await app.close();
  });

  it("answers a real over-limit read that a route lets escape the same way", async () => {
    // The shape of the library upload routes: iterate request.parts() with no
    // try/catch of their own, so the 413 reaches the handler (pinned by
    // tests/unit/api/multipart-failure-drift.test.ts).
    const { registerUpload } = await import("../../../apps/api/src/plugins/upload.js");
    const app = Fastify({ logger: false });
    await registerUpload(app);
    registerErrorHandler(app);
    app.post("/upload", async (request) => {
      for await (const part of request.parts({ limits: { fileSize: 1024 } })) {
        if (part.type === "file") {
          for await (const _chunk of part.file) {
            // drain
          }
        }
      }
      return { ok: true };
    });
    await app.ready();

    const boundary = "----HandlerBoundary2225";
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="big.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      Buffer.alloc(4096, 1),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/upload",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    });

    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body)).toEqual({ error: "File exceeds the 1 KB upload limit" });
    await app.close();
  });
});
