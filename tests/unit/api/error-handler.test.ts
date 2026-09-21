import { SafeError } from "@snapotter/shared";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";

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
