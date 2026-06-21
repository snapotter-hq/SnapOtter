import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const CSV_A = readFixture(fixtures.data.csvA);
const CSV_B = readFixture(fixtures.data.csvB);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("merge-csvs (pure JS, no skipIf)", () => {
  it("merges tiny-a.csv and tiny-b.csv into one file with both rows", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny-a.csv", contentType: "text/csv", content: CSV_A },
      { name: "file", filename: "tiny-b.csv", contentType: "text/csv", content: CSV_B },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/files/merge-csvs",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    const text = dl.payload;
    const lines = text.trim().split("\n");
    // One header line + two data rows
    expect(lines.length).toBe(3);
    expect(text).toContain("alpha");
    expect(text).toContain("beta");
  }, 30_000);

  it("rejects mismatched headers with 422", async () => {
    const bad = Buffer.from("x,y\n10,20\n");
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny-a.csv", contentType: "text/csv", content: CSV_A },
      { name: "file", filename: "bad.csv", contentType: "text/csv", content: bad },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/files/merge-csvs",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(422);
    const parsed = JSON.parse(res.body);
    expect(parsed.details).toMatch(/different columns/i);
  }, 30_000);

  it("rejects a single file with 400", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny-a.csv", contentType: "text/csv", content: CSV_A },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/files/merge-csvs",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toMatch(/at least 2/i);
  }, 30_000);
});
