import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const CSV = readFixture(fixtures.data.csv);
const TSV = readFixture(fixtures.data.tsv);
const JSON_FIXTURE = readFixture(fixtures.data.json);

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
    url: "/api/v1/tools/files/csv-json",
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

  it("unwraps a single-key {data: [...]} wrapper for JSON-to-CSV (#1159)", async () => {
    const wrapped = Buffer.from(JSON.stringify({ data: [{ name: "Ada", age: 36 }] }));
    const res = await runTool("wrapped.json", wrapped);
    expect(res.statusCode).toBe(200);
    const dl = await testApp.app.inject({
      method: "GET",
      url: JSON.parse(res.body).downloadUrl,
    });
    expect(dl.payload).toContain("name,age");
    expect(dl.payload).toContain("Ada,36");
  }, 30_000);

  it("emits key/value rows for a flat object of scalars (#1159)", async () => {
    const obj = Buffer.from(JSON.stringify({ key1: "value" }));
    const res = await runTool("obj.json", obj);
    expect(res.statusCode).toBe(200);
    const dl = await testApp.app.inject({
      method: "GET",
      url: JSON.parse(res.body).downloadUrl,
    });
    expect(dl.payload).toContain("key,value");
    expect(dl.payload).toContain("key1,value");
  }, 30_000);

  it("converts a single-column CSV instead of refusing it (#2099)", async () => {
    const res = await runTool("emails.csv", Buffer.from("email\r\na@x.io\r\nb@x.io"));
    expect(res.statusCode).toBe(200);
    const dl = await testApp.app.inject({
      method: "GET",
      url: JSON.parse(res.body).downloadUrl,
    });
    expect(JSON.parse(dl.payload)).toEqual([{ email: "a@x.io" }, { email: "b@x.io" }]);
  }, 30_000);

  it("keeps a column headed __proto__ in CSV-to-JSON (#2096)", async () => {
    const res = await runTool("proto.csv", Buffer.from("__proto__,x\r\n5,1"));
    expect(res.statusCode).toBe(200);
    const dl = await testApp.app.inject({
      method: "GET",
      url: JSON.parse(res.body).downloadUrl,
    });
    // Parsed JSON would hide it behind the prototype setter, so compare the text.
    expect(dl.payload.replace(/\s/g, "")).toBe('[{"__proto__":"5","x":"1"}]');
  }, 30_000);

  it("round-trips a __proto__ column through JSON-to-CSV and back (#2096)", async () => {
    const toCsv = await runTool("proto.json", Buffer.from('[{"__proto__": 5, "x": 1}]'));
    const csv = (
      await testApp.app.inject({ method: "GET", url: JSON.parse(toCsv.body).downloadUrl })
    ).payload;
    expect(csv).toBe("__proto__,x\r\n5,1");

    const back = await runTool("proto.csv", Buffer.from(csv));
    const json = (
      await testApp.app.inject({ method: "GET", url: JSON.parse(back.body).downloadUrl })
    ).payload;
    expect(json.replace(/\s/g, "")).toBe('[{"__proto__":"5","x":"1"}]');
  }, 30_000);

  it("refuses a CSV with no rows (#2099)", async () => {
    const res = await runTool("blank.csv", Buffer.from("\r\n\r\n"));
    expect(res.statusCode).toBe(400);
  }, 30_000);

  it("still refuses a CSV with a real parse error (#2099)", async () => {
    const res = await runTool("broken.csv", Buffer.from('a,b\r\n"unterminated,1'));
    expect(res.statusCode).toBe(400);
  }, 30_000);

  it("keeps a __proto__ column in JSON-to-CSV (#2062)", async () => {
    const res = await runTool("proto.json", Buffer.from('[{"__proto__": {"a": 1}, "x": 1}]'));
    expect(res.statusCode).toBe(200);
    const dl = await testApp.app.inject({
      method: "GET",
      url: JSON.parse(res.body).downloadUrl,
    });
    expect(dl.payload).toBe('__proto__,x\r\n"{""a"":1}",1');
  }, 30_000);

  it("answers 400, not 422, for empty and field-less JSON rows (#1159)", async () => {
    for (const body of ['{"data": []}', "[]", "[{}]"]) {
      const res = await runTool("empty.json", Buffer.from(body));
      expect(res.statusCode, body).toBe(400);
    }
  }, 30_000);

  it("rejects ambiguous JSON input for JSON-to-CSV", async () => {
    const obj = Buffer.from(JSON.stringify({ users: [{ id: 1 }], meta: { total: 1 } }));
    const res = await runTool("ambiguous.json", obj);
    expect(res.statusCode).toBe(400);
  }, 30_000);
});
