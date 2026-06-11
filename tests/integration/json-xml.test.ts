import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const JSON_FIXTURE = readFileSync(join(__dirname, "..", "fixtures", "data", "tiny.json"));
const XML_FIXTURE = readFileSync(join(__dirname, "..", "fixtures", "data", "tiny.xml"));

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
    url: "/api/v1/tools/json-xml",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe("json-xml (pure JS, no skipIf)", () => {
  it("converts JSON to XML containing <name>Ada</name>", async () => {
    const res = await runTool("tiny.json", JSON_FIXTURE, { pretty: true });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    const xmlText = dl.payload;
    expect(xmlText).toContain("<name>Ada</name>");
  }, 30_000);

  it("converts XML to JSON with the people structure", async () => {
    const res = await runTool("tiny.xml", XML_FIXTURE, { pretty: true });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    const data = JSON.parse(dl.payload);
    // fast-xml-parser parses into a structure with a "people" key
    expect(data.people).toBeDefined();
    const persons = data.people.person;
    expect(Array.isArray(persons)).toBe(true);
    const ada = persons.find((p: Record<string, string>) => p.name === "Ada");
    expect(ada).toBeDefined();
  }, 30_000);
});
