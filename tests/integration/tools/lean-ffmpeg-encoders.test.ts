import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

/**
 * #1270: every tool that hardcoded an external encoder name bypassed the #1092
 * check. On an ffmpeg built without that encoder the job died with
 * `Unknown encoder`, which friendlyError collapses into "The file may be in an
 * unsupported or corrupted format", blaming the user's file.
 *
 * This drives each of those call sites through the real API against a wrapper
 * that behaves like a lean build: the hidden encoders are missing from
 * `ffmpeg -encoders` and fail at encode time the way a real build without them
 * does. The job must fail with the message that names the encoder.
 *
 * libx264 stays visible so resolveEncoder("h264") (covered by #1092) can't fail
 * first and mask a hardcoded site further along the same command line.
 */
const HIDDEN = ["libmp3lame", "libvorbis", "libtheora", "libwebp_anim"];

const realFfmpeg = spawnSync("which", ["ffmpeg"], { encoding: "utf8" }).stdout.trim();
const wrapperDir = mkdtempSync(join(tmpdir(), "snapotter-lean-ffmpeg-"));

if (realFfmpeg) {
  const wrapper = join(wrapperDir, "ffmpeg");
  writeFileSync(
    wrapper,
    [
      "#!/bin/bash",
      `REAL='${realFfmpeg}'`,
      `HIDE='${HIDDEN.join(" ")}'`,
      'for a in "$@"; do',
      '  if [ "$a" = "-encoders" ]; then',
      '    "$REAL" "$@" | grep -vE " ($(echo $HIDE | tr \' \' \'|\')) "',
      '    exit "${PIPESTATUS[0]}"',
      "  fi",
      "done",
      'for a in "$@"; do',
      "  for h in $HIDE; do",
      '    if [ "$a" = "$h" ]; then',
      "      echo \"Unknown encoder '$h'\" >&2",
      "      exit 8",
      "    fi",
      "  done",
      "done",
      'exec "$REAL" "$@"',
      "",
    ].join("\n"),
  );
  chmodSync(wrapper, 0o755);
  // media-engine caches the binary and the encoder list per process, so this
  // has to be in place before anything in the app resolves ffmpeg.
  process.env.FFMPEG_PATH = wrapper;
}

const WAV = readFixture(fixtures.audio.tiny("wav"));
const MP3 = readFixture(fixtures.audio.tiny("mp3"));
const MP4 = readFixture(fixtures.video.tiny("mp4"));
const OGV = readFixture(fixtures.video.tiny("ogv"));

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  if (!realFfmpeg) return;
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp?.cleanup();
  rmSync(wrapperDir, { recursive: true, force: true });
}, 10_000);

interface Upload {
  filename: string;
  contentType: string;
  content: Buffer;
}

async function runTool(route: string, settings: Record<string, unknown>, files: Upload[]) {
  const { body, contentType } = createMultipartPayload([
    ...files.map((f) => ({ name: "file", ...f })),
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: `/api/v1/tools/${route}`,
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

/** The message the user is shown, whether the job failed in the sync window or after a 202. */
async function failureMessage(res: Awaited<ReturnType<typeof runTool>>): Promise<string> {
  if (res.statusCode !== 202) {
    expect(res.statusCode, res.body).not.toBe(200);
    const body = JSON.parse(res.body);
    return String(body.details ?? body.error ?? res.body);
  }
  const { jobId } = JSON.parse(res.body);
  const { db, schema } = await import("../../../apps/api/src/db/index.js");
  for (let i = 0; i < 240; i++) {
    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    if (row?.status === "failed") return String((row.error as { message?: string })?.message);
    expect(row?.status, `job ${jobId}`).not.toBe("completed");
    await delay(250);
  }
  throw new Error(`job ${jobId} did not fail within 60s`);
}

const wav = (name = "tiny.wav"): Upload => ({
  filename: name,
  contentType: "audio/wav",
  content: WAV,
});
const mp3: Upload = { filename: "tiny.mp3", contentType: "audio/mpeg", content: MP3 };
const mp4: Upload = { filename: "tiny.mp4", contentType: "video/mp4", content: MP4 };
const ogv: Upload = { filename: "tiny.ogv", contentType: "video/ogg", content: OGV };

function namesEncoder(message: string, encoder: string): void {
  expect(message).toContain(`has no ${encoder} encoder`);
}

describe.skipIf(!realFfmpeg)("tools on an ffmpeg without external encoders (#1270)", () => {
  it.each([
    ["convert-audio to mp3", "audio/convert-audio", { format: "mp3" }, [wav()], "libmp3lame"],
    ["convert-audio to ogg", "audio/convert-audio", { format: "ogg" }, [wav()], "libvorbis"],
    ["extract-audio to mp3", "video/extract-audio", { format: "mp3" }, [mp4], "libmp3lame"],
    ["extract-audio to ogg", "video/extract-audio", { format: "ogg" }, [mp4], "libvorbis"],
    [
      "merge-audio to mp3",
      "audio/merge-audio",
      { format: "mp3" },
      [wav("a.wav"), wav("b.wav")],
      "libmp3lame",
    ],
    ["reverse-audio keeping mp3", "audio/reverse-audio", {}, [mp3], "libmp3lame"],
    ["convert-video to avi", "video/convert-video", { format: "avi" }, [mp4], "libmp3lame"],
    ["video-to-webp", "video/video-to-webp", {}, [mp4], "libwebp_anim"],
    ["reverse-video keeping ogv", "video/reverse-video", {}, [ogv], "libtheora"],
    ["stabilize-video keeping ogv", "video/stabilize-video", {}, [ogv], "libtheora"],
  ] as const)(
    "%s names the missing encoder",
    async (_label, route, settings, files, encoder) => {
      const res = await runTool(route, settings, [...files]);
      namesEncoder(await failureMessage(res), encoder);
    },
    90_000,
  );

  it("the on-demand audio preview names the missing libmp3lame", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.wav", contentType: "audio/wav", content: WAV },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/preview/generate",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    expect(res.statusCode).toBe(422);
    namesEncoder(JSON.parse(res.body).error, "libmp3lame");
  }, 60_000);

  it("still runs tools whose encoders the build does have", async () => {
    const res = await runTool("audio/convert-audio", { format: "flac" }, [wav()]);
    expect(res.statusCode, res.body).toBe(200);
  }, 60_000);
});
