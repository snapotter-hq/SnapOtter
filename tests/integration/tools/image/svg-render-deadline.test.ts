/**
 * Custom routes that run their own SVG intake must render through the
 * deadline-bound child, so a hostile SVG answers 400 SVG_TOO_COMPLEX instead
 * of keeping libvips busy in the API process (#5274).
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
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
// Distinct content per call: the timeout memory is keyed by content, so a
// repeat of EXPENSIVE_SVG answers at once and would hide the per-file cost.
const slowSvg = (n: number) =>
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000">' +
      `<defs><filter id="f"><feTurbulence baseFrequency="0.0${50 + n}" numOctaves="8"/><feGaussianBlur stdDeviation="20"/></filter></defs>` +
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

  it("image-to-base64 reports the dimensions of the rendered PNG, not the SVG header", async () => {
    const inches = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="2in" height="1in" viewBox="0 0 10 5"><rect width="10" height="5" fill="#c60"/></svg>',
    );
    const res = await post("image-to-base64", [
      { name: "file", filename: "inches.svg", contentType: "image/svg+xml", content: inches },
      settingsPart({ outputFormat: "png" }),
    ]);

    expect(res.statusCode, res.body).toBe(200);
    const result = JSON.parse(res.body).results[0];
    const encoded = await sharp(Buffer.from(result.base64, "base64")).metadata();
    expect({ width: result.width, height: result.height }).toEqual({
      width: encoded.width,
      height: encoded.height,
    });
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

describe("one request pays the SVG render deadline once (#5354)", () => {
  const DEADLINE_MS = 750; // 0.75 of JOB_TIMEOUT_FAST_S=1

  it("find-duplicates with three distinct slow SVGs takes about one deadline", async () => {
    const slow = [1, 2, 3].map(
      (n): Part => ({
        name: `f${n}`,
        filename: `slow-${n}.svg`,
        contentType: "image/svg+xml",
        content: slowSvg(n),
      }),
    );
    const started = Date.now();
    const res = await post("find-duplicates", [slow[0], slow[1], slow[2]]);
    const elapsed = Date.now() - started;

    expect(res.statusCode).toBe(400);
    const { skippedFiles } = JSON.parse(res.body);
    expect(skippedFiles).toHaveLength(3);
    for (const skipped of skippedFiles) {
      expect(skipped.reason).toMatch(/took longer than 1s to render/);
    }
    // Unbudgeted, three files cost three deadlines (2250 ms or more).
    expect(elapsed).toBeLessThan(DEADLINE_MS * 2);
  });

  it("gives the next request on a keep-alive connection a fresh budget", async () => {
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    const send = (parts: Part[]) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        const { body, contentType } = createMultipartPayload(parts);
        const req = http.request(
          {
            agent,
            port,
            host: "127.0.0.1",
            method: "POST",
            path: "/api/v1/tools/image/favicon",
            headers: {
              authorization: `Bearer ${adminToken}`,
              "content-type": contentType,
              "content-length": body.length,
            },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (c: Buffer) => chunks.push(c));
            res.on("end", () =>
              resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }),
            );
          },
        );
        req.on("error", reject);
        req.end(body);
      });
    try {
      const timedOut = await send([
        { name: "file", filename: "slow.svg", contentType: "image/svg+xml", content: slowSvg(4) },
      ]);
      expect(timedOut.status).toBe(400);
      expect(timedOut.body).toMatch(/took longer than 1s to render/);

      const cheap = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#c60"/></svg>',
      );
      const next = await send([
        { name: "file", filename: "cheap.svg", contentType: "image/svg+xml", content: cheap },
      ]);
      expect(next.status, next.body).toBe(200);
    } finally {
      agent.destroy();
    }
  });
});
