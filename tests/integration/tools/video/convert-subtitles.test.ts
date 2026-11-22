import { ffmpegAvailable } from "@snapotter/media-engine";
import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const SRT = readFixture(fixtures.video.subs.srt);
const ASS = readFixture(fixtures.video.subs.ass);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

async function convert(filename: string, content: Buffer, settings: Record<string, unknown>) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/octet-stream", content },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/video/convert-subtitles",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

async function download(res: Awaited<ReturnType<typeof convert>>) {
  expect(res.statusCode).toBe(200);
  const envelope = JSON.parse(res.body);
  expect(envelope.downloadUrl).toBeDefined();
  const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
  expect(dl.statusCode).toBe(200);
  return { url: envelope.downloadUrl as string, text: dl.rawPayload.toString("utf8") };
}

describe.skipIf(!ffmpegAvailable())("convert-subtitles (requires ffmpeg) (#4828)", () => {
  it("converts SRT to WebVTT", async () => {
    const { url, text } = await download(await convert("tiny.srt", SRT, { format: "vtt" }));

    expect(url).toMatch(/tiny\.vtt$/);
    expect(text.startsWith("WEBVTT")).toBe(true);
    expect(text).toContain("SnapOtter subtitle one");
  }, 60_000);

  it("converts ASS to SRT by default and drops the script header", async () => {
    const { url, text } = await download(await convert("tiny.ass", ASS, {}));

    expect(url).toMatch(/tiny\.srt$/);
    expect(text).toMatch(/00:00:00,000 --> 00:00:01,000/);
    expect(text).toContain("Hello World");
    expect(text).not.toContain("[Script Info]");
  }, 60_000);

  it("converts SRT to ASS", async () => {
    const { text } = await download(await convert("tiny.srt", SRT, { format: "ass" }));

    expect(text).toContain("[Script Info]");
    expect(text).toContain("SnapOtter subtitle one");
  }, 60_000);

  it("reads a Windows-1252 SRT on auto and writes UTF-8", async () => {
    const legacy = Buffer.from("1\r\n00:00:00,000 --> 00:00:01,000\r\nCafé crème\r\n", "latin1");
    const { text } = await download(await convert("legacy.srt", legacy, { format: "vtt" }));

    expect(text).toContain("Café crème");
  }, 60_000);

  it("reads GB18030 when that encoding is chosen", async () => {
    const gb = Buffer.concat([
      Buffer.from("1\n00:00:00,000 --> 00:00:01,000\n", "ascii"),
      Buffer.from([0xd7, 0xd6, 0xc4, 0xbb]),
      Buffer.from("\n", "ascii"),
    ]);
    const { text } = await download(
      await convert("chinese.srt", gb, { format: "srt", encoding: "gb18030" }),
    );

    expect(text).toContain("字幕");
  }, 60_000);

  it("rejects a file that isn't a subtitle", async () => {
    const res = await convert("notes.srt", Buffer.from("just some notes\n"), {});

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/not a valid subtitle file/i);
  }, 60_000);

  it("answers 422 for a malformed subtitle that passes the upload sniff", async () => {
    const res = await convert("broken.srt", Buffer.from("1\n00:00:00,000 --> garbage\n"), {});

    expect(res.statusCode).toBe(422);
  }, 60_000);

  it("rejects an unknown output format", async () => {
    const res = await convert("tiny.srt", SRT, { format: "sub" });

    expect(res.statusCode).toBe(400);
  }, 60_000);
});

describe.skipIf(!ffmpegAvailable())(
  "convert-subtitles batch and pipeline (requires ffmpeg) (#5165)",
  () => {
    // Both paths used to validate uploads by the tool's video modality, so the
    // .srt hit ffprobe and failed with "no video track".
    async function post(url: string, parts: Parameters<typeof createMultipartPayload>[0]) {
      const { body, contentType } = createMultipartPayload(parts);
      return testApp.app.inject({
        method: "POST",
        url,
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });
    }

    it("converts several subtitle files through /batch", async () => {
      const res = await post("/api/v1/tools/video/convert-subtitles/batch", [
        { name: "file", filename: "a.srt", contentType: "application/octet-stream", content: SRT },
        { name: "file", filename: "b.srt", contentType: "application/octet-stream", content: SRT },
        { name: "settings", content: JSON.stringify({ format: "vtt" }) },
      ]);

      expect(res.statusCode).toBe(200);
      const entries = new AdmZip(res.rawPayload).getEntries();
      expect(entries).toHaveLength(2);
      for (const entry of entries) {
        expect(entry.entryName).toMatch(/\.vtt$/);
        expect(entry.getData().toString("utf8").startsWith("WEBVTT")).toBe(true);
      }
    }, 90_000);

    it("runs as the first step of a pipeline", async () => {
      const res = await post("/api/v1/pipeline/execute", [
        {
          name: "file",
          filename: "tiny.srt",
          contentType: "application/octet-stream",
          content: SRT,
        },
        {
          name: "pipeline",
          content: JSON.stringify({
            steps: [{ toolId: "convert-subtitles", settings: { format: "vtt" } }],
          }),
        },
      ]);

      const { text } = await download(res);
      expect(text.startsWith("WEBVTT")).toBe(true);
      expect(text).toContain("SnapOtter subtitle one");
    }, 90_000);
  },
);
