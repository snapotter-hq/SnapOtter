import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable, probeMedia, resolveFfmpeg } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const MP4 = readFixture(fixtures.video.tiny("mp4"));

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

describe.skipIf(!ffmpegAvailable())("video-metadata (requires ffmpeg)", () => {
  it("strips metadata and returns probe data in the envelope", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp4", contentType: "video/mp4", content: MP4 },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/video-metadata",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    // Sync resultPayload passthrough: metadata at top level of envelope
    expect(envelope.metadata).toBeDefined();
    expect(Array.isArray(envelope.metadata.streams)).toBe(true);
    expect(envelope.metadata.streams.length).toBeGreaterThan(0);

    // Download and probe the cleaned file
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    const tmpDir = mkdtempSync(join(tmpdir(), "vid-meta-"));
    const probeFile = join(tmpDir, "clean.mp4");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    expect(info.streams.some((s) => s.type === "video")).toBe(true);
  }, 60_000);

  it("lists the removed tag names without their values", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vid-meta-tagged-"));
    const src = join(tmpDir, "src.mp4");
    const tagged = join(tmpDir, "tagged.mp4");
    writeFileSync(src, MP4);
    execFileSync(resolveFfmpeg() ?? "ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      src,
      "-c",
      "copy",
      "-metadata",
      "title=QA private title",
      "-metadata",
      "comment=QA comment",
      tagged,
    ]);

    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "tagged.mp4",
        contentType: "video/mp4",
        content: readFileSync(tagged),
      },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/video-metadata",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.metadata.removed).toEqual(expect.arrayContaining(["title", "comment"]));
    // The muxer rewrites these into every output, so they are not removals.
    expect(envelope.metadata.removed).not.toContain("major_brand");
    expect(envelope.metadata.removed).not.toContain("encoder");
    expect(JSON.stringify(envelope.metadata)).not.toContain("QA private title");
  }, 60_000);
});
