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
            { filename: "song.png", contentType: "image/png", content: PNG },
            { filename: "\u{017f}ong.png", contentType: "image/png", content: TINY_PNG },
            { filename: "masse.png", contentType: "image/png", content: PNG },
            { filename: "ma\u{00df}e.png", contentType: "image/png", content: TINY_PNG },
            { filename: "post.png", contentType: "image/png", content: PNG },
            { filename: "po\u{fb05}.png", contentType: "image/png", content: TINY_PNG },
            { filename: "\u{03bf}\u{03c2}.png", contentType: "image/png", content: PNG },
            { filename: "\u{03bf}\u{03c3}.png", contentType: "image/png", content: TINY_PNG },
            { filename: "10\u{00b5}m.png", contentType: "image/png", content: PNG },
            { filename: "10\u{03bc}m.png", contentType: "image/png", content: TINY_PNG },
            { filename: "\u{0587}.png", contentType: "image/png", content: PNG },
            { filename: "\u{0565}\u{0582}.png", contentType: "image/png", content: TINY_PNG },
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
        "song.png",
        "\u{017f}ong_1.png",
        "masse.png",
        "ma\u{00df}e_1.png",
        "post.png",
        "po\u{fb05}_1.png",
        "\u{03bf}\u{03c2}.png",
        "\u{03bf}\u{03c3}_1.png",
        "10\u{00b5}m.png",
        "10\u{03bc}m_1.png",
        "\u{0587}.png",
        "\u{0565}\u{0582}_1.png",
      ]);
      expect(entries[0].getData().equals(PNG)).toBe(true);
      expect(entries[1].getData().equals(TINY_PNG)).toBe(true);
      expect(entries[2].getData().equals(PNG)).toBe(true);
      expect(entries[3].getData().equals(TINY_PNG)).toBe(true);
      expect(entries[4].getData().equals(PNG)).toBe(true);
      expect(entries[5].getData().equals(TINY_PNG)).toBe(true);
      expect(entries[6].getData().equals(PNG)).toBe(true);
      expect(entries[7].getData().equals(TINY_PNG)).toBe(true);
      expect(entries[8].getData().equals(PNG)).toBe(true);
      expect(entries[9].getData().equals(TINY_PNG)).toBe(true);
      expect(entries[10].getData().equals(PNG)).toBe(true);
      expect(entries[11].getData().equals(TINY_PNG)).toBe(true);
      expect(entries[12].getData().equals(PNG)).toBe(true);
      expect(entries[13].getData().equals(TINY_PNG)).toBe(true);
      expect(entries[14].getData().equals(PNG)).toBe(true);
      expect(entries[15].getData().equals(TINY_PNG)).toBe(true);
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

  it("strips only the trailing extension when {{original}} stem contains the extension substring (#3034, #3380)", async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/bulk-rename",
        ...multipartBody(
          [
            { filename: "my.png.photo.png", contentType: "image/png", content: PNG },
            { filename: "logo.svg.backup.svg", contentType: "image/svg+xml", content: TINY_PNG },
            { filename: "my.png_photo.png", contentType: "image/png", content: PNG },
            { filename: "logo.svg_backup.svg", contentType: "image/svg+xml", content: TINY_PNG },
            {
              filename: "archive.bak.photo.bak",
              contentType: "application/octet-stream",
              content: JPG,
            },
            {
              filename: "price$$100$&.png",
              contentType: "image/png",
              content: PNG,
            },
          ],
          { pattern: "{{original}}-{{original}}" },
        ),
      });

      expect(res.statusCode).toBe(200);
      const zip = new AdmZip(res.rawPayload);
      const entries = zip.getEntries();
      expect(entries.map((e) => e.entryName)).toEqual([
        "my.png.photo-my.png.photo.png",
        "logo.svg.backup-logo.svg.backup.svg",
        "my.png_photo-my.png_photo.png",
        "logo.svg_backup-logo.svg_backup.svg",
        "archive.bak.photo-archive.bak.photo.bak",
        "price$$100$&-price$$100$&.png",
      ]);
      expect(entries[0].getData().equals(PNG)).toBe(true);
      expect(entries[1].getData().equals(TINY_PNG)).toBe(true);
      expect(entries[2].getData().equals(PNG)).toBe(true);
      expect(entries[3].getData().equals(TINY_PNG)).toBe(true);
      expect(entries[4].getData().equals(JPG)).toBe(true);
      expect(entries[5].getData().equals(PNG)).toBe(true);
    } finally {
      await app.close();
    }
  });
});
