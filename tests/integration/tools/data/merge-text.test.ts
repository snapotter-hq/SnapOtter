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
});

afterAll(async () => {
  await testApp.cleanup();
});

type Part = { filename: string; content: Buffer | string; contentType?: string };

async function mergeText(parts: Part[], settings: Record<string, unknown> = {}) {
  const { body, contentType } = createMultipartPayload([
    ...parts.map((p) => ({
      name: "file",
      filename: p.filename,
      contentType: p.contentType ?? "text/plain",
      content: Buffer.isBuffer(p.content) ? p.content : Buffer.from(p.content),
    })),
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/files/merge-text",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe("merge-text (pure JS, no skipIf)", () => {
  it("merges Markdown files in upload order under filename headings", async () => {
    const res = await mergeText(
      [
        { filename: "b.md", content: "beta\n", contentType: "text/markdown" },
        { filename: "a.md", content: "alpha\n", contentType: "text/markdown" },
      ],
      { separator: "filename-heading" },
    );

    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toMatch(/merged\.md$/);

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(dl.payload).toBe("# b.md\n\nbeta\n\n# a.md\n\nalpha\n");
  }, 30_000);

  it("defaults to a blank line between files and plain text for mixed inputs", async () => {
    const res = await mergeText([
      { filename: "notes.txt", content: "one" },
      { filename: "readme.md", content: "two" },
    ]);

    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toMatch(/merged\.txt$/);
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.payload).toBe("one\n\ntwo\n");
  }, 30_000);

  it("rejects a single file with 400 before running", async () => {
    const res = await mergeText([{ filename: "only.txt", content: "x" }]);
    expect(res.statusCode).toBe(400);
  }, 30_000);

  it("rejects an extension outside the accepted list", async () => {
    const res = await mergeText([
      { filename: "a.txt", content: "x" },
      { filename: "mail.eml", content: "From: a@b.c\n\nhi" },
    ]);
    expect(res.statusCode).toBe(415);
  }, 30_000);

  it("rejects a binary file renamed to .txt and names it", async () => {
    const res = await mergeText([
      { filename: "a.txt", content: "x" },
      { filename: "photo.txt", content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a]) },
    ]);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/photo\.txt/);
  }, 30_000);

  it("rejects an unknown separator", async () => {
    const res = await mergeText(
      [
        { filename: "a.txt", content: "x" },
        { filename: "b.txt", content: "y" },
      ],
      { separator: "page-break" },
    );
    expect(res.statusCode).toBe(400);
  }, 30_000);
});
