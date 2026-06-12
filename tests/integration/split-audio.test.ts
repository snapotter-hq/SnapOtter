import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ffmpegAvailable } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const MP3 = readFileSync(join(__dirname, "..", "fixtures", "media", "tiny.mp3"));
const TONE_GAP = readFileSync(join(__dirname, "..", "fixtures", "media", "tone-gap.wav"));

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe.skipIf(!ffmpegAvailable())("split-audio (requires ffmpeg)", () => {
  it("splits into 2 parts via parts mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp3", contentType: "audio/mpeg", content: MP3 },
      { name: "settings", content: JSON.stringify({ mode: "parts", parts: 2 }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/split-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    // ZIP magic: PK\x03\x04
    expect(dl.rawPayload[0]).toBe(0x50);
    expect(dl.rawPayload[1]).toBe(0x4b);
  }, 60_000);

  it("splits by silence on tone-gap.wav", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tone-gap.wav", contentType: "audio/wav", content: TONE_GAP },
      {
        name: "settings",
        content: JSON.stringify({ mode: "silence", thresholdDb: -40, minSilenceS: 0.2 }),
      },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/split-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    // ZIP magic
    expect(dl.rawPayload[0]).toBe(0x50);
    expect(dl.rawPayload[1]).toBe(0x4b);
    expect(dl.rawPayload.length).toBeGreaterThan(400);
  }, 60_000);

  it("rejects silence mode when no silence found", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp3", contentType: "audio/mpeg", content: MP3 },
      {
        name: "settings",
        content: JSON.stringify({ mode: "silence", thresholdDb: -40, minSilenceS: 0.2 }),
      },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/split-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(422);
    const parsed = JSON.parse(res.body);
    expect(parsed.details).toMatch(/no silence found/i);
  }, 60_000);

  it("splits by time mode on tone-gap.wav (segmentS=1)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tone-gap.wav", contentType: "audio/wav", content: TONE_GAP },
      { name: "settings", content: JSON.stringify({ mode: "time", segmentS: 1 }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/split-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    // ZIP magic
    expect(dl.rawPayload[0]).toBe(0x50);
    expect(dl.rawPayload[1]).toBe(0x4b);
  }, 60_000);

  it("rejects parts=1 (schema minimum is 2)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp3", contentType: "audio/mpeg", content: MP3 },
      { name: "settings", content: JSON.stringify({ mode: "parts", parts: 1 }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/split-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  }, 60_000);
});
