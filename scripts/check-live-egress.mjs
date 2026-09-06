#!/usr/bin/env node
/**
 * Fail when a live page loads anything from an origin we did not choose.
 *
 * The landing, docs and demo sites load from origins we chose and nothing
 * else: fonts, screenshots and star counts are self-hosted or baked at build
 * time, PostHog runs through our own e.snapotter.com proxy, and Cloudflare
 * Web Analytics is the one edge feature we keep. Nothing in the repo can add a
 * destination silently, because the local e2e suites see the built output.
 * Cloudflare can though. Zone features add scripts at the edge on the way to
 * the browser, and the Web Analytics beacon rode every page that way before
 * anyone had decided to keep it (#793): the built HTML was clean and every
 * test was green while every visitor requested static.cloudflareinsights.com.
 *
 * So this audits the page a visitor receives, not the one we built. It fetches
 * each URL the way a browser does, collects every origin the HTML's tags make
 * the browser fetch, and exits 1 if any of them is neither the page's own host
 * nor allowlisted. A page it cannot vouch for (challenge, 5xx, non-HTML, a
 * redirect elsewhere, a truncated or placeholder body) fails too: an error
 * page has no beacon in it, and calling that clean would turn every outage
 * into a green run.
 *
 * It is a static scan of tag sources, nothing more. srcset, CSS url(), meta
 * refresh and anything a script fetches at runtime are outside it, and so is
 * every edge feature that loads from the zone's own origin under /cdn-cgi/
 * (Rocket Loader, Zaraz, Email Obfuscation). Those need a different check.
 *
 * Usage:
 *   node scripts/check-live-egress.mjs <url> [<url>...] [--allow <origin>]...
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Cloudflare only injects into browser-shaped requests. On 2026-09-05 a fetch
 * with `Accept: text/html` got the beacon and the same fetch with Node's
 * default `Accept: *\/*` did not, whatever the user agent said. A guard that
 * fetched like Node would pass on every run while every visitor got the
 * beacon, so the Accept header is the whole check today. The rest of the
 * navigation headers are here so a future Cloudflare heuristic on user agent
 * or Sec-Fetch-* does not quietly turn the guard green either.
 */
const BROWSER_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "upgrade-insecure-requests": "1",
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 SnapOtter-egress-check/1.0 (+https://github.com/snapotter-hq/SnapOtter)",
};

const FETCH_TIMEOUT_MS = 20_000;
const ATTEMPTS = 3;
const RETRY_DELAYS_MS = [2_000, 4_000];

/**
 * `<link>` rels that make the browser fetch the href. Everything else
 * (alternate, canonical, me, license, ...) is metadata about another URL and
 * never leaves the page, so a hreflang mirror or a rel=me profile link is not
 * egress.
 */
const FETCHING_LINK_RELS = new Set([
  "stylesheet",
  "preload",
  "modulepreload",
  "prefetch",
  "prerender",
  "preconnect",
  "dns-prefetch",
  "icon",
  "apple-touch-icon",
  "manifest",
]);

/** Tags whose named attribute the browser fetches on its own. */
const TAG_SOURCES = {
  script: "src",
  link: "href",
  iframe: "src",
  img: "src",
  source: "src",
  video: "src",
  audio: "src",
  embed: "src",
};

const TAG_PATTERN = /<(script|link|iframe|img|source|video|audio|embed)\b([^>]*)>/gi;

function attribute(attrs, name) {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(
    attrs,
  );
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3];
}

function linkFetches(attrs) {
  const rel = attribute(attrs, "rel");
  if (rel === null) return false;
  return rel
    .toLowerCase()
    .split(/\s+/)
    .some((token) => FETCHING_LINK_RELS.has(token));
}

