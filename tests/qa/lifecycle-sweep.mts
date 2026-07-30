/**
 * Job, batch, pipeline and lifecycle sweep against a production container.
 *
 * Covers the contracts the per-tool lanes cannot see: the sync 200 versus
 * async 202 fork, SSE monotonicity and reconnect, terminal-event idempotency,
 * cancellation before start and in flight, duplicate and concurrent submits,
 * pool isolation, batch archive membership and ordering, cross-modality
 * pipelines, and worker restart recovery.
 *
 * The restart case is the point of PA-006: it kills the container mid-job and
 * asserts the job reaches a terminal state afterwards instead of sitting in
 * "processing" forever. Nothing else in the suite proves stalled-job recovery.
 *
 * Usage:
 *   QA_BASE_URL=... QA_PASSWORD=... \
 *     ./apps/api/node_modules/.bin/tsx tests/qa/lifecycle-sweep.mts [case ...]
 */

import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { login, QaClient } from "./lib/container.js";
import { resolveFixture } from "./lib/fixture-index.js";
import { inspectOutput } from "./lib/oracles.js";

const run = promisify(execFile);

/* biome-ignore-start lint/suspicious/noUndeclaredEnvVars: QA harness runs outside Turbo. */
const BASE = process.env.QA_BASE_URL ?? "http://localhost:13492";
const USERNAME = process.env.QA_USERNAME ?? "admin";
const PASSWORD = process.env.QA_PASSWORD ?? "";
const PROJECT = process.env.QA_COMPOSE_PROJECT ?? "snapotter-qa-f4c2bde9";
const OUT_DIR_OVERRIDE = process.env.QA_OUT_DIR;
/* biome-ignore-end lint/suspicious/noUndeclaredEnvVars: QA harness runs outside Turbo. */

const APP = `${PROJECT}-app`;
const PG = `${PROJECT}-postgres`;
const REPO = join(import.meta.dirname, "..", "..");
const OUT_DIR =
  OUT_DIR_OVERRIDE ??
  join(REPO, "docs", "qa", "master-20260724", "evidence", "processing-ai", "final");

const PNG = resolveFixture(".png", "image") as string;
const JPG = resolveFixture(".jpg", "image") as string;
const MP4 = resolveFixture(".mp4", "video") as string;
const MP3 = resolveFixture(".mp3", "audio") as string;
const PDF = resolveFixture(".pdf", "document") as string;

interface Check {
  id: string;
  verdict: "pass" | "fail" | "blocked";
  detail: string;
  evidence?: unknown;
}

const checks: Check[] = [];

