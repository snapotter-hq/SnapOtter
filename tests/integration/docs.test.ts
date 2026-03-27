import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./test-server";

describe("API docs", () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  it("serves the OpenAPI spec as YAML", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/openapi.yaml",
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/yaml");
    expect(res.body).toContain("openapi: 3.1.0");
    expect(res.body).toContain("Stirling Image API");
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

  it("includes all tool endpoints in the spec", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/openapi.yaml",
    });
    const body = res.body;
    expect(body).toContain("/api/v1/tools/resize");
    expect(body).toContain("/api/v1/tools/compress");
    expect(body).toContain("/api/v1/tools/remove-background");
    expect(body).toContain("/api/v1/tools/ocr");
  });
});
