import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);

let testApp: TestApp;
let adminToken: string;
let baseUrl: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
  // Listen on a real port so the download is served over a TCP socket instead
  // of app.inject (which buffers the whole body and can't observe a stream that
  // stalls before delivering all of Content-Length).
  await testApp.app.listen({ port: 0, host: "127.0.0.1" });
  const addr = testApp.app.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function convert(files: Buffer[], collate: boolean): Promise<string> {
  const parts = files.map((content, i) => ({
    name: "file",
    filename: `page-${i}.png`,
    contentType: "image/png",
    content,
  }));
  parts.push({
    name: "settings",
    filename: "",
    contentType: "",
    content: Buffer.from(JSON.stringify({ collate })),
  });
  const { body, contentType } = createMultipartPayload(parts);
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/image/image-to-pdf",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body).downloadUrl as string;
}

async function expectCompleteDownload(downloadUrl: string) {
  const res = await fetch(`${baseUrl}${downloadUrl}`);
  expect(res.status).toBe(200);
  // Ask a reverse proxy not to buffer the download (the usual cause of a
  // download that stalls behind nginx on a self-hosted install).
  expect(res.headers.get("x-accel-buffering")).toBe("no");
  const declared = Number(res.headers.get("content-length"));
  expect(declared).toBeGreaterThan(0);
  const body = Buffer.from(await res.arrayBuffer());
  // The reporter's symptom (#590) is a download that "starts but never
  // finishes": Content-Length promises more bytes than the stream delivers, so
  // the browser waits forever. Assert delivered bytes equal the declared length.
  expect(body.length).toBe(declared);
}

describe("image-to-pdf download completes over a real socket (#590)", () => {
  it("delivers exactly Content-Length bytes for a collated PDF", async () => {
    const url = await convert([PNG], true);
    expect(url).toMatch(/\.pdf$/);
    await expectCompleteDownload(url);
  }, 60_000);

  it("delivers exactly Content-Length bytes for a multi-file ZIP", async () => {
    const url = await convert([PNG, PNG], false);
    expect(url).toMatch(/\.zip$/);
    await expectCompleteDownload(url);
  }, 60_000);
});