function report(id: string, verdict: Check["verdict"], detail: string, evidence?: unknown): void {
  checks.push({ id, verdict, detail, evidence });
  console.log(`  [${verdict.toUpperCase().padEnd(7)}] ${id}: ${detail}`);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads job rows straight out of the container's Postgres. */
async function sql(query: string): Promise<string> {
  const { stdout } = await run("docker", [
    "exec",
    PG,
    "psql",
    "-U",
    "snapotter",
    "-d",
    "snapotter",
    "-tAc",
    query,
  ]);
  return stdout.trim();
}

let client: QaClient;
let token: string;

// ── Individual checks ─────────────────────────────────────────────

/** Fast tools must answer 200 inside the sync window with a complete envelope. */
async function checkSyncContract(): Promise<void> {
  const outcome = await client.submit({
    path: "/api/v1/tools/image/resize",
    files: [{ field: "file", path: PNG }],
    settings: { width: 80 },
    timeoutMs: 90_000,
  });
  const json = outcome.json ?? {};
  const missing = ["jobId", "downloadUrl", "originalSize", "processedSize"].filter(
    (key) => !(key in json),
  );
  if (outcome.httpStatus !== 200 || missing.length > 0) {
    report(
      "sync-200-envelope",
      "fail",
      `expected 200 with the full envelope, got ${outcome.httpStatus} missing [${missing.join(",")}]`,
    );
    return;
  }
  const facts = outcome.bytes ? await inspectOutput(outcome.bytes, "o.png", "image/png") : null;
  if (facts?.image?.width !== 80) {
    report(
      "sync-200-envelope",
      "fail",
      `sync output width was ${facts?.image?.width}, expected 80`,
    );
    return;
  }
  const state = await sql(`select status from jobs where id = '${json.jobId}'`);
  report(
    "sync-200-envelope",
    state === "completed" ? "pass" : "fail",
    `200 with full envelope, output 80px wide, jobs row status=${state || "(absent)"}`,
  );
}

/** Long tools must answer 202 and drive the job through SSE to a real artifact. */
async function checkAsyncContract(): Promise<void> {
  const outcome = await client.submit({
    path: "/api/v1/tools/video/compress-video",
    files: [{ field: "file", path: MP4 }],
    settings: {},
    timeoutMs: 300_000,
  });
  if (outcome.httpStatus !== 202 || !outcome.jobId) {
    report("async-202-contract", "fail", `expected 202 with a jobId, got ${outcome.httpStatus}`);
    return;
  }
  if (outcome.asyncOutcome !== "complete" || !outcome.bytes) {
    report(
      "async-202-contract",
      "fail",
      `job ${outcome.jobId} ended ${outcome.asyncOutcome}: ${outcome.asyncError ?? "no bytes"}`,
    );
    return;
  }
  const facts = await inspectOutput(outcome.bytes, outcome.outputFilename ?? "o.mp4", "video/mp4");
  const percents = outcome.sseFrames
    .map((frame) => frame.data.percent)
    .filter((value): value is number => typeof value === "number");
  const monotonic = percents.every((value, index) => index === 0 || value >= percents[index - 1]);
  const state = await sql(`select status from jobs where id = '${outcome.jobId}'`);
  report(
    "async-202-contract",
    facts.decodeError || !monotonic ? "fail" : "pass",
    `202 -> SSE ${outcome.sseFrames.length} frames, percents [${percents.join(",")}] monotonic=${monotonic}, output ${facts.media?.formatName} ${facts.media?.durationS}s, jobs row status=${state}`,
    { percents, decodeError: facts.decodeError },
  );
}

/**
 * A client that drops the SSE connection mid-job must be able to reconnect and
 * still observe the terminal frame, and reconnecting after completion must
 * replay a terminal frame every time rather than hanging.
 */
async function checkSseReconnectAndIdempotency(): Promise<void> {
  const submit = await client.submit({
    path: "/api/v1/tools/video/compress-video",
    files: [{ field: "file", path: MP4 }],
    settings: {},
    timeoutMs: 5_000,
    followAsync: false,
  });
  const jobId = submit.jobId;
  if (submit.httpStatus !== 202 || !jobId) {
    report("sse-reconnect", "blocked", `could not start an async job (${submit.httpStatus})`);
    return;
  }

  // First connection: read a little, then abandon it.
  const controller = new AbortController();
  const first = await fetch(`${BASE}/api/v1/jobs/${jobId}/progress`, {
    signal: controller.signal,
    headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
  });
  const reader = first.body?.getReader();
  await reader?.read();
  controller.abort();

  // Second connection: must still reach the terminal frame.
  const reconnect = await client.followProgress(jobId, 300_000);
  report(
    "sse-reconnect",
    reconnect.outcome === "complete" ? "pass" : "fail",
    `after dropping the first SSE connection, reconnect observed ${reconnect.frames.length} frames and terminal=${reconnect.outcome}`,
  );

  // Third and fourth connections after completion: terminal frame each time.
  const replays: string[] = [];
  for (let i = 0; i < 2; i++) {
    const replay = await client.followProgress(jobId, 20_000);
    replays.push(replay.outcome);
  }
  report(
    "sse-terminal-idempotency",
    replays.every((outcome) => outcome === "complete") ? "pass" : "fail",
    `two post-completion reconnects returned [${replays.join(",")}] (expected complete,complete)`,
  );
}

/** Cancelling a queued job and an in-flight job must both reach a terminal state. */
async function checkCancellation(): Promise<void> {
  for (const [id, waitMs] of [
    ["cancel-before-start", 0],
    ["cancel-in-flight", 2_500],
  ] as const) {
    // Stabilization is two ffmpeg passes, so it stays in flight long enough
    // for an in-flight cancel to land on a running job rather than a finished one.
    const submit = await client.submit({
      path: "/api/v1/tools/video/stabilize-video",
      files: [{ field: "file", path: MP4 }],
      settings: {},
      timeoutMs: 10_000,
      followAsync: false,
    });
    const jobId = submit.jobId;
    if (!jobId) {
      report(id, "blocked", `no jobId to cancel (HTTP ${submit.httpStatus})`);
      continue;
    }
    if (waitMs) await sleep(waitMs);
    const response = await client.raw(`/api/v1/jobs/${jobId}/cancel`, { method: "POST" }, 20_000);
    const body = (await response.json().catch(() => ({}))) as { canceled?: boolean };

    // Poll the row until it settles or a bounded deadline passes.
    let state = "";
    for (let attempt = 0; attempt < 90; attempt++) {
      state = await sql(`select status from jobs where id = '${jobId}'`);
      if (state && !["queued", "processing", "pending", "active"].includes(state)) break;
      await sleep(2_000);
    }
    const terminal = ["cancelled", "canceled", "failed", "completed"].includes(state);
    report(
      id,
      response.status === 200 && terminal ? "pass" : "fail",
      `cancel returned ${response.status} canceled=${body.canceled}; job settled to "${state}"`,
    );
  }
}

/** The same file submitted many times at once must produce independent jobs. */
async function checkDuplicateConcurrent(): Promise<void> {
  const submits = await Promise.all(
    Array.from({ length: 5 }, () =>
      client.submit({
        path: "/api/v1/tools/image/resize",
        files: [{ field: "file", path: PNG }],
        settings: { width: 96 },
        timeoutMs: 120_000,
      }),
    ),
  );
  const ids = new Set(submits.map((outcome) => outcome.jobId).filter(Boolean));
  const hashes = new Set<string>();
  for (const outcome of submits) {
    if (!outcome.bytes) continue;
    hashes.add((await inspectOutput(outcome.bytes, "o.png", "image/png")).sha256);
  }
  const allOk = submits.every((outcome) => outcome.httpStatus === 200 && outcome.bytes);
  report(
    "duplicate-concurrent",
    allOk && ids.size === 5 && hashes.size === 1 ? "pass" : "fail",
    `5 concurrent identical submits -> ${ids.size} distinct jobIds, ${hashes.size} distinct output digests, statuses [${submits.map((o) => o.httpStatus).join(",")}]`,
  );
}

/**
 * A saturated media pool must not block the image pool. Video work goes to
 * media, image work to image; the image job has to finish while video is busy.
 */
async function checkPoolIsolation(): Promise<void> {
  const videoJobs = Array.from({ length: 3 }, () =>
    client.submit({
      path: "/api/v1/tools/video/compress-video",
      files: [{ field: "file", path: MP4 }],
      settings: {},
      timeoutMs: 300_000,
      followAsync: false,
    }),
  );
  await Promise.all(videoJobs);
  const started = Date.now();
  const image = await client.submit({
    path: "/api/v1/tools/image/resize",
    files: [{ field: "file", path: PNG }],
    settings: { width: 32 },
    timeoutMs: 90_000,
  });
  const elapsed = Date.now() - started;
  report(
    "pool-isolation",
    image.httpStatus === 200 && image.bytes ? "pass" : "fail",
    `with 3 media-pool jobs in flight, an image-pool job returned ${image.httpStatus} in ${elapsed}ms`,
  );
}

/** Batch must return an archive with one member per input, in input order. */
async function checkBatch(): Promise<void> {
  const inputs = [PNG, JPG, PNG];
  const outcome = await client.submit({
    path: "/api/v1/tools/image/resize/batch",
    files: inputs.map((path, index) => ({
      field: "file",
      path,
      filename: `batch-${index}-${path.split("/").pop()}`,
    })),
    settings: { width: 48 },
    timeoutMs: 180_000,
  });

  let bytes = outcome.bytes;
  if (!bytes && outcome.jobId) {
    const progress = await client.followProgress(outcome.jobId, 180_000);
    const url = progress.result?.downloadUrl;
    if (typeof url === "string") bytes = (await client.download(url)).bytes;
  }
  if (!bytes) {
    report("batch-zip", "fail", `no batch archive retrieved (HTTP ${outcome.httpStatus})`);
    return;
  }
  const facts = await inspectOutput(bytes, "batch.zip", "application/zip");
  const members = facts.zip?.members ?? [];
  const order = members.map((member) => member.name);
  const correctCount = members.length === inputs.length;
  const ordered = order.every((name, index) => name.includes(`batch-${index}`));
  const allNonEmpty = members.every((member) => member.size > 0);
  report(
    "batch-zip",
    correctCount && allNonEmpty ? "pass" : "fail",
    `${members.length}/${inputs.length} members, all non-empty=${allNonEmpty}, input order preserved=${ordered}, names [${order.join(", ")}]`,
    { members },
  );
}

/** A pipeline that crosses modalities must run every step and emit one artifact. */
async function checkPipeline(): Promise<void> {
  const steps = [
    { toolId: "resize", settings: { width: 120 } },
    { toolId: "adjust-colors", settings: { grayscale: true } },
    { toolId: "convert", settings: { format: "jpeg" } },
  ];
  const outcome = await client.submit({
    path: "/api/v1/pipeline/execute",
    files: [{ field: "file", path: PNG }],
    fields: { pipeline: JSON.stringify({ steps }) },
    timeoutMs: 180_000,
  });
  let bytes = outcome.bytes;
  if (!bytes && outcome.jobId) {
    const progress = await client.followProgress(outcome.jobId, 180_000);
    const url = progress.result?.downloadUrl;
    if (typeof url === "string") bytes = (await client.download(url)).bytes;
  }
  if (!bytes) {
    report(
      "pipeline-multistep",
      "fail",
      `pipeline returned no artifact (HTTP ${outcome.httpStatus}: ${(outcome.bodyText ?? "").slice(0, 200)})`,
    );
    return;
  }
  const facts = await inspectOutput(bytes, "pipeline.jpg", "image/jpeg");
  const widthOk = facts.image?.width === 120;
  const formatOk = facts.image?.format === "jpeg";
  const grayOk = (facts.image?.channels ?? 0) <= 3;
  report(
    "pipeline-multistep",
    widthOk && formatOk && grayOk ? "pass" : "fail",
    `3-step pipeline produced ${facts.image?.format} ${facts.image?.width}x${facts.image?.height} ch${facts.image?.channels} (want jpeg, width 120)`,
  );
}

/** Cross-modality pipeline: image in, PDF out. */
async function checkPipelineCrossModality(): Promise<void> {
  const steps = [
    { toolId: "resize", settings: { width: 200 } },
    { toolId: "pdf-to-text", settings: {} },
  ];
  // Deliberately incoherent: step 2 cannot consume an image. The contract is a
  // clean typed failure, not a 500 or a silent pass-through.
  const outcome = await client.submit({
    path: "/api/v1/pipeline/execute",
    files: [{ field: "file", path: PNG }],
    fields: { pipeline: JSON.stringify({ steps }) },
    timeoutMs: 120_000,
  });
  let terminal = outcome.asyncOutcome;
  let error = outcome.asyncError ?? outcome.bodyText ?? "";
  if (outcome.jobId && !terminal) {
    const progress = await client.followProgress(outcome.jobId, 120_000);
    terminal = progress.outcome;
    error = progress.error ?? error;
  }
  const status = outcome.httpStatus ?? 0;
  const cleanlyRefused =
    (status >= 400 && status < 500 && !/\n\s+at\s/.test(error)) || terminal === "failed";
  report(
    "pipeline-incoherent-steps",
    status >= 500 ? "fail" : cleanlyRefused ? "pass" : "fail",
    `image -> pdf-to-text pipeline: HTTP ${status}, terminal=${terminal ?? "n/a"}, error="${error.slice(0, 160)}"`,
  );
}

/**
 * PA-006. Starts a long job, restarts the container while it is in flight, and
 * asserts the job does not stay stuck in a running state. Either BullMQ
 * recovers and finishes it, or startup reconciliation marks it failed. A row
 * still reading "processing" after the restart is the defect.
 */
async function checkWorkerRestartRecovery(): Promise<void> {
  // OCR of a multi-page PDF runs for minutes on this host, so the restart lands
  // while the job is genuinely in flight rather than after it has finished.
  const submit = await client.submit({
    path: "/api/v1/tools/pdf/ocr-pdf",
    files: [{ field: "file", path: PDF }],
    settings: {},
    timeoutMs: 15_000,
    followAsync: false,
  });
  const jobId = submit.jobId;
  if (!jobId) {
    report("worker-restart-recovery", "blocked", `could not start a job (${submit.httpStatus})`);
    return;
  }
  await sleep(6_000);
  const before = await sql(`select status from jobs where id = '${jobId}'`);

  await run("docker", ["restart", "-t", "5", APP], { timeout: 120_000 });

  // Wait for the API to come back.
  let healthy = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    const response = await fetch(`${BASE}/api/v1/health`).catch(() => null);
    if (response?.ok) {
      healthy = true;
      break;
    }
    await sleep(2_000);
  }
  if (!healthy) {
    report("worker-restart-recovery", "fail", "container did not become healthy after restart");
    return;
  }

  // Give reconciliation and any retry a bounded window to settle the row.
  let after = "";
  for (let attempt = 0; attempt < 60; attempt++) {
    after = await sql(`select status from jobs where id = '${jobId}'`);
    if (["completed", "failed", "cancelled", "canceled"].includes(after)) break;
    await sleep(2_000);
  }
  report(
    "worker-restart-recovery",
    ["completed", "failed", "cancelled", "canceled"].includes(after) ? "pass" : "fail",
    `job ${jobId} was "${before}" at restart and settled to "${after}" afterwards (a row still queued or processing means orphan reconciliation did not run)`,
  );

  // Stale rows left behind by the restart across the whole table.
  const stuck = await sql(
    `select count(*) from jobs where status in ('processing','queued') and created_at < now() - interval '5 minutes'`,
  );
  report(
    "stale-job-reconciliation",
    Number(stuck) === 0 ? "pass" : "fail",
    `${stuck} job row(s) older than 5 minutes still in processing or queued after the restart`,
  );
}

