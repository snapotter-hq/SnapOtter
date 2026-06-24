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

  it("includes all tool endpoints in the spec", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/openapi.yaml",
    });
    const body = res.body;
    expect(body).toContain("/api/v1/tools/image/resize");
    expect(body).toContain("/api/v1/tools/image/compress");
    expect(body).toContain("/api/v1/tools/image/remove-background");
    expect(body).toContain("/api/v1/tools/image/ocr");
  });
});
