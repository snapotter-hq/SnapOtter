import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function registerStatic(app: FastifyInstance) {
  // Resolve relative to this file's location
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const webDistPath = resolve(__dirname, "../../../web/dist");

  if (!existsSync(webDistPath)) {
    app.log.warn(`SPA dist not found at ${webDistPath} — skipping static file serving`);
    return;
  }

  await app.register(fastifyStatic, {
    root: webDistPath,
    prefix: "/",
    wildcard: false,
  });

  // SPA fallback — serve index.html for all non-API routes
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      reply.code(404).send({ error: "Not found", code: "NOT_FOUND" });
    } else {
      reply.sendFile("index.html");
    }
  });
}
