/**
 * Cross-modality launch smoke test.
 *
 * The ship / no-ship signal: one fast tool per modality (image, video, audio,
 * document, data) run end to end via buildTestApp() -- upload a real fixture,
 * process it, assert valid output -- plus an auth check.
 *
 * All chosen tools have executionHint "fast" and use real (small) fixtures so
 * they stay within the sync window under normal conditions. If a tool falls
 * back to async (202) under CI load, the test validates the async response
 * shape and passes (not a real failure).
 *
 * Tools needing a local binary (ffmpeg, qpdf) are gated with skipIf so the
 * test stays green on machines without those binaries.
 */

import { spawnSync } from "node:child_process";
import { apiToolPath } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

// ── Binary gates ──────────────────────────────────────────────────────
function hasBinary(name: string): boolean {
  const res = spawnSync("which", [name], { encoding: "utf8" });
  return res.status === 0 && res.stdout.trim().length > 0;
}

const HAS_FFMPEG = hasBinary("ffmpeg");
const HAS_QPDF = hasBinary("qpdf");

// ── Helpers ───────────────────────────────────────────────────────────

function isAsyncFallback(res: { statusCode: number; body: string }): boolean {
  if (res.statusCode !== 202) return false;
  const body = JSON.parse(res.body);
  expect(body.async).toBe(true);
  expect(body.jobId).toBeDefined();
  return true;
}

async function postTool(
  app: TestApp["app"],
  token: string,
  toolId: string,
  file: Buffer,
  filename: string,
  contentType: string,
  settings: Record<string, unknown>,
): Promise<{ statusCode: number; body: string }> {
  const { body, contentType: ct } = createMultipartPayload([
    { name: "file", filename, contentType, content: file },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return app.inject({
    method: "POST",
    url: apiToolPath(toolId),
    headers: { authorization: `Bearer ${token}`, "content-type": ct },
    body,
  });
}

// ── Test suite ────────────────────────────────────────────────────────

describe("cross-modality launch smoke", () => {
  let testApp: TestApp;
  let app: TestApp["app"];
  let adminToken: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
    app = testApp.app;
    adminToken = await loginAsAdmin(app);
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  }, 10_000);

  // ── Auth gate ─────────────────────────────────────────────────────
  it("unauthenticated request is rejected", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "test.png",
        contentType: "image/png",
        content: readFixture(fixtures.image.base.png200),
      },
      { name: "settings", content: JSON.stringify({ angle: 90, flipH: false, flipV: false }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/rotate",
      headers: { "content-type": contentType },
      body,
    });
    expect(res.statusCode).toBe(401);
  });

  // ── Image: rotate (Sharp, no external binary) ─────────────────────
  it("image modality: rotate", async () => {
    const file = readFixture(fixtures.image.base.png200);
    const res = await postTool(app, adminToken, "rotate", file, "test.png", "image/png", {
      angle: 90,
      flipH: false,
      flipV: false,
    });
    if (isAsyncFallback(res)) return;
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.jobId).toBeDefined();
  });

  // ── Video: mute-video (ffmpeg) ────────────────────────────────────
  it.skipIf(!HAS_FFMPEG)(
    "video modality: mute-video",
    async () => {
      const file = readFixture(fixtures.video.tiny("mp4"));
      const res = await postTool(app, adminToken, "mute-video", file, "tiny.mp4", "video/mp4", {});
      if (isAsyncFallback(res)) return;
      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
      expect(result.jobId).toBeDefined();
    },
    30_000,
  );

  // ── Audio: convert-audio (ffmpeg) ─────────────────────────────────
  it.skipIf(!HAS_FFMPEG)(
    "audio modality: convert-audio",
    async () => {
      const file = readFixture(fixtures.audio.tiny("wav"));
      const res = await postTool(app, adminToken, "convert-audio", file, "tone.wav", "audio/wav", {
        format: "mp3",
        bitrate: 128,
      });
      if (isAsyncFallback(res)) return;
      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
      expect(result.jobId).toBeDefined();
    },
    30_000,
  );

  // ── Document: rotate-pdf (qpdf) ──────────────────────────────────
  it.skipIf(!HAS_QPDF)(
    "document modality: rotate-pdf",
    async () => {
      const file = readFixture(fixtures.document.tiny("pdf"));
      const res = await postTool(
        app,
        adminToken,
        "rotate-pdf",
        file,
        "tiny.pdf",
        "application/pdf",
        { angle: 90, range: "1-z" },
      );
      if (isAsyncFallback(res)) return;
      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
      expect(result.jobId).toBeDefined();
    },
    30_000,
  );

  // ── Files: csv-json (pure JS, no binary) ─────────────────────
  it("file modality: csv-json", async () => {
    const file = readFixture(fixtures.data.csv);
    const res = await postTool(app, adminToken, "csv-json", file, "tiny.csv", "text/csv", {
      direction: "csv-to-json",
    });
    if (isAsyncFallback(res)) return;
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.jobId).toBeDefined();
  });
});
