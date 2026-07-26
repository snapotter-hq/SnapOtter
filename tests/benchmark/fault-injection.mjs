#!/usr/bin/env node
/**
 * Fault injection against a live stack with work in flight.
 *
 * Every scenario follows the same shape: put real jobs into the system, break
 * something while they are running, then reconcile against the database rather
 * than against whatever the HTTP client happened to see. That matters because
 * several of these faults deliberately destroy the client's connection: a
 * harness that only watched its own sockets would call a correctly recovered
 * job a loss.
 *
 * Verdict per scenario is built from seven independent checks:
 *   terminal          every job created in the window reached a terminal state
 *   artifacts         every completed job still serves valid output bytes
 *   noOrphanedOutputs no job's output bytes are stranded on disk unreferenced
 *   noDuplicates      no job completed more than once (one output set per job)
 *   drained           every queue returned to zero waiting and zero active
 *   healthy           the API answered /health again, and how long that took
 *   eventsLive        both completion paths still signal, not just finish
 *
 * noOrphanedOutputs was added for PERF-20260726-006. `terminal` alone does not
 * pin that finding: a fix that marked the stranded jobs failed would satisfy
 * it while the finished AVIF still on disk stayed unreachable, and `artifacts`
 * would not notice because it only visits completed jobs. So the workspace is
 * read directly and every job whose output directory holds real bytes must be
 * completed and must reference them.
 *
 * eventsLive was added for PERF-20260726-007, where every other check passed
 * while the application had quietly stopped signalling completion: jobs ran,
 * wrote correct output and reached terminal rows, but no client was ever told.
 * Reconciling against the database cannot see that, because the database is
 * exactly what stayed right. So both paths are exercised after the stack
 * settles: a job that finishes in milliseconds has to come back 200 inside the
 * sync window (which only the BullMQ QueueEvents stream can deliver), and a
 * client attached to a job that is still running has to be released by a live
 * pub/sub frame rather than by replay-on-connect.
 *
 *   node tests/benchmark/fault-injection.mjs --scenario all --out faults.jsonl
 */
import { execFile } from "node:child_process";
import { appendFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { loadavg } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { validateArtifact, waitForTerminalEvent } from "./lib/job-aware.mjs";

const execFileAsync = promisify(execFile);
const FIXTURE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");
const POOLS = ["image", "media", "ai", "docs", "system"];
const TERMINAL = new Set(["completed", "failed", "canceled"]);

/** Long enough that the fault always lands mid-flight, short enough to iterate. */
const JOB_MIX = [
  {
    tool: "image/convert",
    file: "image/valid/stress-large.jpg",
    settings: { format: "avif", quality: 50 },
  },
  {
    tool: "image/convert",
    file: "image/valid/stress-large.jpg",
    settings: { format: "avif", quality: 40 },
  },
  {
    tool: "image/convert",
    file: "image/valid/stress-large.jpg",
    settings: { format: "avif", quality: 30 },
  },
  { tool: "image/resize", file: "image/valid/stress-large.jpg", settings: { width: 900 } },
  { tool: "pdf/rotate-pdf", file: "document/valid/multipage-6.pdf", settings: { angle: 180 } },
  { tool: "audio/trim-audio", file: "audio/valid/media-30s.wav", settings: { startS: 0, endS: 8 } },
];

/**
 * The two probes behind the `eventsLive` check.
 *
 * `sync` is milliseconds of real work, so a 202 can only mean the sync window
 * expired without the completion event arriving. `live` cannot finish inside
 * the window, so the client attaches while it is still running and only a live
 * pub/sub frame can end the stream; a frame that arrives instantly came from
 * replay-on-connect and proves nothing, which is why the wait is recorded.
 */
const SYNC_PROBE = {
  tool: "files/csv-json",
  file: "data/valid/tiny.csv",
  settings: { pretty: true },
};
const LIVE_PROBE = {
  tool: "image/convert",
  file: "image/valid/stress-large.jpg",
  settings: { format: "avif", quality: 50 },
};
/** Below this, the terminal frame was replayed rather than delivered live. */
const LIVE_FRAME_FLOOR_S = 0.5;
/** How long the pools get to drain once every job row is terminal. */
const DRAIN_TIMEOUT_MS = 120_000;

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    const value = argv[index + 1];
    args[key] = value === undefined || value.startsWith("--") ? "true" : value;
    if (args[key] !== "true") index += 1;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const cfg = {
  baseUrl: args["base-url"] ?? process.env.PERF_BASE_URL ?? "http://127.0.0.1:13496",
  username: args.username ?? process.env.PERF_USERNAME ?? "admin",
  password: args.password ?? process.env.PERF_PASSWORD ?? "",
  app: args["app-container"] ?? process.env.PERF_APP_CONTAINER ?? "",
  pg: args["pg-container"] ?? process.env.PERF_PG_CONTAINER ?? "",
  redis: args["redis-container"] ?? process.env.PERF_REDIS_CONTAINER ?? "",
  redisPassword: args["redis-password"] ?? process.env.PERF_REDIS_PASSWORD ?? "snapotter",
  out: args.out ?? "",
  injectAfterMs: Number(args["inject-after-ms"] ?? 6000),
  settleMs: Number(args["settle-ms"] ?? 240_000),
};

function emit(record) {
  const line = `${JSON.stringify({ ts: new Date().toISOString(), ...record })}\n`;
  if (cfg.out) appendFileSync(cfg.out, line);
  else process.stdout.write(line);
}

function log(message) {
  process.stderr.write(`[${new Date().toISOString().slice(11, 19)}] ${message}\n`);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function docker(...argv) {
  const { stdout } = await execFileAsync("docker", argv, { timeout: 120_000 });
  return stdout.trim();
}

async function psql(sql) {
  return docker("exec", cfg.pg, "psql", "-U", "snapotter", "-d", "snapotter", "-tAc", sql);
}

async function login() {
  const response = await fetch(new URL("/api/auth/login", cfg.baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: cfg.username, password: cfg.password }),
  });
  if (!response.ok) throw new Error(`login returned HTTP ${response.status}`);
  return (await response.json()).token;
}

