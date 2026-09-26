import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

/**
 * #1291: GET /api/v1/files/:id/preview had ffmpeg write straight into the
 * cached preview path. When ffmpeg died partway, the truncated file stayed
 * there, and every later request served it with `immutable`, so the browser
 * never asked again.
 *
 * The ffmpeg here is a stand-in, so this runs on CI shards without ffmpeg.
 * By default it dies mid-encode: writes some bytes to its output path and
 * exits 1. With PREVIEW_STUB_MODE=ok it writes a complete "preview" and exits
 * 0, which covers the rename path. Every write is logged to a sentinel file,
 * so a stub that silently stops writing can't make these pass by accident.
 * (It hands `-encoders` to the real binary when there is one.)
 */
const PARTIAL = "PARTIAL-PREVIEW-BYTES";
const COMPLETE = "COMPLETE-PREVIEW-BYTES";
const realFfmpeg = (spawnSync("which", ["ffmpeg"], { encoding: "utf8" }).stdout ?? "").trim();
const originalFfmpegPath = process.env.FFMPEG_PATH;
const stubDir = mkdtempSync(join(tmpdir(), "snapotter-preview-cache-"));
const stub = join(stubDir, "ffmpeg");
const writesLog = join(stubDir, "writes.log");
writeFileSync(
  stub,
  [
    "#!/bin/bash",
    'for a in "$@"; do',
    '  if [ "$a" = "-encoders" ]; then',
    realFfmpeg ? `    exec '${realFfmpeg}' "$@"` : "    exit 1",
    "  fi",
    "done",
    // The output path is the argument before runFfmpeg's trailing
    // `-progress pipe:1`.
    'out=""; prev=""',
    'for a in "$@"; do',
    '  [ "$a" = "-progress" ] && out="$prev"',
    '  prev="$a"',
    "done",
    '[ -n "$out" ] || { echo "stub: no output path found" >&2; exit 2; }',
    `echo "$out" >> '${writesLog}'`,
    'if [ "$PREVIEW_STUB_MODE" = "ok" ]; then',
    `  printf '${COMPLETE}' > "$out"`,
    "  exit 0",
    "fi",
    `printf '${PARTIAL}' > "$out"`,
    "echo 'Conversion failed!' >&2",
    "exit 1",
    "",
  ].join("\n"),
);
chmodSync(stub, 0o755);
// media-engine caches the binary per process, so this must be set before the
// app resolves ffmpeg. Relies on vitest running each file in its own process.
process.env.FFMPEG_PATH = stub;

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
  if (originalFfmpegPath === undefined) delete process.env.FFMPEG_PATH;
  else process.env.FFMPEG_PATH = originalFfmpegPath;
  rmSync(stubDir, { recursive: true, force: true });
}, 10_000);

async function uploadToLibrary(filename: string, contentType: string, content: Buffer) {
  const payload = createMultipartPayload([{ name: "file", filename, contentType, content }]);
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/files/upload",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": payload.contentType },
    body: payload.body,
  });
  expect(res.statusCode, res.body).toBe(201);
  return JSON.parse(res.body).files[0] as { id: string; mimeType: string };
}

function getPreview(id: string) {
  return testApp.app.inject({
    method: "GET",
    url: `/api/v1/files/${id}/preview`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
}

/** Output paths the stub has written to so far. */
function stubWrites(): string[] {
  return existsSync(writesLog) ? readFileSync(writesLog, "utf8").trim().split("\n") : [];
}

function previewFiles(id: string): string[] {
  return readdirSync(join(env.FILES_STORAGE_PATH, ".previews")).filter((n) => n.startsWith(id));
}

describe("stored-file preview when ffmpeg fails mid-encode (#1291)", () => {
  it.each([
    ["audio", "clip.wav", "audio/wav", () => readFixture(fixtures.audio.tiny("wav"))],
    ["video", "clip.mp4", "video/mp4", () => readFixture(fixtures.video.tiny("mp4"))],
  ])("does not cache or serve a partial %s preview", async (_kind, name, type, content) => {
    const file = await uploadToLibrary(name, type, content());
    const writesBefore = stubWrites().length;

    const first = await getPreview(file.id);
    expect(first.statusCode).toBe(422);
    // The stub really did leave partial output behind for the route to handle.
    expect(stubWrites().length).toBe(writesBefore + 1);
    // ffmpeg's stderr stays out of the response.
    expect(JSON.parse(first.body).error).toBe("Could not generate preview");

    // The retry must fail again (ffmpeg still fails), not serve the leftovers.
    const second = await getPreview(file.id);
    expect(second.statusCode).toBe(422);
    expect(second.rawPayload.toString()).not.toContain(PARTIAL);
  });

  it("leaves no partial or temp file in the preview directory", async () => {
    const file = await uploadToLibrary(
      "left.wav",
      "audio/wav",
      readFixture(fixtures.audio.tiny("wav")),
    );
    expect((await getPreview(file.id)).statusCode).toBe(422);
    expect(stubWrites().at(-1)).toContain(file.id);
    expect(previewFiles(file.id)).toEqual([]);
  });
});

describe("stored-file preview when the encode succeeds (#1291)", () => {
  it("renames the finished preview into the cache and serves it from there", async () => {
    process.env.PREVIEW_STUB_MODE = "ok";
    try {
      const file = await uploadToLibrary(
        "done.wav",
        "audio/wav",
        readFixture(fixtures.audio.tiny("wav")),
      );
      const first = await getPreview(file.id);
      expect(first.statusCode, first.body.slice(0, 200)).toBe(200);
      expect(first.rawPayload.toString()).toBe(COMPLETE);
      // ffmpeg wrote to a temp name, never the cache path itself.
      expect(stubWrites().at(-1)).toMatch(/\.part\.mp3$/);

      const writes = stubWrites().length;
      const second = await getPreview(file.id);
      expect(second.statusCode).toBe(200);
      expect(second.rawPayload.toString()).toBe(COMPLETE);
      // Served from the cache: ffmpeg didn't run again.
      expect(stubWrites().length).toBe(writes);
      expect(previewFiles(file.id)).toEqual([`${file.id}.mp3`]);
    } finally {
      delete process.env.PREVIEW_STUB_MODE;
    }
  });
});
