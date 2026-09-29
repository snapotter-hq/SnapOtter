/**
 * #1577: when a HEIC decode can't read heif-dec's output back into memory
 * (V8's "Array buffer allocation failed"), every caller but barcode-read
 * answered 422 "Failed to decode HEIC file. Ensure libheif-examples is
 * installed.", blaming the upload and the operator's setup for the server
 * running short of memory. It's the server's fault, so it's a 503.
 *
 * Covers the shared image input handler behind the tool factory (resize) and
 * one route with its own HEIC catch (split). The failure is injected at the
 * one read that matters: readFile of heif-dec's output path, once. Every other
 * read in the app passes through untouched. Needs heif-dec.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const failures = vi.hoisted(() => ({ next: null as Error | null }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: (async (path: unknown, ...rest: unknown[]) => {
      if (failures.next && /heic-out-[^/\\]*\.png$/.test(String(path))) {
        const err = failures.next;
        failures.next = null;
        throw err;
      }
      return (actual.readFile as (...args: unknown[]) => unknown)(path, ...rest);
    }) as typeof actual.readFile,
  };
});

const HEIC = readFixture(fixtures.image.base.heic200);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterEach(() => {
  failures.next = null;
});

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

function post(toolId: string, settings: Record<string, unknown>) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "photo.heic", contentType: "image/heic", content: HEIC },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return app.inject({
    method: "POST",
    url: `/api/v1/tools/image/${toolId}`,
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.each([
  ["resize", { width: 25, height: 25 }],
  ["split", { columns: 2, rows: 2 }],
])("%s when the HEIC decode can't be read back", (toolId, settings) => {
  it("answers 503, not a missing-libheif 422, then decodes the next request", async () => {
    failures.next = new RangeError("Array buffer allocation failed");
    const failed = await post(toolId, settings);
    expect(failed.statusCode, failed.body).toBe(503);
    expect(JSON.parse(failed.body).code).toBe("ENGINE_UNAVAILABLE");
    expect(failed.body).not.toContain("libheif");

    const next = await post(toolId, settings);
    expect([200, 202]).toContain(next.statusCode);
  }, 120_000);
});