async function submit(token, spec, fixtures) {
  const form = new FormData();
  const fixture = fixtures.get(spec.file);
  form.append("file", new Blob([fixture]), basename(spec.file));
  form.append("settings", JSON.stringify(spec.settings));
  try {
    const response = await fetch(new URL(`/api/v1/tools/${spec.tool}`, cfg.baseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    const text = await response.text();
    return { tool: spec.tool, status: response.status, body: text.slice(0, 200) };
  } catch (error) {
    return { tool: spec.tool, status: 0, clientError: String(error?.message ?? error) };
  }
}

/**
 * Prove the application can still tell a client that a job finished.
 *
 * Both paths run over Redis connections that only ever read once they are
 * established, which is what made PERF-20260726-007 invisible to every
 * database-side check: a consumer whose socket died without a reset keeps the
 * jobs running and the rows correct while nobody is ever notified.
 */
async function probeEventPaths(token, fixtures) {
  const syncStarted = performance.now();
  const sync = await submit(token, SYNC_PROBE, fixtures);
  const syncS = Number(((performance.now() - syncStarted) / 1000).toFixed(3));

  const live = await submit(token, LIVE_PROBE, fixtures);
  let liveTerminal = live.status === 200 ? "inline" : null;
  let liveWaitS = 0;
  if (live.status === 202) {
    const jobId = JSON.parse(live.body).jobId;
    const started = performance.now();
    liveTerminal = await waitForTerminalEvent({
      baseUrl: cfg.baseUrl,
      token,
      jobId,
      timeoutMs: 120_000,
      fetchImpl: fetch,
    })
      .then(() => "complete")
      .catch((error) => `error:${String(error?.message ?? error)}`);
    liveWaitS = Number(((performance.now() - started) / 1000).toFixed(3));
  }

  return {
    syncStatus: sync.status,
    syncS,
    syncClientError: sync.clientError,
    liveStatus: live.status,
    liveTerminal,
    liveWaitS,
    // "inline" means the encode beat the sync window, so no client ever
    // attached and the live path was not exercised. Rare, and not a pass.
    ok: sync.status === 200 && liveTerminal === "complete" && liveWaitS > LIVE_FRAME_FLOOR_S,
  };
}

async function jobsSince(iso) {
  const rows = await psql(
    `select id || '|' || status || '|' || attempts || '|' || coalesce(tool_id,'-') || '|' || coalesce(jsonb_array_length(output_refs),0) from jobs where created_at >= '${iso}'::timestamptz order by created_at`,
  );
  if (!rows) return [];
  return rows
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, status, attempts, toolId, outputs] = line.split("|");
      return { id, status, attempts: Number(attempts), toolId, outputs: Number(outputs) };
    });
}

