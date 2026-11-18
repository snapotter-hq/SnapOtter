import { ChildProcess, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { type ClientRequest, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

/**
 * Preview encodes ran under the two-hour media job limit and ignored the
 * client going away, so a hung ffmpeg held the request, a CPU, and a process
 * for up to two hours to render a clip capped at 30 or 60 seconds (#1406).
 *
 * The ffmpeg here is a stand-in that records its pid and then hangs, so the
 * test can check the process is actually gone rather than trusting the HTTP
 * status. With the mode file set to "slow-ok" it instead writes a finished
 * preview after a couple of seconds. (It hands `-encoders` to the real binary
 * when there is one.)
 */
const realFfmpeg = (spawnSync("which", ["ffmpeg"], { encoding: "utf8" }).stdout ?? "").trim();
const originalFfmpegPath = process.env.FFMPEG_PATH;
const stubDir = mkdtempSync(join(tmpdir(), "snapotter-preview-limits-"));
const stub = join(stubDir, "ffmpeg");
const pidFile = join(stubDir, "encode.pid");
const modeFile = join(stubDir, "mode");
writeFileSync(
  stub,
  [
    "#!/bin/bash",
    'for a in "$@"; do',
    '  if [ "$a" = "-encoders" ]; then',
    realFfmpeg ? `    exec '${realFfmpeg}' "$@"` : "    exit 1",
    "  fi",
    "done",
    `echo $$ > '${pidFile}.tmp'`,
    `mv '${pidFile}.tmp' '${pidFile}'`,
    `if [ "$(cat '${modeFile}' 2>/dev/null)" = "slow-ok" ]; then`,
    // The output path is the argument before runFfmpeg's trailing `-progress pipe:1`.
    '  out=""; prev=""',
    '  for a in "$@"; do [ "$a" = "-progress" ] && out="$prev"; prev="$a"; done',
    "  sleep 2",
    "  printf 'FINISHED-PREVIEW' > \"$out\"",
    "  exit 0",
    "fi",
    "exec sleep 120",
    "",
  ].join("\n"),
);
chmodSync(stub, 0o755);
// media-engine caches the binary per process, so this must be set before the
// app resolves ffmpeg. Relies on vitest running each file in its own process.
process.env.FFMPEG_PATH = stub;

let testApp: TestApp;
let adminToken: string;
const originalTimeout = env.PREVIEW_TIMEOUT_S;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
  if (originalFfmpegPath === undefined) delete process.env.FFMPEG_PATH;
  else process.env.FFMPEG_PATH = originalFfmpegPath;
  rmSync(stubDir, { recursive: true, force: true });
});

afterEach(() => {
  env.PREVIEW_TIMEOUT_S = originalTimeout;
  // Never leave a hung stub behind, whatever the test did.
  const pid = encodePid();
  if (pid && isAlive(pid)) process.kill(pid, "SIGKILL");
  rmSync(pidFile, { force: true });
  rmSync(`${pidFile}.tmp`, { force: true });
  rmSync(modeFile, { force: true });
});

function encodePid(): number | null {
  if (!existsSync(pidFile)) return null;
  try {
    const raw = readFileSync(pidFile, "utf8");
    if (!/^\d+\n$/.test(raw)) return null;
    const parsed = Number(raw.trim());
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Which kills the app sent, for a failure message. No SIGKILL to `pid` means
 * the server never acted on the disconnect; one that was sent points at the
 * process outliving it.
 */
function describeKills(kill: { mock: { calls: unknown[][]; contexts: unknown[] } }, pid: number) {
  const sent = kill.mock.calls.map(
    ([signal], i) =>
      `${String(signal ?? "SIGTERM")} to ${(kill.mock.contexts[i] as ChildProcess).pid}`,
  );
  const hit = sent.some((entry) => entry.endsWith(` to ${pid}`));
  return `${hit ? "the app did kill it" : "the app never killed it"} (kills sent: ${sent.join(", ") || "none"})`;
}

/** Linux process state ("Z" = killed but not yet reaped), or why it's unknown. */
function processState(pid: number): string {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0] ?? "unparsed";
  } catch {
    return "unavailable";
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function uploadWav(): Promise<string> {
  const payload = createMultipartPayload([
    {
      name: "file",
      filename: "clip.wav",
      contentType: "audio/wav",
      content: readFixture(fixtures.audio.tiny("wav")),
    },
  ]);
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/files/upload",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": payload.contentType },
    body: payload.body,
  });
  expect(res.statusCode, res.body).toBe(201);
  return (JSON.parse(res.body).files[0] as { id: string }).id;
}

function wavUpload() {
  return createMultipartPayload([
    {
      name: "file",
      filename: "clip.wav",
      contentType: "audio/wav",
      content: readFixture(fixtures.audio.tiny("wav")),
    },
  ]);
}

