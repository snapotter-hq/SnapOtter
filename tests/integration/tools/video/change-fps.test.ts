import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const MP4 = readFixture(fixtures.video.tiny("mp4"));
const WEBM = readFixture(fixtures.video.tiny("webm"));

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function runTool(
  settings: Record<string, unknown>,
  file: { filename: string; contentType: string; content: Buffer } = {
    filename: "tiny.mp4",
    contentType: "video/mp4",
    content: MP4,
  },
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: file.filename, contentType: file.contentType, content: file.content },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/video/change-fps",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("change-fps (requires ffmpeg)", () => {
  it("changes to 10 fps and verifies via ffprobe", async () => {
    const res = await runTool({ fps: 10 });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);

    // Write to tmp and probe frame rate directly via ffprobe spawnSync
    const tmpDir = mkdtempSync(join(tmpdir(), "fps-test-"));
    const probeFile = join(tmpDir, "fps.mp4");
    writeFileSync(probeFile, dl.rawPayload);
    const result = spawnSync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=r_frame_rate",
      "-of",
      "csv=p=0",
      probeFile,
    ]);
    const fps = result.stdout.toString().trim();
    expect(fps).toBe("10/1");
  }, 60_000);

  it("changes fps on a webm input and keeps a webm-legal codec (regression: h264-in-webm exit 234)", async () => {
    const res = await runTool(
      { fps: 1 },
      { filename: "tiny.webm", contentType: "video/webm", content: WEBM },
    );
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);

    // Output must be a valid webm with a webm-legal video codec (vp9/vp8/av1),
    // never h264 -- which cannot be muxed into a webm container.
    const tmpDir = mkdtempSync(join(tmpdir(), "fps-webm-test-"));
    const probeFile = join(tmpDir, "out.webm");
    writeFileSync(probeFile, dl.rawPayload);
    const result = spawnSync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name",
      "-of",
      "csv=p=0",
      probeFile,
    ]);
    const codec = result.stdout.toString().trim();
    expect(["vp9", "vp8", "av1"]).toContain(codec);
  }, 60_000);
});