async function queueDepths() {
  const script = `local r={} for _,q in ipairs(ARGV) do r[#r+1]=redis.call('llen','bull:snapotter-'..q..':wait') r[#r+1]=redis.call('llen','bull:snapotter-'..q..':active') end return r`;
  const stdout = await docker(
    "exec",
    cfg.redis,
    "redis-cli",
    "-a",
    cfg.redisPassword,
    "--no-auth-warning",
    "eval",
    script,
    "0",
    ...POOLS,
  );
  const numbers = stdout.split("\n").map(Number);
  const depths = {};
  POOLS.forEach((pool, index) => {
    depths[pool] = { waiting: numbers[index * 2] ?? 0, active: numbers[index * 2 + 1] ?? 0 };
  });
  return depths;
}

async function waitHealthy(timeoutMs = 180_000) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    try {
      const response = await fetch(new URL("/api/v1/health", cfg.baseUrl), {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) return Number(((performance.now() - started) / 1000).toFixed(2));
    } catch {
      // The API is expected to be unreachable for part of every scenario.
    }
    await sleep(1000);
  }
  return null;
}

/**
 * Downloads a completed job's output and proves it is still valid bytes.
 *
 * The download URL comes out of the job row, not out of whatever the client
 * saw. Half these scenarios destroy the client's connection on purpose, so the
 * database is the only place the answer reliably survives. (`output-meta.json`
 * is written for batch and pipeline results only; a plain tool job stores its
 * URL in progress.result.downloadUrl and its object key in output_refs.)
 */
async function verifyArtifact(token, jobId) {
  const stored = await psql(
    `select coalesce(progress->'result'->>'downloadUrl', '/api/v1/download/' || id || '/' || regexp_replace(coalesce(output_refs->>0,''), '^.*/', '')) from jobs where id = '${jobId}'`,
  );
  const downloadUrl = stored.trim();
  if (!downloadUrl || downloadUrl.endsWith("/")) {
    return { jobId, ok: false, error: "job row carries no output reference" };
  }
  const response = await fetch(new URL(downloadUrl, cfg.baseUrl), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) return { jobId, ok: false, error: `download HTTP ${response.status}` };
  const bytes = Buffer.from(await response.arrayBuffer());
  try {
    const artifact = validateArtifact(bytes, response.headers.get("content-type"));
    return { jobId, ok: true, bytes: artifact.outputSize, mime: artifact.outputMime };
  } catch (error) {
    return { jobId, ok: false, error: String(error?.message ?? error) };
  }
}

/**
 * Finds output bytes that survived the fault but are unreachable through the
 * API because their job row never learned about them.
 *
 * The workspace is read from inside the app container rather than through the
 * API on purpose: the whole failure mode is a row that does not know its own
 * result, so asking the API would ask the very record that is wrong. Previews
 * are excluded because they are a derived convenience file, never the result.
 * Local storage only, which is what every scenario in this file runs on.
 */
async function findOrphanedOutputs(jobs) {
  const orphaned = [];
  for (const job of jobs) {
    const listing = await docker(
      "exec",
      cfg.app,
      "sh",
      "-c",
      `ls -1 /tmp/workspace/outputs/${job.id} 2>/dev/null || true`,
    ).catch(() => "");
    const files = listing
      .split("\n")
      .map((name) => name.trim())
      .filter((name) => name && !/^preview\./.test(name));
    if (files.length === 0) continue;
    if (job.status !== "completed" || job.outputs === 0) {
      orphaned.push({ id: job.id, status: job.status, outputRefs: job.outputs, files });
    }
  }
  return orphaned;
}

