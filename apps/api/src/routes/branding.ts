/**
 * Branding routes — custom logo upload, serving, and deletion.
 *
 * POST   /api/v1/settings/logo — Upload logo (admin only)
 * GET    /api/v1/settings/logo — Serve custom logo as PNG (public)
 * DELETE /api/v1/settings/logo — Remove custom logo (admin only)
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { ensureSharpCompat } from "../lib/heic-converter.js";
import { requirePermission } from "../permissions.js";

const BRANDING_DIR = join(env.FILES_STORAGE_PATH, "branding");
const LOGO_PATH = join(BRANDING_DIR, "logo.png");
const maxLogoSize = env.MAX_LOGO_SIZE_KB * 1024;

function upsertSetting(key: string, value: string): void {
  const existing = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  if (existing) {
    db.update(schema.settings)
      .set({ value, updatedAt: new Date() })
      .where(eq(schema.settings.key, key))
      .run();
  } else {
    db.insert(schema.settings).values({ key, value }).run();
  }
}

export async function brandingRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/settings/logo — Upload logo (admin only)
  app.post("/api/v1/settings/logo", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = requirePermission("branding:manage")(request, reply);
    if (!admin) return;

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: "No file uploaded", code: "VALIDATION_ERROR" });
    }

    // Validate mimetype
    if (!file.mimetype.startsWith("image/")) {
      return reply.status(400).send({ error: "File must be an image", code: "VALIDATION_ERROR" });
    }

    // Read file buffer
    const buffer = await file.toBuffer();

    // Validate size
    if (buffer.length > maxLogoSize) {
      return reply.status(400).send({
        error: `Logo must be ${env.MAX_LOGO_SIZE_KB}KB or smaller`,
        code: "VALIDATION_ERROR",
      });
    }

    // Decode HEIC/HEIF if needed, then convert to PNG, resize to max 128x128
    const compatBuffer = await ensureSharpCompat(buffer);
    const pngBuffer = await sharp(compatBuffer)
      .resize(128, 128, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();

    // Ensure branding directory exists
    mkdirSync(BRANDING_DIR, { recursive: true });

    // Write file
    writeFileSync(LOGO_PATH, pngBuffer);

    // Upsert setting
    upsertSetting("customLogo", "true");

    return reply.send({ ok: true });
  });

  // GET /api/v1/settings/logo — Serve logo (public, no auth required)
  app.get("/api/v1/settings/logo", async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!existsSync(LOGO_PATH)) {
      return reply.status(404).send({ error: "No custom logo set", code: "NOT_FOUND" });
    }

    const logoBuffer = readFileSync(LOGO_PATH);
    return reply.type("image/png").send(logoBuffer);
  });

  // DELETE /api/v1/settings/logo — Remove logo (admin only)
  app.delete("/api/v1/settings/logo", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = requirePermission("branding:manage")(request, reply);
    if (!admin) return;

    if (existsSync(LOGO_PATH)) {
      unlinkSync(LOGO_PATH);
    }

    upsertSetting("customLogo", "false");

    return reply.send({ ok: true });
  });

  app.log.info("Branding routes registered");
}
