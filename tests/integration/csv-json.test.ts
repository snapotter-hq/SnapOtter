import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const CSV = readFileSync(join(__dirname, "..", "fixtures", "data", "tiny.csv"));
const TSV = readFileSync(join(__dirname, "..", "fixtures", "data", "tiny.tsv"));
const JSON_FIXTURE = readFileSync(join(__dirname, "..", "fixtures", "data", "tiny.json"));

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
    url: "/api/v1/tools/csv-json",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe("csv-json (pure JS, no skipIf)", () => {
  it("converts CSV to JSON with the Ada row present", async () => {
    const res = await runTool("tiny.csv", CSV, { pretty: true });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    const data = JSON.parse(dl.payload);
    expect(Array.isArray(data)).toBe(true);
    const ada = data.find((r: Record<string, string>) => r.name === "Ada");
    expect(ada).toBeDefined();
    expect(ada.age).toBe("36");
  }, 30_000);

  it("converts JSON to CSV containing name,age header", async () => {
    const res = await runTool("tiny.json", JSON_FIXTURE);
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    const csvText = dl.payload;
    expect(csvText).toContain("name,age");
    expect(csvText).toContain("Ada");
  }, 30_000);

  it("converts TSV to JSON with the correct keys", async () => {
    const res = await runTool("tiny.tsv", TSV, { pretty: true });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    const data = JSON.parse(dl.payload);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);
    const first = data[0] as Record<string, string>;
    expect(first.id).toBe("1");
    expect(first.name).toBe("alpha");
  }, 30_000);

  it("rejects non-array JSON input for JSON-to-CSV", async () => {
    const obj = Buffer.from(JSON.stringify({ key: "value" }));
    const res = await runTool("obj.json", obj);
    expect(res.statusCode).toBe(422);
  }, 30_000);
});
