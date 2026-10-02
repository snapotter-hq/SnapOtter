/**
 * The MIME type the library upload and save-result routes store (#1349).
 *
 * Both validate image bytes themselves, so an image/* type they store must be
 * one the server read off the bytes, never a claim (the client's header, or
 * the filename's extension) for bytes that don't decode. Non-image files
 * (video, audio, PDF, Office) have no server-side sniff here and keep the
 * claimed type, which is what their previews branch on.
 */

import { gzipSync } from "node:zlib";
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
// A parameter entity pointing off-box: Sharp can't decode it as sent, and can
// once the sanitizer has dropped the DOCTYPE.
const PARAMETER_ENTITY_SVG = Buffer.from(
  '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY % p SYSTEM "http://127.0.0.1:1/evil.dtd"> %p;]>' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
);

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

    // What a download of it hands back, which is where the wrong type bit.
    const download = await app.inject({
      method: "GET",
      url: `/api/v1/files/${created.id}/download`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers["content-type"]).toBe("application/octet-stream");
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

  // What gets stored for a hostile SVG is the sanitized one, so those are the
  // bytes that decide the type (#1550). The XXE payload still doesn't decode
  // once sanitized (its &xxe; reference outlives the DOCTYPE), so it keeps
  // the octet-stream type #1349 gave it.
  it("stores a sanitized XXE SVG that still doesn't decode without an image type", async () => {
    const { storedMimeType } = await uploadOne({
      filename: "xxe.svg",
      contentType: "image/svg+xml",
      content: readFixture(fixtures.security.svgXxeFile),
    });

    expect(storedMimeType).toBe("application/octet-stream");
  });

  it("stores a hostile SVG that decodes once sanitized as image/svg+xml", async () => {
    const { storedMimeType } = await uploadOne({
      filename: "pe.svg",
      contentType: "application/octet-stream",
      content: PARAMETER_ENTITY_SVG,
    });

    expect(storedMimeType).toBe("image/svg+xml");
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

// Every image format the validator accepts gets an image/* type, so the
// library's image filter offers it to image tools (#1550). Each is uploaded
// with a non-image claim, so the type can only have come from the bytes.
const SNIFFED_IMAGE_TYPES: [ext: string, mime: string][] = [
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["apng", "image/png"],
  ["webp", "image/webp"],
  ["gif", "image/gif"],
  ["bmp", "image/bmp"],
  ["tiff", "image/tiff"],
  ["avif", "image/avif"],
  ["svg", "image/svg+xml"],
  ["heic", "image/heic"],
  ["heif", "image/heif"],
  ["psd", "image/vnd.adobe.photoshop"],
  ["dng", "image/x-adobe-dng"],
  // The NEF, ARW, ORF and RW2 fixtures are over the suite's 10 MB upload cap
  // (ORF and RW2 run below, cut to their first megabyte).
  ["cr2", "image/x-canon-cr2"],
  ["ico", "image/x-icon"],
  ["cur", "image/x-icon"],
  ["jxl", "image/jxl"],
  ["jp2", "image/jp2"],
  ["exr", "image/x-exr"],
  ["hdr", "image/vnd.radiance"],
  ["qoi", "image/qoi"],
  ["eps", "image/x-eps"],
  ["dds", "image/vnd.ms-dds"],
  ["dpx", "image/x-dpx"],
  ["fits", "image/fits"],
  ["ppm", "image/x-portable-pixmap"],
  ["pgm", "image/x-portable-graymap"],
  ["pbm", "image/x-portable-bitmap"],
];

describe("library upload MIME type for every accepted image format (#1550)", () => {
  it.each(SNIFFED_IMAGE_TYPES)("stores a valid .%s upload as %s", async (ext, mime) => {
    const { storedMimeType } = await uploadOne({
      filename: `sample.${ext}`,
      contentType: "application/octet-stream",
      content: readFixture(fixtures.image.formats(ext)),
    });

    expect(storedMimeType).toBe(mime);
  });

  // These used to be accepted on their name alone and stored untyped (#1782).
  // The validator now finds each in the bytes: TGA by a header whose pixel
  // data adds up, ORF and RW2 by their signatures, SVGZ by inflating its head.
  it.each([
    ["sample.tga", readFixture(fixtures.image.formats("tga")), "image/x-tga"],
    ["sample.svgz", readFixture(fixtures.image.formats("svgz")), "image/svg+xml"],
    // The first megabyte keeps these under the suite's upload cap; RAW isn't decoded here.
    [
      "sample.orf",
      readFixture(fixtures.image.formats("orf")).subarray(0, 1024 * 1024),
      "image/x-olympus-orf",
    ],
    [
      "sample.rw2",
      readFixture(fixtures.image.formats("rw2")).subarray(0, 1024 * 1024),
      "image/x-panasonic-rw2",
    ],
  ])("stores a real %s, found in its bytes, as %s", async (filename, content, mime) => {
    const { storedMimeType } = await uploadOne({
      filename,
      contentType: "application/octet-stream",
      content,
    });

    expect(storedMimeType).toBe(mime);
  });

  // The validator still takes these on their name, with nothing in the bytes
  // to back it (#1550). A name is a claim, so none of them earns an image type.
  it.each([
    ["notes.tga", Buffer.from("plain text, not a picture\n")],
    ["notes.cr2", Buffer.from("plain text, not a picture\n")],
    ["notes.orf", Buffer.from("plain text, not a picture\n")],
    // Opens with ORF's big-endian signature, but points at no IFD.
    ["mmorpg.orf", Buffer.from("MMORPG notes, not a picture\n")],
    ["notes.rw2", Buffer.from("plain text, not a picture\n")],
    ["notes.svgz", gzipSync("plain text, not a picture\n")],
  ])(
    "stores %s, typed only by its name, as application/octet-stream",
    async (filename, content) => {
      const { storedMimeType } = await uploadOne({
        filename,
        contentType: "image/x-whatever",
        content,
      });

      expect(storedMimeType).toBe("application/octet-stream");
    },
  );

  // Text that happens to open with an ASCII image signature used to be stored
  // as that image (#1859). Each signature now needs a header behind it.
  it.each([
    "BMW service notes",
    "P3 meeting agenda",
    "P5 report",
    "P7 notes",
    "FOVbar",
    "SIMPLE question",
    "SDPX draft",
    "DDS notes",
    "qoif",
    "8BPS notes",
  ])("stores text opening %j as application/octet-stream", async (text) => {
    const { storedMimeType } = await uploadOne({
      filename: "notes.txt",
      contentType: "application/octet-stream",
      content: Buffer.from(`${text}\nmore lines of plain text\n`),
    });

    expect(storedMimeType).toBe("application/octet-stream");
  });

  // The extension only narrows a family the bytes already proved: it can't
  // turn HEIF bytes into some other format's type.
  it("doesn't take the type from an extension the bytes contradict", async () => {
    const heic = await uploadOne({
      filename: "holiday.png",
      contentType: "image/png",
      content: readFixture(fixtures.image.formats("heic")),
    });

    expect(heic.storedMimeType).toBe("image/heif");
  });

  // An SVG row is now typed image/svg+xml, which a browser would render. The
  // download has to stay an attachment. (nosniff comes from a global hook in
  // apps/api/src/index.ts, which the test server doesn't install.)
  it("serves an SVG row as an attachment", async () => {
    const { created, storedMimeType } = await uploadOne({
      filename: "drawing.svg",
      contentType: "image/svg+xml",
      content: readFixture(fixtures.image.formats("svg")),
    });
    expect(storedMimeType).toBe("image/svg+xml");

    const download = await app.inject({
      method: "GET",
      url: `/api/v1/files/${created.id}/download`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(download.statusCode).toBe(200);
    expect(download.headers["content-type"]).toBe("image/svg+xml");
    expect(String(download.headers["content-disposition"])).toMatch(/^attachment;/);
  });

  it("still serves a thumbnail for a HEIC row stored as image/heic", async () => {
    const { created, storedMimeType } = await uploadOne({
      filename: "photo.heic",
      contentType: "image/heic",
      content: readFixture(fixtures.image.formats("heic")),
    });
    expect(storedMimeType).toBe("image/heic");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files/${created.id}/thumbnail`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
  });
});

describe("save-result MIME type (#1349)", () => {
  async function saveResult(parentId: string, filename: string, content: Buffer) {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename, contentType: "image/png", content },
      { name: "parentId", content: parentId },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });
    expect(res.statusCode, res.body).toBe(201);
    return JSON.parse(res.body).file as { mimeType: string };
  }

  // save-result reads the type off the name, so result.png claims image/png.
  it("doesn't store image/png for a JSON body saved as result.png", async () => {
    const { created: parent } = await uploadOne({
      filename: "parent.png",
      contentType: "image/png",
      content: PNG,
    });

    const saved = await saveResult(parent.id, "result.png", JSON_ERROR_BODY);

    expect(saved.mimeType).toBe("application/octet-stream");
  });

  it("keeps the extension's type for a non-image result, and the sniffed one for a PNG", async () => {
    const { created: parent } = await uploadOne({
      filename: "parent.png",
      contentType: "image/png",
      content: PNG,
    });

    const pdf = await saveResult(parent.id, "result.pdf", PDF);
    const png = await saveResult(parent.id, "result.png", PNG);

    expect(pdf.mimeType).toBe("application/pdf");
    expect(png.mimeType).toBe("image/png");
  });

  it("stores the sniffed type for a HEIC, PSD, and SVG result (#1550)", async () => {
    const { created: parent } = await uploadOne({
      filename: "parent.png",
      contentType: "image/png",
      content: PNG,
    });

    const heic = await saveResult(
      parent.id,
      "result.heic",
      readFixture(fixtures.image.formats("heic")),
    );
    const psd = await saveResult(
      parent.id,
      "result.psd",
      readFixture(fixtures.image.formats("psd")),
    );
    const svg = await saveResult(
      parent.id,
      "result.svg",
      readFixture(fixtures.image.formats("svg")),
    );

    expect(heic.mimeType).toBe("image/heic");
    expect(psd.mimeType).toBe("image/vnd.adobe.photoshop");
    expect(svg.mimeType).toBe("image/svg+xml");
  });

  it("types an SVG result by its sanitized bytes (#1550)", async () => {
    const { created: parent } = await uploadOne({
      filename: "parent.png",
      contentType: "image/png",
      content: PNG,
    });

    const saved = await saveResult(parent.id, "result.svg", PARAMETER_ENTITY_SVG);

    expect(saved.mimeType).toBe("image/svg+xml");
  });

  it("types a result by its bytes, not the name it's saved under (#1550)", async () => {
    const { created: parent } = await uploadOne({
      filename: "parent.png",
      contentType: "image/png",
      content: PNG,
    });

    const heifAsPng = await saveResult(
      parent.id,
      "result.png",
      readFixture(fixtures.image.formats("heic")),
    );
    const textAsTga = await saveResult(parent.id, "result.tga", JSON_ERROR_BODY);

    expect(heifAsPng.mimeType).toBe("image/heif");
    expect(textAsTga.mimeType).toBe("application/octet-stream");
  });

  it("types a real TGA or SVGZ result from its bytes (#1782)", async () => {
    const { created: parent } = await uploadOne({
      filename: "parent.png",
      contentType: "image/png",
      content: PNG,
    });

    const tga = await saveResult(
      parent.id,
      "result.tga",
      readFixture(fixtures.image.formats("tga")),
    );
    const svgz = await saveResult(
      parent.id,
      "result.svgz",
      readFixture(fixtures.image.formats("svgz")),
    );

    expect(tga.mimeType).toBe("image/x-tga");
    expect(svgz.mimeType).toBe("image/svg+xml");
  });
});
