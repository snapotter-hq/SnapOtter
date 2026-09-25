import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { stripBasePath } from "../../../apps/api/src/lib/base-path.js";
import { loadEnv } from "../../../apps/api/src/lib/env.js";

const config = vi.hoisted(() => ({ BASE_PATH: "" }));
vi.mock("../../../apps/api/src/config.js", () => ({ env: config }));

import { registerStatic } from "../../../apps/api/src/plugins/static.js";
import { docsRoutes } from "../../../apps/api/src/routes/docs.js";

const root = mkdtempSync(join(tmpdir(), "snapotter-subpath-"));
mkdirSync(join(root, "assets"));
writeFileSync(
  join(root, "index.html"),
  '<html><head><base href="/" /></head><script src="./assets/app.js"></script></html>',
);
writeFileSync(join(root, "assets/app.js"), "console.log('loaded')");
afterAll(() => rmSync(root, { recursive: true, force: true }));
afterEach(() => vi.unstubAllEnvs());

describe("BASE_PATH configuration", () => {
  it.each([
    ["", ""],
    ["/", ""],
    ["/snapotter/", "/snapotter"],
    ["/apps/snapotter", "/apps/snapotter"],
  ])("normalizes %s", (input, output) => {
    vi.stubEnv("BASE_PATH", input);
    expect(loadEnv().BASE_PATH).toBe(output);
  });
  it.each([
    "snapotter",
    "//evil.test",
    "/a//b",
    "/../a",
    "/a?b",
    '/a"',
    "/a%2fb",
    "https://example.com/a",
  ])("rejects %s", (input) => {
    vi.stubEnv("BASE_PATH", input);
    expect(() => loadEnv()).toThrow("BASE_PATH");
  });
});

describe.each(["", "/snapotter", "/apps/snapotter"])("deployment at '%s'", (basePath) => {
  it("serves deep links and assets while routing API requests before security hooks", async () => {
    config.BASE_PATH = basePath;
    const seen: string[] = [];
    const app = Fastify({ rewriteUrl: (request) => stripBasePath(request.url ?? "/", basePath) });
    app.addHook("onRequest", async (request) => {
      seen.push(request.url);
    });
    app.get("/api/v1/health", async () => ({ ok: true }));
    await registerStatic(app, root);
    try {
      for (const path of ["", "/", "/index.html", "/image/resize?width=200"]) {
        const response = await app.inject(`${basePath}${path}` || "/");
        expect(response.statusCode).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-cache");
        expect(response.body).toContain(`<base href="${basePath}/"`);
        expect(new URL("./assets/app.js", `https://example.com${basePath}/`).pathname).toBe(
          `${basePath}/assets/app.js`,
        );
      }
      expect((await app.inject(`${basePath}/assets/app.js`)).body).toContain("loaded");
      expect((await app.inject(`${basePath}/api/v1/health?ready=1`)).json()).toEqual({ ok: true });
      expect(seen).toContain("/api/v1/health?ready=1");
      expect((await app.inject("/api/v1/health")).statusCode).toBe(200);
      expect((await app.inject(`${basePath}/api/missing`)).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

it("does not strip a similar prefix or alter query strings", () => {
  expect(stripBasePath("/snapotter-other/api/auth/login", "/snapotter")).toBe(
    "/snapotter-other/api/auth/login",
  );
  expect(stripBasePath("/snapotter?next=%2Ffiles", "/snapotter")).toBe("/?next=%2Ffiles");
  expect(stripBasePath("/api/v1/health", "/snapotter")).toBe("/api/v1/health");
});

it("keeps API documentation redirects and server URLs under the prefix", async () => {
  config.BASE_PATH = "/snapotter";
  const app = Fastify({
    rewriteUrl: (request) => stripBasePath(request.url ?? "/", config.BASE_PATH),
  });
  await docsRoutes(app);
  try {
    const redirect = await app.inject("/snapotter/api/docs");
    expect(redirect.headers.location).toBe("/snapotter/api/docs/");
    const page = await app.inject("/snapotter/api/docs/");
    expect(page.statusCode).toBe(200);
    const spec = await app.inject("/snapotter/api/docs/openapi.json");
    expect(spec.json().servers).toEqual([{ url: "/snapotter" }]);
    const localized = await app.inject("/snapotter/api/v1/openapi.yaml?lang=fr");
    expect(localized.body).toContain("url: /snapotter");
  } finally {
    await app.close();
  }
});
