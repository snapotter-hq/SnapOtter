import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const YAML = readFileSync(join(__dirname, "..", "fixtures", "data", "tiny.yaml"));

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function runTool(filename: string, content: Buffer, settings: Record<string, unknown> = {}) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/octet-stream", content },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/yaml-json",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe("yaml-json (pure JS, no skipIf)", () => {
  it("converts tiny.yaml to JSON containing 'alpha'", async () => {
    const res = await runTool("tiny.yaml", YAML);
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    const json = dl.payload;
    expect(json).toContain("alpha");
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("SnapOtter");
  }, 30_000);

  it("round-trips: converts the produced JSON back to YAML", async () => {
    // First: yaml -> json
    const res1 = await runTool("tiny.yaml", YAML);
    expect(res1.statusCode).toBe(200);
    const env1 = JSON.parse(res1.body);
    const dl1 = await testApp.app.inject({ method: "GET", url: env1.downloadUrl });
    const jsonBuf = Buffer.from(dl1.payload, "utf8");

    // Second: json -> yaml
    const res2 = await runTool("tiny.json", jsonBuf);
    expect(res2.statusCode).toBe(200);
    const env2 = JSON.parse(res2.body);
    const dl2 = await testApp.app.inject({ method: "GET", url: env2.downloadUrl });
    expect(dl2.statusCode).toBe(200);

    const yamlText = dl2.payload;
    expect(yamlText).toContain("alpha");
    expect(yamlText).toContain("SnapOtter");
  }, 30_000);

  it("rejects malformed YAML with 422", async () => {
    const bad = Buffer.from("a: [unclosed");
    const res = await runTool("bad.yaml", bad);
    expect(res.statusCode).toBe(422);
    const parsed = JSON.parse(res.body);
    expect(parsed.details).toMatch(/not valid yaml/i);
  }, 30_000);
});
