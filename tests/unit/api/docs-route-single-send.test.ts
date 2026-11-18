/**
 * The docs text routes must send their response exactly once.
 *
 * An async handler that calls reply.send() and resolves undefined lets
 * Fastify's wrapThenable send a second time while async onSend hooks (the app
 * registers several) are still running, so the second writeHead throws
 * ERR_HTTP_HEADERS_SENT and the request is logged as a 500 (Sentry NODE-A3,
 * GET /llms.txt).
 */
import { Writable } from "node:stream";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {},
  pool: {},
  closeDb: async () => {},
  schema: {},
}));

import { docsRoutes } from "../../../apps/api/src/routes/docs.js";

const logLines: Array<{ level: number; msg?: string; err?: { message?: string } }> = [];
const sink = new Writable({
  write(chunk, _encoding, callback) {
    for (const line of String(chunk).split("\n")) {
      if (line.trim()) logLines.push(JSON.parse(line));
    }
    callback();
  },
});

const app = Fastify({ logger: { level: "warn", stream: sink } });

beforeAll(async () => {
  // Stand-in for the app's async onSend hooks (security headers, response
  // envelope, inline tool audit): any async hook opens the double-send window.
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("x-test-hook", "1");
    await Promise.resolve();
    return payload;
  });
  await app.register(docsRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("docs text routes send once", () => {
  it.each(["/llms.txt", "/llms-full.txt", "/llms.de.txt", "/api/v1/openapi.yaml"])(
    "%s answers 200 without a second send",
    async (url) => {
      logLines.length = 0;
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(200);
      expect(res.headers["x-test-hook"]).toBe("1");
      expect(res.body.length).toBeGreaterThan(0);
      // inject resolves on the first end(); let the losing send settle and log.
      await new Promise((resolve) => setImmediate(resolve));
      const doubleSend = logLines.filter(
        (line) =>
          /already sent/i.test(line.msg ?? "") ||
          /already sent|headers after they are sent/i.test(line.err?.message ?? ""),
      );
      expect(doubleSend).toEqual([]);
    },
  );
});
