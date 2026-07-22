import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { release as osRelease } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const PROCESS_GROUP_POLL_MS = 10;
const PROCESS_KILL_CONFIRMATION_MS = 2_000;
const PROCESS_TERM_GRACE_MS = 1_000;
const ALLOWED_ENVIRONMENT_KEYS = [
  "CI",
  "DATA_DIR",
  "DOCKER_HOST",
  "FULL_MATRIX",
  "LANG",
  "NODE_OPTIONS",
  "PATH",
  "PLAYWRIGHT_BROWSERS_PATH",
  "PW_RETRIES",
  "PW_REUSE_EXISTING_SERVER",
  "SHARP_IGNORE_GLOBAL_LIBVIPS",
  "TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE",
  "TESTCONTAINERS_HOST_OVERRIDE",
  "TEST_DATABASE_URL",
  "TEST_REDIS_URL",
  "TMPDIR",
  "TZ",
  "VITEST_HOOK_TIMEOUT",
  "VITEST_MAX_FORKS",
  "VITEST_TEST_TIMEOUT",
];

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

function artifactEvidence(runDirectory, root = runDirectory) {
  return readdirSync(root)
    .sort()
    .flatMap((name) => {
      const path = join(root, name);
      if (statSync(path).isDirectory()) return artifactEvidence(runDirectory, path);
      if (path === join(runDirectory, "stdout.log") || path === join(runDirectory, "stderr.log")) {
        return [];
      }
      return [{ path: relative(runDirectory, path), sha256: sha256File(path) }];
    });
}

