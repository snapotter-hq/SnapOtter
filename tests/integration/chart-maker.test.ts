/**
 * Integration tests for the chart-maker tool (/api/v1/tools/chart-maker).
 *
 * Factory FILE tool that consumes CSV/JSON and renders hand-rolled SVG
 * rasterized to PNG via sharp. Tests cover bar/line/pie kinds, CSV and JSON
 * inputs, numeric validation, SVG label escaping, and invalid kind rejection.
 */

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

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
      url: "/api/v1/tools/chart-maker",
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
      url: "/api/v1/tools/chart-maker",
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
      url: "/api/v1/tools/chart-maker",
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
      url: "/api/v1/tools/chart-maker",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
  });

  it("rejects CSV with non-numeric column 2", async () => {
    const csv = Buffer.from("label,value\nApples,lots\nBananas,many\n", "utf8");

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "bad.csv", contentType: "text/csv", content: csv },
      { name: "settings", content: JSON.stringify({ kind: "bar" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/chart-maker",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(422);
    const result = JSON.parse(res.body);
    expect(result.error + " " + (result.details ?? "")).toMatch(/numeric/i);
  });

  it("escapes SVG-injection labels and produces valid PNG", async () => {
    const csv = makeCsv([["<script>alert(1)</script>", 10]]);

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "xss.csv", contentType: "text/csv", content: csv },
      { name: "settings", content: JSON.stringify({ kind: "bar" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/chart-maker",
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
      url: "/api/v1/tools/chart-maker",
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
      url: "/api/v1/tools/chart-maker",
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
      url: "/api/v1/tools/chart-maker",
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
      url: "/api/v1/tools/chart-maker",
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
      url: "/api/v1/tools/chart-maker",
      headers: { "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(401);
  });
});
