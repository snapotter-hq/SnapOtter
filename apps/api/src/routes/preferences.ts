/**
 * Per-user preferences.
 *
 * Lets any authenticated user read and write their own preferences (e.g. the
 * default home view). Distinct from /v1/settings, which is the admin-only
 * instance configuration. Values are stored per (userId, key) in the
 * user_preferences table.
 */
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../plugins/auth.js";

const putSchema = z.record(z.string(), z.unknown());

export async function preferencesRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/preferences - the current user's preferences as a key->value map
  app.get(
    "/api/v1/preferences",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      const rows = await db
        .select()
        .from(schema.userPreferences)
        .where(eq(schema.userPreferences.userId, user.id));

      const preferences: Record<string, unknown> = {};
      for (const row of rows) {
        preferences[row.key] = (row.value as { value: unknown }).value;
      }
      return reply.send({ preferences });
    },
  );

  // PUT /api/v1/preferences - upsert one or more of the current user's preferences
  app.put(
    "/api/v1/preferences",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      const parsed = putSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid preferences body" });
      }

      for (const [key, value] of Object.entries(parsed.data)) {
        await db
          .insert(schema.userPreferences)
          .values({ userId: user.id, key, value: { value } })
          .onConflictDoUpdate({
            target: [schema.userPreferences.userId, schema.userPreferences.key],
            set: { value: { value } },
          });
      }
      return reply.send({ ok: true });
    },
  );
}
