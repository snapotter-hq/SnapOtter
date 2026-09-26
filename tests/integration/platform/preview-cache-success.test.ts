import { readdirSync } from "node:fs";
import { join } from "node:path";
import { ffmpegAvailable } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

/**
 * #1291, success path. Previews now encode into `<id>.<uuid>.part.<ext>` and
 * are renamed into the cache when ffmpeg finishes. This pins that the rename
 * happens, that ffmpeg still picks the right container from the temp name, and
 * that nothing is left behind. The failure path is preview-cache.test.ts.
 */
let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function uploadToLibrary(filename: string, contentType: string, content: Buffer) {
  const payload = createMultipartPayload([{ name: "file", filename, contentType, content }]);
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/files/upload",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": payload.contentType },
    body: payload.body,
  });
  expect(res.statusCode, res.body).toBe(201);
  return JSON.parse(res.body).files[0] as { id: string };
}

function getPreview(id: string) {
  return testApp.app.inject({
    method: "GET",
    url: `/api/v1/files/${id}/preview`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
}

describe.skipIf(!ffmpegAvailable())("stored-file preview, successful encode (#1291)", () => {
  it.each([
    [
      "audio",
      "clip.wav",
      "audio/wav",
      () => readFixture(fixtures.audio.tiny("wav")),
      "audio/mpeg",
      // An MP3 starts with an ID3 tag or a frame sync (0xFFEx).
      (b: Buffer) =>
        b.subarray(0, 3).toString() === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
    ],
    [
      "video",
      "clip.mp4",
      "video/mp4",
      () => readFixture(fixtures.video.tiny("mp4")),
      "video/mp4",
      (b: Buffer) => b.subarray(4, 8).toString() === "ftyp",
    ],
  ])(
    "caches a complete %s preview and leaves no temp file",
    async (_kind, name, type, content, served, looksRight) => {
      const file = await uploadToLibrary(name, type, content());

      const first = await getPreview(file.id);
      expect(first.statusCode, first.body.slice(0, 200)).toBe(200);
      expect(first.headers["content-type"]).toBe(served);
      expect(looksRight(first.rawPayload)).toBe(true);

      // Served from the cache the second time: byte-identical.
      const second = await getPreview(file.id);
      expect(second.statusCode).toBe(200);
      expect(second.rawPayload.equals(first.rawPayload)).toBe(true);

      const previewDir = join(env.FILES_STORAGE_PATH, ".previews");
      const mine = readdirSync(previewDir).filter((n) => n.startsWith(file.id));
      expect(mine).toEqual([`${file.id}${served === "video/mp4" ? ".mp4" : ".mp3"}`]);
    },
    60_000,
  );
});
