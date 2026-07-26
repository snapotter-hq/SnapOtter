#!/usr/bin/env node
/**
 * Resource-limit profiles: what the app does when it is given less than the
 * shipped envelope, and whether it comes back.
 *
 * The shipped `docker/docker-compose.yml` pins the app at `mem_limit: 6g` and
 * `cpus: 4`. Two questions follow, and only one of them is answered by running
 * the shipped numbers:
 *
 *   1. Is 6 GB actually safe under *concurrent* load rather than one tool at a
 *      time? Answered by the `baseline` profile's peak RSS and the headroom it
 *      leaves over the heaviest single-tool figure the AI lane measured.
 *   2. When an operator gives it less, does it fail cleanly? A container that
 *      OOM-kills and comes back healthy is an acceptable answer. One that
 *      wedges, corrupts an artifact or strands a job is not.
 *
 * Each profile recreates the app container at the profile's limits, reads the
 * limits back from Docker rather than trusting the file, drives real
 * oracle-checked load through every pool, then asks three questions the verdict
 * is built from:
 *
 *   bounded      the container stayed inside its own limit, or the kernel
 *                enforced it; the host was never the thing that gave way
 *   clean        no request returned wrong bytes, and no job was left
 *                non-terminal in the database once the dust settled
 *   recoverable  /api/v1/health answered again, and a real job submitted after
 *                the event completed and passed its oracle
 *
 *   node tests/benchmark/limits-profile.mjs --profiles baseline,mem-2g,cpu-1
 */
import { execFile, spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  hostLoad,
  latencyStats,
  loadFixtures,
  login,
  runWorkload,
  Sampler,
  summariseSamples,
} from "./perf-suite.mjs";

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const COMPOSE_FILE = resolve(HERE, "perf-stack.compose.yml");
const MIXED = ["image", "media", "document", "file", "imageHeavy", "video"];

/**
 * `baseline` is the shipped envelope and exists to produce the headroom number.
 * `mem-2g` is the interesting failure: comfortably above the idle footprint,
 * comfortably below what concurrent load wants, so the kernel has to enforce it
 * mid-job. `mem-1g` is below the idle footprint, which tests the other failure
 * shape: dying before it can do anything. `cpu-1` starves scheduling rather
 * than memory, which is the profile a small VPS actually runs.
 */
const PROFILES = {
  baseline: { mem: "6g", cpus: "4", clients: 20, iterations: 2 },
  "mem-2g": { mem: "2g", cpus: "4", clients: 10, iterations: 2 },
  "mem-1g": { mem: "1g", cpus: "4", clients: 4, iterations: 1 },
  "cpu-1": { mem: "6g", cpus: "1", clients: 5, iterations: 2 },
};

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    const next = argv[index + 1];
    args[key] = next === undefined || next.startsWith("--") ? "true" : next;
    if (args[key] !== "true") index += 1;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const cfg = {
  project: args.project ?? "snapotter-qa-soak-limits",
  port: args.port ?? "13498",
  image: args.image ?? "",
  expectImage: args["expect-image"] ?? "",
  password: args.password ?? "",
  username: "admin",
  out: args.out ?? "",
  timeoutMs: Number(args["timeout-ms"] ?? 900_000),
  sampleIntervalMs: Number(args["sample-interval-ms"] ?? 5_000),
  redisPassword: "snapotter",
  settleMs: Number(args["settle-ms"] ?? 60_000),
};
cfg.baseUrl = `http://127.0.0.1:${cfg.port}`;
cfg.appContainer = `${cfg.project}-app`;
cfg.pgContainer = `${cfg.project}-postgres`;
cfg.redisContainer = `${cfg.project}-redis`;

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
  const { stdout } = await execFileAsync("docker", argv, { timeout: 300_000 });
  return stdout.trim();
}

