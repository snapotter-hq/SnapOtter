import { readFileSync } from "node:fs";
import { join } from "node:path";
import multipart from "@fastify/multipart";
import AdmZip from "adm-zip";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { registerBulkRename } from "../../../apps/api/src/routes/tools/bulk-rename.js";

const PNG = readFileSync(join(__dirname, "../../fixtures/image/valid/test-200x150.png"));
const TINY_PNG = readFileSync(join(__dirname, "../../fixtures/image/edge/test-1x1.png"));
const JPG = readFileSync(join(__dirname, "../../fixtures/image/valid/test-100x100.jpg"));

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
  registerErrorHandler(app);
  registerBulkRename(app);
  await app.ready();
  return app;
}

function multipartBody(
  files: Array<{ filename: string; contentType: string; content: Buffer }>,
  settings?: Record<string, unknown>,
) {
  const boundary = "----unit";
  const parts: Buffer[] = [];
  for (const file of files) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      ),
      file.content,
      Buffer.from("\r\n"),
    );
  }
  if (settings !== undefined) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="settings"\r\n\r\n${JSON.stringify(settings)}\r\n`,
      ),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

describe("bulk-rename deduplicates colliding ZIP entry names (#3024)", () => {
  it("writes distinct ZIP entry names when a static pattern produces collisions for same-extension files", async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/bulk-rename",
        ...multipartBody(
          [
            { filename: "a.png", contentType: "image/png", content: PNG },
            { filename: "b.png", contentType: "image/png", content: TINY_PNG },
            { filename: "c.jpg", contentType: "image/jpeg", content: JPG },
          ],
          { pattern: "static-name" },
        ),
      });

      expect(res.statusCode).toBe(200);
      const zip = new AdmZip(res.rawPayload);
      const entries = zip.getEntries();
      expect(entries.map((e) => e.entryName)).toEqual([
        "static-name.png",
        "static-name_1.png",
        "static-name.jpg",
      ]);
      expect(entries[0].getData().equals(PNG)).toBe(true);
      expect(entries[1].getData().equals(TINY_PNG)).toBe(true);
      expect(entries[2].getData().equals(JPG)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("writes distinct ZIP entry names when {{original}} produces collisions from duplicate upload names or casing", async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/bulk-rename",
        ...multipartBody(
          [
            { filename: "photo.png", contentType: "image/png", content: PNG },
            { filename: "photo.png", contentType: "image/png", content: TINY_PNG },
            { filename: "PHOTO.png", contentType: "image/png", content: PNG },
            { filename: "photo_1.png", contentType: "image/png", content: TINY_PNG },
          ],
          { pattern: "{{original}}" },
        ),
      });

      expect(res.statusCode).toBe(200);
      const zip = new AdmZip(res.rawPayload);
      const entries = zip.getEntries();
      expect(entries.map((e) => e.entryName)).toEqual([
        "photo.png",
        "photo_1.png",
        "PHOTO_2.png",
        "photo_1_1.png",
      ]);
      expect(entries[0].getData().equals(PNG)).toBe(true);
      expect(entries[1].getData().equals(TINY_PNG)).toBe(true);
      expect(entries[2].getData().equals(PNG)).toBe(true);
      expect(entries[3].getData().equals(TINY_PNG)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("deduplicates colliding extensionless files and patterns that collide after sanitization truncation", async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/bulk-rename",
        ...multipartBody(
          [
            { filename: "noext1", contentType: "application/octet-stream", content: PNG },
            { filename: "noext2", contentType: "application/octet-stream", content: TINY_PNG },
          ],
          { pattern: "readme" },
        ),
      });

      expect(res.statusCode).toBe(200);
      const zip = new AdmZip(res.rawPayload);
      const entries = zip.getEntries();
      expect(entries.map((e) => e.entryName)).toEqual(["readme", "readme_1"]);
      expect(entries[0].getData().equals(PNG)).toBe(true);
      expect(entries[1].getData().equals(TINY_PNG)).toBe(true);

      const truncatedRes = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/bulk-rename",
        ...multipartBody(
          [
            { filename: "a.png", contentType: "image/png", content: PNG },
            { filename: "b.png", contentType: "image/png", content: TINY_PNG },
          ],
          { pattern: `${"x".repeat(250)}-{{index}}` },
        ),
      });

      expect(truncatedRes.statusCode).toBe(200);
      const truncatedEntries = new AdmZip(truncatedRes.rawPayload).getEntries();
      const truncatedNames = truncatedEntries.map((e) => e.entryName);
      expect(new Set(truncatedNames).size).toBe(2);
      expect(truncatedNames[1]).toMatch(/_1\.png$/);
      expect(truncatedEntries[0].getData().equals(PNG)).toBe(true);
      expect(truncatedEntries[1].getData().equals(TINY_PNG)).toBe(true);
    } finally {
      await app.close();
    }
  });
});
