import { ffmpegAvailable } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const MP3 = readFixture(fixtures.audio.tiny("mp3"));

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function runTool(settings: Record<string, unknown>) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "tiny.mp3", contentType: "audio/mpeg", content: MP3 },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/audio/waveform-image",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("waveform-image (requires ffmpeg)", () => {
  it("generates PNG waveform with default settings", async () => {
    const res = await runTool({});
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    // PNG magic bytes: 89 50 4E 47
    expect(dl.rawPayload[0]).toBe(0x89);
    expect(dl.rawPayload[1]).toBe(0x50);
    expect(dl.rawPayload[2]).toBe(0x4e);
    expect(dl.rawPayload[3]).toBe(0x47);
  }, 60_000);

  it("rejects invalid color string (400)", async () => {
    const res = await runTool({ color: "blue" });
    expect(res.statusCode).toBe(400);
  });
});
