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
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      reply.code(404).send({ error: "Not found", code: "NOT_FOUND" });
    } else {
      sendHtml(request, reply);
    }
  });
}
