import { createReadStream, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const STATIC_DIR = join(import.meta.dirname, "../../static");
const TEMPLATES_DIR = join(STATIC_DIR, "meme-templates");
const FONTS_DIR = join(STATIC_DIR, "fonts");

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ttf": "font/ttf",
};

/** Cached manifest (read once at first request, served from memory). */
let manifestCache: string | null = null;

let parsedManifestCache: unknown = null;

function getManifest(): unknown {
  if (parsedManifestCache === null) {
    manifestCache = readFileSync(join(TEMPLATES_DIR, "meme-templates.json"), "utf-8");
    parsedManifestCache = JSON.parse(manifestCache);
  }
  return parsedManifestCache;
}

export function hasPathTraversal(filename: string): boolean {
  return (
    filename.includes("..") ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("\0")
  );
}

export function getContentType(filename: string): string | undefined {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return undefined;
  return CONTENT_TYPES[filename.slice(dot).toLowerCase()];
}

function serveStaticFile(
  dir: string,
  filename: string,
  reply: FastifyReply,
  cacheControl: string,
): FastifyReply | undefined {
  if (hasPathTraversal(filename)) {
    return reply.status(400).send({ error: "Invalid filename" });
  }

  const contentType = getContentType(filename);
  if (!contentType) {
    return reply.status(400).send({ error: "Unsupported file type" });
  }

  const filePath = join(dir, filename);
  if (!existsSync(filePath)) {
    return reply.status(404).send({ error: "File not found" });
  }

  const stream = createReadStream(filePath);
  stream.on("error", () => {
    if (!reply.raw.headersSent) {
      reply.status(404).send({ error: "File not found" });
    }
  });

  return reply
    .header("Content-Type", contentType)
    .header("Cache-Control", cacheControl)
    .send(stream);
}

export async function registerMemeTemplates(app: FastifyInstance): Promise<void> {
  // GET /api/v1/meme-templates -- Return the full manifest JSON
  app.get("/api/v1/meme-templates", async (_request: FastifyRequest, reply: FastifyReply) => {
    const manifest = getManifest();
    return reply
      .header("Content-Type", "application/json")
      .header("Cache-Control", "public, max-age=3600")
      .send(manifest);
  });

  // GET /api/v1/meme-templates/full/:filename -- Serve full-size template images
  app.get(
    "/api/v1/meme-templates/full/:filename",
    async (request: FastifyRequest<{ Params: { filename: string } }>, reply: FastifyReply) => {
      const { filename } = request.params;
      return serveStaticFile(
        join(TEMPLATES_DIR, "full"),
        filename,
        reply,
        "public, max-age=31536000, immutable",
      );
    },
  );

  // GET /api/v1/meme-templates/thumbs/:filename -- Serve thumbnail images
  app.get(
    "/api/v1/meme-templates/thumbs/:filename",
    async (request: FastifyRequest<{ Params: { filename: string } }>, reply: FastifyReply) => {
      const { filename } = request.params;
      return serveStaticFile(
        join(TEMPLATES_DIR, "thumbs"),
        filename,
        reply,
        "public, max-age=31536000, immutable",
      );
    },
  );

  // GET /api/v1/meme-templates/fonts/:filename -- Serve font files
  app.get(
    "/api/v1/meme-templates/fonts/:filename",
    async (request: FastifyRequest<{ Params: { filename: string } }>, reply: FastifyReply) => {
      const { filename } = request.params;
      return serveStaticFile(FONTS_DIR, filename, reply, "public, max-age=31536000, immutable");
    },
  );
}
