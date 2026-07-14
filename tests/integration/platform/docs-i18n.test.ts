// tests/integration/platform/docs-i18n.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
    expect(res.body).toContain("Größe ändern");
    expect(res.body).toContain("locale: de");
  });

  it("falls back to English for an unsupported lang", async () => {
    const res = await testApp.app.inject({ method: "GET", url: "/api/v1/openapi.yaml?lang=zz" });
    expect(res.statusCode).toBe(200);
    // English spec has the English summary, not the German one.
    expect(res.body).toContain("openapi: 3.1.0");
    expect(res.body).not.toContain("Größe ändern");
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
    expect(res.body).toContain("Größe ändern - Größe nach Pixeln");
    expect(res.body).toContain("(resize, sync)");
  });
});
