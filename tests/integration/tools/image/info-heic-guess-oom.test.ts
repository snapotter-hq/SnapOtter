/**
 * #1628: when an upload isn't detected as HEIF and Sharp can't read it, the
 * info tool guesses it might be HEIF and tries the HEIF decoder. A missing
 * decoder there says nothing about the file, so it stays "Unrecognized image
 * format". The decoder running out of memory does say something: it was
 * decoding the file, so that answers the server's 503 instead of a 422.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const decodeFailure = vi.hoisted(() => ({ next: null as Error | null }));

vi.mock("../../../../apps/api/src/lib/heic-converter.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../apps/api/src/lib/heic-converter.js")>();
  return {
    ...actual,
    decodeHeic: (async (...args: Parameters<typeof actual.decodeHeic>) => {
      if (decodeFailure.next) throw decodeFailure.next;
      return actual.decodeHeic(...args);
    }) as typeof actual.decodeHeic,
  };
});

const { DecoderOutOfMemoryError, DecoderUnavailableError } = await import(
  "../../../../apps/api/src/lib/format-decoders.js"
);

// Neither detected as any image format nor readable by Sharp, so the route
// falls through to its HEIF guess.
const UNREADABLE = Buffer.from("definitely not an image, just some bytes to read");

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

function info() {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: UNREADABLE },
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/tools/image/info",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe("info's HEIF guess", () => {
  it("answers 503 when the HEIF decoder runs out of memory on the guess", async () => {
    decodeFailure.next = new DecoderOutOfMemoryError("The HEIF decoder ran out of memory.");
    const res = await info();
    decodeFailure.next = null;

    expect(res.statusCode, res.body).toBe(503);
    expect(JSON.parse(res.body).code).toBe("ENGINE_UNAVAILABLE");
  });

  it("still calls the format unrecognized when the HEIF decoder is only missing", async () => {
    decodeFailure.next = new DecoderUnavailableError("No HEIF decoder found.");
    const res = await info();
    decodeFailure.next = null;

    expect(res.statusCode, res.body).toBe(422);
    expect(JSON.parse(res.body).details).toBe("Unrecognized image format");
  });
});
