import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";

/**
 * Pins how app.close() treats open connections, which decides how long
 * shutdown() in apps/api/src/index.ts waits before it can move on to workers,
 * dispatchers and the analytics flush.
 *
 * fastify 5.11.1 changed the default ("idle") from closing every connection to
 * honouring in-flight requests (GHSA-3m5p-2c4r-xxw2 landed in the same line).
 * Node's server.close() only reaps connections that are idle at the instant it
 * runs, so a keep-alive socket whose response finishes a tick later lingers
 * until the 30s connection sweep, the same length as SHUTDOWN_TIMEOUT_MS. The
 * app keeps the old behaviour explicit with forceCloseConnections: true, and
 * the integration harness mirrors it so a test that listens on a real port
 * cannot hang its cleanup on that race.
 */

const root = resolve(import.meta.dirname, "../../..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

/** Boot a server with one route whose response never finishes on its own. */
async function listenWithInFlightResponse(forceCloseConnections: boolean | "idle") {
  const app = Fastify({ forceCloseConnections });
  app.get("/slow", (_request, reply) => {
    reply.raw.writeHead(200, { "content-type": "text/plain" });
    reply.raw.write("started");
    // No end(): the request stays in flight until the socket is closed.
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = app.server.address() as { port: number };
  const response = await fetch(`http://127.0.0.1:${port}/slow`);
  expect(response.status).toBe(200);
  return app;
}

function closeWithin(app: ReturnType<typeof Fastify>, ms: number): Promise<"closed" | "timeout"> {
  return Promise.race([
    app.close().then(() => "closed" as const),
    new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms)),
  ]);
}

describe("app.close() connection handling", () => {
  it("is pinned to forceCloseConnections: true in the app and the integration harness", () => {
    expect(read("apps/api/src/index.ts")).toMatch(/forceCloseConnections:\s*true/);
    expect(read("tests/integration/test-server.ts")).toMatch(/forceCloseConnections:\s*true/);
  });

  it("returns promptly with a response still in flight when forced", async () => {
    const app = await listenWithInFlightResponse(true);
    expect(await closeWithin(app, 2_000)).toBe("closed");
  });

  it("would wait on that same response under fastify's default, which is why the option is set", async () => {
    // Documents the upstream behaviour the option guards against. If this ever
    // starts closing promptly, fastify changed the default again and the
    // explicit option may be redundant.
    const app = await listenWithInFlightResponse("idle");
    expect(await closeWithin(app, 1_000)).toBe("timeout");
    app.server.closeAllConnections();
    await app.close();
  });
});
