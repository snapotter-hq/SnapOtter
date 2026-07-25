#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_FUZZ_RUNS = 10_000;
const MAX_FUZZ_SEED = 2_147_483_647;

export const FUZZ_USAGE = "usage: pnpm test:fuzz [--runs <1-10000>] [--seed <0-2147483647>]";

function parseInteger(name, value, { min, max }) {
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) {
    throw new Error(`${name} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be an integer`);
  if (parsed < min || parsed > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return parsed;
}

export function parseFuzzArguments(argv) {
  const result = { help: false, runs: undefined, seed: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--help" || argument === "-h") {
      result.help = true;
      continue;
    }

    const [name, inlineValue] = argument.split("=", 2);
    if (name !== "--runs" && name !== "--seed") {
      throw new Error(`unknown argument: ${argument}\n${FUZZ_USAGE}`);
    }
    const nextValue = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
    if (nextValue === undefined) throw new Error(`${name} requires a value`);

    const key = name === "--runs" ? "runs" : "seed";
    if (result[key] !== undefined) throw new Error(`${name} may only be provided once`);
    result[key] = parseInteger(name, nextValue, {
      min: key === "runs" ? 1 : 0,
      max: key === "runs" ? MAX_FUZZ_RUNS : MAX_FUZZ_SEED,
    });
  }
  return result;
}

export function buildFuzzEnvironment(baseEnvironment, arguments_) {
  const environment = {
    ...baseEnvironment,
    FUZZ: "1",
    VITEST_MAX_FORKS: "1",
  };
  if (arguments_.runs !== undefined) environment.FUZZ_RUNS = String(arguments_.runs);
  if (arguments_.seed !== undefined) {
    environment.FUZZ_SEED = String(arguments_.seed);
    delete environment.FC_SEED;
  }
  return environment;
}

export function fuzzLockPath(cwd) {
  let repositoryIdentity = resolve(cwd);
  try {
    const gitCommonDirectory = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
      windowsHide: true,
    }).trim();
    if (gitCommonDirectory) repositoryIdentity = resolve(cwd, gitCommonDirectory);
  } catch {
    // Outside a Git repository, keep the resolved working directory identity.
  }
  const repoHash = createHash("sha256").update(repositoryIdentity).digest("hex");
  return resolve(tmpdir(), `snapotter-fuzz-${repoHash}.lock`);
}

function describeLockOwner(lockPath) {
  try {
    const owner = JSON.parse(readFileSync(resolve(lockPath, "owner.json"), "utf8"));
    return {
      pid: Number.isInteger(owner.pid) ? owner.pid : "unknown",
      startedAt: typeof owner.startedAt === "string" ? owner.startedAt : "unknown",
    };
  } catch {
    return { pid: "unknown", startedAt: "unknown" };
  }
}

export function acquireFuzzLock(lockPath, owner) {
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = describeLockOwner(lockPath);
    throw new Error(
      `another fuzz campaign is already running (pid=${existing.pid}, ` +
        `startedAt=${existing.startedAt}, lock=${lockPath})`,
    );
  }

  try {
    writeFileSync(resolve(lockPath, "owner.json"), `${JSON.stringify(owner, null, 2)}\n`, {
      flag: "wx",
    });
  } catch (error) {
    rmSync(lockPath, { force: true, recursive: true });
    throw error;
  }

  let released = false;
  return {
    release() {
      if (released) return;
      const currentOwner = JSON.parse(readFileSync(resolve(lockPath, "owner.json"), "utf8"));
      if (currentOwner.token !== owner.token) {
        throw new Error("refusing to release a fuzz lock owned by another process");
      }
      rmSync(lockPath, { recursive: true });
      released = true;
    },
  };
}

function runVitest(cwd, environment) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const args = [
    "exec",
    "vitest",
    "run",
    "tests/integration/generated/fuzz-settings.test.ts",
    "--reporter=verbose",
  ];

  return new Promise((fulfill, reject) => {
    const child = spawn(command, args, { cwd, env: environment, stdio: "inherit" });
    const forwardSignal = (signal) => child.kill(signal);
    const interrupt = () => forwardSignal("SIGINT");
    const terminate = () => forwardSignal("SIGTERM");
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);

    const cleanup = () => {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    };
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("exit", (code) => {
      cleanup();
      fulfill(code ?? 1);
    });
  });
}

async function main() {
  const arguments_ = parseFuzzArguments(process.argv.slice(2));
  if (arguments_.help) {
    console.info(FUZZ_USAGE);
    return 0;
  }

  const cwd = process.cwd();
  const lockPath = fuzzLockPath(cwd);
  const lock = acquireFuzzLock(lockPath, {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    token: randomUUID(),
  });

  try {
    console.info(`[fuzz-runner] acquired exclusive lock ${lockPath}; VITEST_MAX_FORKS=1`);
    return await runVitest(cwd, buildFuzzEnvironment(process.env, arguments_));
  } finally {
    lock.release();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
