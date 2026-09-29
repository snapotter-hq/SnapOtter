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
