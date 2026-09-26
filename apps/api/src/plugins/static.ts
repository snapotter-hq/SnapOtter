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

  // SPA fallback — serve index.html for all non-API routes
  const warnedUndeclaredPrefixes = new Set<string>();
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      reply.code(404).send({ error: "Not found", code: "NOT_FOUND" });
      return;
    }
    // A missing hashed asset answered with this HTML shell (200) surfaces as
    // "Expected a JavaScript module script..." with only 200s in the log;
    // asset-shaped misses are never router deep links, so 404 them (#1275).
    // rewriteUrl has already stripped the deployment path.
    const path = request.url.split(/[?#]/)[0];
    if (path.startsWith("/assets/") || path.endsWith(".js") || path.endsWith(".css")) {
      reply.code(404).type("text/plain; charset=utf-8").send("Not found");
      return;
    }
    warnUndeclaredPrefix(app, path, warnedUndeclaredPrefixes);
    sendHtml(request, reply);
  });
}

/**
 * A fallback for a path whose second segment is api or assets while BASE_PATH
 * is empty means a proxy is forwarding a prefix nobody declared (for example
 * /snapotter/api/v1/... with BASE_PATH unset): the URL reaches this server,
 * but the shell it gets points every asset and API call at the domain root.
 * Warn once per prefix so the misconfiguration shows up in the log (#1275).
 */
function warnUndeclaredPrefix(app: FastifyInstance, path: string, warned: Set<string>) {
  if (env.BASE_PATH) return;
  const segments = path.split("/");
  const second = segments[2];
  if (second !== "api" && second !== "assets") return;
  const prefix = segments[1];
  if (warned.has(prefix)) return;
  warned.add(prefix);
  app.log.warn(
    `"${path}" looks like a subpath deployment, but BASE_PATH is empty — ` +
      `a proxy is forwarding a prefix nobody declared; set BASE_PATH=/${prefix} ` +
      `(or strip the prefix at the proxy) so API calls and assets resolve`,
  );
}
