import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import {
  requestsInFlight,
  trackRequestsInFlight,
} from "../../../apps/api/src/lib/requests-in-flight.js";

let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
});

/** A route that answers only once `release` is called. */
async function buildApp() {
  const a = Fastify();
  trackRequestsInFlight(a);
  const waiting: Array<() => void> = [];
  const hold = () => new Promise<void>((resolve) => waiting.push(resolve));
  a.post("/slow", async () => {
    await hold();
    return { ok: true };
  });
  a.get("/slow", async () => {
    await hold();
    return { ok: true };
  });
  a.post("/fail", async () => {
    throw new Error("boom");
  });
  a.addHook("onRequest", async (request, reply) => {
    if (request.url === "/denied") return reply.status(401).send({ error: "no" });
  });
  a.post("/denied", async () => ({ ok: true }));
  await a.ready();
  app = a;
  const until = async (pred: () => boolean) => {
    while (!pred()) await new Promise((r) => setImmediate(r));
  };
  const releaseAll = () => {
    for (const r of waiting.splice(0)) r();
  };
  return { a, until, waiting, releaseAll };
}

describe("requests in flight", () => {
  it("counts a write request until its response is sent", async () => {
    const { a, until, waiting, releaseAll } = await buildApp();
    const start = requestsInFlight();
    const pending = a.inject({ method: "POST", url: "/slow" });
    await until(() => waiting.length === 1);
    expect(requestsInFlight()).toBe(start + 1);
    releaseAll();
    expect((await pending).statusCode).toBe(200);
    expect(requestsInFlight()).toBe(start);
  });

  it("leaves reads out, so a health poll or a progress stream never counts", async () => {
    const { a, until, waiting, releaseAll } = await buildApp();
    const start = requestsInFlight();
    const pending = a.inject({ method: "GET", url: "/slow" });
    await until(() => waiting.length === 1);
    expect(requestsInFlight()).toBe(start);
    releaseAll();
    await pending;
  });

  it("drops a request that failed or was refused before its handler", async () => {
    const { a } = await buildApp();
    const start = requestsInFlight();
    expect((await a.inject({ method: "POST", url: "/fail" })).statusCode).toBe(500);
    expect((await a.inject({ method: "POST", url: "/denied" })).statusCode).toBe(401);
    expect(requestsInFlight()).toBe(start);
  });
});
