import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditPage, auditWithRetry, externalOrigins } from "../../../scripts/check-live-egress.mjs";

/**
 * The landing, docs and demo sites promise no third-party egress, and nothing
 * in the repo can break that promise silently: fonts and star counts are baked
 * or self-hosted, and the local e2e suites see the built output. Cloudflare
 * can break it though. Zone features inject scripts at the edge on the way to
 * the browser, and the Web Analytics beacon did exactly that (#793): the built
 * HTML was clean while every visitor requested static.cloudflareinsights.com.
 *
 * scripts/check-live-egress.mjs audits the page a visitor actually receives,
 * so these tests pin the two things that made the bug invisible: the beacon
 * tag as the edge really emits it, and the request header that makes the edge
 * emit it at all. The subprocess block at the end runs the CLI the way the
 * deploy workflows do, because a guard whose entry point silently skips main()
 * is a green step with nothing behind it.
 */

const root = path.resolve(import.meta.dirname, "../../..");
const script = path.join(root, "scripts/check-live-egress.mjs");
const run = promisify(execFile);

/** Verbatim from a browser fetch of https://snapotter.com/ on 2026-09-05. */
const BEACON_TAG =
  '<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/v31edd6df95cf4e85bb4c19e7a9bdbcba1788362987495" integrity="sha512-iIg7k2xntmwu6/uSb5tpc/hySgZc4eoL31yB29W6tJFo2akwjPWcEqnCEdJvGexCL0KEQwVYv5BlowfhVz26hg==" data-cf-beacon=\'{"version":"2024.11.0","token":"8ccdab3de8314ae58382b03bb1429c20","r":1,"spa":2}\' crossorigin="anonymous"></script>';

const PAGE_URL = "https://snapotter.com/";
const FIRST_PARTY = '<link rel="stylesheet" href="/_astro/index.css">';

