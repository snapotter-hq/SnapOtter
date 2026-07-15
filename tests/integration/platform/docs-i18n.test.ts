// tests/integration/platform/docs-i18n.test.ts
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { docsRoutes } from "../../../apps/api/src/routes/docs.js";
import { buildTestApp, type TestApp } from "../test-server";

describe("API docs i18n serving", () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  it("serves the German spec for ?lang=de", async () => {
    const res = await testApp.app.inject({ method: "GET", url: "/api/v1/openapi.yaml?lang=de" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/yaml");
    expect(res.body).toContain("Bildgröße ändern");
    expect(res.body).toContain("locale: de");
  });

  it("falls back to English for an unsupported lang", async () => {
    const res = await testApp.app.inject({ method: "GET", url: "/api/v1/openapi.yaml?lang=zz" });
    expect(res.statusCode).toBe(200);
    // English spec has the English summary, not the German one.
    expect(res.body).toContain("openapi: 3.1.0");
    expect(res.body).not.toContain("Bildgröße ändern");
  });

  it("serves another committed locale spec without falling back to English", async () => {
    const res = await testApp.app.inject({ method: "GET", url: "/api/v1/openapi.yaml?lang=fr" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("locale: fr");
    expect(res.body).not.toContain("locale: de");
  });

  it("keeps the default (no lang) response ASCII-only", async () => {
    const res = await testApp.app.inject({ method: "GET", url: "/api/v1/openapi.yaml" });
    const offending = [...res.body].find((ch) => ch.charCodeAt(0) > 0x7f);
    expect(offending).toBeUndefined();
  });

  it("serves a localized llms.de.txt using translated tool strings", async () => {
    const res = await testApp.app.inject({ method: "GET", url: "/llms.de.txt" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).toContain("## Tools");
    // Tag prose comes from the committed German spec.
    expect(res.body).toContain("Datei-Verarbeitungstools");
    // Tool lines come from shared i18n; the Resize tool id is present with a mode.
    expect(res.body).toContain("Bildgröße ändern - Größe nach Pixeln");
    expect(res.body).toContain("(resize, sync)");
  });

  it("rate-limits request-time localized docs work even when global limiting is disabled", async () => {
    const app = Fastify();
    await app.register(rateLimit, {
      max: 50_000,
      timeWindow: "1 minute",
      allowList: (request) => !request.url.startsWith("/api/"),
    });
    await docsRoutes(app);
    await app.ready();

    try {
      for (const url of ["/api/v1/openapi.yaml?lang=de", "/llms.de.txt"]) {
        for (let request = 0; request < 60; request++) {
          const response = await app.inject({ method: "GET", url });
          expect(response.statusCode).toBe(200);
          expect(response.headers["x-ratelimit-limit"]).toBe("60");
        }

        const limited = await app.inject({ method: "GET", url });
        expect(limited.statusCode).toBe(429);

        const head = await app.inject({ method: "HEAD", url });
        expect(head.statusCode).toBe(404);
      }
    } finally {
      await app.close();
    }
  });

  it("does not loosen a stricter operator rate limit", async () => {
    const previousLimit = env.RATE_LIMIT_PER_MIN;
    env.RATE_LIMIT_PER_MIN = 2;
    const app = Fastify();

    try {
      await app.register(rateLimit, {
        max: env.RATE_LIMIT_PER_MIN,
        timeWindow: "1 minute",
        allowList: (request) => !request.url.startsWith("/api/"),
      });
      await docsRoutes(app);
      await app.ready();

      for (const url of ["/api/v1/openapi.yaml?lang=de", "/llms.de.txt"]) {
        for (let request = 0; request < 2; request++) {
          const response = await app.inject({ method: "GET", url });
          expect(response.statusCode).toBe(200);
          expect(response.headers["x-ratelimit-limit"]).toBe("2");
        }

        const limited = await app.inject({ method: "GET", url });
        expect(limited.statusCode).toBe(429);
      }
    } finally {
      env.RATE_LIMIT_PER_MIN = previousLimit;
      await app.close();
    }
  });
});
