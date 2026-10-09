/**
 * The on-demand media preview reads the whole upload before it runs ffmpeg.
 * An upload over MAX_UPLOAD_SIZE_MB ("10" in every vitest run) used to escape
 * that read as a bare Error and come back as a 500 with "Internal server
 * error", so the preview panel could only say "preview failed" (#1280). The
 * limit is a client error and must answer 413.
 *
 * The request fails while the body is still being read, before ffmpeg is
 * spawned, so this runs on CI shards that have no ffmpeg.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

function mkvUpload(bytes: number) {
  return createMultipartPayload([
    {
      name: "file",
      filename: "clip.mkv",
      contentType: "video/x-matroska",
      content: Buffer.alloc(bytes, 1),
    },
  ]);
}

describe("POST /api/v1/preview/generate upload limit", () => {
  it("answers 413 for a file over MAX_UPLOAD_SIZE_MB", async () => {
    const { body, contentType } = mkvUpload(11 * 1024 * 1024);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/preview/generate",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      payload: body,
    });

    expect(res.statusCode).toBe(413);
    // The test app doesn't install plugins/error-handler.ts (#1243), so the
    // body is Fastify's default shape ({ error: "Payload Too Large", message:
    // "request file too large" }). With the handler installed, as in
    // production, it is the tool routes' { error: "File exceeds the 10 MB
    // upload limit" } (#2225). Either way the reason travels with it.
    expect(res.body).toMatch(/file too large|exceeds the 10 MB upload limit/i);
  });

  it("still reads a file under the limit (the 413 is not a blanket rejection)", async () => {
    // Garbage bytes under the limit get past the read and fail later: 422
    // where ffmpeg ran and couldn't decode them, or a spawn error mapped to the
    // same 422 where ffmpeg is missing. Either way, not 413.
    const { body, contentType } = mkvUpload(64 * 1024);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/preview/generate",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      payload: body,
    });

    expect(res.statusCode).not.toBe(413);
    expect(res.statusCode).toBe(422);
  });
});