const SCENARIOS = {
  "app-restart": {
    what: "docker restart of the application container with jobs mid-flight",
    inject: () => docker("restart", "-t", "10", cfg.app),
  },
  "worker-sigkill": {
    what: "SIGKILL to the application container (ungraceful worker death)",
    inject: async () => {
      await docker("kill", "-s", "KILL", cfg.app);
      // restart: unless-stopped brings it back on its own; give Docker a beat.
      await sleep(2000);
      await docker("start", cfg.app).catch(() => "");
    },
  },
  "redis-outage": {
    what: "Redis stopped for 20s while jobs are queued, then restarted",
    inject: async () => {
      await docker("stop", "-t", "5", cfg.redis);
      await sleep(20_000);
      await docker("start", cfg.redis);
    },
  },
  "postgres-outage": {
    what: "Postgres stopped for 20s while jobs are running, then restarted",
    inject: async () => {
      await docker("stop", "-t", "5", cfg.pg);
      await sleep(20_000);
      await docker("start", cfg.pg);
    },
  },
  "network-partition": {
    what: "Postgres and Redis detached from the stack network for 20s, then reattached",
    inject: async () => {
      // Detaching the dependencies rather than the app is deliberate. Pulling
      // the app off the network would also tear down its published-port
      // endpoint, so the harness would be measuring a lost port mapping rather
      // than how the application copes with unreachable dependencies.
      const network = await networkOf(cfg.pg);
      await docker("network", "disconnect", network, cfg.pg);
      await docker("network", "disconnect", network, cfg.redis);
      await sleep(20_000);
      await docker("network", "connect", "--alias", "postgres", network, cfg.pg);
      await docker("network", "connect", "--alias", "redis", network, cfg.redis);
    },
  },
  "redis-readdress": {
    what: "Redis leaves the network for 20s and comes back at a different address",
    /**
     * The minimal form of PERF-20260726-007, and the reason that finding was
     * filed as needing isolation: it is what "network-partition" degenerates
     * into whenever Docker hands Postgres the address Redis had. A connection
     * parked on a blocking read has nothing left to send, so it never draws a
     * reset, so ioredis never reconnects it. Moving Redis explicitly makes that
     * deterministic instead of dependent on reattachment order, and it is the
     * harsher half of the pair: with the old address vacated rather than taken
     * over by a live host, not even a write draws a reset.
     */
    inject: async () => {
      const network = await networkOf(cfg.redis);
      const subnet = await docker(
        "network",
        "inspect",
        "--format",
        "{{(index .IPAM.Config 0).Subnet}}",
        network,
      );
      const base = subnet.split("/")[0].split(".").slice(0, 3).join(".");
      const current = await containerAddress(cfg.redis);
      const target = current.endsWith(".200") ? `${base}.201` : `${base}.200`;
      await docker("network", "disconnect", network, cfg.redis);
      await sleep(20_000);
      await docker("network", "connect", "--alias", "redis", "--ip", target, network, cfg.redis);
    },
  },
};

async function networkOf(container) {
  return docker(
    "inspect",
    "--format",
    "{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}",
    container,
  );
}

async function containerAddress(container) {
  return docker(
    "inspect",
    "--format",
    "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
    container,
  );
}

async function restartCount(container) {
  return Number(await docker("inspect", "--format", "{{.RestartCount}}", container));
}

