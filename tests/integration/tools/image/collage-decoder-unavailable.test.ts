/**
 * #795: collage decodes HEIC and CLI-decoded formats (ICO, RAW, PSD, ...) in its
 * own per-file validation loop. Both catches answered 422 for ANY decode
 * failure, so a host with no HEIF decoder or no ImageMagick told the user their
 * image was unprocessable, and because the error was handled inline the global
 * handler never ran: no request.log.error, no Sentry event for the operator.
 *
 * A missing decoder must propagate as a 503 ENGINE_UNAVAILABLE (the code the
 * media and document input handlers already use) while a genuinely corrupt
 * upload keeps its 422.
 *
 * The missing binary is simulated the way a misconfigured host sees it: PATH
 * points at an empty directory, so every decoder spawn fails with ENOENT. The
 * test app keeps Fastify's default error handler, which honours statusCode; in
 * production apps/api/src/plugins/error-handler.ts turns the same propagation
 * into request.log.error + reportError.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const HEIC = readFixture(fixtures.image.base.heic200);
const ICO = readFixture(fixtures.image.formats("ico"));

const ORIGINAL_PATH = process.env.PATH;
const emptyBinDir = mkdtempSync(join(tmpdir(), "collage-no-decoders-"));

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterEach(() => {
  process.env.PATH = ORIGINAL_PATH;
});

afterAll(async () => {
  process.env.PATH = ORIGINAL_PATH;
  rmSync(emptyBinDir, { recursive: true, force: true });
  await testApp.cleanup();
}, 10_000);

function hideDecoderBinaries() {
  process.env.PATH = emptyBinDir;
}

function collageRequest(file: { filename: string; contentType: string; content: Buffer }) {
  const { body, contentType } = createMultipartPayload([
    { name: "f1", ...file },
    { name: "f2", filename: "b.png", contentType: "image/png", content: PNG },
    { name: "settings", content: JSON.stringify({ templateId: "2-h-equal" }) },
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/tools/image/collage",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe("Collage decoder availability (#795)", () => {
  it("reports a missing HEIF decoder as 503 ENGINE_UNAVAILABLE, not a 422 bad input", async () => {
    hideDecoderBinaries();

    const res = await collageRequest({
      filename: "photo.heic",
      contentType: "image/heic",
      content: HEIC,
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe("ENGINE_UNAVAILABLE");
  });

  it("reports a missing ImageMagick as 503 ENGINE_UNAVAILABLE for a CLI-decoded format", async () => {
    hideDecoderBinaries();

    const res = await collageRequest({
      filename: "icon.ico",
      contentType: "image/x-icon",
      content: ICO,
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe("ENGINE_UNAVAILABLE");
  });

  it("still builds the collage when the CLI decoder is missing but Sharp can read the file", async () => {
    hideDecoderBinaries();

    // DNG is a TIFF container, so Sharp's own fallback decodes it even with no
    // RAW decoder on the host. A missing decoder must not cost this path.
    const res = await collageRequest({
      filename: "photo.dng",
      contentType: "image/x-adobe-dng",
      content: readFixture(fixtures.image.formats("dng")),
    });

    expect([200, 202]).toContain(res.statusCode);
  });

  it("decodes a CLI format normally when the decoder is installed", async () => {
    const res = await collageRequest({
      filename: "icon.ico",
      contentType: "image/x-icon",
      content: ICO,
    });

    expect(res.statusCode).toBe(200);
  });

  it("keeps 422 for a corrupt HEIC when the decoder is installed", async () => {
    // ftyp header intact (passes the magic-byte check), payload garbage.
    const corrupt = Buffer.concat([HEIC.subarray(0, 64), Buffer.alloc(4096, 0x5a)]);

    const res = await collageRequest({
      filename: "broken.heic",
      contentType: "image/heic",
      content: corrupt,
    });

    expect(res.statusCode).toBe(422);
  });

  it("keeps 422 for a corrupt ICO when ImageMagick is installed", async () => {
    // Valid ICONDIR header claiming one 16x16 entry, image data garbage.
    const corrupt = Buffer.concat([ICO.subarray(0, 22), Buffer.alloc(2048, 0x5a)]);

    const res = await collageRequest({
      filename: "broken.ico",
      contentType: "image/x-icon",
      content: corrupt,
    });

    expect(res.statusCode).toBe(422);
  });
});