function page(body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><title>SnapOtter</title>${body}</head><body><main>hi</main></body></html>`;
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/** A fetch result the script can read, with a `url` the Response class refuses to set. */
function landedAt(url: string, html: string) {
  return {
    ok: true,
    status: 200,
    url,
    headers: new Headers({ "content-type": "text/html" }),
    text: async () => html,
  } as unknown as Response;
}

describe("externalOrigins", () => {
  it("flags the Cloudflare Web Analytics beacon exactly as the edge injects it", () => {
    const html = page(`${FIRST_PARTY}${BEACON_TAG}`);

    expect(externalOrigins(html, PAGE_URL, [])).toEqual([
      { origin: "https://static.cloudflareinsights.com", tags: ["script"] },
    ]);
  });

  it("treats relative paths and absolute same-origin URLs as first-party", () => {
    const html = page(
      [
        FIRST_PARTY,
        '<link rel="preload" href="https://snapotter.com/fonts/body.woff2" as="font">',
        '<script type="module" src="/_astro/hoisted.js"></script>',
        '<img src="screenshots/editor.webp">',
      ].join(""),
    );

    expect(externalOrigins(html, PAGE_URL, [])).toEqual([]);
  });

  it("resolves protocol-relative URLs against the page scheme", () => {
    const html = page('<script src="//static.cloudflareinsights.com/beacon.min.js"></script>');

    expect(externalOrigins(html, PAGE_URL, [])).toEqual([
      { origin: "https://static.cloudflareinsights.com", tags: ["script"] },
    ]);
  });

  it("lets an allowlisted origin through and reports the rest", () => {
    const html = page(
      `<script src="https://e.snapotter.com/static/array.js"></script>${BEACON_TAG}`,
    );

    expect(externalOrigins(html, PAGE_URL, ["https://e.snapotter.com"])).toEqual([
      { origin: "https://static.cloudflareinsights.com", tags: ["script"] },
    ]);
  });

  it("matches the allowlist on the exact origin, never a suffix or another scheme", () => {
    const html = page(
      [
        '<script src="https://evil.e.snapotter.com/x.js"></script>',
        '<script src="http://e.snapotter.com/x.js"></script>',
        '<script src="https://e.snapotter.com/x.js"></script>',
      ].join(""),
    );

    expect(externalOrigins(html, PAGE_URL, ["https://e.snapotter.com/"])).toEqual([
      { origin: "http://e.snapotter.com", tags: ["script"] },
      { origin: "https://evil.e.snapotter.com", tags: ["script"] },
    ]);
  });

  it("only counts <link> rels that make the browser fetch something", () => {
    const html = page(
      [
        '<link rel="alternate" hreflang="de" href="https://mirror.example/de/">',
        '<link rel="canonical" href="https://mirror.example/">',
        '<link rel="me" href="https://github.com/snapotter-hq">',
        '<link rel="preconnect" href="https://fonts.gstatic.com">',
        '<link rel="stylesheet" href="https://cdn.example/site.css">',
        '<link href="https://bare.example/unlabeled.css">',
      ].join(""),
    );

    expect(externalOrigins(html, PAGE_URL, [])).toEqual([
      { origin: "https://cdn.example", tags: ["link"] },
      { origin: "https://fonts.gstatic.com", tags: ["link"] },
    ]);
  });

  it("skips data:, blob:, about: and other unfetchable sources", () => {
    const html = page(
      '<img src="data:image/gif;base64,R0lGOD"><iframe src="about:blank"></iframe><video src="blob:https://snapotter.com/abc"></video><embed src="mailto:contact@snapotter.com">',
    );

    expect(externalOrigins(html, PAGE_URL, [])).toEqual([]);
  });

  it("groups every tag that reaches the same origin", () => {
    const html = page(
      '<script src="https://cdn.example/a.js"></script><img src="https://cdn.example/b.png"><iframe src="https://cdn.example/c"></iframe>',
    );

    expect(externalOrigins(html, PAGE_URL, [])).toEqual([
      { origin: "https://cdn.example", tags: ["iframe", "img", "script"] },
    ]);
  });
});

describe("auditPage", () => {
  it("asks for text/html, because the edge only injects into browser-shaped requests", async () => {
    // Cloudflare skipped the beacon for a bare `Accept: */*` fetch (Node's
    // default) and injected it for `Accept: text/html`. A guard that fetched
    // like Node would pass on every run while every visitor got the beacon.
    const seen: { headers?: Headers } = {};
    const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.headers = new Headers(init?.headers);
      return htmlResponse(page(`${FIRST_PARTY}${BEACON_TAG}`));
    };

    const result = await auditPage(PAGE_URL, { allow: [], fetchImpl });

    expect(seen.headers?.get("accept")).toMatch(/^text\/html\b/);
    expect(seen.headers?.get("sec-fetch-dest")).toBe("document");
    expect(result).toEqual({
      url: PAGE_URL,
      ok: false,
      disallowed: [{ origin: "https://static.cloudflareinsights.com", tags: ["script"] }],
    });
  });

  it("passes a page whose only sources are first-party or allowlisted", async () => {
    const fetchImpl = async () =>
      htmlResponse(page(`${FIRST_PARTY}<script src="/_astro/a.js"></script>`));

    await expect(auditPage(PAGE_URL, { allow: [], fetchImpl })).resolves.toEqual({
      url: PAGE_URL,
      ok: true,
      disallowed: [],
    });
  });

  it("fails loudly, not cleanly, when it could not see the page", async () => {
    // A challenge page or an error page has no beacon in it. Treating that as
    // "no third-party egress" would turn every outage into a green run.
    const challenge = async () =>
      new Response("<html>checking your browser</html>", {
        status: 403,
        headers: { "content-type": "text/html", "cf-mitigated": "challenge" },
      });
    const notHtml = async () =>
      new Response('{"status":"operational"}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const blocked = await auditPage(PAGE_URL, { allow: [], fetchImpl: challenge });
    expect(blocked.ok).toBe(false);
    expect(blocked.problem).toMatch(/403/);

    const json = await auditPage(PAGE_URL, { allow: [], fetchImpl: notHtml });
    expect(json.ok).toBe(false);
    expect(json.problem).toMatch(/application\/json/);
  });

  it("refuses an empty or truncated HTML 200 instead of calling it clean", async () => {
    // The edge injects the beacon right before </body>, so a body that ends
    // early is exactly the one whose injection point was never seen.
    const empty = async () => htmlResponse("");
    const truncated = async () =>
      htmlResponse(`<!DOCTYPE html><html><head>${FIRST_PARTY}</head><body><main>hi`);

    const emptyResult = await auditPage(PAGE_URL, { allow: [], fetchImpl: empty });
    expect(emptyResult.ok).toBe(false);
    expect(emptyResult.problem).toMatch(/<\/body>/);

    const truncatedResult = await auditPage(PAGE_URL, { allow: [], fetchImpl: truncated });
    expect(truncatedResult.ok).toBe(false);
    expect(truncatedResult.problem).toMatch(/<\/body>/);
  });

  it("refuses a page that loads no first-party assets, since that is not the site we shipped", async () => {
    const placeholder = async () => htmlResponse(page("<p>maintenance</p>"));

    const result = await auditPage(PAGE_URL, { allow: [], fetchImpl: placeholder });
    expect(result.ok).toBe(false);
    expect(result.problem).toMatch(/first-party/);
  });

  it("follows a same-origin redirect and judges first-party by where it landed", async () => {
    const fetchImpl = async () =>
      landedAt("https://snapotter.com/en/", page('<script src="/_astro/a.js"></script>'));

    await expect(auditPage(PAGE_URL, { allow: [], fetchImpl })).resolves.toEqual({
      url: PAGE_URL,
      ok: true,
      disallowed: [],
    });
  });

  it("refuses to audit another origin the request was redirected to", async () => {
    // A redirect to www or a maintenance host would have this run vouch for a
    // site it never asked for. The workflow URL is the one that must be clean.
    const fetchImpl = async () =>
      landedAt("https://www.snapotter.com/", page('<script src="/_astro/a.js"></script>'));

    const result = await auditPage(PAGE_URL, { allow: [], fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.problem).toMatch(/www\.snapotter\.com/);
  });
});

describe("auditWithRetry", () => {
  const noSleep = async () => {};
  const beacon = () => htmlResponse(page(`${FIRST_PARTY}${BEACON_TAG}`));
  const serverError = () =>
    new Response("bad gateway", { status: 502, headers: { "content-type": "text/html" } });

  it("reports the beacon from a later attempt, never the earlier 5xx", async () => {
    const responses = [serverError(), beacon()];
    const fetchImpl = async () => responses.shift() as Response;

    const result = await auditWithRetry(PAGE_URL, { allow: [], fetchImpl, sleep: noSleep });

    expect(result.ok).toBe(false);
    expect(result.problem).toBeUndefined();
    expect(result.disallowed).toEqual([
      { origin: "https://static.cloudflareinsights.com", tags: ["script"] },
    ]);
  });

  it("does not retry a challenge, because a retry cannot fix it", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response("", {
        status: 403,
        headers: { "content-type": "text/html", "cf-mitigated": "challenge" },
      });
    };

    const result = await auditWithRetry(PAGE_URL, { allow: [], fetchImpl, sleep: noSleep });

    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
  });

  it("gives up after three network failures with the real cause in the message", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      throw new TypeError("fetch failed", {
        cause: new Error("getaddrinfo ENOTFOUND snapotter.com"),
      });
    };

    const result = await auditWithRetry(PAGE_URL, { allow: [], fetchImpl, sleep: noSleep });

    expect(calls).toBe(3);
    expect(result.ok).toBe(false);
    expect(result.problem).toMatch(/ENOTFOUND/);
  });
});

describe("Cloudflare Pages deploy workflows", () => {
  const guard = "node scripts/check-live-egress.mjs";
  const deploys = [
    { file: "deploy-landing.yml", project: "snapotter-landing", url: "https://snapotter.com/" },
    { file: "deploy-docs.yml", project: "snapotter-docs", url: "https://docs.snapotter.com/" },
    { file: "deploy-demo.yml", project: "snapotter-demo", url: "https://demo.snapotter.com/" },
  ];

  for (const { file, project, url } of deploys) {
    it(`${file} audits ${url} for third-party egress after publishing, unconditionally`, () => {
      const workflowPath = path.resolve(root, ".github/workflows", file);
      expect(existsSync(workflowPath)).toBe(true);
      const workflow = readFileSync(workflowPath, "utf8");

      const deployIndex = workflow.indexOf(`--project-name ${project}`);
      const guardIndex = workflow.indexOf(`${guard} ${url}`);
      expect(deployIndex, "wrangler deploy step").toBeGreaterThanOrEqual(0);
      expect(guardIndex, `${guard} ${url} step`).toBeGreaterThanOrEqual(0);
      // The edge injects whichever deployment is live; running after wrangler
      // just keeps the verdict next to the publish it belongs to.
      expect(guardIndex, "guard runs after the deploy").toBeGreaterThan(deployIndex);

      // "The deploy keeps failing on the beacon, let me unblock it" must not be
      // a one-line edit that keeps the step and loses the gate.
      const afterGuard = workflow.slice(guardIndex);
      expect(afterGuard).not.toMatch(/continue-on-error/);
      expect(afterGuard).not.toMatch(/^\s+if:/m);
    });

    it(`${file} allows exactly the origins the public sites chose`, () => {
      // Cloudflare Web Analytics is accepted on the zone (decided on #793).
      // PostHog loads at runtime from inline script, so it never appears as
      // a tag and needs no entry. Anything else added here is a policy change.
      const workflow = readFileSync(path.resolve(root, ".github/workflows", file), "utf8");
      const command = workflow.match(/node scripts\/check-live-egress\.mjs[^\n]*/)?.[0] ?? "";
      const allowed = [...command.matchAll(/--allow (\S+)/g)].map((match) => match[1]);

      expect(allowed).toEqual(["https://static.cloudflareinsights.com"]);
    });
  }
});

