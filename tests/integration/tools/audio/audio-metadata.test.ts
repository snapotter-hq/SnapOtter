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
    url: "/api/v1/tools/audio/audio-metadata",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("audio-metadata (requires ffmpeg)", () => {
  it("sets title tag and envelope contains metadata with tags object", async () => {
    const res = await runTool({ title: "EnvelopeTitle2026" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    // Envelope carries resultPayload.metadata at top level (sync passthrough)
    expect(envelope.metadata).toBeDefined();
    expect(typeof envelope.metadata.tags).toBe("object");

    // Download and probe the output to verify the tag was written
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    const tmpDir = mkdtempSync(join(tmpdir(), "audio-meta-"));
    const probeFile = join(tmpDir, "tagged.mp3");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    expect(info.tags?.title).toBe("EnvelopeTitle2026");
  }, 60_000);

  it("strips metadata with strip true and returns 200", async () => {
    const res = await runTool({ strip: true });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
  }, 60_000);

  it("rejects title exceeding 500 characters (400)", async () => {
    const res = await runTool({ title: "x".repeat(501) });
    expect(res.statusCode).toBe(400);
  });
});
