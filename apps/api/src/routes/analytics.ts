import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../plugins/auth.js";

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/config/analytics", async () => {
    if (!env.ANALYTICS_ENABLED) {
      return {
        enabled: false,
        posthogApiKey: "",
        posthogHost: "",
        sentryDsn: "",
        sampleRate: 0,
        instanceId: "",
      };
    }

    const row = db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "instance_id"))
      .get();

    return {
      enabled: true,
      posthogApiKey: env.POSTHOG_API_KEY,
      posthogHost: env.POSTHOG_HOST,
      sentryDsn: env.SENTRY_DSN,
      sampleRate: env.ANALYTICS_SAMPLE_RATE,
      instanceId: row?.value ?? "",
    };
  });

  app.put("/api/v1/user/analytics", async (request, reply) => {
    const user = requireAuth(request, reply);
    if (!user) return;

    const body = request.body as {
      enabled?: boolean;
      remindLater?: boolean;
    } | null;

    const now = new Date();

    if (body?.remindLater) {
      const remindAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      db.update(schema.users)
        .set({
          analyticsEnabled: null,
          analyticsConsentShownAt: now,
          analyticsConsentRemindAt: remindAt,
          updatedAt: now,
        })
        .where(eq(schema.users.id, user.id))
        .run();
      return reply.send({ ok: true, analyticsEnabled: null });
    }

    const enabled = body?.enabled === true;
    db.update(schema.users)
      .set({
        analyticsEnabled: enabled,
        analyticsConsentShownAt: now,
        analyticsConsentRemindAt: null,
        updatedAt: now,
      })
      .where(eq(schema.users.id, user.id))
      .run();
    return reply.send({ ok: true, analyticsEnabled: enabled });
  });
}