function atomicWrite(path, content) {
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    const file = openSync(temporaryPath, "wx", 0o600);
    try {
      writeFileSync(file, content);
      fsyncSync(file);
    } finally {
      closeSync(file);
    }
    renameSync(temporaryPath, path);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

function writeRunEvent(runDirectory, name, event) {
  const path = join(runDirectory, name);
  if (existsSync(path)) throw new Error(`refusing to overwrite campaign event: ${path}`);
  atomicWrite(path, `${JSON.stringify(event)}\n`);
}

export function mergeCommandEvents(registry) {
  const events = readdirSync(join(registry, "runs"))
    .sort()
    .flatMap((runId) => {
      const runDirectory = join(registry, "runs", runId);
      const startedPath = join(runDirectory, "command-started.json");
      const finishedPath = join(runDirectory, "command-finished.json");
      if (!existsSync(startedPath) || !existsSync(finishedPath)) {
        throw new Error(`run does not have a complete event pair: ${runId}`);
      }
      const started = JSON.parse(readFileSync(startedPath, "utf8"));
      const finished = JSON.parse(readFileSync(finishedPath, "utf8"));
      if (
        started.runId !== runId ||
        finished.runId !== runId ||
        started.event !== "command_started" ||
        finished.event !== "command_finished"
      ) {
        throw new Error(`invalid event pair: ${runId}`);
      }
      return [started, finished];
    });
  events.sort((left, right) => {
    const leftTime = left.startedAt ?? left.finishedAt;
    const rightTime = right.startedAt ?? right.finishedAt;
    return (
      leftTime.localeCompare(rightTime) ||
      left.runId.localeCompare(right.runId) ||
      (left.event === "command_started" ? -1 : 1)
    );
  });
  atomicWrite(
    join(registry, "commands.jsonl"),
    `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
  );
  return events;
}

function commitAt(cwd) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
    timeout: 5_000,
  });
  if (result.status !== 0) throw new Error(`cannot resolve campaign commit: ${result.stderr}`);
  return result.stdout.trim();
}

function dockerResourceSnapshot(cwd) {
  const queries = {
    containers: ["ps", "-aq", "--no-trunc"],
    networks: ["network", "ls", "-q", "--no-trunc"],
    volumes: ["volume", "ls", "-q"],
  };
  return Object.fromEntries(
    Object.entries(queries).map(([kind, args]) => {
      const result = spawnSync("docker", args, { cwd, encoding: "utf8", timeout: 5_000 });
      if (result.error) throw new Error(`cannot snapshot Docker ${kind}: ${result.error.message}`);
      if (result.status !== 0) {
        throw new Error(`cannot snapshot Docker ${kind}: ${result.stderr.trim()}`);
      }
      return [
        kind,
        result.stdout
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean)
          .sort(),
      ];
    }),
  );
}

function newDockerResources(before, after) {
  return Object.fromEntries(
    Object.keys(before).map((kind) => {
      const existing = new Set(before[kind]);
      return [kind, after[kind].filter((id) => !existing.has(id))];
    }),
  );
}

function hasDockerLeaks(leaks) {
  return Object.values(leaks).some((ids) => ids.length > 0);
}

function contextEvidence(registry, cwd) {
  const candidates = [
    join(registry, "bootstrap.json"),
    join(registry, "campaign.json"),
    join(registry, "inventory.json"),
    join(registry, "resource-policy.json"),
    join(cwd, "package.json"),
    join(cwd, "pnpm-lock.yaml"),
    join(cwd, "tests", "fixtures", "manifest.json"),
    join(cwd, "vitest.config.ts"),
  ];
  return candidates.filter(existsSync).map((path) => ({ path, sha256: sha256File(path) }));
}

function environmentEvidence() {
  const values = Object.fromEntries(
    ALLOWED_ENVIRONMENT_KEYS.filter((key) => process.env[key] !== undefined).map((key) => [
      key,
      process.env[key],
    ]),
  );
  return {
    keys: Object.keys(values),
    sha256: sha256Buffer(JSON.stringify(values)),
  };
}

function argumentShape(value) {
  if (value === "--") return "separator";
  if (/^--[^=\s]+=[\s\S]*$/.test(value)) return "long-option-with-value";
  if (/^--[^=\s]+$/.test(value)) return "long-option";
  if (/^-[^-=\s]=[\s\S]*$/.test(value)) return "short-option-with-value";
  if (/^-[^-=\s]$/.test(value)) return "short-option";
  if (/^-[^-=\s][\s\S]+$/.test(value)) return "short-option-with-attached-value";
  if (/^[A-Za-z_][A-Za-z0-9_]*=[\s\S]*$/.test(value)) return "assignment";
  return "positional";
}

function snapshotArguments(args) {
  if (!Array.isArray(args)) throw new Error("campaign arguments must be a dense array");
  const snapshot = [];
  for (let index = 0; index < args.length; index += 1) {
    if (!Object.hasOwn(args, index)) {
      throw new Error("campaign arguments must be a dense array");
    }
    const value = args[index];
    if (typeof value !== "string" || value.includes("\0")) {
      throw new Error("campaign arguments must be NUL-free strings");
    }
    snapshot.push(value);
  }
  return snapshot;
}

export function projectCommandEvidence(command, args) {
  if (typeof command !== "string" || command.length === 0 || command.includes("\0")) {
    throw new Error("campaign command must be a non-empty NUL-free string");
  }
  const snapshot = snapshotArguments(args);
  return {
    argumentCount: snapshot.length,
    argumentShape: snapshot.map(argumentShape),
    executable: command,
    rawArgumentsRecorded: false,
  };
}

function safeOwnerMetadata(owner, includeTokenFingerprint = false) {
  if (!owner || typeof owner !== "object" || Array.isArray(owner))
    return { state: "invalid-owner" };
  const allowedKeys = [
    "campaignId",
    "deadline",
    "lockTokenSha256",
    "operation",
    "ownerPid",
    "startedAt",
    "status",
    "updatedAt",
    "worktree",
  ];
  const safe = Object.fromEntries(
    allowedKeys
      .filter((key) => typeof owner[key] === "string" || typeof owner[key] === "number")
      .map((key) => [key, owner[key]]),
  );
  if (includeTokenFingerprint && typeof owner.token === "string") {
    safe.tokenSha256 = sha256Buffer(owner.token);
  }
  return safe;
}

function safeOwnerDescription(ownerPath, includeTokenFingerprint = false) {
  if (!existsSync(ownerPath)) return { state: "missing-owner" };
  try {
    return safeOwnerMetadata(JSON.parse(readFileSync(ownerPath, "utf8")), includeTokenFingerprint);
  } catch {
    return { state: "invalid-owner" };
  }
}

function mutationGuardPath(lockPath) {
  return `${lockPath}.mutation`;
}

function acquireMutationGuard(lockPath, operation, lockToken) {
  const guardPath = mutationGuardPath(lockPath);
  const guardOwner = {
    lockTokenSha256: sha256Buffer(lockToken),
    operation,
    ownerPid: process.pid,
    startedAt: new Date().toISOString(),
    token: randomUUID(),
  };
  try {
    mkdirSync(guardPath);
  } catch (error) {
    if (error?.code === "EEXIST") {
      const detail = safeOwnerDescription(join(guardPath, "owner.json"), true);
      throw new Error(`host lock mutation guard already exists: ${JSON.stringify(detail)}`);
    }
    throw error;
  }
  atomicWrite(join(guardPath, "owner.json"), `${JSON.stringify(guardOwner, null, 2)}\n`);
  return { guardPath, token: guardOwner.token };
}

function releaseMutationGuard({ guardPath, token }) {
  const owner = JSON.parse(readFileSync(join(guardPath, "owner.json"), "utf8"));
  if (owner.token !== token) {
    throw new Error("refusing to release a lock mutation guard with a different owner token");
  }
  rmSync(guardPath, { recursive: true });
}

function withLockMutation(lockPath, operation, lockToken, mutation) {
  const guard = acquireMutationGuard(lockPath, operation, lockToken);
  try {
    return mutation();
  } finally {
    releaseMutationGuard(guard);
  }
}

function acquireLock(lockPath, owner) {
  return withLockMutation(lockPath, "acquire", owner.token, () => {
    let lockCreated = false;
    try {
      mkdirSync(lockPath);
      lockCreated = true;
    } catch (error) {
      if (error?.code === "EEXIST") {
        const detail = safeOwnerDescription(join(lockPath, "owner.json"));
        throw new Error(`host lock already exists: ${JSON.stringify(detail)}`);
      }
      throw error;
    }
    try {
      atomicWrite(join(lockPath, "owner.json"), `${JSON.stringify(owner, null, 2)}\n`);
    } catch (error) {
      if (lockCreated) rmSync(lockPath, { recursive: true });
      throw error;
    }
  });
}

function releaseLock(lockPath, token) {
  return withLockMutation(lockPath, "release", token, () => {
    const ownerPath = join(lockPath, "owner.json");
    const owner = JSON.parse(readFileSync(ownerPath, "utf8"));
    if (owner.token !== token) {
      throw new Error("refusing to release a lock with a different owner token");
    }
    rmSync(lockPath, { recursive: true });
  });
}

function updateOwnedLock(lockPath, token, updates) {
  return withLockMutation(lockPath, "update", token, () => {
    const ownerPath = join(lockPath, "owner.json");
    const owner = JSON.parse(readFileSync(ownerPath, "utf8"));
    if (owner.token !== token) {
      throw new Error("refusing to update a lock with a different owner token");
    }
    atomicWrite(ownerPath, `${JSON.stringify({ ...owner, ...updates }, null, 2)}\n`);
  });
}

function processGroupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

async function waitForProcessGroupAbsence(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (processGroupExists(pid) && Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, PROCESS_GROUP_POLL_MS));
  }
  return !processGroupExists(pid);
}

async function terminateProcessGroup(pid) {
  if (!processGroupExists(pid)) return;
  terminateGroup(pid, "SIGTERM");
  if (await waitForProcessGroupAbsence(pid, PROCESS_TERM_GRACE_MS)) return;
  terminateGroup(pid, "SIGKILL");
  if (!(await waitForProcessGroupAbsence(pid, PROCESS_KILL_CONFIRMATION_MS))) {
    throw new Error(`process group ${pid} survived SIGKILL`);
  }
}

function terminateGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function writeBounded(file, chunk, state) {
  if (state.written >= MAX_OUTPUT_BYTES) {
    state.truncated = true;
    return;
  }
  const remaining = MAX_OUTPUT_BYTES - state.written;
  const kept = chunk.subarray(0, remaining);
  writeSync(file, kept);
  state.written += kept.length;
  if (kept.length !== chunk.length) state.truncated = true;
}

async function runGatedChild() {
  process.send?.({ type: "ready" });
  process.once("message", (message) => {
    if (
      message?.type !== "start" ||
      typeof message.cwd !== "string" ||
      message.cwd.includes("\0")
    ) {
      process.exit(125);
      return;
    }
    let dispatchArgs;
    try {
      projectCommandEvidence(message.command, message.args);
      dispatchArgs = snapshotArguments(message.args);
    } catch {
      process.exit(125);
      return;
    }
    const command = spawn(message.command, dispatchArgs, {
      cwd: message.cwd,
      env: process.env,
      stdio: ["ignore", "inherit", "inherit"],
    });
    command.once("exit", (code, signal) => {
      process.send?.({ code, signal, type: "result" });
      process.exitCode = code ?? (signal ? 128 : 125);
      process.disconnect?.();
    });
    command.once("error", (error) => {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      process.send?.({ code: 127, signal: null, type: "result" });
      process.exitCode = 127;
      process.disconnect?.();
    });
  });
}

export async function runCampaignCommand({
  args,
  beforeResourceAudit = () => {},
  command,
  cwd,
  inspectDocker = false,
  lockPath,
  openFile = openSync,
  outputWriter = writeBounded,
  registry,
  resourceSnapshot = dockerResourceSnapshot,
  runId,
  signalEmitter = process,
  timeoutMs,
}) {
  if (!/^[a-z0-9][a-z0-9-]+$/.test(runId)) throw new Error(`invalid run ID: ${runId}`);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error("timeoutMs must be positive");
  if (typeof cwd !== "string" || cwd.length === 0 || cwd.includes("\0")) {
    throw new Error("campaign cwd must be a non-empty NUL-free string");
  }
  const dispatchArgs = Object.freeze(snapshotArguments(args));
  const commandEvidence = projectCommandEvidence(command, dispatchArgs);
  const runDirectory = join(registry, "runs", runId);
  const stdoutPath = join(runDirectory, "stdout.log");
  const stderrPath = join(runDirectory, "stderr.log");
  const stdoutState = { truncated: false, written: 0 };
  const stderrState = { truncated: false, written: 0 };
  const token = randomUUID();
  const useLock = lockPath !== null;
  let commit;
  let context;
  let deadline;
  let environment;
  let startedAtMs;
  let lockOwned = false;
  let lockOwner;
  let runner;
  let timeout;
  let interruptedSignal = null;
  let childResult = null;
  let commandDispatched = false;
  let captureError = null;
  let outputLimitExceeded = false;
  let startRecorded = false;
  let startupTimeout;
  let stderrClosed = false;
  let stdoutClosed = false;
  let timedOut = false;
  let retainLock = false;
  let resourceInspectionError = null;
  let resourceLeaks = { containers: [], networks: [], volumes: [] };
  let resourcesBefore = null;
  let resourceAuditCompleted = !inspectDocker;
  let runDirectoryOwned = false;
  let stderrFile;
  let stdoutFile;
  let terminationFailure = null;
  let terminationPromise = null;
  let terminationRequested = false;
  let cleanupFailure = null;
  let executionFailed = false;
  let executionFailure;
  let executionResult;
  const signalHandlers = new Map();
  const rememberCleanupFailure = (error) => {
    cleanupFailure ??= error instanceof Error ? error : new Error(String(error));
  };

  const requestTermination = () => {
    terminationRequested = true;
    if (!runner?.pid || terminationPromise || terminationFailure) return;
    terminationPromise = terminateProcessGroup(runner.pid).catch((error) => {
      terminationFailure = error instanceof Error ? error : new Error(String(error));
    });
  };
  const ensureProcessGroupAbsent = async () => {
    if (!runner?.pid) return;
    if (processGroupExists(runner.pid)) requestTermination();
    while (terminationPromise) {
      const activeTermination = terminationPromise;
      await activeTermination;
      if (terminationPromise === activeTermination) terminationPromise = null;
      if (terminationFailure) throw terminationFailure;
      if (processGroupExists(runner.pid)) requestTermination();
    }
    if (processGroupExists(runner.pid)) {
      throw new Error(`process group ${runner.pid} remained after termination`);
    }
  };
  const refuseInterruptedDispatch = () => {
    if (interruptedSignal) {
      throw new Error(`campaign interrupted by ${interruptedSignal} before command dispatch`);
    }
    if (terminationRequested) {
      throw new Error("campaign termination began before command dispatch");
    }
  };

  try {
    for (const signal of ["SIGINT", "SIGTERM"]) {
      const handler = () => {
        interruptedSignal ??= signal;
        requestTermination();
      };
      signalHandlers.set(signal, handler);
      signalEmitter.on(signal, handler);
    }
    await Promise.resolve();
    refuseInterruptedDispatch();

    try {
      mkdirSync(runDirectory);
      runDirectoryOwned = true;
    } catch (error) {
      if (error?.code === "EEXIST") {
        throw new Error(`run directory already exists: ${runDirectory}`);
      }
      throw error;
    }
    stdoutFile = openFile(stdoutPath, "wx", 0o600);
    stderrFile = openFile(stderrPath, "wx", 0o600);

    commit = commitAt(cwd);
    context = contextEvidence(registry, cwd);
    environment = environmentEvidence();
    startedAtMs = Date.now();
    deadline = new Date(startedAtMs + timeoutMs).toISOString();
    refuseInterruptedDispatch();
    if (useLock) {
      lockOwner = {
        campaignId: basename(registry),
        command: commandEvidence,
        deadline,
        ownerPid: process.pid,
        token,
        worktree: cwd,
      };
      acquireLock(lockPath, lockOwner);
      lockOwned = true;
      if (inspectDocker) resourcesBefore = resourceSnapshot(cwd);
    }
    refuseInterruptedDispatch();

    runner = spawn(process.execPath, [fileURLToPath(import.meta.url), "--gated-child"], {
      cwd,
      detached: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    const abortForCaptureError = (error) => {
      captureError ??= error instanceof Error ? error.message : String(error);
      requestTermination();
    };
    const capture = (file, chunk, state) => {
      try {
        outputWriter(file, chunk, state);
      } catch (error) {
        abortForCaptureError(error);
        return;
      }
      if (state.truncated && !outputLimitExceeded) {
        outputLimitExceeded = true;
        requestTermination();
      }
    };
    runner.stdout.on("data", (chunk) => capture(stdoutFile, chunk, stdoutState));
    runner.stderr.on("data", (chunk) => capture(stderrFile, chunk, stderrState));
    runner.stdout.on("error", abortForCaptureError);
    runner.stderr.on("error", abortForCaptureError);
    runner.on("error", abortForCaptureError);
    runner.on("message", (message) => {
      if (message?.type === "result") childResult = message;
    });

    await new Promise((resolveReady, rejectReady) => {
      let settled = false;
      const cleanupReadyListeners = () => {
        clearTimeout(startupTimeout);
        runner.removeListener("close", onClose);
        runner.removeListener("error", onError);
        runner.removeListener("message", onMessage);
      };
      const settleReady = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanupReadyListeners();
        callback(value);
      };
      const onClose = (code, signal) => {
        settleReady(
          rejectReady,
          new Error(`campaign child closed before ready: code=${code} signal=${signal}`),
        );
      };
      const onError = (error) => settleReady(rejectReady, error);
      const onMessage = (message) => {
        if (message?.type === "ready") settleReady(resolveReady);
      };
      startupTimeout = setTimeout(
        () => {
          settleReady(
            rejectReady,
            new Error("campaign child did not become ready before its deadline"),
          );
        },
        Math.max(1, startedAtMs + timeoutMs - Date.now()),
      );
      runner.once("close", onClose);
      runner.once("error", onError);
      runner.on("message", onMessage);
    });

    refuseInterruptedDispatch();
    writeRunEvent(runDirectory, "command-started.json", {
      command: commandEvidence,
      commit,
      context,
      cwd,
      deadline,
      environment,
      event: "command_started",
      lockPath,
      os: { arch: process.arch, platform: process.platform, release: osRelease() },
      outputPolicy: {
        commandMustNotEmitSecrets: true,
        mode: "verbatim-bounded",
      },
      pid: runner.pid,
      processGroup: runner.pid,
      runId,
      startedAt: new Date(startedAtMs).toISOString(),
      toolchain: { node: process.version },
    });
    startRecorded = true;

    refuseInterruptedDispatch();
    const closedPromise = new Promise((resolveClosed) => {
      runner.once("close", (code, signal) => resolveClosed({ code, signal }));
    });
    commandDispatched = true;
    runner.send({ args: dispatchArgs, command, cwd, type: "start" });
    timeout = setTimeout(
      () => {
        timedOut = true;
        requestTermination();
      },
      Math.max(1, startedAtMs + timeoutMs - Date.now()),
    );

    const closed = await closedPromise;
    clearTimeout(timeout);
    clearTimeout(startupTimeout);
    await ensureProcessGroupAbsent();
    fsyncSync(stdoutFile);
    fsyncSync(stderrFile);
    closeSync(stdoutFile);
    stdoutClosed = true;
    closeSync(stderrFile);
    stderrClosed = true;

    const exitCode = childResult?.code ?? closed.code;
    const signal = interruptedSignal ?? childResult?.signal ?? closed.signal;
    let classification = "command_failure";
    if (interruptedSignal) classification = "interrupted";
    else if (captureError) classification = "infrastructure_failure";
    else if (outputLimitExceeded) classification = "resource_abort";
    else if (timedOut) classification = "timeout";
    else if (exitCode === 0) classification = "success";
    try {
      beforeResourceAudit();
    } catch (error) {
      resourceInspectionError = error instanceof Error ? error.message : String(error);
      throw error;
    }
    if (inspectDocker && resourcesBefore) {
      try {
        resourceLeaks = newDockerResources(resourcesBefore, resourceSnapshot(cwd));
        retainLock = hasDockerLeaks(resourceLeaks);
      } catch (error) {
        resourceInspectionError = error instanceof Error ? error.message : String(error);
        retainLock = true;
      } finally {
        resourceAuditCompleted = true;
      }
      if (retainLock) classification = "infrastructure_failure";
    }
    const finishedAtMs = Date.now();
    const result = { classification, exitCode, signal };
    if (lockOwned && retainLock) {
      updateOwnedLock(lockPath, token, {
        resourceInspectionError,
        resourceLeaks,
        status: "resource-audit-failed",
        updatedAt: new Date(finishedAtMs).toISOString(),
      });
    } else if (lockOwned) {
      releaseLock(lockPath, token);
      lockOwned = false;
    }
    writeRunEvent(runDirectory, "command-finished.json", {
      ...result,
      artifacts: artifactEvidence(runDirectory),
      captureError,
      cleanup: {
        lockReleased: useLock && !retainLock,
        resourceInspectionError,
        resourceLeaks,
      },
      durationMs: finishedAtMs - startedAtMs,
      event: "command_finished",
      finishedAt: new Date(finishedAtMs).toISOString(),
      runId,
      stderr: {
        bytes: stderrState.written,
        path: stderrPath,
        sha256: sha256File(stderrPath),
        truncated: stderrState.truncated,
      },
      stdout: {
        bytes: stdoutState.written,
        path: stdoutPath,
        sha256: sha256File(stdoutPath),
        truncated: stdoutState.truncated,
      },
    });
    executionResult = result;
  } catch (error) {
    executionFailed = true;
    executionFailure = error;
  } finally {
    clearTimeout(timeout);
    clearTimeout(startupTimeout);
    try {
      await ensureProcessGroupAbsent();
    } catch (error) {
      rememberCleanupFailure(error);
    }
    if (stdoutFile !== undefined && !stdoutClosed) {
      try {
        closeSync(stdoutFile);
        stdoutClosed = true;
      } catch (error) {
        rememberCleanupFailure(error);
      }
    }
    if (stderrFile !== undefined && !stderrClosed) {
      try {
        closeSync(stderrFile);
        stderrClosed = true;
      } catch (error) {
        rememberCleanupFailure(error);
      }
    }
    if (lockOwned && commandDispatched && !resourceAuditCompleted) {
      retainLock = true;
      resourceInspectionError ??=
        cleanupFailure?.message ??
        "command left runner control before its post-command resource audit";
      try {
        updateOwnedLock(lockPath, token, {
          resourceInspectionError,
          resourceLeaks,
          status: "resource-audit-incomplete",
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // Retain the original owner record and directory; never unlock an unaudited command.
      }
    }
    if (lockOwned && !retainLock) {
      try {
        releaseLock(lockPath, token);
        lockOwned = false;
      } catch (error) {
        rememberCleanupFailure(error);
      }
    }
    if (runDirectoryOwned && !startRecorded) {
      try {
        rmSync(runDirectory, { force: true, recursive: true });
      } catch (error) {
        rememberCleanupFailure(error);
      }
    }
    for (const [signal, handler] of signalHandlers) {
      try {
        signalEmitter.removeListener(signal, handler);
      } catch (error) {
        rememberCleanupFailure(error);
      }
    }
  }
  if (cleanupFailure) throw cleanupFailure;
  if (executionFailed) throw executionFailure;
  return executionResult;
}

async function runCli() {
  const separator = process.argv.indexOf("--");
  if (separator !== 7) {
    throw new Error(
      "usage: campaign-runner.mjs <registry> <lock-path|-> <run-id> <timeout-seconds> <cwd> -- <command> [args...]",
    );
  }
  const [registry, rawLockPath, runId, rawTimeoutSeconds, cwd] = process.argv.slice(2, separator);
  const [command, ...args] = process.argv.slice(separator + 1);
  if (!command) throw new Error("campaign command is required");
  const result = await runCampaignCommand({
    args,
    command,
    cwd: resolve(cwd),
    inspectDocker: rawLockPath !== "-",
    lockPath: rawLockPath === "-" ? null : resolve(rawLockPath),
    registry: resolve(registry),
    runId,
    timeoutMs: Number(rawTimeoutSeconds) * 1_000,
  });
  process.exitCode =
    result.classification === "success"
      ? 0
      : result.exitCode && result.exitCode !== 0
        ? result.exitCode
        : 1;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain && process.argv[2] === "--gated-child") {
  await runGatedChild();
} else if (isMain && process.argv[2] === "--merge") {
  const registry = process.argv[3];
  if (!registry || process.argv.length !== 4) {
    throw new Error("usage: campaign-runner.mjs --merge <registry>");
  }
  const events = mergeCommandEvents(resolve(registry));
  process.stdout.write(`${JSON.stringify({ events: events.length })}\n`);
} else if (isMain) {
  await runCli();
}
