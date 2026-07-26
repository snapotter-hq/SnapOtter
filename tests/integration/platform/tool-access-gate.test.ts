/**
 * Every tool endpoint enforces tool access, not just the factory-built ones
 * (issue #645).
 *
 * createToolRoute calls requireToolAccess, so factory tools were gated. The
 * 45 hand-written routes each called nothing, so a role without `tools:use`
 * could run erase-object, favicon, qr-generate, image-to-pdf, svg-to-raster
 * and the rest. Per-route calls are what drifted, so the gate now lives in
 * one preHandler keyed off the tool id in the URL.
 */
import { apiToolPath, TOOLS } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  createUserAndLogin,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const SVG = readFixture(fixtures.image.base.svg100);
const PDF = readFixture(fixtures.document.pdf3);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;
/** Session for a role that deliberately lacks tools:use. */
let noToolsToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);

  await app.inject({
    method: "POST",
    url: "/api/v1/roles",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      name: "notools645",
      description: "Can browse but not run tools",
      permissions: ["files:own"],
    },
  });
  noToolsToken = (await createUserAndLogin(app, "notools645user", "notools645")).token;
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

function post(
  url: string,
  token: string | null,
  file: { name: string; type: string; buf: Buffer },
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: file.name, contentType: file.type, content: file.buf },
    { name: "settings", content: JSON.stringify({}) },
  ]);
  return app.inject({
    method: "POST",
    url,
    body,
    headers: {
      "content-type": contentType,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
}

const IMG = { name: "a.png", type: "image/png", buf: PNG };
const VEC = { name: "a.svg", type: "image/svg+xml", buf: SVG };
const DOC = { name: "a.pdf", type: "application/pdf", buf: PDF };

/**
 * A spread of endpoints across every registration style: the factory, the
 * three custom ZIP routes and their presets, plain hand-written routes, an AI
 * route, and the generic batch route.
 */
const GATED: Array<[string, string, typeof IMG]> = [
  ["factory tool", "/api/v1/tools/image/resize", IMG],
  ["generic batch", "/api/v1/tools/image/resize/batch", IMG],
  ["image-to-pdf base", "/api/v1/tools/image/image-to-pdf", IMG],
  ["image-to-pdf preset", "/api/v1/tools/image/jpg-to-pdf", IMG],
  ["svg-to-raster base", "/api/v1/tools/image/svg-to-raster", VEC],
  ["svg-to-raster batch", "/api/v1/tools/image/svg-to-raster/batch", VEC],
  ["svg-to-raster preset", "/api/v1/tools/image/svg-to-png", VEC],
  ["pdf-to-image preset", "/api/v1/tools/pdf/pdf-to-jpg", DOC],
  ["pdf-to-image info", "/api/v1/tools/pdf/pdf-to-jpg/info", DOC],
  ["hand-written: favicon", "/api/v1/tools/image/favicon", IMG],
  ["hand-written: qr-generate", "/api/v1/tools/image/qr-generate", IMG],
  ["hand-written: collage", "/api/v1/tools/image/collage", IMG],
  ["hand-written: split", "/api/v1/tools/image/split", IMG],
  ["hand-written: stitch", "/api/v1/tools/image/stitch", IMG],
  ["hand-written: image-to-base64", "/api/v1/tools/image/image-to-base64", IMG],
  ["hand-written: info", "/api/v1/tools/image/info", IMG],
  ["hand-written: compare", "/api/v1/tools/image/compare", IMG],
  ["hand-written: vectorize", "/api/v1/tools/image/vectorize", IMG],
  ["hand-written: strip-metadata inspect", "/api/v1/tools/image/strip-metadata/inspect", IMG],
  ["ai route: upscale", "/api/v1/tools/image/upscale", IMG],
  ["ai route: erase-object", "/api/v1/tools/image/erase-object", IMG],
  ["ai route: remove-background", "/api/v1/tools/image/remove-background", IMG],
  ["sign-pdf", "/api/v1/tools/pdf/sign-pdf", DOC],
];

describe("tool access gate (issue #645)", () => {
  it.each(GATED)("%s returns 403 for a role without tools:use", async (_label, url, file) => {
    const res = await post(url, noToolsToken, file);
    expect(res.statusCode, `${url} -> ${res.body.slice(0, 200)}`).toBe(403);
  });

  it.each(GATED)("%s returns 401 with no session", async (_label, url, file) => {
    const res = await post(url, null, file);
    expect(res.statusCode, `${url} -> ${res.body.slice(0, 200)}`).toBe(401);
  });

  it.each(GATED)("%s does not 403 an admin", async (_label, url, file) => {
    const res = await post(url, adminToken, file);
    expect(res.statusCode, `${url} -> ${res.body.slice(0, 200)}`).not.toBe(403);
  });

  /**
   * The sampled list above is readable but partial. This walks the whole
   * catalog so a tool cannot escape the gate by being registered in a shape
   * nobody thought to sample, for instance inside an encapsulated plugin,
   * which is the way a global hook would silently stop applying.
   */
  it("refuses every tool in the catalog for a role without tools:use", async () => {
    const reachable: string[] = [];
    for (const tool of TOOLS) {
      const res = await post(apiToolPath(tool.id), noToolsToken, IMG);
      if (res.statusCode !== 403) reachable.push(`${tool.id} -> ${res.statusCode}`);
    }
    expect(reachable, `tools not gated: ${reachable.join(", ")}`).toEqual([]);
  }, 120_000);

  it("still lets a tools:use-less role read the popular-tools listing", async () => {
    // A listing under the same prefix is not a tool run. `popular` has one
    // path segment, so it must not be mistaken for a section/toolId pair.
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tools/popular",
      headers: { authorization: `Bearer ${noToolsToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("leaves an unknown tool id as a 404, not a 403", async () => {
    const res = await post("/api/v1/tools/image/not-a-real-tool", noToolsToken, IMG);
    expect(res.statusCode).toBe(404);
  });

  it("leaves a real tool under the wrong section as a 404", async () => {
    const res = await post("/api/v1/tools/video/resize", noToolsToken, IMG);
    expect(res.statusCode).toBe(404);
  });

  /**
   * The gate reads the tool id out of the URL, so any URL form the router
   * still resolves to a tool handler but the gate reads differently would be
   * a way straight past it. Each of these must be refused or unrouted; the
   * one answer that must never appear is a 2xx.
   */
  it.each([
    // Probe hand-written routes specifically. A factory tool like resize
    // keeps its own requireToolAccess call, so it answers 403 whether or not
    // the gate resolved the URL, and would hide a gate that failed open.
    ["percent-encoded hand-written id", "/api/v1/tools/image/%66avicon"],
    ["percent-encoded ai route", "/api/v1/tools/image/%75pscale"],
    ["fully percent-encoded hand-written id", "/api/v1/tools/image/%73%70%6c%69%74"],
    ["percent-encoded tool id", "/api/v1/tools/image/%72esize"],
    ["percent-encoded section", "/api/v1/tools/%69mage/resize"],
    ["fully percent-encoded id", "/api/v1/tools/image/%72%65%73%69%7a%65"],
    ["encoded separator", "/api/v1/tools/image%2fresize"],
    ["uppercase tool id", "/api/v1/tools/image/RESIZE"],
    ["double slash before section", "/api/v1/tools//image/resize"],
    ["dot segment", "/api/v1/tools/image/./resize"],
    ["parent segment", "/api/v1/tools/pdf/../image/resize"],
    ["trailing dot", "/api/v1/tools/image/resize."],
    ["query smuggling", "/api/v1/tools/image/resize?x=/api/v1/tools/image/other"],
  ])("never processes a tool via %s", async (_label, url) => {
    const res = await post(url, noToolsToken, IMG);
    expect(
      res.statusCode,
      `${url} reached a handler with ${res.statusCode}: ${res.body.slice(0, 200)}`,
    ).toBeGreaterThanOrEqual(400);
  });
});
