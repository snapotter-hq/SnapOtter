// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the drift-guard fixtures pin literal `${...}` interpolation shapes found in source.
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

/**
 * Flags every download-URL construction that bakes a deployment prefix or an
 * absolute origin into a persisted result URL (#1274, #1297 drift guard).
 *
 * Result URLs are persisted in jobs.result, so they must be root-relative;
 * interpolating env.BASE_PATH (or anything else deployment-relative) ahead of
 * the literal /api/v1/download/ path strands stored results when the prefix
 * changes. The backward window catches the shapes a single-line heuristic
 * misses (#1297's blind-spot list, inverted for the root-relative convention):
 *
 *   - a quote-less prefix directly inside the template (no quote before the
 *     path): `${env.BASE_PATH}/api/...`
 *   - an external origin interpolation: `${env.EXTERNAL_URL}/api/...`
 *   - a generic request-origin variable: `${origin}/api/...`
 *   - concatenation without a template literal
 *   - a biome-wrapped template where the interpolation lands on an earlier
 *     line
 *
 * The window stops at statement/argument boundaries (`; , =`), crossing
 * template braces and newlines so wrapped interpolations stay adjacent; sibling
 * env reads inside the same object literal (`{ size: env.X, url: "/api/..." }`)
 * and trailing mentions after the path stay clean. Not caught: the prefix
 * variable appearing after the path start, or as a sibling function
 * argument (`join(env.BASE_PATH, "/api/...")`) — no such call site exists.
 */
function findBakedDownloadPrefixes(source: string): string[] {
  const offenders: string[] = [];
  const offsets: number[] = [];
  const lines = source.split("\n");
  let acc = 0;
  for (const line of lines) {
    offsets.push(acc);
    acc += line.length + 1;
  }
  const lineAt = (index: number): number => {
    let lo = 0;
    let hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  let pos = source.indexOf("/api/v1/download/");
  while (pos !== -1) {
    // Whole-line comments are the docs' job, not code.
    if (!/^\s*(?:\/\/|\*|\/\*)/.test(lines[lineAt(pos)])) {
      // Window back to the last statement/argument boundary. `{`/`}` are
      // deliberately NOT boundaries: they are the braces of `${...}` itself,
      // so stopping there would clip every prefix interpolation out of the
      // window. A `,` still stops the window before a sibling property.
      let boundary = pos - 1;
      while (boundary >= 0 && pos - boundary < 120) {
        const ch = source[boundary];
        if (ch === ";" || ch === "," || ch === "=") break;
        boundary--;
      }
      const window = source.slice(boundary + 1, pos);
      if (window.includes("${") || /\benv\.[A-Z_]/.test(window)) {
        offenders.push(`line ${lineAt(pos) + 1}: ...${window} /api/v1/download/...`);
      }
    }
    pos = source.indexOf("/api/v1/download/", pos + 1);
  }
  return offenders;
}

describe("download-URL drift guard", () => {
  it.each([
    [
      "a quote-less prefix inside the template",
      "const u = `${env.BASE_PATH}/api/v1/download/${id}`;",
    ],
    ["an external-origin interpolation", "const u = `${env.EXTERNAL_URL}/api/v1/download/${id}`;"],
    ["a generic request-origin variable", "const u = `${requestOrigin}/api/v1/download/${id}`;"],
    [
      "plain concatenation without a template literal",
      "const u = env.BASE_PATH + '/api/v1/download/' + id;",
    ],
    ["a biome-wrapped template", "const u =\n  `${env.BASE_PATH}/api/v1/download/${id}`;"],
  ])("flags %s", (_label, snippet) => {
    expect(findBakedDownloadPrefixes(snippet)).toHaveLength(1);
  });

  it.each([
    ["a route registration", `app.get("/api/v1/download/:jobId/:filename", handler);`],
    ["the public-path literal", `const PUBLIC_PATHS = [\n  "/api/v1/download/",\n];`],
    [
      "a root-relative result URL",
      "downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(name)}`,",
    ],
    [
      "env read on a sibling property",
      'respond({ size: env.MAX_UPLOAD_BYTES, url: "/api/v1/download/x" });',
    ],
    ["a whole-line comment", "// the legacy download URL /api/v1/download/<id>/f works."],
    [
      "a trailing comment after a clean path",
      'const u = "/api/v1/download/x"; // never env.BASE_PATH here',
    ],
    [
      "the docs string describing the convention",
      "Join them with your instance base (e.g. `https://host/snapotter` + `/api/v1/download/...`); never expect a baked-in prefix.",
    ],
  ])("allows %s", (_label, snippet) => {
    expect(findBakedDownloadPrefixes(snippet)).toEqual([]);
  });

  it("keeps result download URLs root-relative (no baked deployment prefix)", () => {
    // Drift guard for #1274: interpolating env.BASE_PATH into a persisted
    // result URL bakes the deployment prefix into the jobs.result JSON, so
    // changing BASE_PATH leaves every earlier result pointing at the old
    // prefix. Server-emitted download/preview URLs must be root-relative and
    // let clients resolve them against their own base. Route registrations
    // (`"/api/v1/download/:jobId/..."`) are plain strings and stay fine.
    const offenders: Array<{ file: string; found: string[] }> = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name.endsWith(".ts")) {
          const found = findBakedDownloadPrefixes(readFileSync(p, "utf8"));
          if (found.length > 0) offenders.push({ file: p, found });
        }
      }
    };
    walk(fileURLToPath(new URL("../../../apps/api/src", import.meta.url)));
    expect(offenders).toEqual([]);
  });
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
