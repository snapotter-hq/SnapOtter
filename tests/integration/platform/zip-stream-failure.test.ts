/**
 * What every ZIP-streaming route does when object storage fails AFTER the 200
 * headers are already on the wire (issue #645).
 *
 * The response is hijacked and chunked by then, so the status cannot change.
 * Ending the response cleanly is therefore indistinguishable from success and
 * hands the client a ZIP with no central directory; worse, a source stream
 * that errors with no listener leaves the request hanging and raises an
 * unhandled error. The routes must instead destroy the connection so the
 * client sees a transport failure it can act on.
 */
import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

/** Prefixes whose getObjectStream should fail once a consumer starts reading. */
const storageMock = vi.hoisted(() => ({ poison: new Set<string>() }));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  const { Readable } = await import("node:stream");
  return {
    ...actual,
    getObjectStream: async (key: string) => {
      for (const prefix of storageMock.poison) {
        if (key.startsWith(prefix)) {
          // Fail on read, not on open: that is how a real backend behaves
          // (createReadStream resolves, then emits ENOENT), and it is the case
          // the route's try/catch cannot see.
          return new Readable({
            read() {
              this.destroy(new Error(`test poison: stream error for ${key}`));
            },
          });
        }
      }
      return actual.getObjectStream(key);
    },
  };
});

const PNG = readFixture(fixtures.image.base.png200);
const JPG = readFixture(fixtures.image.base.jpg100);
const SVG = readFixture(fixtures.image.base.svg100);
const PDF_3PAGE = readFixture(fixtures.document.pdf3);
const PDF_2PAGE = readFixture(fixtures.document.pdf2);

let testApp: TestApp;
let token: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  token = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

/**
 * Run a request whose ZIP entries all come from poisoned storage and report
 * how it ended. A route that handles this correctly must terminate promptly
 * and must not hand back something that parses as a complete archive.
 */
async function runWithPoisonedOutputs(
  url: string,
  parts: Array<{ name: string; filename?: string; contentType?: string; content: Buffer | string }>,
): Promise<{ settledWithin: boolean; deliveredCompleteZip: boolean }> {
  const { body, contentType } = createMultipartPayload(parts);
  storageMock.poison.add("outputs/");

  // Race a real deadline rather than leaning on the test timeout: a hang is
  // the failure mode being tested, and "the suite timed out" is a much weaker
  // signal than a named assertion.
  const HANG_BUDGET_MS = 10_000;
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), HANG_BUDGET_MS);
  });

  try {
    const request = testApp.app
      .inject({
        method: "POST",
        url,
        headers: { authorization: `Bearer ${token}`, "content-type": contentType },
        body,
      })
      // A destroyed connection surfaces as a rejected request, which is
      // exactly the signal the client should get.
      .then(
        (res) => res,
        () => null,
      );

    const outcome = await Promise.race([request, deadline]);
    if (outcome === "timeout") return { settledWithin: false, deliveredCompleteZip: false };
    if (outcome === null) return { settledWithin: true, deliveredCompleteZip: false };

    try {
      new AdmZip(outcome.rawPayload).getEntries();
      return { settledWithin: true, deliveredCompleteZip: true };
    } catch {
      return { settledWithin: true, deliveredCompleteZip: false };
    }
  } finally {
    if (timer) clearTimeout(timer);
    storageMock.poison.clear();
  }
}

describe("ZIP streaming failure after headers are sent (issue #645)", () => {
  // Healthy path first: a hung request from a later case would otherwise
  // starve it and make an unrelated timeout look like a regression.
  it("returns a complete ZIP when storage is healthy", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize/batch",
      headers: { authorization: `Bearer ${token}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(new AdmZip(res.rawPayload).getEntries()).toHaveLength(2);
  }, 60_000);

  it("svg-to-raster still returns a complete ZIP (it never reads storage mid-stream)", async () => {
    // Kept as a guard rather than a failure case: svg-to-raster appends
    // in-memory buffers, so it has no post-header storage read to poison.
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.svg", contentType: "image/svg+xml", content: SVG },
      { name: "file", filename: "b.svg", contentType: "image/svg+xml", content: SVG },
      { name: "settings", content: JSON.stringify({ outputFormat: "png" }) },
    ]);
    storageMock.poison.add("outputs/");
    try {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/tools/image/svg-to-raster/batch",
        headers: { authorization: `Bearer ${token}`, "content-type": contentType },
        body,
      });
      expect(res.statusCode).toBe(200);
      expect(new AdmZip(res.rawPayload).getEntries()).toHaveLength(2);
    } finally {
      storageMock.poison.clear();
    }
  }, 60_000);

  it("generic /batch terminates instead of hanging, and delivers no complete ZIP", async () => {
    const result = await runWithPoisonedOutputs("/api/v1/tools/image/resize/batch", [
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({ width: 50 }) },
      { name: "clientJobId", content: "zipfail-batch" },
    ]);

    expect(result.settledWithin, "request hung instead of terminating").toBe(true);
    expect(result.deliveredCompleteZip).toBe(false);
  }, 60_000);

  it("pdf-to-image /batch terminates instead of hanging", async () => {
    const result = await runWithPoisonedOutputs("/api/v1/tools/pdf/pdf-to-jpg/batch", [
      { name: "file", filename: "a.pdf", contentType: "application/pdf", content: PDF_3PAGE },
      { name: "file", filename: "b.pdf", contentType: "application/pdf", content: PDF_2PAGE },
      { name: "settings", content: JSON.stringify({ dpi: 72 }) },
      { name: "clientJobId", content: "zipfail-pdf" },
    ]);

    expect(result.settledWithin, "request hung instead of terminating").toBe(true);
    expect(result.deliveredCompleteZip).toBe(false);
  }, 60_000);
});
