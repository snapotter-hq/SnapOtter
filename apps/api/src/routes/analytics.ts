import { ANALYTICS_BAKED } from "@snapotter/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db, schema } from "../db/index.js";
import { analyticsEnabled } from "../lib/analytics-gate.js";

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/config/analytics", async () => {
    // Effective state: compile-time bake AND the runtime instance opt-out.
    if (!analyticsEnabled()) {
      return {
        enabled: false,
        posthogApiKey: "",
        posthogHost: "",
        sentryDsn: "",
        sentryDsnWeb: "",
        posthogSampleRate: 0,
        instanceId: "",
      };
    }

    const [row] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "instance_id"));

    return {
      enabled: true,
      posthogApiKey: ANALYTICS_BAKED.posthogApiKey,
      posthogHost: ANALYTICS_BAKED.posthogHost,
      sentryDsn: ANALYTICS_BAKED.sentryDsn,
      sentryDsnWeb: ANALYTICS_BAKED.sentryDsnWeb,
      posthogSampleRate: ANALYTICS_BAKED.posthogSampleRate,
      instanceId: row?.value ?? "",
    };
  });
}
