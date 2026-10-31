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
});

afterAll(async () => {
  await testApp.cleanup();
});

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

  it("merges CSVs with 200,000 rows without overflowing the call stack (#2320)", async () => {
    const rowCount = 200_000;
    const firstCsv = Buffer.from(`a,b\n0,0\n${"1,2\n".repeat(rowCount - 1)}`);
    const secondCsv = Buffer.from(`a,b\n${"3,4\n".repeat(rowCount)}`);
    const thirdCsv = Buffer.from("a,b\n9,10\n");
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "a.csv",
        contentType: "text/csv",
        content: firstCsv,
      },
      {
        name: "file",
        filename: "b.csv",
        contentType: "text/csv",
        content: secondCsv,
      },
      {
        name: "file",
        filename: "c.csv",
        contentType: "text/csv",
        content: thirdCsv,
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/files/merge-csvs",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const dl = await testApp.app.inject({
      method: "GET",
      url: JSON.parse(res.body).downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    const lines = dl.payload.trim().split(/\r?\n/);
    expect(lines.length).toBe(rowCount * 2 + 2);
    expect(lines[0]).toBe("a,b");
    expect(lines[1]).toBe("0,0");
    expect(lines[lines.length - 1]).toBe("9,10");
  }, 30_000);

  it("merges single-column CSVs instead of refusing them (#2099)", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "a.csv",
        contentType: "text/csv",
        content: Buffer.from("email\r\na@x.io"),
      },
      {
        name: "file",
        filename: "b.csv",
        contentType: "text/csv",
        content: Buffer.from("email\r\nb@x.io"),
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/files/merge-csvs",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const dl = await testApp.app.inject({
      method: "GET",
      url: JSON.parse(res.body).downloadUrl,
    });
    expect(dl.payload).toContain("a@x.io");
    expect(dl.payload).toContain("b@x.io");
  }, 30_000);

  it("keeps a column headed __proto__ instead of writing [object Object] (#2097)", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "a.csv",
        contentType: "text/csv",
        content: Buffer.from("__proto__,x\r\n5,1"),
      },
      {
        name: "file",
        filename: "b.csv",
        contentType: "text/csv",
        content: Buffer.from("__proto__,x\r\n6,2"),
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/files/merge-csvs",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const dl = await testApp.app.inject({
      method: "GET",
      url: JSON.parse(res.body).downloadUrl,
    });
    expect(dl.payload).toBe("__proto__,x\r\n5,1\r\n6,2");
  }, 30_000);

  it("merges files whose __proto__ column sits in a different position (#2097)", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "a.csv",
        contentType: "text/csv",
        content: Buffer.from("x,__proto__,constructor\r\n1,5,a"),
      },
      {
        name: "file",
        filename: "b.csv",
        contentType: "text/csv",
        content: Buffer.from("constructor,__proto__,x\r\nb,6,2"),
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/files/merge-csvs",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const dl = await testApp.app.inject({
      method: "GET",
      url: JSON.parse(res.body).downloadUrl,
    });
    expect(dl.payload).toBe("x,__proto__,constructor\r\n1,5,a\r\n2,6,b");
  }, 30_000);

  it("preserves the header row when merging header-only CSVs (#2321)", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "a.csv",
        contentType: "text/csv",
        content: Buffer.from("a,x"),
      },
      {
        name: "file",
        filename: "b.csv",
        contentType: "text/csv",
        content: Buffer.from("x,a\r\n"),
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/files/merge-csvs",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const dl = await testApp.app.inject({
      method: "GET",
      url: JSON.parse(res.body).downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.payload).toBe("a,x");
  }, 30_000);

  it("preserves the detected delimiter when merging header-only TSVs (#2321)", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "a.tsv",
        contentType: "text/tab-separated-values",
        content: Buffer.from("a\tx\r\n"),
      },
      {
        name: "file",
        filename: "b.tsv",
        contentType: "text/tab-separated-values",
        content: Buffer.from("a\tx"),
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/files/merge-csvs",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const dl = await testApp.app.inject({
      method: "GET",
      url: JSON.parse(res.body).downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.payload).toBe("a\tx");
  }, 30_000);

  it("merges a header-only first file with a populated second file in the first file's column order (#2321)", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "a.csv",
        contentType: "text/csv",
        content: Buffer.from("a,x\r\n"),
      },
      {
        name: "file",
        filename: "b.csv",
        contentType: "text/csv",
        content: Buffer.from("x,a\r\n2,1"),
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/files/merge-csvs",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const dl = await testApp.app.inject({
      method: "GET",
      url: JSON.parse(res.body).downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.payload).toBe("a,x\r\n1,2");
  }, 30_000);

  it("answers 400, not a server error, for blank files (#2099)", async () => {
    const bom = Buffer.from("﻿");
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.csv", contentType: "text/csv", content: bom },
      { name: "file", filename: "b.csv", contentType: "text/csv", content: bom },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/files/merge-csvs",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  }, 30_000);

  it("rejects mismatched headers with 400", async () => {
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

    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toMatch(/different columns/i);
  }, 30_000);

  it("rejects a later file with the same column count but different column names", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "a.csv",
        contentType: "text/csv",
        content: Buffer.from("a,b\n1,2\n"),
      },
      {
        name: "file",
        filename: "b.csv",
        contentType: "text/csv",
        content: Buffer.from("a,c\n3,4\n"),
      },
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
    expect(parsed.error).toMatch(/b\.csv has different columns/i);
  }, 30_000);

  it("rejects a later file that fails CSV parsing with 400 and names the file", async () => {
    const bom = Buffer.from("﻿");
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny-a.csv", contentType: "text/csv", content: CSV_A },
      { name: "file", filename: "broken.csv", contentType: "text/csv", content: bom },
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
    expect(parsed.error).toMatch(/CSV parse failed in broken\.csv/i);
  }, 30_000);

  it("refuses a CSV with duplicate column headers instead of rewriting the merged header (#2229)", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "a.csv",
        contentType: "text/csv",
        content: Buffer.from("a,a\r\n1,2"),
      },
      {
        name: "file",
        filename: "b.csv",
        contentType: "text/csv",
        content: Buffer.from("a,a\r\n3,4"),
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/files/merge-csvs",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/duplicate column headers: a/i);
  }, 30_000);

  it("refuses CSVs whose duplicate-named columns sit in a different order (#2229)", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "a.csv",
        contentType: "text/csv",
        content: Buffer.from("a,a,a_1\r\n1,2,3"),
      },
      {
        name: "file",
        filename: "b.csv",
        contentType: "text/csv",
        content: Buffer.from("a_1,a,a\r\n3,4,5"),
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/files/merge-csvs",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/duplicate column headers: a/i);
  }, 30_000);

  it("refuses a later file with duplicate column headers and names the file (#2229)", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "a.csv",
        contentType: "text/csv",
        content: Buffer.from("a,a_1\r\n1,2"),
      },
      {
        name: "file",
        filename: "b.csv",
        contentType: "text/csv",
        content: Buffer.from("a,a\r\n3,4"),
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/files/merge-csvs",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(
      /CSV parse failed in b\.csv:.*duplicate column headers: a/i,
    );
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
