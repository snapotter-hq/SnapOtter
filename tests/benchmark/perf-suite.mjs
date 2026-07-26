#!/usr/bin/env node
/**
 * Mixed-pool load, isolation, sustained-throughput and soak harness.
 *
 * `bench.sh` measures one tool at a time against one pool. This drives all
 * four processing pools at once, because that is the shape of a real install
 * and the only shape in which pool fairness, queue backpressure and the
 * shipped 6 GB memory ceiling mean anything.
 *
 * Every request goes through the same completion-aware resolver the rest of
 * the benchmark suite uses, with a semantic oracle attached, so a tier can
 * only be green when every response carried the bytes the settings asked for.
 * Host load is recorded next to every tier: a number taken while the box is
 * busy with someone else's work measures the host, not the product.
 *
 *   node tests/benchmark/perf-suite.mjs fixtures    --out fixtures.json
 *   node tests/benchmark/perf-suite.mjs concurrency --clients 1,3,5,10,20
 *   node tests/benchmark/perf-suite.mjs isolation
 *   node tests/benchmark/perf-suite.mjs sustained   --minutes 20
 *   node tests/benchmark/perf-suite.mjs soak        --minutes 20
 *   node tests/benchmark/perf-suite.mjs summary     --in run.jsonl
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { loadavg } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { resolveBenchmarkResponse } from "./lib/job-aware.mjs";

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(HERE, "../fixtures");

/**
 * The frozen stress set. One representative fixture per modality, each chosen
 * to be heavy enough that the work is real and small enough that a 20-client
 * tier finishes inside a QA window. Hashes are recorded so a later run can
 * prove it measured the same bytes.
 */
export const WORKLOADS = {
  image: {
    pool: "image",
    tool: "image/resize",
    files: ["image/valid/stress-large.jpg"],
    settings: { width: 800, fit: "cover" },
    oracle: { width: 800 },
  },
  imageHeavy: {
    pool: "image",
    tool: "image/convert",
    files: ["image/valid/stress-large.jpg"],
    settings: { format: "avif", quality: 50 },
    expectedMime: "image/avif",
    oracle: { minBytes: 4096 },
  },
  media: {
    pool: "media",
    tool: "audio/trim-audio",
    files: ["audio/valid/media-30s.wav"],
    settings: { startS: 0, endS: 5 },
    oracle: { durationS: 5, toleranceS: 0.3 },
  },
  video: {
    pool: "media",
    tool: "video/trim-video",
    files: ["video/valid/media-30s.mp4"],
    settings: { startS: 0, endS: 3 },
    oracle: { durationS: 3, toleranceS: 0.6 },
  },
  document: {
    pool: "docs",
    tool: "pdf/rotate-pdf",
    files: ["document/valid/multipage-6.pdf"],
    settings: { angle: 90 },
    oracle: { pages: 6 },
  },
  file: {
    pool: "docs",
    tool: "files/csv-json",
    files: ["data/valid/tiny.csv"],
    settings: { pretty: true },
    oracle: { textIncludes: "Grace" },
  },
};

/** Round-robin order for the mixed tiers: every pool appears every cycle. */
const MIXED = ["image", "media", "document", "file", "imageHeavy", "video"];

const POOLS = ["image", "media", "ai", "docs", "system"];

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function config(args) {
  return {
    baseUrl: args["base-url"] ?? process.env.PERF_BASE_URL ?? "http://127.0.0.1:13496",
    username: args.username ?? process.env.PERF_USERNAME ?? "admin",
    password: args.password ?? process.env.PERF_PASSWORD ?? "",
    appContainer: args["app-container"] ?? process.env.PERF_APP_CONTAINER ?? "",
    pgContainer: args["pg-container"] ?? process.env.PERF_PG_CONTAINER ?? "",
    redisContainer: args["redis-container"] ?? process.env.PERF_REDIS_CONTAINER ?? "",
    redisPassword: args["redis-password"] ?? process.env.PERF_REDIS_PASSWORD ?? "snapotter",
    out: args.out ?? process.env.PERF_OUT ?? "",
    timeoutMs: Number(args["timeout-ms"] ?? 300_000),
    sampleIntervalMs: Number(args["sample-interval-ms"] ?? 5_000),
  };
}

