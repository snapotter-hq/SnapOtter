import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable, probeMedia } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const MP4 = readFileSync(join(__dirname, "..", "fixtures", "media", "tiny.mp4"));
const SRT = readFileSync(join(__dirname, "..", "fixtures", "media", "tiny.srt"));

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe.skipIf(!ffmpegAvailable())("embed-subtitles (requires ffmpeg)", () => {
  it("embeds an SRT subtitle track into an MP4", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp4", contentType: "video/mp4", content: MP4 },
      { name: "file", filename: "tiny.srt", contentType: "application/x-subrip", content: SRT },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/embed-subtitles",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);

    // Probe the output: should have a non-av stream (subtitle mapped as "other")
    const tmpDir = mkdtempSync(join(tmpdir(), "embed-sub-"));
    const probeFile = join(tmpDir, "embedded.mp4");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    expect(info.streams.some((s) => s.type === "other")).toBe(true);
  }, 60_000);

  it("rejects invalid language code 'english' with 400", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp4", contentType: "video/mp4", content: MP4 },
      { name: "file", filename: "tiny.srt", contentType: "application/x-subrip", content: SRT },
      { name: "settings", content: JSON.stringify({ language: "english" }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/embed-subtitles",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  }, 60_000);
});
