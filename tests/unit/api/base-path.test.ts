import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  // Both SSO providers build their callback URLs from EXTERNAL_URL while the
  // session cookie follows BASE_PATH, so the boot check has to cover each one
  // on its own (#1356).
  const enableSso = {
    OIDC: () => {
      vi.stubEnv("OIDC_ENABLED", "true");
      vi.stubEnv("OIDC_ISSUER_URL", "https://idp.example.com");
      vi.stubEnv("OIDC_CLIENT_ID", "client");
      vi.stubEnv("OIDC_CLIENT_SECRET", "secret");
    },
    SAML: () => {
      vi.stubEnv("SAML_ENABLED", "true");
      vi.stubEnv("SAML_IDP_SSO_URL", "https://idp.example.com/sso");
      vi.stubEnv("SAML_IDP_CERTIFICATE", "MIIC-test-certificate");
    },
  };

  describe.each(Object.keys(enableSso) as (keyof typeof enableSso)[])(
    "with %s enabled",
    (provider) => {
      const configure = (basePath: string, externalUrl: string) => {
        // Pin both flags off first so each arm runs alone, whatever the shell exports.
        vi.stubEnv("OIDC_ENABLED", "false");
        vi.stubEnv("SAML_ENABLED", "false");
        enableSso[provider]();
        vi.stubEnv("EXTERNAL_URL", externalUrl);
        vi.stubEnv("BASE_PATH", basePath);
      };

      it.each([
        ["", "https://example.com"],
        ["", "https://example.com/"],
        ["/snapotter", "https://example.com/snapotter"],
        ["/snapotter/", "https://example.com/snapotter/"],
      ])("accepts BASE_PATH %s with EXTERNAL_URL %s", (basePath, externalUrl) => {
        configure(basePath, externalUrl);
        expect(() => loadEnv()).not.toThrow();
      });

      it.each([
        ["/snapotter", "https://example.com"],
        ["", "https://example.com/snapotter"],
        ["/snapotter", "https://example.com/other"],
      ])("rejects BASE_PATH %s with EXTERNAL_URL %s", (basePath, externalUrl) => {
        configure(basePath, externalUrl);
        expect(() => loadEnv()).toThrow(/EXTERNAL_URL path .* must match BASE_PATH/);
      });

      it("rejects an EXTERNAL_URL that is not an absolute URL", () => {
        configure("/snapotter", "not a url");
        expect(() => loadEnv()).toThrow(/EXTERNAL_URL must be an absolute URL/);
      });

      // Callback and logout URLs are EXTERNAL_URL plus a path, so a trailing
      // slash would double up (#1599).
      it.each([
        ["", "https://example.com/", "https://example.com"],
        ["", "https://example.com//", "https://example.com"],
        ["/snapotter", "https://example.com/snapotter/", "https://example.com/snapotter"],
      ])(
        "strips the trailing slash from BASE_PATH %s with EXTERNAL_URL %s",
        (basePath, input, output) => {
          configure(basePath, input);
          expect(loadEnv().EXTERNAL_URL).toBe(output);
        },
      );

      // Appending a path after a query string or fragment lands outside the
      // URL's path, and a non-http scheme can't receive an IdP redirect at all,
      // so SSO could never work with these. Fail at boot instead (#1599).
      it.each([
        ["/snapotter", "file:///snapotter"],
        ["/snapotter", "ftp://example.com/snapotter"],
        ["/snapotter", "https://example.com/snapotter?x=1"],
        ["/snapotter", "https://example.com/snapotter#top"],
        ["", "https://example.com/?x=1"],
        // URL parses these with an empty search and hash, but appending a path
        // still lands after the "?" or "#".
        ["", "https://example.com/?"],
        ["/snapotter", "https://example.com/snapotter#"],
      ])("rejects BASE_PATH %s with EXTERNAL_URL %s", (basePath, externalUrl) => {
        configure(basePath, externalUrl);
        expect(() => loadEnv()).toThrow(
          /EXTERNAL_URL must be an http\(s\) URL with no query string or fragment/,
        );
      });
    },
  );

  it("leaves EXTERNAL_URL unchecked against BASE_PATH when no SSO provider is on", () => {
    vi.stubEnv("OIDC_ENABLED", "false");
    vi.stubEnv("SAML_ENABLED", "false");
    vi.stubEnv("BASE_PATH", "/snapotter");
    vi.stubEnv("EXTERNAL_URL", "https://example.com");
    expect(() => loadEnv()).not.toThrow();
  });

  // The secure-cookie check reads EXTERNAL_URL with SSO off too, so the slash
  // is trimmed whatever else is configured, while values SSO would reject
  // still boot as before (#1599).
  it.each([
    ["", ""],
    ["https://example.com", "https://example.com"],
    ["https://example.com/", "https://example.com"],
    ["https://example.com/snapotter/", "https://example.com/snapotter"],
    ["https://example.com/?x=1", "https://example.com/?x=1"],
    [" https://example.com/\n", "https://example.com"],
    ["https://example.com/snapotter/ ", "https://example.com/snapotter"],
  ])("normalizes EXTERNAL_URL %j without SSO", (input, output) => {
    vi.stubEnv("OIDC_ENABLED", "false");
    vi.stubEnv("SAML_ENABLED", "false");
    vi.stubEnv("EXTERNAL_URL", input);
    expect(loadEnv().EXTERNAL_URL).toBe(output);
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

  it("404s missing assets after the prefix is stripped, and keeps the shell for deep links (#1275)", async () => {
    config.BASE_PATH = basePath;
    const app = Fastify({ rewriteUrl: (request) => stripBasePath(request.url ?? "/", basePath) });
    await registerStatic(app, root);
    try {
      // Prefix kept by the proxy, and prefix already stripped by it.
      for (const url of [
        `${basePath}/assets/gone.js`,
        `${basePath}/assets/gone.css?v=1`,
        "/assets/gone.js",
      ]) {
        const response = await app.inject(url);
        expect(response.statusCode, url).toBe(404);
        expect(response.headers["content-type"]).toContain("text/plain");
      }
      const deepLink = await app.inject(`${basePath}/image/resize`);
      expect(deepLink.statusCode).toBe(200);
      expect(deepLink.body).toContain(`<base href="${basePath}/"`);
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
    expect(spec.json().servers).toEqual([{ url: "/snapotter", description: "Current instance" }]);
    // Only the servers url changes; the rest of the localized file is served as-is.
    const localized = await app.inject("/snapotter/api/v1/openapi.yaml?lang=fr");
    const frSource = readFileSync(
      new URL("../../../apps/api/src/openapi.fr.yaml", import.meta.url),
      "utf8",
    );
    expect(localized.body).toBe(
      frSource.replace("\nservers:\n  - url: /\n", "\nservers:\n  - url: /snapotter\n"),
    );
    expect(localized.body).not.toBe(frSource);
  } finally {
    await app.close();
    config.BASE_PATH = "";
  }
});

it("finds the root servers entry in every OpenAPI spec", () => {
  const dir = new URL("../../../apps/api/src/", import.meta.url);
  const specs = readdirSync(dir).filter((name) => /^openapi(\.[\w-]+)?\.yaml$/.test(name));
  expect(specs.length).toBeGreaterThan(1);
  for (const name of specs) {
    expect(readFileSync(new URL(name, dir), "utf8"), name).toContain("\nservers:\n  - url: /\n");
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

describe("SPA fallback disambiguation (#1275)", () => {
  function captureWarnings(app: ReturnType<typeof Fastify>) {
    const warnings: string[] = [];
    vi.spyOn(app.log, "warn").mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
    return warnings;
  }

  it("answers asset-shaped misses with 404 instead of the shell", async () => {
    const app = Fastify();
    await registerStatic(app, root);
    try {
      for (const url of [
        "/assets/gone.js",
        "/assets/gone.css",
        "/assets/gone.js?v=9a3b",
        "/assets/pdf.worker.mjs",
        "/assets/app.js.map",
        "/assets/gone.png",
        "/deep/gone.js",
        "/gone.css",
        "/gone.wasm",
        // A prefix-preserving proxy with BASE_PATH unset reaches the same spots.
        "/snapotter/assets/gone.js",
        "/apps/snapotter/gone.css",
      ]) {
        const response = await app.inject(url);
        expect(response.statusCode, url).toBe(404);
        expect(response.headers["content-type"]).toContain("text/plain");
      }
      // Router deep links keep the shell. An image outside /assets/ is not
      // asset-shaped on purpose: only build output (/assets/, scripts, styles,
      // source maps, wasm) can never be a page.
      for (const url of ["/files", "/image/resize", "/deep/route?lang=fr", "/snapotter/gone.png"]) {
        const response = await app.inject(url);
        expect(response.statusCode, url).toBe(200);
        expect(response.body).toContain("<base href");
      }
    } finally {
      await app.close();
    }
  });

  it("still serves real public files, including root scripts", async () => {
    const dist = mkdtempSync(join(tmpdir(), "snapotter-public-"));
    writeFileSync(join(dist, "index.html"), '<html><head><base href="/" /></head></html>');
    writeFileSync(join(dist, "manifest.json"), '{"name":"SnapOtter"}');
    writeFileSync(join(dist, "sw.js"), "self.addEventListener('fetch', () => {})");
    const app = Fastify();
    await registerStatic(app, dist);
    try {
      expect((await app.inject("/manifest.json")).json()).toEqual({ name: "SnapOtter" });
      const sw = await app.inject("/sw.js");
      expect(sw.statusCode).toBe(200);
      expect(sw.body).toContain("addEventListener");
    } finally {
      await app.close();
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it("answers non-GET misses with 404 instead of the shell", async () => {
    const app = Fastify();
    await registerStatic(app, root);
    try {
      for (const method of ["POST", "PUT", "DELETE"] as const) {
        const response = await app.inject({ method, url: "/snapotter/api/v1/tools/image/resize" });
        expect(response.statusCode, method).toBe(404);
        expect(response.body).not.toContain("<html");
      }
      expect((await app.inject({ method: "HEAD", url: "/files" })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("warns once per undeclared prefix, including for missing chunks", async () => {
    const app = Fastify();
    await registerStatic(app, root);
    const warnings = captureWarnings(app);
    try {
      // The shell (200) is still served for the page; the warning is the diagnostic.
      for (const call of [1, 2, 3]) {
        const response = await app.inject(`/snapotter/api/v1/config/analytics?n=${call}`);
        expect(response.statusCode).toBe(200);
      }
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("BASE_PATH=/snapotter");
      expect(warnings[0]).not.toContain("config/analytics");

      // A missing chunk under another undeclared prefix is a 404 and still warns.
      expect((await app.inject("/other/assets/index-abc.js")).statusCode).toBe(404);
      expect(warnings).toHaveLength(2);
      expect(warnings[1]).toContain("BASE_PATH=/other");
    } finally {
      await app.close();
    }
  });

  it("stops recording prefixes after a small cap", async () => {
    const app = Fastify();
    await registerStatic(app, root);
    const warnings = captureWarnings(app);
    try {
      for (let i = 0; i < 50; i++) await app.inject(`/p${i}/api/x`);
      expect(warnings).toHaveLength(8);
    } finally {
      await app.close();
    }
  });

  it("never suggests a prefix BASE_PATH would reject", async () => {
    const app = Fastify();
    await registerStatic(app, root);
    const warnings = captureWarnings(app);
    try {
      for (const url of ["//api/x", "/a.b/api/x", "/%2e%2e/api/x", "/a%20b/assets/x"]) {
        await app.inject(url);
      }
      expect(warnings).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("stays silent once BASE_PATH is set", async () => {
    config.BASE_PATH = "/snapotter";
    const app = Fastify();
    await registerStatic(app, root);
    const warnings = captureWarnings(app);
    try {
      await app.inject("/other/api/x");
      await app.inject("/other/assets/x.js");
      expect(warnings).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("keeps the warning silent when the second segment is unrelated", async () => {
    const app = Fastify();
    await registerStatic(app, root);
    const warnings = captureWarnings(app);
    try {
      await app.inject("/snapotter");
      await app.inject("/snapotter/login");
      await app.inject("/files");
      await app.inject("/snapotter/image/resize");
      expect(warnings).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
