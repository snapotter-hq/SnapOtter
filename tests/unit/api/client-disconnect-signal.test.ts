import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { clientDisconnectSignal } from "../../../apps/api/src/lib/client-disconnect-signal.js";
import { prepareRouteImage } from "../../../apps/api/src/lib/image-input-prep.js";

const expensiveSvg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000">' +
    '<defs><filter id="f"><feTurbulence baseFrequency="0.05" numOctaves="8"/><feGaussianBlur stdDeviation="20"/></filter></defs>' +
    `<rect id="r" width="2000" height="2000" filter="url(#f)"/>${'<use href="#r"/>'.repeat(40)}</svg>`,
);

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function listen(build: (instance: FastifyInstance) => void): Promise<number> {
  app = Fastify();
  build(app);
  await app.listen({ port: 0, host: "127.0.0.1" });
  return (app.server.address() as AddressInfo).port;
}

/** Sends a complete POST body, then calls `onSent` so the test can hang up. */
function post(port: number, onSent: (destroy: () => void) => void): Promise<void> {
  return new Promise((resolve) => {
    const req = httpRequest({
      port,
      host: "127.0.0.1",
      method: "POST",
      path: "/",
      headers: { "content-type": "text/plain" },
    });
    req.on("error", () => resolve());
    req.on("close", () => resolve());
    req.end("body", () => onSent(() => req.destroy()));
  });
}

describe("clientDisconnectSignal", () => {
  it("aborts when the client hangs up after the whole body arrived", async () => {
    const seen = Promise.withResolvers<AbortSignal>();
    const aborted = Promise.withResolvers<void>();
    const port = await listen((instance) => {
      instance.post("/", async (_request, reply) => {
        const signal = clientDisconnectSignal(reply);
        seen.resolve(signal);
        signal.addEventListener("abort", () => aborted.resolve());
        await aborted.promise;
        return reply.send({ ok: true });
      });
    });

    const done = post(port, (destroy) => {
      void seen.promise.then(() => destroy());
    });
    await aborted.promise;
    await done;
    expect((await seen.promise).aborted).toBe(true);
  });

  it("stays unaborted for a request that finishes normally", async () => {
    const seen = Promise.withResolvers<AbortSignal>();
    const port = await listen((instance) => {
      instance.post("/", async (_request, reply) => {
        seen.resolve(clientDisconnectSignal(reply));
        return reply.send({ ok: true });
      });
    });

    await new Promise<void>((resolve) => {
      const req = httpRequest(
        {
          port,
          host: "127.0.0.1",
          method: "POST",
          path: "/",
          headers: { "content-type": "text/plain" },
        },
        (res) => {
          res.resume();
          res.on("close", () => resolve());
        },
      );
      req.end("body");
    });
    await app?.close();
    app = undefined;
    expect((await seen.promise).aborted).toBe(false);
  });

  it("cancels an SVG render that is already running when the client leaves", async () => {
    const started = Promise.withResolvers<void>();
    const outcome = Promise.withResolvers<unknown>();
    const port = await listen((instance) => {
      instance.post("/", async (_request, reply) => {
        const signal = clientDisconnectSignal(reply);
        started.resolve();
        const startedAt = Date.now();
        const failure = await prepareRouteImage(expensiveSvg, "x.svg", "svg", { signal }).then(
          () => null,
          (err: unknown) => err,
        );
        outcome.resolve({ failure, elapsedMs: Date.now() - startedAt });
        return reply.send({ ok: true });
      });
    });

    const done = post(port, (destroy) => {
      void started.promise.then(() => destroy());
    });
    const { failure, elapsedMs } = (await outcome.promise) as {
      failure: Error | null;
      elapsedMs: number;
    };
    await done;
    expect(failure?.name).toBe("AbortError");
    expect(elapsedMs).toBeLessThan(5000);
  }, 30_000);
});
