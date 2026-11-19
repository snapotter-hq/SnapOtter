import { readFileSync } from "node:fs";
import { join } from "node:path";
import multipart from "@fastify/multipart";
import AdmZip from "adm-zip";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { registerBulkRename } from "../../../apps/api/src/routes/tools/bulk-rename.js";

const PNG = readFileSync(join(__dirname, "../../fixtures/image/valid/test-200x150.png"));
const TXT = readFileSync(join(__dirname, "../../fixtures/document/formats/tiny.txt"));

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
  registerErrorHandler(app);
  registerBulkRename(app);
  await app.ready();
  return app;
}

function multipartBody(files: Array<{ filename: string; content: Buffer }>) {
  const boundary = "----unit";
  const parts: Buffer[] = [];
  for (const file of files) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      file.content,
      Buffer.from("\r\n"),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="settings"\r\n\r\n${JSON.stringify({ pattern: "x-{{index}}" })}\r\n`,
    ),
  );
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

async function rename(files: Array<{ filename: string; content: Buffer }>) {
  const app = await buildApp();
  try {
    return await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/bulk-rename",
      ...multipartBody(files),
    });
  } finally {
    await app.close();
  }
}

describe("bulk-rename only accepts images (#4401)", () => {
  it("rejects a text file mixed in with an image, naming the file", async () => {
    const res = await rename([
      { filename: "sample.png", content: PNG },
      { filename: "tiny.txt", content: TXT },
    ]);

    expect(res.statusCode).toBe(400);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(JSON.parse(res.body).error).toContain('"tiny.txt"');
  });

  it("rejects garbage bytes behind an image extension", async () => {
    const res = await rename([{ filename: "fake.png", content: Buffer.from("not an image") }]);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('"fake.png"');
  });

  it("still zips real images, including one with no extension", async () => {
    const res = await rename([
      { filename: "sample.png", content: PNG },
      { filename: "noext", content: PNG },
    ]);

    expect(res.statusCode).toBe(200);
    const names = new AdmZip(res.rawPayload).getEntries().map((e) => e.entryName);
    expect(names).toEqual(["x-1.png", "x-2"]);
  });
});