async function compose(env, ...argv) {
  const { stdout, stderr } = await execFileAsync(
    "docker",
    ["compose", "-p", cfg.project, "-f", COMPOSE_FILE, ...argv],
    {
      timeout: 600_000,
      env: {
        ...process.env,
        PERF_PROJECT: cfg.project,
        PERF_APP_PORT: cfg.port,
        PERF_IMAGE: cfg.image,
        PERF_ADMIN_PASSWORD: cfg.password,
        ...env,
      },
    },
  );
  return `${stdout}${stderr}`.trim();
}

/** Limits as Docker actually applied them, never as the compose file asked. */
async function readBackLimits() {
  const raw = await docker(
    "inspect",
    "--type",
    "container",
    "--format",
    "{{.Image}}\t{{.HostConfig.Memory}}\t{{.HostConfig.NanoCpus}}\t{{.RestartCount}}\t{{.State.OOMKilled}}",
    cfg.appContainer,
  );
  const [imageId, memory, nanoCpus, restarts, oomKilled] = raw.split("\t");
  return {
    imageId,
    memLimitMiB: Number(memory) / (1024 * 1024),
    cpus: Number(nanoCpus) / 1e9,
    restarts: Number(restarts),
    oomKilled: oomKilled === "true",
  };
}

async function waitForHealth(budgetMs) {
  const started = performance.now();
  while (performance.now() - started < budgetMs) {
    const response = await fetch(new URL("/api/v1/health", cfg.baseUrl), {
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null);
    if (response?.ok) return Number(((performance.now() - started) / 1000).toFixed(2));
    await sleep(2_000);
  }
  return null;
}

/** Rows that never reached a terminal state are the stranded-state signature. */
async function nonTerminalJobs() {
  const raw = await docker(
    "exec",
    cfg.pgContainer,
    "psql",
    "-U",
    "snapotter",
    "-d",
    "snapotter",
    "-tAc",
    "select count(*) from jobs where status not in ('completed','failed','canceled')",
  );
  return Number(raw.trim());
}

async function jobRowCount() {
  const raw = await docker(
    "exec",
    cfg.pgContainer,
    "psql",
    "-U",
    "snapotter",
    "-d",
    "snapotter",
    "-tAc",
    "select count(*) from jobs",
  );
  return Number(raw.trim());
}

/**
 * Watch for the container dying, live, for as long as the profile runs.
 *
 * Getting this after the fact does not work. `.State.OOMKilled` belongs to the
 * run that ended, and `restart: unless-stopped` has already replaced it with a
 * fresh run whose flag is false before anything can ask. Polling `docker inspect`
 * is no better, because Docker goes restarting -> running inside a second.
 * Replaying `docker events` with `--since/--until` in the past is no better
 * either: Docker Desktop keeps only about thirty seconds of history, so the query
 * returns an empty result that reads exactly like "nothing died".
 *
 * A live subscription started before the load catches every death and carries the
 * exit code with it, which is what separates an OOM kill (137) from anything
 * else. The dedicated `oom` event is subscribed alongside it and agrees, but the
 * exit code is the one to reason from: it is present whatever the cause.
 */
function watchDeaths() {
  const child = spawn("docker", [
    "events",
    "--filter",
    `container=${cfg.appContainer}`,
    "--filter",
    "event=die",
    "--filter",
    "event=oom",
    "--format",
    '{{.Action}} {{index .Actor.Attributes "exitCode"}}',
  ]);
  const lines = [];
  child.stdout.on("data", (chunk) => {
    for (const line of String(chunk).split("\n")) {
      if (line.trim()) lines.push(line.trim());
    }
  });
  child.on("error", () => {});
  return {
    stop() {
      child.kill();
      const exitCodes = lines
        .filter((line) => line.startsWith("die"))
        .map((line) => Number(line.split(" ")[1]));
      return {
        dieExitCodes: exitCodes,
        oomKills: exitCodes.filter((code) => code === 137).length,
        oomEvents: lines.filter((line) => line.startsWith("oom")).length,
      };
    },
  };
}

function rotate(list, offset) {
  const index = offset % list.length;
  return [...list.slice(index), ...list.slice(0, index)];
}

async function driveLoad(token, fixtures, clients, iterations) {
  const results = [];
  await Promise.all(
    Array.from({ length: clients }, async (_, index) => {
      const keys = rotate(MIXED, index);
      for (let round = 0; round < iterations; round += 1) {
        for (const key of keys) {
          const result = await runWorkload(cfg, token, fixtures, key);
          results.push(result);
          emit({ kind: "request", ...result });
        }
      }
    }),
  );
  return results;
}

/**
 * Classify every failure. "Errors happened" is not a verdict: a refused
 * connection while the container is being OOM-killed is the limit working,
 * whereas a request that hangs to the client timeout is the wedge this profile
 * exists to catch.
 */
function classifyFailures(results) {
  const buckets = { refused: 0, timedOut: 0, httpError: 0, oracle: 0, other: 0 };
  for (const result of results.filter((r) => !r.ok)) {
    const message = String(result.error ?? "");
    if (/fetch failed|ECONNREFUSED|ECONNRESET|socket hang up|other side closed/i.test(message)) {
      buckets.refused += 1;
    } else if (/timed out|timeout|aborted/i.test(message)) {
      buckets.timedOut += 1;
    } else if (/HTTP \d{3}|returned HTTP/i.test(message)) {
      buckets.httpError += 1;
    } else if (
      /expected|magic|truncated|oracle|page|duration|width|is not valid|reported failure/i.test(
        message,
      )
    ) {
      buckets.oracle += 1;
    } else {
      buckets.other += 1;
    }
  }
  return buckets;
}

async function runProfile(name) {
  const profile = PROFILES[name];
  if (!profile) throw new Error(`unknown profile ${name}`);
  const deaths = watchDeaths();
  log(`profile ${name}: recreating app at mem=${profile.mem} cpus=${profile.cpus}`);
  await compose(
    { PERF_APP_MEM: profile.mem, PERF_APP_CPUS: profile.cpus },
    "up",
    "-d",
    "--force-recreate",
    "app",
  ).catch((error) => log(`compose up reported: ${error.message.slice(0, 200)}`));

  const bootHealthS = await waitForHealth(180_000);
  const limits = await readBackLimits();
  const jobsBefore = bootHealthS === null ? null : await jobRowCount().catch(() => null);
  // Profiles share one database, so a raw count would inherit whatever the
  // previous profile left behind. Only the delta belongs to this profile.
  const strandedBefore = bootHealthS === null ? null : await nonTerminalJobs().catch(() => -1);
  emit({ kind: "profile-start", profile: name, ...profile, limits, bootHealthS, strandedBefore });

  if (bootHealthS === null) {
    // The app never became healthy at this ceiling. That is a legitimate
    // outcome to record, not a harness failure: it is the answer to "what
    // happens below the idle footprint".
    const logs = await docker("logs", "--tail", "30", cfg.appContainer).catch(() => "");
    const verdict = {
      kind: "profile",
      profile: name,
      ...profile,
      limits,
      bootHealthS: null,
      booted: false,
      restartsDuringBoot: (await readBackLimits()).restarts - limits.restarts,
      ...deaths.stop(),
      tailLog: logs.split("\n").slice(-6).join(" | ").slice(0, 600),
      hostLoad: hostLoad(),
    };
    emit(verdict);
    return verdict;
  }

  const token = await login(cfg);
  const fixtures = await loadFixtures();
  const sampler = new Sampler(cfg);
  sampler.start(`limits-${name}`);
  const loadBefore = hostLoad();
  const started = performance.now();
  const results = await driveLoad(token, fixtures, profile.clients, profile.iterations);
  const wallS = (performance.now() - started) / 1000;

  // Let restarts, retries and the queues settle before asking whether anything
  // was left behind. Reading the jobs table the instant load stops would count
  // still-running work as stranded.
  await sleep(cfg.settleMs);
  const samples = await sampler.stop();

  const healthRecoveryS = await waitForHealth(180_000);
  const afterProbe =
    healthRecoveryS === null ? null : await runWorkload(cfg, token, fixtures, "image");
  const after = await readBackLimits();
  const stranded = await nonTerminalJobs().catch(() => -1);
  const jobsAfter = await jobRowCount().catch(() => null);
  const failures = classifyFailures(results);
  const resources = summariseSamples(samples);
  const peakRssMiB = resources.appMemMaxMiB;

  const verdict = {
    kind: "profile",
    profile: name,
    ...profile,
    limits,
    booted: true,
    bootHealthS,
    requests: results.length,
    ok: results.filter((r) => r.ok).length,
    errors: results.filter((r) => !r.ok).length,
    failures,
    wallS: Number(wallS.toFixed(2)),
    throughputPerS: Number((results.length / wallS).toFixed(3)),
    latency: latencyStats(results.filter((r) => r.ok).map((r) => r.latencyS)),
    peakRssMiB,
    limitMiB: limits.memLimitMiB,
    peakOfLimitPct: Number(((peakRssMiB / limits.memLimitMiB) * 100).toFixed(1)),
    restartsDelta: after.restarts - limits.restarts,
    oomFlagAtEnd: after.oomKilled,
    ...deaths.stop(),
    jobsBefore,
    jobsAfter,
    strandedBefore,
    strandedJobs: stranded,
    strandedDelta: stranded - (strandedBefore ?? 0),
    healthRecoveryS,
    afterProbeOk: Boolean(afterProbe?.ok),
    afterProbeError: afterProbe?.ok ? undefined : afterProbe?.error,
    // bounded: RSS never exceeded the ceiling the container was given.
    bounded: peakRssMiB <= limits.memLimitMiB,
    // clean: nothing came back wrong, and nothing was left half-done.
    clean: failures.oracle === 0 && failures.other === 0 && stranded - (strandedBefore ?? 0) === 0,
    recoverable: healthRecoveryS !== null && Boolean(afterProbe?.ok),
    resources,
    hostLoadBefore: loadBefore,
    hostLoadAfter: hostLoad(),
    sampleFailures: results
      .filter((r) => !r.ok)
      .slice(0, 8)
      .map((r) => ({ workload: r.workload, status: r.admissionStatus, error: r.error })),
  };
  emit(verdict);
  log(
    `profile ${name}: ${verdict.ok}/${verdict.requests} ok, peak ${peakRssMiB} MiB of ${limits.memLimitMiB} MiB, ` +
      `restarts +${verdict.restartsDelta}, stranded ${stranded}, recoverable ${verdict.recoverable}`,
  );
  return verdict;
}

async function main() {
  if (!cfg.image) throw new Error("--image is required");
  if (!cfg.password) throw new Error("--password is required");
  const names = (args.profiles ?? "baseline,mem-2g,mem-1g,cpu-1").split(",");
  emit({ kind: "run", project: cfg.project, baseUrl: cfg.baseUrl, profiles: names });
  const verdicts = [];
  for (const name of names) {
    verdicts.push(await runProfile(name));
    await sleep(5_000);
  }
  emit({
    kind: "summary",
    profiles: verdicts.map((v) => ({
      profile: v.profile,
      booted: v.booted,
      peakRssMiB: v.peakRssMiB ?? null,
      limitMiB: v.limitMiB ?? v.limits?.memLimitMiB ?? null,
      errors: v.errors ?? null,
      restartsDelta: v.restartsDelta ?? null,
      strandedJobs: v.strandedJobs ?? null,
      bounded: v.bounded ?? null,
      clean: v.clean ?? null,
      recoverable: v.recoverable ?? null,
    })),
  });
}

await main();