function emit(cfg, record) {
  const line = `${JSON.stringify({ ts: new Date().toISOString(), ...record })}\n`;
  if (cfg.out) appendFileSync(cfg.out, line);
  else process.stdout.write(line);
}

function log(message) {
  process.stderr.write(`[${new Date().toISOString().slice(11, 19)}] ${message}\n`);
}

export function hostLoad() {
  const [one, five, fifteen] = loadavg();
  return {
    load1: Number(one.toFixed(2)),
    load5: Number(five.toFixed(2)),
    load15: Number(fifteen.toFixed(2)),
  };
}

export async function login(cfg) {
  if (!cfg.password) throw new Error("--password is required");
  const response = await fetch(new URL("/api/auth/login", cfg.baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: cfg.username, password: cfg.password }),
  });
  if (!response.ok) throw new Error(`login returned HTTP ${response.status}`);
  const payload = await response.json();
  if (typeof payload.token !== "string") throw new Error("login response carried no token");
  return payload.token;
}

/**
 * Proves the container behind the base URL is the image under test. Recording
 * a number against an unidentified stack is how a QA campaign ends up
 * benchmarking last week's build.
 */
export async function proveImage(cfg, expectedImageId) {
  if (!cfg.appContainer) throw new Error("--app-container is required to prove image identity");
  const { stdout } = await execFileAsync("docker", [
    "inspect",
    "--type",
    "container",
    "--format",
    "{{.Image}}\t{{.Config.Image}}\t{{.HostConfig.Memory}}\t{{.HostConfig.NanoCpus}}\t{{.State.Running}}",
    cfg.appContainer,
  ]);
  const [imageId, imageRef, memory, nanoCpus, running] = stdout.trim().split("\t");
  if (running !== "true") throw new Error(`${cfg.appContainer} is not running`);
  if (expectedImageId && imageId !== expectedImageId) {
    throw new Error(`container runs ${imageId}, expected ${expectedImageId}`);
  }
  return { imageId, imageRef, memoryBytes: Number(memory), nanoCpus: Number(nanoCpus) };
}

