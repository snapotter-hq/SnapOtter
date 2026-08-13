import { ANALYTICS_BAKED, POSTHOG_PROXY_PATH } from "@snapotter/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db, schema } from "../db/index.js";
import { analyticsEnabled } from "../lib/analytics-gate.js";
import { posthogProxyEnabled } from "../lib/posthog-proxy.js";

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/config/analytics", async () => {
    // Effective state: compile-time bake AND the runtime instance opt-out.
    if (!analyticsEnabled()) {
      return {
        enabled: false,
        posthogApiKey: "",
        posthogHost: "",
        posthogProxyPath: "",
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
      // First-party proxy on by default; the break-glass env drops the client
      // back to talking to PostHog directly.
      posthogProxyPath: posthogProxyEnabled() ? POSTHOG_PROXY_PATH : "",
      sentryDsn: ANALYTICS_BAKED.sentryDsn,
      sentryDsnWeb: ANALYTICS_BAKED.sentryDsnWeb,
      posthogSampleRate: ANALYTICS_BAKED.posthogSampleRate,
      instanceId: row?.value ?? "",
    };
  });
}
