import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";

async function buildApp() {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  app.get("/direct-404", async (_req, reply) => reply.status(404).send({ error: "Gone" }));
  app.get("/direct-own-code", async (_req, reply) =>
    reply.status(409).send({ error: "Taken", code: "ALIAS_TAKEN" }),
  );
  app.get("/thrown", async () => {
    throw Object.assign(new Error("Bad input"), { statusCode: 422 });
  });
  app.get("/accepted", async (_req, reply) =>
    reply.status(202).send({ jobId: "job-9", async: true, statusUrl: "/api/v1/jobs/job-9" }),
  );
  app.get("/ok", async () => ({ ok: true }));
  app.get("/text-error", async (_req, reply) => reply.status(400).type("text/plain").send("nope"));
  await app.ready();
  return app;
}

describe("response envelope", () => {
  it("adds a status-derived code and the request id to a direct JSON error", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/direct-404" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Gone", code: "NOT_FOUND", requestId: expect.any(String) });
  });

  it("keeps a code a route already set", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/direct-own-code" });
    expect(res.json()).toMatchObject({ error: "Taken", code: "ALIAS_TAKEN" });
  });

  it("gives an error that reaches the global handler the same envelope", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/thrown" });
    expect(res.json()).toMatchObject({
      error: "Bad input",
      code: "UNPROCESSABLE_ENTITY",
      requestId: expect.any(String),
    });
  });

  it("sets Location on a 202 from its statusUrl and leaves the body as sent", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/accepted" });
    expect(res.statusCode).toBe(202);
    expect(res.headers.location).toBe("/api/v1/jobs/job-9");
    expect(res.json()).toEqual({ jobId: "job-9", async: true, statusUrl: "/api/v1/jobs/job-9" });
  });

  it("leaves successful bodies unchanged", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/ok" });
    expect(res.json()).toEqual({ ok: true });
  });

  it("leaves non-JSON error bodies unchanged", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/text-error" });
    expect(res.body).toBe("nope");
  });
});
