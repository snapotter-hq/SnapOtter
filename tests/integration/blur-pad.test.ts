import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable, probeMedia } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canvasFor } from "../../apps/api/src/routes/tools/blur-pad.js";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const MP4 = readFileSync(join(__dirname, "..", "fixtures", "media", "tiny.mp4"));

let testApp: TestApp;
let adminToken: string;
let sourceW: number;
let sourceH: number;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);

  const tmpDir = mkdtempSync(join(tmpdir(), "bpad-src-"));
  const srcFile = join(tmpDir, "tiny.mp4");
  writeFileSync(srcFile, MP4);
  const info = await probeMedia(srcFile);
  const v = info.streams.find((s) => s.type === "video");
  sourceW = v?.width ?? 0;
  sourceH = v?.height ?? 0;
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function runTool(settings: Record<string, unknown>) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "tiny.mp4", contentType: "video/mp4", content: MP4 },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/blur-pad",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("blur-pad (requires ffmpeg)", () => {
  it("pads to 1:1 producing a square output", async () => {
    const res = await runTool({ target: "1:1" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);

    const tmpDir = mkdtempSync(join(tmpdir(), "bpad-test-"));
    const probeFile = join(tmpDir, "blurpad.mp4");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    const v = info.streams.find((s) => s.type === "video");
    expect(v?.width).toBe(v?.height);
  }, 60_000);

  it("pads to default 16:9 with dims matching canvasFor output", async () => {
    const res = await runTool({});
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    const tmpDir = mkdtempSync(join(tmpdir(), "bpad-test2-"));
    const probeFile = join(tmpDir, "blurpad169.mp4");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    const v = info.streams.find((s) => s.type === "video");

    const expected = canvasFor(sourceW, sourceH, 16, 9);
    expect(v?.width).toBe(expected.cw);
    expect(v?.height).toBe(expected.ch);
  }, 60_000);
});
