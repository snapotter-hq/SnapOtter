import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config.js";

export async function registerStatic(app: FastifyInstance, root?: string) {
  // Resolve relative to this file's location
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const webDistPath = root ?? resolve(__dirname, "../../../web/dist");

  if (!existsSync(webDistPath)) {
    app.log.warn(`SPA dist not found at ${webDistPath} — skipping static file serving`);
    return;
  }

  const indexPath = resolve(webDistPath, "index.html");
  const builtHtml = readFileSync(indexPath, "utf8");
  // A build without the expected tag would serve every asset and API call from
  // the domain root under a subpath, which only shows up as a blank page.
  if (env.BASE_PATH && !builtHtml.includes('<base href="/"')) {
    throw new Error(
      `BASE_PATH is set but ${indexPath} has no <base href="/"> tag to rewrite; rebuild the web app`,
    );
  }
  const html = builtHtml.replace('<base href="/"', `<base href="${env.BASE_PATH}/"`);
  const sendHtml = (_request: FastifyRequest, reply: FastifyReply) =>
    reply.header("Cache-Control", "no-cache").type("text/html; charset=utf-8").send(html);
  app.get("/", sendHtml);
  app.get("/index.html", sendHtml);

  await app.register(fastifyStatic, {
    root: webDistPath,
    prefix: "/",
    wildcard: false,
    index: false,
    globIgnore: ["**/index.html"],
    decorateReply: !app.hasReplyDecorator("sendFile"),
  });

  // SPA fallback: serve index.html for page navigations only.
  const warnedUndeclaredPrefixes = new Set<string>();
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      reply.code(404).send({ error: "Not found", code: "NOT_FOUND" });
      return;
    }
    // rewriteUrl has already stripped a configured deployment path.
    const path = request.url.split(/[?#]/)[0];
    warnUndeclaredPrefix(app, path, warnedUndeclaredPrefixes);
    // Only a browser navigation wants the shell. A missing chunk answered with
    // HTML and a 200 surfaces as "Expected a JavaScript module script" with
    // nothing but 200s in the log, and a POST answered with HTML fails as a
    // JSON parse error; asset-shaped paths are never router deep links (#1275).
    if ((request.method !== "GET" && request.method !== "HEAD") || isAssetPath(path)) {
      reply.code(404).type("text/plain; charset=utf-8").send("Not found");
      return;
    }
    sendHtml(request, reply);
  });
}

const ASSET_EXTENSION = /\.(js|mjs|css|map|wasm)$/;

function isAssetPath(path: string): boolean {
  return path.startsWith("/assets/") || ASSET_EXTENSION.test(path);
}

// Anyone can send these paths unauthenticated and they skip the rate limit,
// so the set of prefixes already reported is capped.
const MAX_WARNED_PREFIXES = 8;
// Same shape BASE_PATH accepts (apps/api/src/lib/env.ts); anything else is
// not worth suggesting to an operator.
const VALID_PREFIX_SEGMENT = /^[a-zA-Z0-9_-]+$/;

/**
 * A request whose second segment is api or assets while BASE_PATH is empty
 * means a proxy is forwarding a prefix nobody declared (for example
 * /snapotter/api/v1/... with BASE_PATH unset): the URL reaches this server,
 * but the shell points every asset and API call at the domain root. Warn once
 * per prefix so the misconfiguration shows up in the log (#1275).
 */
function warnUndeclaredPrefix(app: FastifyInstance, path: string, warned: Set<string>) {
  if (env.BASE_PATH) return;
  const [, prefix, second] = path.split("/");
  if (second !== "api" && second !== "assets") return;
  if (!prefix || !VALID_PREFIX_SEGMENT.test(prefix)) return;
  if (warned.has(prefix) || warned.size >= MAX_WARNED_PREFIXES) return;
  warned.add(prefix);
  app.log.warn(
    `Requests arrive under /${prefix}/ but BASE_PATH is empty, so a proxy is forwarding ` +
      `a prefix nobody declared. Set BASE_PATH=/${prefix}, or strip the prefix at the proxy, ` +
      "so API calls and assets resolve.",
  );
}
