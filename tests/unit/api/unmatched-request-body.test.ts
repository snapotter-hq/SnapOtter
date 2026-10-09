import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { afterAll, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({ BASE_PATH: "" }));
vi.mock("../../../apps/api/src/config.js", () => ({ env: config }));

import { registerStatic } from "../../../apps/api/src/plugins/static.js";
import { skipUnmatchedRequestBodies } from "../../../apps/api/src/plugins/unmatched-body.js";

/**
 * A request for a path with no route has nothing to parse, but Fastify still runs the
 * content-type parser for it, so an unauthenticated client could make the server buffer
 * up to bodyLimit (100 MB by default, 1 GiB when uploads are unlimited) before the 404
 * (#2123).
 */

const root = mkdtempSync(join(tmpdir(), "snapotter-unmatched-body-"));
mkdirSync(join(root, "assets"));
writeFileSync(join(root, "index.html"), '<html><head><base href="/" /></head></html>');
afterAll(() => rmSync(root, { recursive: true, force: true }));

const BIG = 5 * 1024 * 1024;

/** The app as index.ts builds it: a JSON parser, plus a urlencoded one when SAML is on. */
async function buildApp(opts: { cors?: boolean } = {}) {
  const seen: { type: string; length: number }[] = [];
  const app = Fastify({ bodyLimit: 100 * 1024 * 1024 });
  // Production runs cors with origin: false unless CORS_ORIGIN is set; its OPTIONS *
  // catch-all route is still registered and matches every preflight.
  if (opts.cors) await app.register(cors, { origin: false });
  const record = (type: string) => (_request: unknown, body: string | Buffer, done: Function) => {
    seen.push({ type, length: body.length });
    done(null, body.length > 0 && type === "json" ? JSON.parse(body.toString()) : body);
  };
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, record("json"));
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    record("form"),
  );
  skipUnmatchedRequestBodies(app);
  app.post("/api/echo", async (request) => ({ got: request.body }));
  await registerStatic(app, root);
  return { app, seen };
}

describe("a request for a path with no route", () => {
  it.each([
    ["JSON", "application/json", `{"pad":"${"x".repeat(BIG)}"}`],
    ["urlencoded", "application/x-www-form-urlencoded", `pad=${"x".repeat(BIG)}`],
  ])("never has its %s body handed to a parser", async (_label, contentType, payload) => {
    const { app, seen } = await buildApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/does-not-exist",
        headers: { "content-type": contentType },
        payload,
      });

      expect(response.statusCode).toBe(404);
      // The parser may run on an empty body; it must not see the megabytes.
      expect(Math.max(0, ...seen.map((s) => s.length))).toBe(0);
    } finally {
      await app.close();
    }
  });

  it("is still a plain 404 for other methods with a body", async () => {
    const { app, seen } = await buildApp();
    try {
      for (const method of ["PUT", "PATCH", "DELETE"] as const) {
        const response = await app.inject({
          method,
          url: "/no/such/thing",
          headers: { "content-type": "application/json" },
          payload: `{"pad":"${"x".repeat(1024)}"}`,
        });
        expect(response.statusCode, method).toBe(404);
      }
      expect(Math.max(0, ...seen.map((s) => s.length))).toBe(0);
    } finally {
      await app.close();
    }
  });

  it("still gets the save-password redirect on POST to the app root (#2088)", async () => {
    const { app } = await buildApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: "username=admin&password=new-Password1",
      });
      expect(response.statusCode).toBe(303);
      expect(response.headers.location).toBe("/");
    } finally {
      await app.close();
    }
  });

  it("answers an unmatched request that sends its body with no declared length", async () => {
    const { app, seen } = await buildApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/nowhere",
        headers: { "content-type": "application/json" },
        payload: Readable.from(['{"pad":"', "x".repeat(1024), '"}']),
      });
      expect(response.statusCode).toBe(404);
      expect(Math.max(0, ...seen.map((s) => s.length))).toBe(0);
    } finally {
      await app.close();
    }
  });

  it("does not buffer the body of a CORS preflight to a path with no route", async () => {
    const { app, seen } = await buildApp({ cors: true });
    try {
      for (const url of ["/nope", "/api/nope"]) {
        const response = await app.inject({
          method: "OPTIONS",
          url,
          headers: { "content-type": "application/json" },
          payload: `{"pad":"${"x".repeat(BIG)}"}`,
        });
        expect(response.statusCode, url).toBe(404);
      }
      expect(Math.max(0, ...seen.map((s) => s.length))).toBe(0);
    } finally {
      await app.close();
    }
  });
});

describe("a request for a path that has a route", () => {
  it("still has its body parsed in full", async () => {
    const { app, seen } = await buildApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/echo",
        headers: { "content-type": "application/json" },
        payload: { hello: "world", n: 3 },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ got: { hello: "world", n: 3 } });
      expect(seen).toEqual([
        { type: "json", length: JSON.stringify({ hello: "world", n: 3 }).length },
      ]);
    } finally {
      await app.close();
    }
  });

  it("still enforces the body limit on its own routes", async () => {
    const app = Fastify({ bodyLimit: 1024 });
    skipUnmatchedRequestBodies(app);
    app.post("/api/echo", async (request) => ({ got: request.body }));
    try {
      // Declared length over the limit: refused before anything is read.
      const declared = await app.inject({
        method: "POST",
        url: "/api/echo",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ pad: "x".repeat(4096) }),
      });
      expect(declared.statusCode).toBe(413);

      // No declared length: the limit has to be enforced while reading, which a hook
      // that emptied every body would silently skip.
      const streamed = await app.inject({
        method: "POST",
        url: "/api/echo",
        headers: { "content-type": "application/json" },
        payload: Readable.from(['{"pad":"', "x".repeat(4096), '"}']),
      });
      expect(streamed.statusCode).toBe(413);
    } finally {
      await app.close();
    }
  });

  it("still has a CORS preflight to a real route answered by cors", async () => {
    const app = Fastify();
    await app.register(cors, { origin: "https://app.example" });
    skipUnmatchedRequestBodies(app);
    app.post("/api/echo", async () => ({ ok: true }));
    try {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/api/echo",
        headers: {
          origin: "https://app.example",
          "access-control-request-method": "POST",
        },
      });
      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe("https://app.example");
    } finally {
      await app.close();
    }
  });
});

it("keeps the hook wired in before routes and plugins in the production entry point", () => {
  // index.ts boots the whole service; the unit harness cannot import it.
  const source = readFileSync(new URL("../../../apps/api/src/index.ts", import.meta.url), "utf8");
  const hook = source.indexOf("skipUnmatchedRequestBodies(app);");
  expect(hook).toBeGreaterThan(-1);
  expect(hook).toBeLessThan(source.indexOf("await app.register(cors"));
});
