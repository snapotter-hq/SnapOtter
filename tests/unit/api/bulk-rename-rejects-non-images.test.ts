import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import multipart from "@fastify/multipart";
import { IMAGE_INPUTS } from "@snapotter/shared";
import AdmZip from "adm-zip";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { registerBulkRename } from "../../../apps/api/src/routes/tools/bulk-rename.js";

const PNG = readFileSync(join(__dirname, "../../fixtures/image/valid/test-200x150.png"));
const TXT = readFileSync(join(__dirname, "../../fixtures/document/formats/tiny.txt"));
const FORMATS_DIR = join(__dirname, "../../fixtures/image/formats");

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

  // RAW, TGA and SVGZ pass the validator on their extension alone and other
  // formats take different detection paths, so sweep every accepted format.
  it("zips one fixture of every accepted image format unchanged", async () => {
    const accepted = new Set(IMAGE_INPUTS.map((ext) => ext.toLowerCase()));
    const files = readdirSync(FORMATS_DIR)
      .filter((name) => accepted.has(extname(name).toLowerCase()))
      .sort()
      .map((filename) => ({ filename, content: readFileSync(join(FORMATS_DIR, filename)) }));
    expect(files.length).toBeGreaterThan(20);

    const res = await rename(files);

    expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
    const entries = new AdmZip(res.rawPayload).getEntries();
    expect(entries).toHaveLength(files.length);
    entries.forEach((entry, i) => {
      expect(entry.getData().equals(files[i].content), files[i].filename).toBe(true);
    });
  });
});