/** The origin a source attribute resolves to, or null when nothing is fetched. */
function originOf(value, pageUrl) {
  const trimmed = value.trim();
  if (/^(data|blob|about|javascript):/i.test(trimmed)) return null;
  try {
    const { origin } = new URL(trimmed, pageUrl);
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

/** Every (tag, origin) pair the HTML's tags make the browser fetch. */
function sources(html, pageUrl) {
  const found = [];
  for (const [, tagName, attrs] of html.matchAll(TAG_PATTERN)) {
    const tag = tagName.toLowerCase();
    if (tag === "link" && !linkFetches(attrs)) continue;
    const value = attribute(attrs, TAG_SOURCES[tag]);
    if (value === null) continue;
    const origin = originOf(value, pageUrl);
    if (origin !== null) found.push({ tag, origin });
  }
  return found;
}

function byOrigin(entries) {
  const grouped = new Map();
  for (const { tag, origin } of entries) {
    if (!grouped.has(origin)) grouped.set(origin, new Set());
    grouped.get(origin).add(tag);
  }
  return [...grouped.keys()]
    .sort()
    .map((origin) => ({ origin, tags: [...grouped.get(origin)].sort() }));
}

/**
 * Every origin the HTML makes the browser fetch from, other than the page's
 * own and the allowlist, with the tags that reach it. Allowlist entries match
 * on the exact origin: no suffixes, no other schemes.
 */
export function externalOrigins(html, pageUrl, allow) {
  const own = new URL(pageUrl).origin;
  const allowed = new Set(allow.map((entry) => new URL(entry).origin));
  return byOrigin(
    sources(html, pageUrl).filter(({ origin }) => origin !== own && !allowed.has(origin)),
  );
}

function unauditable(url, problem, status) {
  return { url, ok: false, disallowed: [], problem, status };
}

/**
 * Fetch one page as a browser would and audit what it loads. `problem` is set
 * when the page could not be vouched for at all; that is a failure, not a pass.
 */
export async function auditPage(url, { allow, fetchImpl = fetch }) {
  const response = await fetchImpl(url, {
    headers: BROWSER_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status !== 200 || !/^text\/html\b/i.test(contentType)) {
    const mitigated = response.headers.get("cf-mitigated");
    const detail = `${response.status} ${contentType || "(no content-type)"}${mitigated ? ` cf-mitigated=${mitigated}` : ""}`;
    return unauditable(url, `expected an HTML 200, got ${detail}`, response.status);
  }

  // A redirect to www or a maintenance host would have this run vouch for a
  // site it never asked about. Same-origin redirects (/ to /en/) are fine.
  const own = new URL(url).origin;
  const landed = response.url || url;
  if (new URL(landed).origin !== own) {
    return unauditable(
      url,
      `redirected to ${landed}, which is another origin; audit that URL directly if it is the intended one`,
      response.status,
    );
  }

  const html = await response.text();
  // The edge injects right before </body>, so a body that ends early is the
  // one whose injection point was never seen.
  if (!/<\/body\s*>/i.test(html)) {
    return unauditable(
      url,
      "response has no </body>, so the page is empty or truncated",
      response.status,
    );
  }
  const loaded = sources(html, landed);
  if (!loaded.some(({ origin }) => origin === own)) {
    return unauditable(
      url,
      "page loads no first-party assets, so this is not the site we deployed (placeholder or maintenance page?)",
      response.status,
    );
  }

  const disallowed = externalOrigins(html, landed, allow);
  return { url, ok: disallowed.length === 0, disallowed };
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

function describeFailure(error) {
  if (!(error instanceof Error)) return String(error);
  // undici wraps every transport error in TypeError("fetch failed") and keeps
  // the DNS, TLS or reset detail on `cause`.
  return error.cause instanceof Error ? error.cause.message : error.message;
}

/** Retry only what a retry can fix: a dropped connection, a timeout or a 5xx. */
export async function auditWithRetry(url, { allow, fetchImpl = fetch, sleep = wait }) {
  for (let attempt = 1; ; attempt++) {
    let result;
    try {
      result = await auditPage(url, { allow, fetchImpl });
    } catch (error) {
      result = unauditable(url, `fetch failed: ${describeFailure(error)}`);
    }
    const transient = result.problem !== undefined && (result.status ?? 500) >= 500;
    if (!transient || attempt === ATTEMPTS) return result;
    console.log(`retrying ${url} after: ${result.problem}`);
    await sleep(RETRY_DELAYS_MS[attempt - 1]);
  }
}

function parseUrl(value, hint) {
  try {
    return new URL(value);
  } catch {
    throw new Error(hint);
  }
}

function parseArgs(argv) {
  const urls = [];
  const allow = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--allow") {
      const value = argv[++i] ?? "";
      const hint = `--allow needs an origin like https://e.snapotter.com, got "${value}"`;
      allow.push(parseUrl(value, hint).origin);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      urls.push(parseUrl(arg, `Not a URL: ${arg}`).href);
    }
  }
  if (urls.length === 0) {
    throw new Error("Usage: check-live-egress.mjs <url> [<url>...] [--allow <origin>]...");
  }
  return { urls, allow };
}

function report(result) {
  if (result.ok) {
    console.log(`ok    ${result.url}: no third-party origins`);
    return;
  }
  if (result.problem) {
    console.log(`FAIL  ${result.url}: could not audit (${result.problem})`);
    return;
  }
  const origins = result.disallowed
    .map(({ origin, tags }) => `${origin} via <${tags.join(">, <")}>`)
    .join("; ");
  console.log(
    `FAIL  ${result.url}: loads from ${origins}. Only the page's own host and allowlisted origins may be reached. A Cloudflare zone feature injecting at the edge is the usual cause (#793): turn it off in the dashboard, or allowlist it in the deploy workflow if it was a deliberate choice.`,
  );
}

async function main() {
  const { urls, allow } = parseArgs(process.argv.slice(2));
  const results = await Promise.all(urls.map((url) => auditWithRetry(url, { allow })));
  for (const result of results) report(result);
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

/** Realpath both sides: through a symlink the plain paths differ and main() would silently never run. */
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  main().catch((error) => {
    console.error(describeFailure(error));
    process.exitCode = 1;
  });
}