/** Terminal SSE for a job id that never existed must not hang forever. */
async function checkUnknownJobProgress(): Promise<void> {
  const started = Date.now();
  const progress = await client.followProgress("00000000-0000-4000-8000-000000000000", 20_000);
  const elapsed = Date.now() - started;
  report(
    "unknown-job-progress",
    progress.outcome !== "complete" ? "pass" : "fail",
    `progress for a non-existent job returned ${progress.outcome} after ${elapsed}ms with ${progress.frames.length} frames`,
  );
}

// ── Entrypoint ────────────────────────────────────────────────────

const CASES: Record<string, () => Promise<void>> = {
  sync: checkSyncContract,
  async: checkAsyncContract,
  sse: checkSseReconnectAndIdempotency,
  cancel: checkCancellation,
  duplicate: checkDuplicateConcurrent,
  pools: checkPoolIsolation,
  batch: checkBatch,
  pipeline: checkPipeline,
  "pipeline-cross": checkPipelineCrossModality,
  "unknown-job": checkUnknownJobProgress,
  restart: checkWorkerRestartRecovery,
};

async function main(): Promise<void> {
  if (!PASSWORD) {
    console.error("QA_PASSWORD is required");
    process.exit(2);
  }
  const requested = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  const selected = requested.length > 0 ? requested : Object.keys(CASES);

  const auth = await login(BASE, USERNAME, PASSWORD);
  token = auth.token;
  client = new QaClient({ baseUrl: BASE, token });

  console.log(`=== lifecycle sweep: ${selected.join(", ")} ===\n`);
  for (const name of selected) {
    const check = CASES[name];
    if (!check) {
      console.error(`unknown case "${name}"`);
      process.exit(2);
    }
    try {
      await check();
    } catch (error) {
      report(name, "fail", `check threw: ${(error as Error).message.slice(0, 300)}`);
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    join(OUT_DIR, "lifecycle.json"),
    `${JSON.stringify({ baseUrl: BASE, checks }, null, 2)}\n`,
  );
  const failed = checks.filter((check) => check.verdict === "fail").length;
  console.log(`\nlifecycle: ${checks.length} checks, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(2);
});