export async function loadFixtures() {
  const cache = new Map();
  for (const workload of Object.values(WORKLOADS)) {
    for (const relative of workload.files) {
      if (cache.has(relative)) continue;
      const bytes = await readFile(join(FIXTURE_ROOT, relative));
      cache.set(relative, {
        name: basename(relative),
        bytes,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
  return cache;
}

export async function runWorkload(cfg, token, fixtures, key) {
  const workload = WORKLOADS[key];
  const form = new FormData();
  for (const relative of workload.files) {
    const fixture = fixtures.get(relative);
    form.append("file", new Blob([fixture.bytes]), fixture.name);
  }
  if (workload.settings) form.append("settings", JSON.stringify(workload.settings));

  const started = performance.now();
  let response;
  let body;
  try {
    response = await fetch(new URL(`/api/v1/tools/${workload.tool}`, cfg.baseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    body = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    return {
      workload: key,
      pool: workload.pool,
      tool: workload.tool,
      ok: false,
      admissionStatus: 0,
      latencyS: (performance.now() - started) / 1000,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const admissionLatencyS = (performance.now() - started) / 1000;

  try {
    const resolved = await resolveBenchmarkResponse({
      baseUrl: cfg.baseUrl,
      token,
      admissionStatus: response.status,
      admissionMime: response.headers.get("content-type"),
      admissionBody: body,
      admissionLatencyS,
      timeoutMs: cfg.timeoutMs,
      expectedMime: workload.expectedMime,
      oracle: workload.oracle,
    });
    return {
      workload: key,
      pool: workload.pool,
      tool: workload.tool,
      ok: true,
      admissionStatus: response.status,
      admissionLatencyS: Number(admissionLatencyS.toFixed(4)),
      latencyS: Number(resolved.completionLatencyS.toFixed(4)),
      outputSize: resolved.outputSize,
      outputMime: resolved.outputMime,
    };
  } catch (error) {
    return {
      workload: key,
      pool: workload.pool,
      tool: workload.tool,
      ok: false,
      admissionStatus: response.status,
      admissionLatencyS: Number(admissionLatencyS.toFixed(4)),
      latencyS: (performance.now() - started) / 1000,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(fraction * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)];
}

export function latencyStats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: Number(percentile(sorted, 0.5).toFixed(3)),
    p95: Number(percentile(sorted, 0.95).toFixed(3)),
    max: Number((sorted.at(-1) ?? 0).toFixed(3)),
    min: Number((sorted[0] ?? 0).toFixed(3)),
  };
}

/** Periodic container, queue, database and disk readings taken during a tier. */
export class Sampler {
  constructor(cfg) {
    this.cfg = cfg;
    this.samples = [];
    this.running = false;
  }

  async probeDockerStats() {
    const names = [this.cfg.appContainer, this.cfg.pgContainer, this.cfg.redisContainer].filter(
      Boolean,
    );
    if (names.length === 0) return {};
    const { stdout } = await execFileAsync(
      "docker",
      ["stats", "--no-stream", "--format", "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}", ...names],
      { timeout: 20_000 },
    );
    const readings = {};
    for (const line of stdout.trim().split("\n")) {
      const [name, cpu, mem] = line.split("\t");
      if (!name) continue;
      readings[name] = {
        cpuPct: Number(String(cpu).replace("%", "")),
        memMiB: parseMemUsage(mem),
      };
    }
    return readings;
  }

  async probeQueues() {
    if (!this.cfg.redisContainer) return {};
    const script = `local r={} for _,q in ipairs(ARGV) do r[#r+1]=redis.call('llen','bull:snapotter-'..q..':wait') r[#r+1]=redis.call('llen','bull:snapotter-'..q..':active') r[#r+1]=redis.call('zcard','bull:snapotter-'..q..':failed') end return r`;
    const { stdout } = await execFileAsync(
      "docker",
      [
        "exec",
        this.cfg.redisContainer,
        "redis-cli",
        "-a",
        this.cfg.redisPassword,
        "--no-auth-warning",
        "eval",
        script,
        "0",
        ...POOLS,
      ],
      { timeout: 20_000 },
    );
    const numbers = stdout.trim().split("\n").map(Number);
    const queues = {};
    POOLS.forEach((pool, index) => {
      queues[pool] = {
        waiting: numbers[index * 3] ?? 0,
        active: numbers[index * 3 + 1] ?? 0,
        failed: numbers[index * 3 + 2] ?? 0,
      };
    });
    return queues;
  }

  async probePostgres() {
    if (!this.cfg.pgContainer) return {};
    const sql =
      "select pg_database_size(current_database()) || ' ' || coalesce((select sum(size) from pg_ls_waldir()),0) || ' ' || (select count(*) from pg_ls_waldir()) || ' ' || (select count(*) from jobs)";
    const { stdout } = await execFileAsync(
      "docker",
      ["exec", this.cfg.pgContainer, "psql", "-U", "snapotter", "-d", "snapotter", "-tAc", sql],
      { timeout: 20_000 },
    );
    const [dbBytes, walBytes, walFiles, jobRows] = stdout.trim().split(" ").map(Number);
    return { dbBytes, walBytes, walFiles, jobRows };
  }

  /**
   * Container lifecycle, read from Docker rather than inferred. A soak that
   * only samples RSS cannot tell a flat memory curve from a container that
   * quietly OOM-killed and restarted back to its baseline.
   */
  async probeContainerState() {
    if (!this.cfg.appContainer) return {};
    const { stdout } = await execFileAsync(
      "docker",
      [
        "inspect",
        "--type",
        "container",
        "--format",
        "{{.RestartCount}}\t{{.State.OOMKilled}}\t{{.State.Running}}\t{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}",
        this.cfg.appContainer,
      ],
      { timeout: 20_000 },
    );
    const [restarts, oomKilled, running, health] = stdout.trim().split("\t");
    return {
      restarts: Number(restarts),
      oomKilled: oomKilled === "true",
      running: running === "true",
      health,
    };
  }

  async probeDisk() {
    if (!this.cfg.appContainer) return {};
    const { stdout } = await execFileAsync(
      "docker",
      [
        "exec",
        this.cfg.appContainer,
        "sh",
        "-c",
        "du -sk /data /tmp/workspace 2>/dev/null | awk '{print $1}' | tr '\\n' ' '",
      ],
      { timeout: 60_000 },
    );
    const [dataKiB, workspaceKiB] = stdout.trim().split(/\s+/).map(Number);
    return { dataKiB, workspaceKiB };
  }

  async takeSample(phase) {
    const [stats, queues, postgres, disk, state] = await Promise.all([
      this.probeDockerStats().catch((error) => ({ error: error.message })),
      this.probeQueues().catch((error) => ({ error: error.message })),
      this.probePostgres().catch((error) => ({ error: error.message })),
      this.probeDisk().catch((error) => ({ error: error.message })),
      this.probeContainerState().catch((error) => ({ error: error.message })),
    ]);
    const sample = {
      kind: "sample",
      phase,
      elapsedS: Number(((performance.now() - this.startedAt) / 1000).toFixed(1)),
      host: hostLoad(),
      containers: stats,
      queues,
      postgres,
      disk,
      state,
    };
    this.samples.push(sample);
    emit(this.cfg, sample);
    return sample;
  }

  start(phase) {
    this.running = true;
    this.startedAt = performance.now();
    this.loop = (async () => {
      while (this.running) {
        await this.takeSample(phase).catch(() => {});
        const deadline = Date.now() + this.cfg.sampleIntervalMs;
        while (this.running && Date.now() < deadline) {
          await new Promise((done) => setTimeout(done, 250));
        }
      }
    })();
  }

  async stop() {
    this.running = false;
    await this.loop;
    return this.samples;
  }
}

function parseMemUsage(value) {
  const match = /([0-9.]+)\s*([KMGT]?i?B)/.exec(String(value ?? ""));
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2];
  const factor = unit.startsWith("G")
    ? 1024
    : unit.startsWith("T")
      ? 1024 * 1024
      : unit.startsWith("K")
        ? 1 / 1024
        : unit === "B"
          ? 1 / (1024 * 1024)
          : 1;
  return Number((amount * factor).toFixed(2));
}

/**
 * Growth shape of one sampled series over a phase.
 *
 * A two-point delta cannot separate a leak from churn: a run that allocates,
 * frees and happens to end high looks identical to one that never gives memory
 * back. So each series carries a least-squares slope (normalised per hour) and
 * a split-half comparison. A leak has a positive slope AND a second half that
 * sits above the first; churn has a slope near zero and halves that match.
 */
function seriesGrowth(points) {
  const usable = points.filter(
    ([elapsed, value]) => Number.isFinite(elapsed) && Number.isFinite(value),
  );
  if (usable.length < 2) return { samples: usable.length };
  const values = usable.map(([, value]) => value);
  const half = Math.floor(usable.length / 2);
  const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
  const meanX = mean(usable.map(([elapsed]) => elapsed));
  const meanY = mean(values);
  let covariance = 0;
  let variance = 0;
  for (const [elapsed, value] of usable) {
    covariance += (elapsed - meanX) * (value - meanY);
    variance += (elapsed - meanX) ** 2;
  }
  const slopePerSecond = variance === 0 ? 0 : covariance / variance;
  return {
    samples: usable.length,
    first: values[0],
    last: values.at(-1),
    min: Math.min(...values),
    max: Math.max(...values),
    slopePerHour: Number((slopePerSecond * 3600).toFixed(3)),
    firstHalfMean: Number(mean(values.slice(0, half)).toFixed(2)),
    secondHalfMean: Number(mean(values.slice(half)).toFixed(2)),
  };
}

/** Per-metric growth curves plus the lifecycle facts a leak verdict needs. */
export function growthReport(samples) {
  const appName = Object.keys(samples[0]?.containers ?? {})[0];
  const series = (pick) => seriesGrowth(samples.map((s) => [s.elapsedS, pick(s)]));
  const restarts = samples.map((s) => s.state?.restarts).filter(Number.isFinite);
  const backlog = (sample) =>
    POOLS.reduce((total, pool) => total + (sample.queues?.[pool]?.waiting ?? 0), 0);
  return {
    appMemMiB: series((s) => s.containers?.[appName]?.memMiB),
    workspaceKiB: series((s) => s.disk?.workspaceKiB),
    dataKiB: series((s) => s.disk?.dataKiB),
    dbBytes: series((s) => s.postgres?.dbBytes),
    walBytes: series((s) => s.postgres?.walBytes),
    jobRows: series((s) => s.postgres?.jobRows),
    restartsFirst: restarts[0] ?? null,
    restartsLast: restarts.at(-1) ?? null,
    oomKillSamples: samples.filter((s) => s.state?.oomKilled).length,
    notRunningSamples: samples.filter((s) => s.state?.running === false).length,
    unhealthySamples: samples.filter(
      (s) => s.state?.health && s.state.health !== "healthy" && s.state.health !== "none",
    ).length,
    queueBacklogLast: samples.length ? backlog(samples.at(-1)) : 0,
    queueFailedLast: POOLS.reduce(
      (total, pool) => total + (samples.at(-1)?.queues?.[pool]?.failed ?? 0),
      0,
    ),
  };
}

export function summariseSamples(samples) {
  const appName = Object.keys(samples[0]?.containers ?? {})[0];
  const memory = samples.map((s) => s.containers?.[appName]?.memMiB ?? 0).filter(Boolean);
  const cpu = samples.map((s) => s.containers?.[appName]?.cpuPct ?? 0);
  const queueMax = {};
  for (const pool of POOLS) {
    queueMax[pool] = Math.max(0, ...samples.map((s) => s.queues?.[pool]?.waiting ?? 0));
  }
  const first = samples[0];
  const last = samples.at(-1);
  return {
    samples: samples.length,
    appMemMaxMiB: memory.length ? Math.max(...memory) : 0,
    appMemLastMiB: memory.at(-1) ?? 0,
    appCpuMaxPct: cpu.length ? Math.max(...cpu) : 0,
    queueWaitingMax: queueMax,
    dbBytesDelta: (last?.postgres?.dbBytes ?? 0) - (first?.postgres?.dbBytes ?? 0),
    walBytesDelta: (last?.postgres?.walBytes ?? 0) - (first?.postgres?.walBytes ?? 0),
    dataKiBDelta: (last?.disk?.dataKiB ?? 0) - (first?.disk?.dataKiB ?? 0),
    workspaceKiBDelta: (last?.disk?.workspaceKiB ?? 0) - (first?.disk?.workspaceKiB ?? 0),
    workspaceKiBLast: last?.disk?.workspaceKiB ?? 0,
    growth: growthReport(samples),
  };
}

function tierSummary(label, clients, results, samples, loadBefore, loadAfter, wallS) {
  const ok = results.filter((r) => r.ok);
  const byPool = {};
  for (const pool of new Set(results.map((r) => r.pool))) {
    const poolResults = results.filter((r) => r.pool === pool);
    byPool[pool] = {
      ...latencyStats(poolResults.filter((r) => r.ok).map((r) => r.latencyS)),
      errors: poolResults.filter((r) => !r.ok).length,
    };
  }
  return {
    kind: "tier",
    tier: label,
    clients,
    requests: results.length,
    errors: results.length - ok.length,
    errorRatePct: Number((((results.length - ok.length) / results.length) * 100).toFixed(2)),
    wallS: Number(wallS.toFixed(2)),
    throughputPerS: Number((results.length / wallS).toFixed(3)),
    latency: latencyStats(ok.map((r) => r.latencyS)),
    admission: latencyStats(ok.map((r) => r.admissionLatencyS ?? 0)),
    async202: results.filter((r) => r.admissionStatus === 202).length,
    byPool,
    resources: summariseSamples(samples),
    hostLoadBefore: loadBefore,
    hostLoadAfter: loadAfter,
    failures: results
      .filter((r) => !r.ok)
      .slice(0, 10)
      .map((r) => ({ workload: r.workload, status: r.admissionStatus, error: r.error })),
  };
}

async function client(cfg, token, fixtures, keys, iterations, sink) {
  for (let round = 0; round < iterations; round += 1) {
    for (const key of keys) {
      const result = await runWorkload(cfg, token, fixtures, key);
      sink.push(result);
      emit(cfg, { kind: "request", ...result });
    }
  }
}

function rotate(list, offset) {
  const index = offset % list.length;
  return [...list.slice(index), ...list.slice(0, index)];
}

function selectedWorkloads(args) {
  const requested = args.workloads;
  if (!requested) return MIXED;
  const keys = requested.split(",");
  for (const key of keys) {
    if (!WORKLOADS[key]) throw new Error(`unknown workload ${key}`);
  }
  return keys;
}

async function commandConcurrency(cfg, args) {
  const clients = String(args.clients ?? "1,3,5,10,20")
    .split(",")
    .map(Number);
  const iterations = Number(args.iterations ?? 2);
  const mix = selectedWorkloads(args);
  const token = await login(cfg);
  const fixtures = await loadFixtures();
  const identity = await proveImage(cfg, args["expect-image"]);
  emit(cfg, { kind: "identity", ...identity, baseUrl: cfg.baseUrl });

  for (const count of clients) {
    const loadBefore = hostLoad();
    log(`tier c${count}: host load ${loadBefore.load1}`);
    const sampler = new Sampler(cfg);
    sampler.start(`concurrency-c${count}`);
    const results = [];
    const started = performance.now();
    await Promise.all(
      Array.from({ length: count }, (_, index) =>
        client(cfg, token, fixtures, rotate(mix, index), iterations, results),
      ),
    );
    const wallS = (performance.now() - started) / 1000;
    const samples = await sampler.stop();
    const summary = tierSummary(
      `${args.label ?? "concurrency"}-c${count}`,
      count,
      results,
      samples,
      loadBefore,
      hostLoad(),
      wallS,
    );
    emit(cfg, summary);
    log(
      `tier c${count}: n=${summary.requests} errors=${summary.errors} p50=${summary.latency.p50}s p95=${summary.latency.p95}s max=${summary.latency.max}s mem=${summary.resources.appMemMaxMiB}MiB`,
    );
    await new Promise((done) => setTimeout(done, 5_000));
  }
}

/**
 * Pool isolation: flood the image pool, then measure the docs pool from a
 * separate client and compare against its own unloaded baseline. A shared
 * worker pool would show docs latency tracking the image saturation.
 */
async function commandIsolation(cfg, args) {
  const floodClients = Number(args["flood-clients"] ?? 12);
  const probeCount = Number(args["probes"] ?? 12);
  const token = await login(cfg);
  const fixtures = await loadFixtures();
  const identity = await proveImage(cfg, args["expect-image"]);
  emit(cfg, { kind: "identity", ...identity, baseUrl: cfg.baseUrl });

  const loadBefore = hostLoad();
  const baseline = [];
  for (let index = 0; index < probeCount; index += 1) {
    baseline.push(await runWorkload(cfg, token, fixtures, "document"));
  }
  emit(cfg, {
    kind: "isolation-baseline",
    ...latencyStats(baseline.filter((r) => r.ok).map((r) => r.latencyS)),
    errors: baseline.filter((r) => !r.ok).length,
    hostLoad: loadBefore,
  });

  const sampler = new Sampler(cfg);
  sampler.start("isolation-flood");
  const floodResults = [];
  let flooding = true;
  const flood = Promise.all(
    Array.from({ length: floodClients }, async () => {
      while (flooding) {
        floodResults.push(await runWorkload(cfg, token, fixtures, "imageHeavy"));
      }
    }),
  );

  // Let the image pool build a real backlog before probing the docs pool.
  await new Promise((done) => setTimeout(done, 15_000));
  const underLoad = [];
  for (let index = 0; index < probeCount; index += 1) {
    underLoad.push(await runWorkload(cfg, token, fixtures, "document"));
  }
  flooding = false;
  await flood;
  const samples = await sampler.stop();

  const baselineStats = latencyStats(baseline.filter((r) => r.ok).map((r) => r.latencyS));
  const loadedStats = latencyStats(underLoad.filter((r) => r.ok).map((r) => r.latencyS));
  emit(cfg, {
    kind: "isolation",
    floodClients,
    floodRequests: floodResults.length,
    floodErrors: floodResults.filter((r) => !r.ok).length,
    docsBaseline: baselineStats,
    docsUnderImageLoad: loadedStats,
    docsErrors: underLoad.filter((r) => !r.ok).length,
    p95RatioDocs: Number((loadedStats.p95 / Math.max(baselineStats.p95, 0.001)).toFixed(2)),
    resources: summariseSamples(samples),
    hostLoadBefore: loadBefore,
    hostLoadAfter: hostLoad(),
    failures: [...floodResults, ...underLoad]
      .filter((r) => !r.ok)
      .slice(0, 10)
      .map((r) => ({ workload: r.workload, status: r.admissionStatus, error: r.error })),
  });
}

async function commandSustained(cfg, args) {
  const minutes = Number(args.minutes ?? 20);
  const concurrency = Number(args.concurrency ?? 2);
  const mix = selectedWorkloads(args);
  const token = await login(cfg);
  const fixtures = await loadFixtures();
  const identity = await proveImage(cfg, args["expect-image"]);
  emit(cfg, { kind: "identity", ...identity, baseUrl: cfg.baseUrl });

  const loadBefore = hostLoad();
  const sampler = new Sampler(cfg);
  sampler.start("sustained");
  const deadline = Date.now() + minutes * 60_000;
  const results = [];
  const started = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async (_, index) => {
      const keys = rotate(mix, index);
      let cursor = 0;
      while (Date.now() < deadline) {
        const key = keys[cursor % keys.length];
        cursor += 1;
        const result = await runWorkload(cfg, token, fixtures, key);
        results.push(result);
        emit(cfg, { kind: "request", phase: "sustained", ...result });
        if (index === 0 && cursor % 25 === 0) {
          const last = sampler.samples.at(-1);
          const appName = Object.keys(last?.containers ?? {})[0];
          log(
            `sustained: ${results.length} requests, ${results.filter((r) => !r.ok).length} errors, ` +
              `${Math.round((deadline - Date.now()) / 60_000)} min left, ` +
              `rss=${last?.containers?.[appName]?.memMiB ?? "?"}MiB ws=${last?.disk?.workspaceKiB ?? "?"}KiB`,
          );
        }
      }
    }),
  );
  const wallS = (performance.now() - started) / 1000;
  const samples = await sampler.stop();
  emit(cfg, {
    ...tierSummary("sustained", concurrency, results, samples, loadBefore, hostLoad(), wallS),
    minutes,
    latencyByDecile: decileTrend(results),
  });
}

/** Latency per tenth of the run: a rising trend is the leak signature. */
function decileTrend(results) {
  const ok = results.filter((r) => r.ok);
  const bucket = Math.max(1, Math.ceil(ok.length / 10));
  const trend = [];
  for (let index = 0; index < ok.length; index += bucket) {
    trend.push(latencyStats(ok.slice(index, index + bucket).map((r) => r.latencyS)).p50);
  }
  return trend;
}

async function commandSoak(cfg, args) {
  const minutes = Number(args.minutes ?? 20);
  const identity = await proveImage(cfg, args["expect-image"]);
  emit(cfg, { kind: "identity", ...identity, baseUrl: cfg.baseUrl });
  const token = await login(cfg);
  const fixtures = await loadFixtures();
  const sampler = new Sampler(cfg);
  sampler.start("idle-soak");
  const deadline = Date.now() + minutes * 60_000;
  const health = [];
  while (Date.now() < deadline) {
    await new Promise((done) => setTimeout(done, 30_000));
    const started = performance.now();
    const response = await fetch(new URL("/api/v1/health", cfg.baseUrl)).catch(() => null);
    health.push({
      ok: Boolean(response?.ok),
      latencyMs: Number((performance.now() - started).toFixed(1)),
    });
    if (health.length % 10 === 0) {
      log(
        `idle soak: ${health.length} health checks, ${Math.round((deadline - Date.now()) / 60_000)} min left`,
      );
    }
  }
  // An instance that idles without leaking is only half the answer: it also has
  // to still do work afterwards. One real job, oracle-checked, closes that gap.
  const afterIdle = await runWorkload(cfg, token, fixtures, "image");
  const samples = await sampler.stop();
  emit(cfg, {
    kind: "soak",
    minutes,
    healthChecks: health.length,
    healthFailures: health.filter((h) => !h.ok).length,
    healthLatencyMsMax: Math.max(...health.map((h) => h.latencyMs)),
    processingProbeAfterIdle: afterIdle,
    resources: summariseSamples(samples),
    hostLoadAfter: hostLoad(),
  });
}

async function commandFixtures(cfg) {
  const fixtures = await loadFixtures();
  const manifest = [];
  for (const [relative, fixture] of fixtures) {
    manifest.push({
      path: `tests/fixtures/${relative}`,
      bytes: fixture.bytes.length,
      sha256: fixture.sha256,
    });
  }
  manifest.sort((a, b) => a.path.localeCompare(b.path));
  emit(cfg, { kind: "fixtures", workloads: Object.keys(WORKLOADS), manifest });
}

function commandSummary(args) {
  const rows = readFileSync(args.in, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .filter((row) => row.kind === "tier");
  const header =
    "| tier | clients | n | errors | p50 s | p95 s | max s | req/s | 202s | app RSS MiB | host load |";
  const lines = [header, "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"];
  for (const row of rows) {
    lines.push(
      `| ${row.tier} | ${row.clients} | ${row.requests} | ${row.errors} | ${row.latency.p50} | ${row.latency.p95} | ${row.latency.max} | ${row.throughputPerS} | ${row.async202} | ${row.resources.appMemMaxMiB} | ${row.hostLoadBefore.load1} -> ${row.hostLoadAfter.load1} |`,
    );
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

const COMMANDS = {
  fixtures: (cfg) => commandFixtures(cfg),
  concurrency: commandConcurrency,
  isolation: commandIsolation,
  sustained: commandSustained,
  soak: commandSoak,
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (command === "summary") return commandSummary(args);
  const handler = COMMANDS[command];
  if (!handler) {
    process.stderr.write(`unknown command ${command ?? "(none)"}\n`);
    process.exitCode = 2;
    return;
  }
  await handler(config(args), args);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
