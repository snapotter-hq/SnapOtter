import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable, probeMedia } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const TONE_GAP = readFixture(fixtures.audio.gap);

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
    { name: "file", filename: "tone-gap.wav", contentType: "audio/wav", content: TONE_GAP },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/audio/silence-removal",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("silence-removal (requires ffmpeg)", () => {
  it("removes silent gap and shortens duration below 1.05s", async () => {
    const res = await runTool({ thresholdDb: -40, minSilenceS: 0.2 });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    const tmpDir = mkdtempSync(join(tmpdir(), "silence-test-"));
    const probeFile = join(tmpDir, "nosilence.wav");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);

    // tone-gap.wav is ~1.2s with a 0.4s silent middle; output should be shorter than 1.05s
    expect(info.durationS).toBeLessThan(1.05);
    expect(info.durationS).toBeGreaterThan(0.3);
  }, 60_000);
});
