import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const JSON_FIXTURE = readFixture(fixtures.data.json);
const XML_FIXTURE = readFixture(fixtures.data.xml);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

async function runTool(filename: string, content: Buffer, settings: Record<string, unknown> = {}) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/octet-stream", content },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/files/json-xml",
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

  // Sentry NODE-A8: the XML builder and parser cap nesting at 100 levels and
  // throw a plain Error that used to read as our bug (#4378).
  function nestedJson(depth: number): Buffer {
    let doc = '{"leaf":1}';
    for (let i = 0; i < depth; i++) doc = `{"n":${doc}}`;
    return Buffer.from(doc);
  }

  it("still converts JSON just under the nesting limit", async () => {
    const res = await runTool("deep-98.json", nestedJson(98), { pretty: false });
    expect(res.statusCode).toBe(200);
  }, 30_000);

  it.each([100, 500])(
    "rejects JSON nested %i levels with a coded 400",
    async (depth) => {
      const res = await runTool(`deep-${depth}.json`, nestedJson(depth), { pretty: false });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("NESTING_TOO_DEEP");
      expect(body.error).toMatch(/more than 100 levels/);
    },
    30_000,
  );

  it("rejects XML nested past the limit with a coded 400", async () => {
    const xml = Buffer.from(`${"<a>".repeat(150)}x${"</a>".repeat(150)}`);
    const res = await runTool("deep.xml", xml);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("NESTING_TOO_DEEP");
  }, 30_000);
});
