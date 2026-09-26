import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
afterEach(() => {
  vi.unstubAllEnvs();
  config.BASE_PATH = "";
});

it("keeps the production URL rewrite wired before routing and auth", () => {
  // index.ts boots the full service; the integration harness cannot import it.
  // Pin its wiring so removing the production rewrite cannot leave tests green.
  const source = readFileSync(new URL("../../../apps/api/src/index.ts", import.meta.url), "utf8");
  expect(source).toMatch(
    /const app = Fastify\(\{\s*rewriteUrl: \(request\) => stripBasePath\(request\.url \?\? "\/", env\.BASE_PATH\)/,
  );
});

it("keeps result download URLs root-relative (no baked deployment prefix)", () => {
  // Drift guard for #1274: interpolating env.BASE_PATH into a persisted
  // result URL bakes the deployment prefix into the jobs.result JSON, so
  // changing BASE_PATH leaves every earlier result pointing at the old
  // prefix. Server-emitted download/preview URLs must be root-relative and
  // let clients resolve them against their own base. Route registrations
  // (`"/api/v1/download/:jobId/..."`) are plain strings and stay fine.
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".ts")) {
        for (const [i, line] of readFileSync(p, "utf8").split("\n").entries()) {
          // A baked prefix is always a template literal interpolating
          // env.BASE_PATH into a /api/v1/download/ URL.
          if (
            /["'`]\/api\/v1\/download\//.test(line) &&
            line.includes("${") &&
            line.includes("env.BASE_PATH")
          )
            offenders.push(`${p}:${i + 1}: ${line.trim()}`);
        }
      }
    }
  };
  walk(fileURLToPath(new URL("../../../apps/api/src", import.meta.url)));
  expect(offenders).toEqual([]);
});

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
    "/api",
    "/api/v1",
    "/assets",
  ])("rejects %s", (input) => {
    vi.stubEnv("BASE_PATH", input);
    expect(() => loadEnv()).toThrow("BASE_PATH");
  });

  it("allows prefixes that only share letters with app paths", () => {
    vi.stubEnv("BASE_PATH", "/apis");
    expect(loadEnv().BASE_PATH).toBe("/apis");
  });

  describe("with OIDC enabled", () => {
    const enableOidc = (externalUrl: string) => {
      vi.stubEnv("OIDC_ENABLED", "true");
      vi.stubEnv("OIDC_ISSUER_URL", "https://idp.example.com");
      vi.stubEnv("OIDC_CLIENT_ID", "client");
      vi.stubEnv("OIDC_CLIENT_SECRET", "secret");
      vi.stubEnv("EXTERNAL_URL", externalUrl);
    };

    it.each([
      ["", "https://example.com"],
      ["", "https://example.com/"],
      ["/snapotter", "https://example.com/snapotter"],
      ["/snapotter/", "https://example.com/snapotter/"],
    ])("accepts BASE_PATH %s with EXTERNAL_URL %s", (basePath, externalUrl) => {
      enableOidc(externalUrl);
      vi.stubEnv("BASE_PATH", basePath);
      expect(() => loadEnv()).not.toThrow();
    });

    it.each([
      ["/snapotter", "https://example.com"],
      ["", "https://example.com/snapotter"],
      ["/snapotter", "not a url"],
    ])("rejects BASE_PATH %s with EXTERNAL_URL %s", (basePath, externalUrl) => {
      enableOidc(externalUrl);
      vi.stubEnv("BASE_PATH", basePath);
      expect(() => loadEnv()).toThrow("EXTERNAL_URL");
    });
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
    // The prefixed server is prepended; the spec's own entries (with the
    // "Current instance" description) are kept, not dropped.
    expect(spec.json().servers).toEqual([
      { url: "/snapotter" },
      { url: "/", description: "Current instance" },
    ]);
    const localized = await app.inject("/snapotter/api/v1/openapi.yaml?lang=fr");
    expect(localized.body).toContain("url: /snapotter");
  } finally {
    await app.close();
  }
});

it("caches the localized spec body so repeated ?lang= requests do not re-transform", async () => {
  config.BASE_PATH = "/snapotter";
  const app = Fastify({
    rewriteUrl: (request) => stripBasePath(request.url ?? "/", config.BASE_PATH),
  });
  await docsRoutes(app);
  try {
    const first = await app.inject("/snapotter/api/v1/openapi.yaml?lang=fr");
    const second = await app.inject("/snapotter/api/v1/openapi.yaml?lang=fr");
    expect(first.body).toBe(second.body);
    expect(first.body).toContain("url: /snapotter");
  } finally {
    await app.close();
  }
});

describe("index.html <base> rewrite", () => {
  it("matches the tag shipped in the web app source", () => {
    const source = readFileSync(new URL("../../../apps/web/index.html", import.meta.url), "utf8");
    expect(source.split('<base href="/"').length - 1).toBe(1);
  });

  it("refuses to start under a subpath when the build has no tag to rewrite", async () => {
    const stale = mkdtempSync(join(tmpdir(), "snapotter-stale-dist-"));
    writeFileSync(join(stale, "index.html"), '<html><script src="/assets/app.js"></script></html>');
    config.BASE_PATH = "/snapotter";
    const app = Fastify();
    try {
      await expect(registerStatic(app, stale)).rejects.toThrow("BASE_PATH");
    } finally {
      await app.close();
      rmSync(stale, { recursive: true, force: true });
    }
  });

  it("still serves a build without the tag at the root", async () => {
    const stale = mkdtempSync(join(tmpdir(), "snapotter-stale-dist-"));
    writeFileSync(join(stale, "index.html"), "<html>root</html>");
    const app = Fastify();
    try {
      await registerStatic(app, stale);
      expect((await app.inject("/files")).body).toBe("<html>root</html>");
    } finally {
      await app.close();
      rmSync(stale, { recursive: true, force: true });
    }
  });
});
