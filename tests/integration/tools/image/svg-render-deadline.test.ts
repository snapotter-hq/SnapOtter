/**
 * Custom routes that run their own SVG intake must render through the
 * deadline-bound child, so a hostile SVG answers 400 SVG_TOO_COMPLEX instead
 * of keeping libvips busy in the API process (#5274).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../../apps/api/src/config.js";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

// Passes sanitizeSvg; librsvg repaints the filtered rect once per <use>.
const EXPENSIVE_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000">' +
    '<defs><filter id="f"><feTurbulence baseFrequency="0.05" numOctaves="8"/><feGaussianBlur stdDeviation="20"/></filter></defs>' +
    `<rect id="r" width="2000" height="2000" filter="url(#f)"/>${'<use href="#r"/>'.repeat(40)}</svg>`,
);
const PNG = readFixture(fixtures.image.base.png200);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;
let originalDeadlineS: number;

beforeAll(async () => {
  originalDeadlineS = env.JOB_TIMEOUT_FAST_S;
  (env as { JOB_TIMEOUT_FAST_S: number }).JOB_TIMEOUT_FAST_S = 1;
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
});

afterAll(async () => {
  (env as { JOB_TIMEOUT_FAST_S: number }).JOB_TIMEOUT_FAST_S = originalDeadlineS;
  await testApp.cleanup();
});

type Part = Parameters<typeof createMultipartPayload>[0][number];

const svgPart = (name = "file"): Part => ({
  name,
  filename: "hostile.svg",
  contentType: "image/svg+xml",
  content: EXPENSIVE_SVG,
});
const settingsPart = (settings: object): Part => ({
  name: "settings",
  content: JSON.stringify(settings),
});

function post(tool: string, parts: Part[]) {
  const { body, contentType } = createMultipartPayload(parts);
  return app.inject({
    method: "POST",
    url: `/api/v1/tools/image/${tool}`,
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe("custom routes bound their SVG render", () => {
  const rejecting: [string, () => Part[]][] = [
    ["color-palette", () => [svgPart()]],
    ["info", () => [svgPart()]],
    ["split", () => [svgPart(), settingsPart({ columns: 2, rows: 2 })]],
    ["image-to-pdf", () => [svgPart(), settingsPart({})]],
    ["barcode-read", () => [svgPart()]],
    ["beautify", () => [svgPart(), settingsPart({})]],
    [
      "collage",
      () => [
        svgPart("f1"),
        { name: "f2", filename: "b.png", contentType: "image/png", content: PNG },
        settingsPart({}),
      ],
    ],
    [
      "stitch",
      () => [
        svgPart("f1"),
        { name: "f2", filename: "b.png", contentType: "image/png", content: PNG },
        settingsPart({ direction: "horizontal" }),
      ],
    ],
  ];

  it.each(rejecting)("%s answers 400 SVG_TOO_COMPLEX", async (tool, parts) => {
    const res = await post(tool, parts());

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("SVG_TOO_COMPLEX");
  });

  it("image-to-base64 reports the file as an error when converting", async () => {
    const res = await post("image-to-base64", [svgPart(), settingsPart({ outputFormat: "png" })]);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).errors[0].error).toMatch(/took longer than 1s to render/);
  });

  it("image-to-base64 still returns the SVG text untouched in original mode", async () => {
    const res = await post("image-to-base64", [svgPart(), settingsPart({})]);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).results[0].mimeType).toBe("image/svg+xml");
  });

  it("find-duplicates skips the file with the deadline's reason", async () => {
    const res = await post("find-duplicates", [
      svgPart("f1"),
      { name: "f2", filename: "a.png", contentType: "image/png", content: PNG },
    ]);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).skippedFiles).toEqual([
      { filename: "hostile.svg", reason: expect.stringMatching(/took longer than 1s to render/) },
    ]);
  });

  it("favicon skips the file with the deadline's reason", async () => {
    const res = await post("favicon", [svgPart()]);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/took longer than 1s to render/);
  });

  it("favicon still renders a very wide SVG instead of skipping it", async () => {
    const wide = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="10"><rect width="1000" height="10" fill="#c60"/></svg>',
    );
    const res = await post("favicon", [
      { name: "file", filename: "wide.svg", contentType: "image/svg+xml", content: wide },
    ]);

    expect(res.statusCode, res.body).toBe(200);
  });

  it("the file preview answers 400 SVG_TOO_COMPLEX", async () => {
    const { body, contentType } = createMultipartPayload([svgPart()]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/preview",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("SVG_TOO_COMPLEX");
  });

  it("a library thumbnail answers 422 instead of rendering in the API process", async () => {
    const { body, contentType } = createMultipartPayload([svgPart()]);
    const upload = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    expect(upload.statusCode, upload.body).toBe(201);
    const fileId = upload.json().files[0].id as string;

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files/${fileId}/thumbnail`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toBe("Could not generate thumbnail");
  });
});