/**
 * Start a request over a real socket so the test can hang up on it; inject has
 * no client to disconnect. The app's own cleanup closes the listener.
 */
async function openPreviewRequest(
  method: "GET" | "POST",
  path: string,
  upload?: ReturnType<typeof createMultipartPayload>,
): Promise<ClientRequest> {
  if (!testApp.app.server.listening) await testApp.app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = testApp.app.server.address() as AddressInfo;
  const req = httpRequest({
    host: "127.0.0.1",
    port,
    method,
    path,
    headers: {
      authorization: `Bearer ${adminToken}`,
      ...(upload && { "content-type": upload.contentType }),
    },
  });
  req.on("error", () => {}); // the hangup surfaces here
  req.end(upload?.body);
  return req;
}

describe("preview encode limits (#1406)", () => {
  it("stops a stored-file preview encode at PREVIEW_TIMEOUT_S", async () => {
    env.PREVIEW_TIMEOUT_S = 1;
    const id = await uploadWav();

    const started = Date.now();
    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/files/${id}/preview`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(422);
    expect(Date.now() - started).toBeLessThan(15_000);
    const pid = encodePid();
    expect(pid, "the stub encode ran").not.toBeNull();
    await vi.waitFor(() => expect(isAlive(pid as number)).toBe(false), { timeout: 5_000 });
  });

  it("stops an on-demand preview encode at PREVIEW_TIMEOUT_S", async () => {
    env.PREVIEW_TIMEOUT_S = 1;
    const payload = wavUpload();
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/preview/generate",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": payload.contentType },
      body: payload.body,
    });
    expect(res.statusCode).toBe(422);
    const pid = encodePid();
    expect(pid, "the stub encode ran").not.toBeNull();
    await vi.waitFor(() => expect(isAlive(pid as number)).toBe(false), { timeout: 5_000 });
  });

  it("kills an on-demand encode when the client disconnects", async () => {
    env.PREVIEW_TIMEOUT_S = 600;
    // The app runs in this process, so the route's SIGKILL goes through here.
    const kill = vi.spyOn(ChildProcess.prototype, "kill");
    try {
      const req = await openPreviewRequest("POST", "/api/v1/preview/generate", wavUpload());

      await vi.waitFor(() => expect(encodePid()).not.toBeNull(), { timeout: 10_000 });
      const pid = encodePid() as number;
      expect(isAlive(pid)).toBe(true);

      req.destroy();
      const hungUpAt = Date.now();
      // The contract is "killed on hang-up, not left to PREVIEW_TIMEOUT_S" (600s
      // here; the stub sleeps 120s), not a latency target. It takes ~50ms on an
      // idle host, but a loaded CI runner blew a 5s budget now and then (#4790).
      try {
        await vi.waitFor(() => expect(isAlive(pid)).toBe(false), { timeout: 20_000 });
      } catch (err) {
        throw new Error(
          `encode ${pid} still alive ${Date.now() - hungUpAt}ms after the client hung up; ` +
            `${describeKills(kill, pid)}; process state: ${processState(pid)}`,
          { cause: err },
        );
      }
      // Dead alone could mean anything killed it; the disconnect path must have.
      const killedByApp = kill.mock.calls.some(
        ([signal], i) =>
          signal === "SIGKILL" && (kill.mock.contexts[i] as ChildProcess).pid === pid,
      );
      expect(killedByApp, describeKills(kill, pid)).toBe(true);
    } finally {
      kill.mockRestore();
    }
  }, 45_000);

  it("lets a stored-file encode finish into the cache after the client disconnects", async () => {
    env.PREVIEW_TIMEOUT_S = 600;
    writeFileSync(modeFile, "slow-ok");
    const id = await uploadWav();
    const req = await openPreviewRequest("GET", `/api/v1/files/${id}/preview`);

    await vi.waitFor(() => expect(encodePid()).not.toBeNull(), { timeout: 10_000 });
    req.destroy();

    // The retry a proxy timeout leads to is then a cache hit.
    const cached = join(env.FILES_STORAGE_PATH, ".previews", `${id}.mp3`);
    await vi.waitFor(() => expect(existsSync(cached)).toBe(true), { timeout: 10_000 });
    expect(readFileSync(cached, "utf8")).toBe("FINISHED-PREVIEW");
  });

  // Kept last: the encoder probe that picks the mp3 encoder is cached per
  // process by now, so only the encode itself meets the unrunnable binary.
  it("answers an encode that couldn't start with a 500 (#1439)", async () => {
    chmodSync(stub, 0o644);
    try {
      const payload = wavUpload();
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/preview/generate",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": payload.contentType },
        body: payload.body,
      });
      // The spawn failed on the server; nothing was wrong with the upload.
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Could not generate preview" });
    } finally {
      chmodSync(stub, 0o755);
    }
  });
});