describe("check-live-egress CLI", () => {
  let server: Server;
  let base: string;
  let lastHeaders: IncomingHttpHeaders = {};

  beforeAll(async () => {
    server = createServer((req, res) => {
      lastHeaders = req.headers;
      const route = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
      if (route === "/json") {
        res.writeHead(200, { "content-type": "application/json" }).end("{}");
        return;
      }
      const body = route === "/beacon" ? `${FIRST_PARTY}${BEACON_TAG}` : FIRST_PARTY;
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page(body));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function cli(args: string[], file = script) {
    try {
      const { stdout, stderr } = await run(process.execPath, [file, ...args], { cwd: root });
      return { code: 0, stdout, stderr };
    } catch (error) {
      const failed = error as { code?: number; stdout?: string; stderr?: string };
      return { code: failed.code ?? -1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
    }
  }

  it("exits 1 and names the origin when the live page carries the beacon", async () => {
    const result = await cli([`${base}/beacon`]);

    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/FAIL/);
    expect(result.stdout).toContain("https://static.cloudflareinsights.com");
    expect(lastHeaders.accept).toMatch(/^text\/html\b/);
  });

  it("exits 0 on a first-party-only page", async () => {
    const result = await cli([`${base}/clean`]);

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^ok /m);
  });

  it("exits 1 when one of several URLs fails", async () => {
    const result = await cli([`${base}/clean`, `${base}/json`]);

    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/could not audit/);
  });

  it("rejects a bad --allow before fetching anything", async () => {
    const result = await cli(["--allow", "e.snapotter.com", `${base}/clean`]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/--allow needs an origin/);
  });

  it("prints usage and exits 1 with no URL", async () => {
    const result = await cli([]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/Usage:/);
  });

  it("still runs main() when invoked through a symlink", async () => {
    // A path comparison that is not realpath-aware makes the entry guard skip
    // main() and exit 0 with no output: a green step with nothing behind it.
    const dir = mkdtempSync(path.join(tmpdir(), "egress-link-"));
    const link = path.join(dir, "linked.mjs");
    symlinkSync(script, link);
    try {
      const result = await cli([`${base}/beacon`], link);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain("https://static.cloudflareinsights.com");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
