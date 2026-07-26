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
 * Verdict per scenario is built from five independent checks:
 *   terminal      every job created in the window reached a terminal state
 *   artifacts     every completed job still serves valid output bytes
 *   noDuplicates  no job completed more than once (one output set per job)
 *   drained       every queue returned to zero waiting and zero active
 *   healthy       the API answered /health again, and how long that took
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
import { validateArtifact } from "./lib/job-aware.mjs";

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

async function jobsSince(iso) {
  const rows = await psql(
    `select id || '|' || status || '|' || attempts || '|' || coalesce(tool_id,'-') || '|' || coalesce(array_length(array(select jsonb_array_elements_text(output_refs)),1),0) from jobs where created_at >= '${iso}'::timestamptz order by created_at`,
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

/** Downloads a completed job's output and proves it is still valid bytes. */
async function verifyArtifact(token, jobId) {
  const metaResponse = await fetch(
    new URL(`/api/v1/download/${jobId}/output-meta.json`, cfg.baseUrl),
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!metaResponse.ok) return { jobId, ok: false, error: `meta HTTP ${metaResponse.status}` };
  const meta = await metaResponse.json();
  const fileResponse = await fetch(
    new URL(`/api/v1/download/${jobId}/${encodeURIComponent(meta.filename)}`, cfg.baseUrl),
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!fileResponse.ok) return { jobId, ok: false, error: `download HTTP ${fileResponse.status}` };
  const bytes = Buffer.from(await fileResponse.arrayBuffer());
  try {
    const artifact = validateArtifact(bytes, fileResponse.headers.get("content-type"));
    return { jobId, ok: true, bytes: artifact.outputSize, mime: artifact.outputMime };
  } catch (error) {
    return { jobId, ok: false, error: String(error?.message ?? error) };
  }
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
    what: "app detached from the stack network for 20s, then reattached",
    inject: async () => {
      const network = await docker(
        "inspect",
        "--format",
        "{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}",
        cfg.app,
      );
      await docker("network", "disconnect", network, cfg.app);
      await sleep(20_000);
      await docker("network", "connect", network, cfg.app);
    },
  },
};

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
  const deadline = Date.now() + cfg.settleMs;
  let jobs = [];
  let stuck = [];
  while (Date.now() < deadline) {
    jobs = await jobsSince(since).catch(() => []);
    stuck = jobs.filter((job) => !TERMINAL.has(job.status));
    if (jobs.length > 0 && stuck.length === 0) break;
    await sleep(3000);
  }

  const completed = jobs.filter((job) => job.status === "completed");
  const artifacts = [];
  for (const job of completed) {
    artifacts.push(await verifyArtifact(freshToken, job.id));
  }
  const depths = await queueDepths().catch(() => ({}));
  const drained = Object.values(depths).every((d) => d.waiting === 0 && d.active === 0);
  const duplicated = completed.filter((job) => job.outputs > 1);

  const checks = {
    terminal: stuck.length === 0,
    artifacts: artifacts.every((a) => a.ok),
    noDuplicates: duplicated.length === 0,
    drained,
    healthy: recoveredInS !== null,
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
    byStatus: jobs.reduce((acc, job) => ({ ...acc, [job.status]: (acc[job.status] ?? 0) + 1 }), {}),
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
    duplicatedOutputs: duplicated.length,
    queueDepths: depths,
    recoveredInS,
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
  for (const spec of JOB_MIX) {
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
