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

describe("create-zip (pure JS, no skipIf)", () => {
  it("zips two fixture files into a valid ZIP with PK magic", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny-a.csv", contentType: "text/csv", content: CSV_A },
      { name: "file", filename: "tiny-b.csv", contentType: "text/csv", content: CSV_B },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/files/create-zip",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    // PK magic bytes
    expect(dl.rawPayload[0]).toBe(0x50);
    expect(dl.rawPayload[1]).toBe(0x4b);

    // Non-trivial size (both fixture files + zip overhead)
    expect(dl.rawPayload.length).toBeGreaterThan(CSV_A.length + CSV_B.length - 50);
  }, 30_000);

  it("rejects a single file with 400 'at least two'", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny-a.csv", contentType: "text/csv", content: CSV_A },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/files/create-zip",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toMatch(/at least 2/i);
  }, 30_000);
});
