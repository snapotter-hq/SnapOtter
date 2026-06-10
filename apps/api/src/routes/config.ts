import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db, schema } from "../db/index.js";

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/config/locale", async (_request, reply) => {
    const [row] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "defaultLocale"));
    return reply.send({ defaultLocale: row?.value ?? "en" });
  });
}
