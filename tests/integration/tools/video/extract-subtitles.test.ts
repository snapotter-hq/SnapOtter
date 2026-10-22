import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable, runFfmpeg } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const MKV = readFixture(fixtures.video.subs.mkv);
const MP4 = readFixture(fixtures.video.tiny("mp4"));

async function buildVobSubMkv(): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "snapotter-vobsub-"));
  try {
    const idxPath = join(dir, "sub.idx");
    const subPath = join(dir, "sub.sub");
    const mkvPath = join(dir, "bitmap-subs.mkv");
    await writeFile(
      idxPath,
      "# VobSub index file, v7 (do not modify this line!)\nsize: 720x480\nid: en, index: 0\ntimestamp: 00:00:00:000, filepos: 000000000\n",
    );
    await writeFile(subPath, Buffer.alloc(2048));
    await runFfmpeg([
      "-i",
      fixtures.video.tiny("mp4"),
      "-i",
      idxPath,
      "-map",
      "0:v",
      "-map",
      "1:s",
      "-c",
      "copy",
      mkvPath,
    ]);
    return await readFile(mkvPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
});

describe.skipIf(!ffmpegAvailable())("extract-subtitles (requires ffmpeg)", () => {
  it("extracts the subtitle track from an MKV with embedded subs", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny-subs.mkv", contentType: "video/x-matroska", content: MKV },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/extract-subtitles",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    const srtContent = dl.rawPayload.toString("utf8");
    expect(srtContent).toContain("SnapOtter subtitle one");
  }, 60_000);

  it("rejects a video with no subtitle track (400)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp4", contentType: "video/mp4", content: MP4 },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/extract-subtitles",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toMatch(/no subtitle track/i);
  }, 60_000);

  it("rejects a video with a bitmap subtitle track as 422 instead of 400 missing subtitle track (#3371)", async () => {
    const bitmapMkv = await buildVobSubMkv();
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "bitmap-subs.mkv",
        contentType: "video/x-matroska",
        content: bitmapMkv,
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/extract-subtitles",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(422);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toBe("Image-based subtitle tracks cannot be converted to SRT without OCR");
  }, 60_000);
});
