// tests/integration/platform/docs-i18n.test.ts
import { rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "../test-server";

// The docs route resolves locale specs relative to apps/api/src (next to
// openapi.yaml). Write a small German fixture spec there so serve-by-lang has
// a real file to pick up, then clean it up. This avoids committing a full
// generated locale spec into the repo just for the test.
const apiSrc = join(dirname(fileURLToPath(import.meta.url)), "../../../apps/api/src");
const deSpecPath = join(apiSrc, "openapi.de.yaml");

const DE_SPEC = {
  openapi: "3.1.0",
  info: { title: "SnapOtter API", version: "2.0.0", description: "Deutsche Beschreibung." },
  tags: [{ name: "Tools", description: "Werkzeuge." }],
  paths: {
    "/api/v1/tools/image/resize": {
      post: { tags: ["Tools"], summary: "Groesse aendern", description: "Bild skalieren." },
    },
  },
  "x-i18n": { locale: "de", entries: {} },
};

describe("API docs i18n serving", () => {
  let testApp: TestApp;

  beforeAll(async () => {
    writeFileSync(deSpecPath, yaml.dump(DE_SPEC, { lineWidth: -1 }), "utf8");
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    rmSync(deSpecPath, { force: true });
    await testApp.cleanup();
  });

  it("serves the German spec for ?lang=de", async () => {
    const res = await testApp.app.inject({ method: "GET", url: "/api/v1/openapi.yaml?lang=de" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/yaml");
    expect(res.body).toContain("Groesse aendern");
    expect(res.body).toContain("locale: de");
  });

  it("falls back to English for an unsupported lang", async () => {
    const res = await testApp.app.inject({ method: "GET", url: "/api/v1/openapi.yaml?lang=zz" });
    expect(res.statusCode).toBe(200);
    // English spec has the English summary, not the German one.
    expect(res.body).toContain("openapi: 3.1.0");
    expect(res.body).not.toContain("Groesse aendern");
  });

  it("falls back to English for a supported locale with no spec file", async () => {
    // fr is supported but no openapi.fr.yaml exists.
    const res = await testApp.app.inject({ method: "GET", url: "/api/v1/openapi.yaml?lang=fr" });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain("Groesse aendern");
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
    // Tag prose comes from the German fixture spec.
    expect(res.body).toContain("Werkzeuge.");
    // Tool lines come from shared i18n; the Resize tool id is present with a mode.
    expect(res.body).toContain("(resize, sync)");
  });
});
