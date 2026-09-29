/**
 * The MIME type the library upload stores (#1349).
 *
 * The route validates image bytes itself, so an image/* type in the library
 * must be one the server read off the bytes, never the client's claim for
 * bytes that don't decode. Non-image uploads (video, audio, PDF, Office) have
 * no server-side sniff here and keep the type the client sent, which is what
 * their previews branch on.
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const MP4 = readFixture(fixtures.video.tiny("mp4"));
const PDF = readFixture(fixtures.document.pdf3);
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// The body #1286's client saved into the library in place of a result image.
const JSON_ERROR_BODY = Buffer.from('{"error":"File not found"}');

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

type Upload = { filename: string; contentType: string; content: Buffer };

async function uploadOne(file: Upload) {
  const { body, contentType } = createMultipartPayload([{ name: "file", ...file }]);
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/files/upload",
    headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
    body,
  });
  expect(res.statusCode, res.body).toBe(201);
  const [created] = JSON.parse(res.body).files as {
    id: string;
    mimeType: string;
    width: number | null;
    height: number | null;
  }[];
  const [row] = await db
    .select({ mimeType: schema.userFiles.mimeType })
    .from(schema.userFiles)
    .where(eq(schema.userFiles.id, created.id));
  return { created, storedMimeType: row?.mimeType };
}

describe("library upload MIME type (#1349)", () => {
  it("doesn't store image/png for a JSON body the client labelled image/png", async () => {
    const { created, storedMimeType } = await uploadOne({
      filename: "photo_resize.png",
      contentType: "image/png",
      content: JSON_ERROR_BODY,
    });

    expect(storedMimeType).toBe("application/octet-stream");
    expect(created.mimeType).toBe("application/octet-stream");
    expect(created.width).toBeNull();
    expect(created.height).toBeNull();
  });

  it("doesn't store any client-claimed image type for bytes that aren't an image", async () => {
    const { storedMimeType } = await uploadOne({
      filename: "notes.bin",
      contentType: "image/webp",
      content: Buffer.from("plain text, not a picture\n"),
    });

    expect(storedMimeType).toBe("application/octet-stream");
  });

  it("treats a mixed-case image claim the same way", async () => {
    const { storedMimeType } = await uploadOne({
      filename: "shouty.png",
      contentType: "Image/PNG",
      content: JSON_ERROR_BODY,
    });

    expect(storedMimeType).toBe("application/octet-stream");
  });

  it("stores the sniffed type for a real PNG, whatever the client claimed", async () => {
    const claimedPng = await uploadOne({
      filename: "real.png",
      contentType: "image/png",
      content: PNG,
    });
    const unclaimedPng = await uploadOne({
      filename: "real-unlabelled.png",
      contentType: "application/octet-stream",
      content: PNG,
    });

    expect(claimedPng.storedMimeType).toBe("image/png");
    expect(unclaimedPng.storedMimeType).toBe("image/png");
    expect(claimedPng.created.width).toBe(200);
  });

  it("keeps the client's type for video, PDF, and Office uploads", async () => {
    const video = await uploadOne({ filename: "clip.mp4", contentType: "video/mp4", content: MP4 });
    const pdf = await uploadOne({
      filename: "doc.pdf",
      contentType: "application/pdf",
      content: PDF,
    });
    const docx = await uploadOne({
      filename: "report.docx",
      contentType: DOCX_MIME,
      content: Buffer.from("docx"),
    });

    expect(video.storedMimeType).toBe("video/mp4");
    expect(pdf.storedMimeType).toBe("application/pdf");
    expect(docx.storedMimeType).toBe(DOCX_MIME);
  });
});
