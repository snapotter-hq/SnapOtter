/**
 * Integration tests for the chart-maker tool (/api/v1/tools/files/chart-maker).
 *
 * Factory FILE tool that consumes CSV/JSON and renders hand-rolled SVG
 * rasterized to PNG via sharp. Tests cover bar/line/pie kinds, CSV and JSON
 * inputs, numeric validation, SVG label escaping, and invalid kind rejection.
 */

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

function makeCsv(rows: [string, number][]): Buffer {
  const lines = ["label,value", ...rows.map(([l, v]) => `${l},${v}`)];
  return Buffer.from(lines.join("\n"), "utf8");
}

async function postChart(
  content: string,
  filename = "data.csv",
  settings: Record<string, unknown> = { kind: "bar" },
) {
  const { body, contentType } = createMultipartPayload([
    {
      name: "file",
      filename,
      contentType: filename.endsWith(".json") ? "application/json" : "text/csv",
      content: Buffer.from(content, "utf8"),
    },
    { name: "settings", content: JSON.stringify(settings) },
  ]);

  return app.inject({
    method: "POST",
    url: "/api/v1/tools/files/chart-maker",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

/** POSTs one file and hands back the rendered PNG bytes. */
async function renderChart(content: string, filename = "data.csv"): Promise<Buffer> {
  const res = await postChart(content, filename);
  expect(res.statusCode, res.body).toBe(200);
  const dl = await app.inject({ method: "GET", url: JSON.parse(res.body).downloadUrl });
  expect(dl.statusCode).toBe(200);
  return dl.rawPayload;
}

describe("Chart Maker", () => {
  it("generates a bar chart from a 4-row CSV", async () => {
    const csv = makeCsv([
      ["Apples", 10],
      ["Bananas", 25],
      ["Cherries", 15],
      ["Dates", 30],
    ]);

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "data.csv", contentType: "text/csv", content: csv },
      { name: "settings", content: JSON.stringify({ kind: "bar" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/files/chart-maker",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();

    // Download and verify PNG
    const dlRes = await app.inject({ method: "GET", url: result.downloadUrl });
    expect(dlRes.statusCode).toBe(200);
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBeGreaterThan(0);
  });

  it("generates a chart from JSON object input", async () => {
    const jsonData = JSON.stringify({ Apples: 10, Bananas: 25, Cherries: 15 });

    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "data.json",
        contentType: "application/json",
        content: Buffer.from(jsonData),
      },
      { name: "settings", content: JSON.stringify({ kind: "bar" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/files/chart-maker",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("generates a pie chart", async () => {
    const csv = makeCsv([
      ["Red", 40],
      ["Blue", 30],
      ["Green", 30],
    ]);

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "data.csv", contentType: "text/csv", content: csv },
      { name: "settings", content: JSON.stringify({ kind: "pie" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/files/chart-maker",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("generates a line chart", async () => {
    const csv = makeCsv([
      ["Jan", 10],
      ["Feb", 20],
      ["Mar", 15],
    ]);

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "data.csv", contentType: "text/csv", content: csv },
      { name: "settings", content: JSON.stringify({ kind: "line" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/files/chart-maker",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("rejects CSV with no numeric column", async () => {
    const csv = Buffer.from("label,value\nApples,lots\nBananas,many\n", "utf8");

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "bad.csv", contentType: "text/csv", content: csv },
      { name: "settings", content: JSON.stringify({ kind: "bar" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/files/chart-maker",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(422);
    const result = JSON.parse(res.body);
    expect(`${result.error} ${result.details ?? ""}`).toMatch(/numeric/i);
  });

  it("escapes SVG-injection labels and produces valid PNG", async () => {
    const csv = makeCsv([["<script>alert(1)</script>", 10]]);

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "xss.csv", contentType: "text/csv", content: csv },
      { name: "settings", content: JSON.stringify({ kind: "bar" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/files/chart-maker",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);

    // Download and verify it decodes as PNG (the escape proof: no SVG parse error)
    const dlRes = await app.inject({ method: "GET", url: result.downloadUrl });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.format).toBe("png");
  });

  it("rejects invalid chart kind", async () => {
    const csv = makeCsv([["A", 1]]);

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "data.csv", contentType: "text/csv", content: csv },
      { name: "settings", content: JSON.stringify({ kind: "donut" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/files/chart-maker",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  });

  it("uses default kind bar when no kind specified", async () => {
    const csv = makeCsv([
      ["A", 10],
      ["B", 20],
    ]);

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "data.csv", contentType: "text/csv", content: csv },
      { name: "settings", content: JSON.stringify({}) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/files/chart-maker",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("generates a chart from JSON array input", async () => {
    const jsonData = JSON.stringify([
      { label: "A", value: 10 },
      { label: "B", value: 20 },
      { label: "C", value: 30 },
    ]);

    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "data.json",
        contentType: "application/json",
        content: Buffer.from(jsonData),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/files/chart-maker",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("respects custom title", async () => {
    const csv = makeCsv([["A", 10]]);

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "data.csv", contentType: "text/csv", content: csv },
      { name: "settings", content: JSON.stringify({ title: "Sales Report" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/files/chart-maker",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("rejects unauthenticated requests", async () => {
    const csv = makeCsv([["A", 10]]);

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "data.csv", contentType: "text/csv", content: csv },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/files/chart-maker",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });
});

/**
 * Column detection (#1158).
 *
 * The label used to come from column 1 and the value from column 2, always, so
 * any file whose numbers sat anywhere else was refused. Rendering both the
 * awkward file and its hand-shaped equivalent and comparing the PNG bytes pins
 * which two columns the detection actually picked, which asserting a 200 alone
 * would not.
 */
describe("Chart Maker column detection", () => {
  it("charts a four-column CSV whose numbers are not in column 2", async () => {
    const png = await renderChart(
      "date,region,units,revenue\n2026-01,EMEA,120,4400\n2026-02,EMEA,98,3610\n",
    );

    expect((await sharp(png).metadata()).format).toBe("png");
    // Rightmost numeric column is the value, leftmost text column the label.
    expect(png.equals(await renderChart("date,revenue\n2026-01,4400\n2026-02,3610\n"))).toBe(true);
  });

  it("passes over a leading numeric id column when picking the value", async () => {
    const png = await renderChart("id,name,score\n1,Alice,90\n2,Bob,85\n");

    expect(png.equals(await renderChart("name,score\nAlice,90\nBob,85\n"))).toBe(true);
  });

  it("labels with the first column and plots the last when every column is numeric", async () => {
    const png = await renderChart("year,units,sales\n2020,5,100\n2021,7,150\n");

    expect(png.equals(await renderChart("label,value\n2020,100\n2021,150\n"))).toBe(true);
  });

  it("charts a single-column CSV, numbering the rows", async () => {
    const png = await renderChart("10\n20\n30\n");

    expect(png.equals(await renderChart("label,value\n1,10\n2,20\n3,30\n"))).toBe(true);
  });

  it("drops rows whose value cell is blank", async () => {
    const png = await renderChart("month,sales\nJan,100\nFeb,\nMar,300\n");

    expect(png.equals(await renderChart("month,sales\nJan,100\nMar,300\n"))).toBe(true);
  });

  it("names the columns it checked when the file holds no numbers", async () => {
    const res = await postChart("region,city\nEMEA,Berlin\nAPAC,Singapore\n");

    expect(res.statusCode).toBe(422);
    const result = JSON.parse(res.body);
    const message = `${result.error} ${result.details ?? ""}`;
    expect(message).toMatch(/numeric/i);
    expect(message).toContain("region");
    expect(message).toContain("city");
  });

  it("charts JSON wrapped in a data property", async () => {
    const rows = [
      { label: "A", value: 10 },
      { label: "B", value: 20 },
    ];
    const wrapped = await renderChart(JSON.stringify({ data: rows }), "data.json");

    expect(wrapped.equals(await renderChart(JSON.stringify(rows), "data.json"))).toBe(true);
  });

  it("charts a JSON array of objects that do not use label and value keys", async () => {
    const png = await renderChart(
      JSON.stringify([
        { name: "Ada", age: 36 },
        { name: "Grace", age: 45 },
      ]),
      "people.json",
    );

    expect(png.equals(await renderChart("name,age\nAda,36\nGrace,45\n"))).toBe(true);
  });

  it("reads CSV content out of a file named .json", async () => {
    const csv = "name,age\nAda,36\nGrace,45\n";

    expect((await renderChart(csv, "data.json")).equals(await renderChart(csv, "data.csv"))).toBe(
      true,
    );
  });

  it("charts a spreadsheet export that trails rows of bare commas", async () => {
    const png = await renderChart("month,sales\nJan,100\nFeb,200\n,\n,\n,\n");

    expect(png.equals(await renderChart("month,sales\nJan,100\nFeb,200\n"))).toBe(true);
  });

  it("skips past a rightmost column holding negative numbers", async () => {
    const png = await renderChart("region,sales,growth\nEMEA,4400,-2.1\nAPAC,3600,1.4\n");

    expect(png.equals(await renderChart("region,sales\nEMEA,4400\nAPAC,3600\n"))).toBe(true);
  });

  it("still rejects a file whose only numeric column is negative", async () => {
    const res = await postChart("month,delta\nJan,-5\nFeb,-3\n");

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).details).toMatch(/zero or greater/i);
  });

  it("rejects a CSV whose delimiter guess split the numbers apart", async () => {
    // "1,200" is a thousands separator, not two fields. Papa reports
    // UndetectableDelimiter and splits anyway; charting 200 would be wrong.
    const res = await postChart("sales\n1,200\n2,400\n3,600\n");

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).details).toMatch(/delimit/i);
  });

  it("ignores a stray extra field that only one row carries", async () => {
    const png = await renderChart("name,value\nA,1\nB,2,99\n");

    expect(png.equals(await renderChart("name,value\nA,1\nB,2\n"))).toBe(true);
  });

  it("keeps the no-numeric-column message readable on a wide file", async () => {
    const header = Array.from({ length: 14 }, (_, i) => `Revenue FY26 Q${i + 1}`).join(",");
    const res = await postChart(`${header}\n${Array(14).fill("n/a").join(",")}\n`);

    expect(res.statusCode).toBe(422);
    const details: string = JSON.parse(res.body).details;
    // Over 280 chars and friendlyError swaps in a generic sentence instead.
    expect(details.length).toBeLessThanOrEqual(280);
    expect(details).toMatch(/numeric/i);
    expect(details).toContain("Revenue FY26 Q1");
  });

  it("prefers an explicit value key over a later numeric one", async () => {
    const png = await renderChart(
      JSON.stringify([
        { label: "A", value: 10, rank: 3 },
        { label: "B", value: 20, rank: 1 },
      ]),
      "ranked.json",
    );

    expect(png.equals(await renderChart("label,value\nA,10\nB,20\n"))).toBe(true);
  });

  it("charts JSON objects that omit an optional field", async () => {
    const png = await renderChart(
      JSON.stringify([{ name: "A" }, { name: "B", revenue: 20 }, { name: "C", revenue: 30 }]),
      "sparse.json",
    );

    expect(png.equals(await renderChart("name,revenue\nB,20\nC,30\n"))).toBe(true);
  });

  it("reads JSON that carries a UTF-8 byte order mark", async () => {
    const rows = JSON.stringify([{ label: "A", value: 10 }]);

    expect(
      (await renderChart(`﻿${rows}`, "bom.json")).equals(await renderChart(rows, "bom.json")),
    ).toBe(true);
  });
});
