import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiToolPath, TOOLS } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "../test-server";

describe("API docs", () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  function openApiPathSet(body: string): Set<string> {
    return new Set([...body.matchAll(/^ {2}(\/[^:]+):/gm)].map((match) => match[1]));
  }

  it("serves the OpenAPI spec as YAML", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/openapi.yaml",
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/yaml");
    expect(res.body).toContain("openapi: 3.1.0");
    expect(res.body).toContain("SnapOtter API");
  });

  it("serves an ASCII-only spec (strict YAML parsers reject high-byte chars)", async () => {
    // Schemathesis (and other strict YAML parsers) mis-decode multi-byte UTF-8
    // sequences as C1 control characters and refuse to load the schema. Keep the
    // spec ASCII-only: use '-' instead of em dashes, plain ASCII section dividers.
    const res = await testApp.app.inject({ method: "GET", url: "/api/v1/openapi.yaml" });
    const offending = [...res.body].find((ch) => ch.charCodeAt(0) > 0x7f);
    const hint = offending
      ? `OpenAPI spec has non-ASCII char U+${offending
          .charCodeAt(0)
          .toString(16)
          .padStart(4, "0")} (${JSON.stringify(offending)}); replace it with ASCII.`
      : "ok";
    expect(hint).toBe("ok");
  });

  it("serves the Scalar docs page without auth", async () => {
    // Scalar redirects /api/docs -> /api/docs/ (trailing slash)
    const redirect = await testApp.app.inject({
      method: "GET",
      url: "/api/docs",
    });
    expect([200, 301, 302]).toContain(redirect.statusCode);

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/docs/",
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("includes every catalog tool endpoint in the spec", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/openapi.yaml",
    });
    const paths = openApiPathSet(res.body);
    const missing = TOOLS.map((tool) => apiToolPath(tool.id)).filter((path) => !paths.has(path));

    expect(missing, `OpenAPI missing tool paths: ${missing.join(", ")}`).toEqual([]);
  });

  it("documents public docs metadata routes", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/openapi.yaml",
    });
    const paths = openApiPathSet(res.body);
    const expectedPaths = [
      "/llms.txt",
      "/llms-full.txt",
      "/api/v1/openapi.yaml",
      "/api/v1/tools/popular",
    ];
    const missing = expectedPaths.filter((path) => !paths.has(path));

    expect(missing, `OpenAPI missing docs metadata paths: ${missing.join(", ")}`).toEqual([]);
  });

  it("documents the surrounding non-tool API surface in the spec", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/openapi.yaml",
    });
    const paths = openApiPathSet(res.body);
    const expectedPaths = [
      "/api/v1/readyz",
      "/api/v1/jobs/{jobId}/cancel",
      "/api/v1/preferences",
      "/api/auth/mfa/enroll",
      "/api/auth/oidc/login",
      "/api/auth/saml/metadata",
      "/api/v1/files/{id}/preview",
      "/api/v1/preview/generate",
      "/api/v1/admin/log-level",
      "/api/v1/metrics",
      "/api/v1/enterprise/scim/token",
      "/api/v1/scim/v2/ServiceProviderConfig",
    ];
    const missing = expectedPaths.filter((path) => !paths.has(path));

    expect(missing, `OpenAPI missing non-tool API paths: ${missing.join(", ")}`).toEqual([]);
  });

  it("keeps published docs counts aligned with the live catalog", () => {
    const root = process.cwd();
    const gettingStarted = readFileSync(join(root, "apps/docs/guide/getting-started.md"), "utf8");
    const deployment = readFileSync(join(root, "apps/docs/guide/deployment.md"), "utf8");
    const architecture = readFileSync(join(root, "apps/docs/guide/architecture.md"), "utf8");

    expect(gettingStarted).toContain("| **Image** | 107 |");
    expect(gettingStarted).toContain("| **Video** | 57 |");
    expect(gettingStarted).toContain("| **Audio** | 27 |");
    expect(gettingStarted).toContain("| **PDF / Document** | 42 |");
    expect(gettingStarted).toContain("| **Files** | 10 |");
    expect(deployment).not.toContain("All 138 non-AI tools");
    expect(architecture).toContain("243 tool routes");
  });

  it("serves an LLM summary with live catalog tools", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/llms.txt",
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("## Tools");
    expect(res.body).toContain("- Image (107 tools)");
    expect(res.body).toContain("Resize Image - Resize by pixels");
    expect(res.body).toContain("Sign PDF -");
  });
});
