import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("SVGZ fallback behavior", () => {
  it("keeps .svgz extension if it does not contain a valid SVG", async () => {
    // A gzipped file containing a plain text string
    const gzippedText = gzipSync(Buffer.from("This is just some text, not an SVG"));

    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test-invalid.svgz",
        contentType: "application/octet-stream",
        content: gzippedText,
      },
    ]);

    const uploadRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      payload: body,
    });

    expect(uploadRes.statusCode).toBe(201);
    const result = JSON.parse(uploadRes.body);

    // It should keep the .svgz extension since it fell back to binary
    expect(result.files[0].originalName).toBe("test-invalid.svgz");
  });
});