async function runScenario(name, fixtures) {
  const scenario = SCENARIOS[name];
  log(`scenario ${name}: ${scenario.what}`);
  const token = await login();
  const restartsBefore = {
    app: await restartCount(cfg.app),
    redis: await restartCount(cfg.redis),
    postgres: await restartCount(cfg.pg),
  };
  const since = (await psql("select (now() - interval '2 seconds')::text")).trim();

  const submissions = JOB_MIX.map((spec) => submit(token, spec, fixtures));
  await sleep(cfg.injectAfterMs);

  const inFlight = await jobsSince(since);
  const injectedAt = new Date().toISOString();
  let injectError = null;
  try {
    await scenario.inject();
  } catch (error) {
    injectError = String(error?.message ?? error);
  }

  const recoveredInS = await waitHealthy();
  const admissions = await Promise.all(submissions);

  // Reconcile against the database: several scenarios kill the client's socket
  // on purpose, so the HTTP replies are evidence about the client, not the job.
  const freshToken = await login().catch(() => token);
  const settleStarted = performance.now();
  const deadline = Date.now() + cfg.settleMs;
  let jobs = [];
  let stuck = [];
  while (Date.now() < deadline) {
    jobs = await jobsSince(since).catch(() => []);
    stuck = jobs.filter((job) => !TERMINAL.has(job.status));
    if (jobs.length > 0 && stuck.length === 0) break;
    await sleep(3000);
  }
  // How long the last job took to reach a terminal state. Recovery that leans
  // on a periodic reconciler is legitimate but not free, so record the cost.
  const settledInS = Number(((performance.now() - settleStarted) / 1000).toFixed(2));

  const completed = jobs.filter((job) => job.status === "completed");
  const artifacts = [];
  for (const job of completed) {
    artifacts.push(await verifyArtifact(freshToken, job.id));
  }
  // BullMQ can still hold an active entry after every row is terminal, when a
  // completion landed on a connection that had to be re-established, and its
  // stalled-detection reaps that on its own schedule. Sampling once made this a
  // race, so wait for the drain the same way terminal state is waited for. An
  // unreadable depth is not a drain: an empty object would satisfy `every`.
  const drainStarted = performance.now();
  const drainDeadline = Date.now() + DRAIN_TIMEOUT_MS;
  let depths = {};
  let drained = false;
  while (Date.now() < drainDeadline) {
    depths = await queueDepths().catch(() => ({}));
    const pools = Object.values(depths);
    drained = pools.length > 0 && pools.every((d) => d.waiting === 0 && d.active === 0);
    if (drained) break;
    await sleep(3000);
  }
  const drainedInS = Number(((performance.now() - drainStarted) / 1000).toFixed(2));
  const duplicated = completed.filter((job) => job.outputs > 1);
  const orphanedOutputs = await findOrphanedOutputs(jobs);
  // Last, on a settled stack: the queues are empty by now, so a slow admission
  // here is the notification path failing rather than a busy pool.
  const eventPaths = await probeEventPaths(freshToken, fixtures).catch((error) => ({
    ok: false,
    probeError: String(error?.message ?? error),
  }));

  const checks = {
    terminal: stuck.length === 0,
    artifacts: artifacts.every((a) => a.ok),
    noOrphanedOutputs: orphanedOutputs.length === 0,
    noDuplicates: duplicated.length === 0,
    drained,
    healthy: recoveredInS !== null,
    eventsLive: eventPaths.ok,
  };
  const record = {
    kind: "fault",
    scenario: name,
    what: scenario.what,
    injectedAt,
    injectError,
    hostLoad: loadavg()[0].toFixed(2),
    submitted: JOB_MIX.length,
    inFlightAtInjection: inFlight.length,
    jobRows: jobs.length,
    byStatus: jobs.reduce((acc, job) => {
      acc[job.status] = (acc[job.status] ?? 0) + 1;
      return acc;
    }, {}),
    maxAttempts: Math.max(0, ...jobs.map((job) => job.attempts)),
    stuck: stuck.map((job) => ({ id: job.id, status: job.status, toolId: job.toolId })),
    admissions: admissions.map((a) => ({
      tool: a.tool,
      status: a.status,
      clientError: a.clientError,
    })),
    clientLosses: admissions.filter((a) => a.status === 0).length,
    artifactsVerified: artifacts.length,
    artifactFailures: artifacts.filter((a) => !a.ok),
    orphanedOutputs,
    duplicatedOutputs: duplicated.length,
    queueDepths: depths,
    drainedInS,
    eventPaths,
    recoveredInS,
    settledInS,
    restartsBefore,
    restartsAfter: {
      app: await restartCount(cfg.app),
      redis: await restartCount(cfg.redis),
      postgres: await restartCount(cfg.pg),
    },
    checks,
    verdict: Object.values(checks).every(Boolean) ? "pass" : "fail",
  };
  emit(record);
  log(`scenario ${name}: ${record.verdict} ${JSON.stringify(checks)}`);
  return record;
}

async function main() {
  if (!cfg.password) throw new Error("--password is required");
  const fixtures = new Map();
  for (const spec of [...JOB_MIX, SYNC_PROBE, LIVE_PROBE]) {
    if (!fixtures.has(spec.file))
      fixtures.set(spec.file, await readFile(join(FIXTURE_ROOT, spec.file)));
  }
  const requested = args.scenario ?? "all";
  const names = requested === "all" ? Object.keys(SCENARIOS) : requested.split(",");
  const records = [];
  for (const name of names) {
    if (!SCENARIOS[name]) throw new Error(`unknown scenario ${name}`);
    records.push(await runScenario(name, fixtures));
    await sleep(10_000);
  }
  emit({
    kind: "fault-summary",
    scenarios: records.length,
    passed: records.filter((r) => r.verdict === "pass").length,
    failed: records.filter((r) => r.verdict === "fail").map((r) => r.scenario),
  });
  if (records.some((r) => r.verdict === "fail")) process.exitCode = 1;
}

await main();
