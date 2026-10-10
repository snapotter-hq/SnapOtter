import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

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
    url: "/api/v1/tools/files/xml-to-csv",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe("xml-to-csv (pure JS, no skipIf)", () => {
  it("converts XML with 2 repeated elements to CSV with 2 data rows", async () => {
    const xml = Buffer.from(
      '<?xml version="1.0"?><items><item><name>Ada</name><age>36</age></item><item><name>Grace</name><age>85</age></item></items>',
    );
    const res = await runTool("data.xml", xml);
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    expect(envelope.rows).toBe(2);

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    const text = dl.payload;
    const lines = text.trim().split("\n");
    // header + 2 data rows
    expect(lines.length).toBe(3);
    expect(text).toContain("Ada");
    expect(text).toContain("Grace");
  }, 30_000);

  it("converts single non-repeating record to a 1-row CSV", async () => {
    const xml = Buffer.from('<?xml version="1.0"?><root><single>value</single></root>');
    const res = await runTool("flat.xml", xml);
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    expect(envelope.rows).toBe(1);

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    const text = dl.payload;
    const lines = text.trim().split("\n");
    // header + 1 data row
    expect(lines.length).toBe(2);
    expect(text).toContain("single");
    expect(text).toContain("value");
  }, 30_000);

  // #2098: flattenRow built each row on a {} literal, so an attribute named
  // __proto__ hit the prototype setter (column dropped) and a row missing a
  // column named toString read the inherited function into its cell. The same
  // bug was fixed in csv-json (#2062) with null-prototype rows.
  it("keeps a column whose attribute is named __proto__", async () => {
    const xml = Buffer.from(
      '<?xml version="1.0"?><rows><row __proto__="5" a="1"/><row __proto__="6" a="2"/></rows>',
    );
    const res = await runTool("proto.xml", xml);
    expect(res.statusCode).toBe(200);

    const envelope = JSON.parse(res.body);
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    const text = (dl.payload as string).replace(/\r\n/g, "\n");
    const lines = text.trim().split("\n");
    expect(lines[0]).toBe("__proto__,a");
    expect(lines[1]).toBe("5,1");
    expect(lines[2]).toBe("6,2");
  }, 30_000);

  it("leaves a missing toString cell empty instead of the inherited function", async () => {
    const xml = Buffer.from('<?xml version="1.0"?><rows><row toString="5"/><row a="1"/></rows>');
    const res = await runTool("tostring.xml", xml);
    expect(res.statusCode).toBe(200);

    const envelope = JSON.parse(res.body);
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    const text = (dl.payload as string).replace(/\r\n/g, "\n");
    const lines = text.trim().split("\n");
    expect(lines[0]).toBe("toString,a");
    expect(lines[1]).toBe("5,");
    expect(lines[2]).toBe(",1");
    expect(text).not.toContain("native code");
  }, 30_000);
});
