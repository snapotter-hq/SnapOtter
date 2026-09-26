import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
 * The ffmpeg here is a stand-in for one that dies mid-encode: it writes some
 * bytes to its output path and exits 1. (It hands `-encoders` to the real
 * binary when there is one, so the encoder check sees a normal build.)
 */
const PARTIAL = "PARTIAL-PREVIEW-BYTES";
const realFfmpeg = (spawnSync("which", ["ffmpeg"], { encoding: "utf8" }).stdout ?? "").trim();
const originalFfmpegPath = process.env.FFMPEG_PATH;
const stubDir = mkdtempSync(join(tmpdir(), "snapotter-preview-cache-"));
const stub = join(stubDir, "ffmpeg");
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

describe("stored-file preview when ffmpeg fails mid-encode (#1291)", () => {
  it.each([
    ["audio", "clip.wav", "audio/wav", () => readFixture(fixtures.audio.tiny("wav"))],
    ["video", "clip.mp4", "video/mp4", () => readFixture(fixtures.video.tiny("mp4"))],
  ])("does not cache or serve a partial %s preview", async (_kind, name, type, content) => {
    const file = await uploadToLibrary(name, type, content());

    const first = await getPreview(file.id);
    expect(first.statusCode).toBe(422);

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
    const previewDir = join(env.FILES_STORAGE_PATH, ".previews");
    const leftovers = readdirSync(previewDir).filter((n) => n.startsWith(file.id));
    expect(leftovers).toEqual([]);
  });
});
