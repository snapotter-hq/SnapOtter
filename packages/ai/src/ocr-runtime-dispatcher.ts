import { type ChildProcess, type StdioOptions, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fchmodSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  type Stats,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  type ActiveRuntimeDescriptor,
  OCR_RUNTIME_PROTOCOL_VERSION,
  type OcrRuntimeActivationIdentity,
  type RuntimeStateOptions,
  readActiveRuntime,
  readCommittedOcrRuntimeActivationIdentity,
  readPendingOcrRuntimeActivationIdentity,
  readPendingOcrRuntimeForHandoff,
  resolveAiDataDir,
} from "./runtime-state.js";

export type OcrRuntimeScript = "ocr" | "ocr_pdf";
type OcrRuntimeProtocolScript = OcrRuntimeScript | "smoke";

export interface OcrRuntimeRunOptions extends RuntimeStateOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface OcrRuntimeRunResult {
  result: unknown;
  stderr: string;
  runtime: Readonly<{
    generation: string;
    artifactVersion: string;
    target: ActiveRuntimeDescriptor["artifact"]["target"];
    providers: readonly string[];
    models: Readonly<Record<string, string>>;
  }>;
}

interface CapturedRuntime {
  generation: string;
  artifactVersion: string;
  artifactSha256: string;
  signedIndexSha256: string;
  target: ActiveRuntimeDescriptor["artifact"]["target"];
  runtimeRoot: string;
  pythonPath: string;
  entrypoint: string;
  providers: readonly string[];
  models: Readonly<Record<string, string>>;
  activationDescriptorSha256: string;
  fingerprint: string;
}

interface ProtocolSuccess {
  protocolVersion: number;
  requestId: string;
  ok: true;
  result: unknown;
}

interface ProtocolFailure {
  protocolVersion: number;
  requestId: string;
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const MAX_STDOUT_BYTES = 8 * 1024 * 1024;
const MAX_STDERR_BYTES = 1024 * 1024;
const MAX_REQUEST_BYTES = 64 * 1024;
const TERMINATION_GRACE_MS = 1_000;
const LEASE_HEARTBEAT_MS = 5_000;
const ACTIVATION_WATCH_INTERVAL_MS = 10_000;
const PROCESS_NONCE = randomUUID();
const SHARED_STATE_DIRECTORY_MODE = 0o2770;
const SHARED_STATE_FILE_MODE = 0o660;
const KERNEL_LOCK_BUSY_EXIT_CODE = 73;
const SAFE_STATE_COMPONENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function abortError(message = "Accurate OCR runtime request was aborted"): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortedRecord(value: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))),
  );
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalJsonValue(entry)]),
  );
}

function captureDescriptor(descriptor: ActiveRuntimeDescriptor): CapturedRuntime {
  const models = sortedRecord(descriptor.artifact.models);
  const providers = Object.freeze([...descriptor.capabilities.providers]);
  const identity = {
    generation: descriptor.generation,
    artifactVersion: descriptor.artifact.version,
    artifactSha256: descriptor.artifact.sha256,
    signedIndexSha256: descriptor.artifact.signedIndex.sha256,
    target: descriptor.artifact.target,
    runtimeRoot: descriptor.runtime.root,
    pythonPath: descriptor.runtime.pythonPath,
    entrypoint: descriptor.runtime.entrypoint,
    providers,
    models,
    activationDescriptorSha256: descriptor.activationDescriptorSha256,
  };

  return Object.freeze({
    ...identity,
    // Reuse is valid only for the exact descriptor captured when the child was
    // spawned. Canonicalizing the full descriptor covers execution hashes,
    // model paths/sizes, compatibility, and activation metadata without being
    // sensitive to JSON object key insertion order.
    fingerprint: JSON.stringify(canonicalJsonValue(descriptor)),
  });
}

function descriptorMatches(
  captured: CapturedRuntime,
  descriptor: ActiveRuntimeDescriptor,
): boolean {
  return captureDescriptor(descriptor).fingerprint === captured.fingerprint;
}

function writeAtomicJson(path: string, value: unknown): void {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: SHARED_STATE_FILE_MODE,
    });
    chmodSync(temporaryPath, SHARED_STATE_FILE_MODE);
    renameSync(temporaryPath, path);
  } catch (error) {
    try {
      rmSync(temporaryPath, { force: true });
    } catch {
      // Preserve the original atomic-write failure when the parent path itself
      // disappeared or stopped being a directory.
    }
    throw error;
  }
}

function ensureSafeLeaseDirectory(aiDataDir: string, generation: string): string {
  const createdRoot = mkdirSync(aiDataDir, {
    recursive: true,
    mode: SHARED_STATE_DIRECTORY_MODE,
  });
  if (createdRoot) chmodSync(aiDataDir, SHARED_STATE_DIRECTORY_MODE);
  const components = [
    aiDataDir,
    join(aiDataDir, "v3"),
    join(aiDataDir, "v3", "leases"),
    join(aiDataDir, "v3", "leases", "ocr"),
    join(aiDataDir, "v3", "leases", "ocr", generation),
  ];

  for (const component of components) {
    let stats: ReturnType<typeof lstatSync>;
    try {
      stats = lstatSync(component);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      let created = false;
      try {
        mkdirSync(component, { mode: SHARED_STATE_DIRECTORY_MODE });
        created = true;
      } catch (mkdirError) {
        // Another API replica may create the shared generation directory
        // between lstat() and mkdir(). Revalidate the winner below, including
        // the symlink check, instead of failing an otherwise safe lease.
        if ((mkdirError as NodeJS.ErrnoException).code !== "EEXIST") throw mkdirError;
      }
      if (created) chmodSync(component, SHARED_STATE_DIRECTORY_MODE);
      stats = lstatSync(component);
    }

    if (stats.isSymbolicLink()) {
      throw new Error(`OCR runtime lease path component is a symbolic link: ${component}`);
    }
    if (!stats.isDirectory()) {
      throw new Error(`OCR runtime lease path component is not a directory: ${component}`);
    }
  }

  return components.at(-1) as string;
}

function ensureSafeGenerationLockDirectory(aiDataDir: string, family: string): string {
  if (!SAFE_STATE_COMPONENT_PATTERN.test(family)) {
    throw new Error("OCR runtime returned an unsafe family identifier");
  }

  const createdRoot = mkdirSync(aiDataDir, {
    recursive: true,
    mode: SHARED_STATE_DIRECTORY_MODE,
  });
  if (createdRoot) chmodSync(aiDataDir, SHARED_STATE_DIRECTORY_MODE);
  const components = [
    aiDataDir,
    join(aiDataDir, "v3"),
    join(aiDataDir, "v3", "locks"),
    join(aiDataDir, "v3", "locks", "generations"),
    join(aiDataDir, "v3", "locks", "generations", family),
  ];

  for (const component of components) {
    let stats: ReturnType<typeof lstatSync>;
    try {
      stats = lstatSync(component);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      let created = false;
      try {
        mkdirSync(component, { mode: SHARED_STATE_DIRECTORY_MODE });
        created = true;
      } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== "EEXIST") throw mkdirError;
      }
      if (created) chmodSync(component, SHARED_STATE_DIRECTORY_MODE);
      stats = lstatSync(component);
    }

    if (stats.isSymbolicLink()) {
      throw new Error(`OCR runtime lock path component is a symbolic link: ${component}`);
    }
    if (!stats.isDirectory()) {
      throw new Error(`OCR runtime lock path component is not a directory: ${component}`);
    }
  }

  return components.at(-1) as string;
}

function assertGenerationLockFileIdentity(
  path: string,
  opened: Stats,
  linked: Stats,
  expected?: Readonly<{ dev: number; ino: number }>,
): void {
  if (
    !opened.isFile() ||
    opened.nlink !== 1 ||
    linked.isSymbolicLink() ||
    !linked.isFile() ||
    linked.nlink !== 1 ||
    opened.dev !== linked.dev ||
    opened.ino !== linked.ino ||
    (expected !== undefined &&
      (opened.dev !== expected.dev ||
        opened.ino !== expected.ino ||
        linked.dev !== expected.dev ||
        linked.ino !== expected.ino))
  ) {
    throw new Error(`OCR runtime generation lock is not a private regular file: ${path}`);
  }
}

/**
 * Apply a nonblocking shared POSIX flock to an inherited descriptor. The lock
 * remains attached to Node's open file description after the helper exits and
 * is released by closeSync() or process death.
 */
function acquireKernelGenerationReadLock(fd: number): void {
  const stdio: StdioOptions = ["ignore", "ignore", "pipe", fd];
  const options = {
    env: { LANG: "C.UTF-8", PATH: process.env.PATH },
    stdio,
    timeout: 5_000,
  } as const;
  const result = existsSync("/usr/bin/flock")
    ? spawnSync(
        "/usr/bin/flock",
        ["--shared", "--nonblock", "--conflict-exit-code", String(KERNEL_LOCK_BUSY_EXIT_CODE), "3"],
        options,
      )
    : spawnSync(
        process.env.SNAPOTTER_SYSTEM_PYTHON || "/usr/bin/python3",
        [
          "-c",
          `import fcntl, sys
try:
    fcntl.flock(3, fcntl.LOCK_SH | fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit(${KERNEL_LOCK_BUSY_EXIT_CODE})`,
        ],
        options,
      );

  if (result.error) throw result.error;
  if (result.status === 0) return;
  if (result.status === KERNEL_LOCK_BUSY_EXIT_CODE) {
    throw new Error("OCR runtime generation lock is busy");
  }
  throw new Error(
    `OCR runtime generation-lock helper failed with status ${String(result.status)}: ${result.stderr?.toString().trim() || "no error output"}`,
  );
}

function acquireGenerationReadLock(aiDataDir: string, family: string, generation: string): number {
  if (!SAFE_STATE_COMPONENT_PATTERN.test(generation)) {
    throw new Error("OCR runtime returned an unsafe generation identifier");
  }
  const directory = ensureSafeGenerationLockDirectory(aiDataDir, family);
  const path = join(directory, `${generation}.lock`);
  const fd = openSync(
    path,
    fsConstants.O_RDWR | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW,
    SHARED_STATE_FILE_MODE,
  );
  try {
    const opened = fstatSync(fd);
    const linked = lstatSync(path);
    assertGenerationLockFileIdentity(path, opened, linked);
    if ((opened.mode & 0o777) !== SHARED_STATE_FILE_MODE) {
      try {
        fchmodSync(fd, SHARED_STATE_FILE_MODE);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        // Another replica UID may own this permanent inode while fsGroup grants
        // O_RDWR access. Never tolerate a lock file accessible to other users.
        if ((code !== "EPERM" && code !== "EACCES") || (opened.mode & 0o007) !== 0) {
          throw error;
        }
      }
    }
    const identity = { dev: opened.dev, ino: opened.ino };
    acquireKernelGenerationReadLock(fd);
    assertGenerationLockFileIdentity(path, fstatSync(fd), lstatSync(path), identity);
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

class GenerationLease {
  readonly path: string;
  private readonly createdAt: string;
  private readonly generation: string;
  private readonly requestNonce: string;
  private generationLockFd: number | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private closed = false;
  private heartbeatFailure: Error | null = null;
  private failureHandler: ((error: Error) => void) | null = null;

  constructor(aiDataDir: string, generation: string) {
    if (!SAFE_STATE_COMPONENT_PATTERN.test(generation)) {
      throw new Error("OCR runtime returned an unsafe generation identifier");
    }

    this.generation = generation;
    this.requestNonce = randomUUID();
    this.createdAt = new Date().toISOString();
    const directory = ensureSafeLeaseDirectory(aiDataDir, generation);
    this.generationLockFd = acquireGenerationReadLock(aiDataDir, "ocr", generation);
    try {
      this.path = join(directory, `${process.pid}-${PROCESS_NONCE}-${this.requestNonce}.json`);
      this.writeHeartbeat();
    } catch (error) {
      closeSync(this.generationLockFd);
      this.generationLockFd = null;
      throw error;
    }
    this.heartbeatTimer = setInterval(() => {
      try {
        this.writeHeartbeat();
      } catch (error) {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
        this.heartbeatFailure = new Error(
          `OCR runtime lease heartbeat failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        this.failureHandler?.(this.heartbeatFailure);
      }
    }, LEASE_HEARTBEAT_MS);
    this.heartbeatTimer.unref();
  }

  private writeHeartbeat(): void {
    if (this.closed) return;
    writeAtomicJson(this.path, {
      schemaVersion: 2,
      family: "ocr",
      generation: this.generation,
      pid: process.pid,
      processNonce: PROCESS_NONCE,
      requestNonce: this.requestNonce,
      createdAt: this.createdAt,
      heartbeatAt: new Date().toISOString(),
    });
  }

  setFailureHandler(handler: ((error: Error) => void) | null): void {
    this.failureHandler = handler;
    if (handler && this.heartbeatFailure) handler(this.heartbeatFailure);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.failureHandler = null;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    try {
      rmSync(this.path, { force: true });
    } finally {
      if (this.generationLockFd !== null) {
        const fd = this.generationLockFd;
        this.generationLockFd = null;
        closeSync(fd);
      }
    }
  }
}

function buildRuntimeEnv(runtime: CapturedRuntime): Readonly<Record<string, string>> {
  return Object.freeze({
    LANG: "C.UTF-8",
    HF_HUB_OFFLINE: "1",
    NO_PROXY: "*",
    PIP_NO_INDEX: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONUNBUFFERED: "1",
    PYTHONNOUSERSITE: "1",
    SNAPOTTER_ALLOW_MODEL_DOWNLOAD: "0",
    SNAPOTTER_NETWORK_DISABLED: "1",
    SNAPOTTER_OCR_ARTIFACT_SHA256: runtime.artifactSha256,
    SNAPOTTER_OCR_ARTIFACT_VERSION: runtime.artifactVersion,
    SNAPOTTER_OCR_GENERATION: runtime.generation,
    SNAPOTTER_OCR_MODELS_JSON: JSON.stringify(runtime.models),
    SNAPOTTER_OCR_PROTOCOL_VERSION: String(OCR_RUNTIME_PROTOCOL_VERSION),
    SNAPOTTER_OCR_PROVIDERS_JSON: JSON.stringify(runtime.providers),
    SNAPOTTER_OCR_RUNTIME_TARGET: runtime.target,
    SNAPOTTER_RUNTIME_ROOT: runtime.runtimeRoot,
    TRANSFORMERS_OFFLINE: "1",
    no_proxy: "*",
  });
}

function validateRequest(script: OcrRuntimeScript, args: readonly string[]): void {
  if (script !== "ocr" && script !== "ocr_pdf") {
    throw new Error(`Unsupported OCR runtime script "${String(script)}"`);
  }
  if (!Array.isArray(args) || !args.every((arg) => typeof arg === "string")) {
    throw new Error("OCR runtime arguments must be strings");
  }
}

function parseResponse(stdout: string, requestId: string): ProtocolSuccess | ProtocolFailure {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    throw new Error("Accurate OCR runtime returned a malformed JSON response");
  }

  if (
    !isRecord(parsed) ||
    parsed.protocolVersion !== OCR_RUNTIME_PROTOCOL_VERSION ||
    parsed.requestId !== requestId ||
    typeof parsed.ok !== "boolean"
  ) {
    throw new Error("Accurate OCR runtime returned a mismatched response envelope");
  }

  if (parsed.ok === true) {
    if (!("result" in parsed)) {
      throw new Error("Accurate OCR runtime returned a malformed success response");
    }
    return parsed as unknown as ProtocolSuccess;
  }

  if (
    !isRecord(parsed.error) ||
    typeof parsed.error.code !== "string" ||
    parsed.error.code.length === 0 ||
    typeof parsed.error.message !== "string" ||
    parsed.error.message.length === 0
  ) {
    throw new Error("Accurate OCR runtime returned a malformed error response");
  }
  return parsed as unknown as ProtocolFailure;
}

interface PreparedRequest {
  requestId: string;
  serialized: string;
  timeoutMs: number;
}

interface PendingRequest extends PreparedRequest {
  signal?: AbortSignal;
  lease: GenerationLease;
  timeoutTimer: NodeJS.Timeout | null;
  abortHandler: (() => void) | null;
  settled: boolean;
  resolve: (result: OcrRuntimeRunResult) => void;
  reject: (error: Error) => void;
}

function timeoutError(timeoutMs: number): Error {
  return new Error(`Accurate OCR runtime timed out after ${timeoutMs}ms`);
}

function resolveTimeoutMs(options: OcrRuntimeRunOptions): number {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("OCR runtime timeout must be a positive number");
  }
  return timeoutMs;
}

function remainingTimeoutMs(deadline: number, totalTimeoutMs: number): number {
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw timeoutError(totalTimeoutMs);
  return Math.max(1, Math.ceil(remaining));
}

function awaitWithDeadline<T>(
  promise: Promise<T>,
  deadline: number,
  totalTimeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError());
  let remaining: number;
  try {
    remaining = remainingTimeoutMs(deadline, totalTimeoutMs);
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise<T>((resolvePromise, rejectPromise) => {
    let settled = false;
    const finish = (outcome: "resolve" | "reject", value: T | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      signal?.removeEventListener("abort", onAbort);
      if (outcome === "resolve") resolvePromise(value as T);
      else rejectPromise(value);
    };
    const onAbort = () => finish("reject", abortError());
    const timeoutTimer = setTimeout(
      () => finish("reject", timeoutError(totalTimeoutMs)),
      remaining,
    );
    timeoutTimer.unref();
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => finish("resolve", value),
      (error) => finish("reject", error instanceof Error ? error : new Error(String(error))),
    );
  });
}

function prepareRequest(
  script: OcrRuntimeProtocolScript,
  args: readonly string[],
  options: OcrRuntimeRunOptions,
): PreparedRequest {
  const timeoutMs = resolveTimeoutMs(options);

  const requestId = randomUUID();
  const serialized = `${JSON.stringify({
    protocolVersion: OCR_RUNTIME_PROTOCOL_VERSION,
    requestId,
    script,
    args,
  })}\n`;
  if (Buffer.byteLength(serialized) > MAX_REQUEST_BYTES) {
    throw new Error(`OCR runtime request exceeded ${MAX_REQUEST_BYTES} bytes`);
  }
  return { requestId, serialized, timeoutMs };
}

class OcrRuntimeManager {
  readonly child: ChildProcess;
  readonly closed: Promise<void>;
  private readonly runtime: CapturedRuntime;
  private readonly onClosed: (manager: OcrRuntimeManager) => void;
  private readonly queue: PendingRequest[] = [];
  private current: PendingRequest | null = null;
  private stdoutBuffer = Buffer.alloc(0);
  private processStderrChunks: Buffer[] = [];
  private processStderrBytes = 0;
  private accepting = true;
  private ending = false;
  private didClose = false;
  private fatalError: Error | null = null;
  private forceKillTimer: NodeJS.Timeout | null = null;
  private resolveClosed: () => void = () => {};

  constructor(runtime: CapturedRuntime, onClosed: (manager: OcrRuntimeManager) => void) {
    this.runtime = runtime;
    this.onClosed = onClosed;
    this.closed = new Promise<void>((resolvePromise) => {
      this.resolveClosed = resolvePromise;
    });
    this.child = spawn(runtime.pythonPath, [runtime.entrypoint], {
      cwd: dirname(runtime.entrypoint),
      env: buildRuntimeEnv(runtime),
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.attachProcessListeners();
  }

  matches(runtime: CapturedRuntime): boolean {
    return this.runtime.fingerprint === runtime.fingerprint;
  }

  matchesActivation(identity: OcrRuntimeActivationIdentity): boolean {
    return (
      this.runtime.generation === identity.generation &&
      this.runtime.activationDescriptorSha256 === identity.descriptorSha256
    );
  }

  canAccept(): boolean {
    return this.accepting && !this.didClose && !this.fatalError;
  }

  submit(
    prepared: PreparedRequest,
    signal: AbortSignal | undefined,
    lease: GenerationLease,
  ): Promise<OcrRuntimeRunResult> {
    if (!this.canAccept()) {
      return Promise.reject(new Error("Accurate OCR runtime dispatcher is unavailable"));
    }

    return new Promise<OcrRuntimeRunResult>((resolvePromise, rejectPromise) => {
      const pending: PendingRequest = {
        ...prepared,
        signal,
        lease,
        timeoutTimer: null,
        abortHandler: null,
        settled: false,
        resolve: resolvePromise,
        reject: rejectPromise,
      };
      pending.abortHandler = () => this.cancel(pending, abortError());
      signal?.addEventListener("abort", pending.abortHandler, { once: true });
      pending.timeoutTimer = setTimeout(
        () => this.cancel(pending, timeoutError(prepared.timeoutMs)),
        prepared.timeoutMs,
      );
      pending.timeoutTimer.unref();
      lease.setFailureHandler((error) => this.cancel(pending, error));
      this.queue.push(pending);

      if (signal?.aborted) {
        this.cancel(pending, abortError());
        return;
      }
      this.pump();
    });
  }

  beginDrain(): void {
    if (this.didClose) return;
    this.accepting = false;
    this.endWhenIdle();
  }

  forceAbort(error: Error): void {
    this.accepting = false;
    this.terminate(error);
  }

  private attachProcessListeners(): void {
    this.child.stdout?.on("data", (chunk: Buffer | string) => this.collectStdout(chunk));
    this.child.stderr?.on("data", (chunk: Buffer | string) => this.collectStderr(chunk));
    this.child.stdin?.on("error", (error) => this.terminate(error));
    this.child.on("error", (error) => this.terminate(error));
    this.child.on("close", (code, signal) => this.handleClose(code, signal));

    if (!this.child.stdin || !this.child.stdout || !this.child.stderr) {
      this.terminate(new Error("Accurate OCR runtime did not expose isolated stdio pipes"));
    }
  }

  private pump(): void {
    if (this.didClose || this.fatalError || this.current) return;
    const pending = this.queue.shift();
    if (!pending) {
      this.endWhenIdle();
      return;
    }
    if (pending.settled) {
      this.pump();
      return;
    }

    this.current = pending;
    try {
      this.child.stdin?.write(pending.serialized, (error) => {
        if (error) this.terminate(error);
      });
    } catch (error) {
      this.terminate(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private endWhenIdle(): void {
    if (this.accepting || this.ending || this.didClose || this.current || this.queue.length > 0) {
      return;
    }
    this.ending = true;
    try {
      this.child.stdin?.end();
    } catch (error) {
      this.terminate(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private cancel(pending: PendingRequest, error: Error): void {
    if (pending.settled) return;
    if (this.current === pending) {
      this.terminate(error);
      return;
    }

    const index = this.queue.indexOf(pending);
    if (index >= 0) this.queue.splice(index, 1);
    this.rejectPending(pending, error);
    this.endWhenIdle();
  }

  private terminate(error: Error): void {
    if (this.didClose || this.fatalError) return;
    this.fatalError = error;
    this.accepting = false;

    for (const pending of this.queue.splice(0)) this.rejectPending(pending, error);
    try {
      this.child.kill("SIGTERM");
    } catch {
      // The close/error events determine when the in-flight generation lease
      // can be released safely.
    }
    this.forceKillTimer = setTimeout(() => {
      try {
        this.child.kill("SIGKILL");
      } catch {
        // Keep the current request pinned until close proves the child is gone.
      }
    }, TERMINATION_GRACE_MS);
    this.forceKillTimer.unref();
  }

  private collectStdout(chunk: Buffer | string): void {
    if (this.didClose || this.fatalError) return;
    let remaining = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    while (remaining.length > 0) {
      const newlineIndex = remaining.indexOf(0x0a);
      if (newlineIndex < 0) {
        if (this.stdoutBuffer.length + remaining.length > MAX_STDOUT_BYTES) {
          this.terminate(new Error(`OCR runtime stdout exceeded ${MAX_STDOUT_BYTES} bytes`));
          return;
        }
        this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, remaining]);
        return;
      }

      const segment = remaining.subarray(0, newlineIndex);
      if (this.stdoutBuffer.length + segment.length + 1 > MAX_STDOUT_BYTES) {
        this.terminate(new Error(`OCR runtime stdout exceeded ${MAX_STDOUT_BYTES} bytes`));
        return;
      }
      const line = Buffer.concat([this.stdoutBuffer, segment]).toString("utf8");
      this.stdoutBuffer = Buffer.alloc(0);
      remaining = remaining.subarray(newlineIndex + 1);
      this.handleResponseLine(line);
      if (this.fatalError) return;
    }
  }

  private collectStderr(chunk: Buffer | string): void {
    if (this.didClose || this.fatalError) return;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.processStderrBytes += buffer.length;
    if (this.processStderrBytes > MAX_STDERR_BYTES) {
      this.terminate(new Error(`OCR runtime stderr exceeded ${MAX_STDERR_BYTES} bytes`));
      return;
    }
    this.processStderrChunks.push(buffer);
  }

  private clearProcessStderr(): void {
    this.processStderrChunks = [];
    this.processStderrBytes = 0;
  }

  private handleResponseLine(line: string): void {
    const pending = this.current;
    if (!pending) {
      this.terminate(new Error("Accurate OCR runtime returned an unsolicited response"));
      return;
    }

    let response: ProtocolSuccess | ProtocolFailure;
    try {
      response = parseResponse(line, pending.requestId);
    } catch (error) {
      this.terminate(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    this.current = null;
    // stdout and stderr are independent pipes, so their cross-stream ordering
    // cannot establish request ownership. Keep stderr only as bounded process
    // diagnostics for unexpected exits; never attach a late chunk to the next
    // otherwise-successful request.
    this.clearProcessStderr();
    if (!response.ok) {
      this.rejectPending(
        pending,
        new Error(
          `Accurate OCR runtime failed (${response.error.code}): ${response.error.message}`,
        ),
      );
    } else {
      this.resolvePending(pending, {
        result: response.result,
        stderr: "",
        runtime: Object.freeze({
          generation: this.runtime.generation,
          artifactVersion: this.runtime.artifactVersion,
          target: this.runtime.target,
          providers: this.runtime.providers,
          models: this.runtime.models,
        }),
      });
    }
    this.pump();
  }

  private cleanupPending(pending: PendingRequest): void {
    if (pending.timeoutTimer) clearTimeout(pending.timeoutTimer);
    pending.timeoutTimer = null;
    if (pending.abortHandler) pending.signal?.removeEventListener("abort", pending.abortHandler);
    pending.abortHandler = null;
    pending.lease.setFailureHandler(null);
  }

  private resolvePending(pending: PendingRequest, result: OcrRuntimeRunResult): void {
    if (pending.settled) return;
    pending.settled = true;
    this.cleanupPending(pending);
    pending.resolve(result);
  }

  private rejectPending(pending: PendingRequest, error: Error): void {
    if (pending.settled) return;
    pending.settled = true;
    this.cleanupPending(pending);
    pending.reject(error);
  }

  private handleClose(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.didClose) return;
    this.didClose = true;
    this.accepting = false;
    if (this.forceKillTimer) clearTimeout(this.forceKillTimer);
    this.forceKillTimer = null;

    let error = this.fatalError;
    if (!error && this.stdoutBuffer.length > 0) {
      error = new Error("Accurate OCR runtime returned a malformed JSON response");
    }
    if (!error && (this.current || this.queue.length > 0)) {
      const stderr = Buffer.concat(this.processStderrChunks).toString("utf8").trim();
      error = new Error(
        `Accurate OCR runtime exited with code ${String(code)}${
          signal ? ` (${signal})` : ""
        }${stderr ? `: ${stderr}` : ""}`,
      );
    }

    if (this.current) {
      this.rejectPending(
        this.current,
        error ?? new Error("Accurate OCR runtime exited unexpectedly"),
      );
      this.current = null;
    }
    for (const pending of this.queue.splice(0)) {
      this.rejectPending(pending, error ?? new Error("Accurate OCR runtime exited unexpectedly"));
    }
    this.onClosed(this);
    this.resolveClosed();
  }
}

type AdmissionState = "open" | "draining" | "shutdown";

const managers = new Set<OcrRuntimeManager>();
let currentManager: OcrRuntimeManager | null = null;
let admissionState: AdmissionState = "open";
let lifecyclePromise: Promise<void> | null = null;
let rotationPromise: Promise<OcrRuntimeRunResult> | null = null;
let rotationKey: string | null = null;
let activationWatchTimer: NodeJS.Timeout | null = null;
let activationWatchOptions: RuntimeStateOptions = {};

type RuntimeActivationView = "committed" | "pending";

function managerClosed(manager: OcrRuntimeManager): void {
  managers.delete(manager);
  if (currentManager === manager) currentManager = null;
  if (managers.size === 0 && activationWatchTimer) {
    clearInterval(activationWatchTimer);
    activationWatchTimer = null;
  }
}

function checkPublishedActivation(): void {
  const published = currentManager;
  if (!published || rotationPromise) return;
  const committed = readCommittedOcrRuntimeActivationIdentity(activationWatchOptions);
  if (committed && published.matchesActivation(committed)) return;
  const pending = !committed
    ? readPendingOcrRuntimeActivationIdentity(activationWatchOptions)
    : null;
  // Handoff publishes a fully probed pending candidate before commit. Retain
  // only that exact candidate; an unrelated stale manager must still retire.
  if (pending && published.matchesActivation(pending)) return;
  if (currentManager !== published) return;
  currentManager = null;
  published.beginDrain();
}

function watchPublishedActivation(options: RuntimeStateOptions): void {
  activationWatchOptions = options;
  if (activationWatchTimer) return;
  activationWatchTimer = setInterval(checkPublishedActivation, ACTIVATION_WATCH_INTERVAL_MS);
  activationWatchTimer.unref();
}

function getPublishedManager(runtime: CapturedRuntime): OcrRuntimeManager {
  if (!currentManager?.matches(runtime)) {
    throw new Error("Accurate OCR runtime dispatcher generation is not ready");
  }
  if (!currentManager.canAccept()) {
    throw new Error("Accurate OCR runtime dispatcher is unavailable");
  }
  return currentManager;
}

function assertAdmissionOpen(): void {
  if (admissionState !== "open") {
    throw new Error(`Accurate OCR runtime dispatcher is ${admissionState}`);
  }
}

function readRuntimeForActivation(
  view: RuntimeActivationView,
  options: RuntimeStateOptions,
): ActiveRuntimeDescriptor | null {
  return view === "pending"
    ? readPendingOcrRuntimeForHandoff(options)
    : readActiveRuntime("ocr", options);
}

function activeRuntime(
  options: RuntimeStateOptions,
  view: RuntimeActivationView = "committed",
): CapturedRuntime {
  const descriptor = readRuntimeForActivation(view, options);
  if (!descriptor) throw new Error("Accurate OCR runtime is not active");
  return captureDescriptor(descriptor);
}

function assertRuntimeStillActive(
  runtime: CapturedRuntime,
  options: RuntimeStateOptions,
  view: RuntimeActivationView = "committed",
): void {
  const descriptor = readRuntimeForActivation(view, options);
  if (!descriptor || !descriptorMatches(runtime, descriptor)) {
    throw new Error("OCR runtime activation changed before execution");
  }
}

function validateReadinessResult(result: unknown, runtime: CapturedRuntime): void {
  if (
    !isRecord(result) ||
    typeof result.provider !== "string" ||
    !runtime.providers.includes(result.provider) ||
    result.device !== "cpu" ||
    result.runtimeVersion !== runtime.artifactVersion ||
    result.target !== runtime.target ||
    typeof result.representativeModel !== "string" ||
    result.representativeModel.length === 0
  ) {
    throw new Error("Accurate OCR runtime returned a malformed readiness result");
  }
}

async function probeManager(
  manager: OcrRuntimeManager,
  runtime: CapturedRuntime,
  options: OcrRuntimeRunOptions,
  view: RuntimeActivationView = "committed",
): Promise<OcrRuntimeRunResult> {
  const prepared = prepareRequest("smoke", [], options);
  const lease = new GenerationLease(resolveAiDataDir(options), runtime.generation);
  try {
    assertRuntimeStillActive(runtime, options, view);
    assertAdmissionOpen();
    const result = await manager.submit(prepared, options.signal, lease);
    validateReadinessResult(result.result, runtime);
    return result;
  } finally {
    lease.close();
  }
}

async function performRotation(
  options: OcrRuntimeRunOptions,
  runtime: CapturedRuntime,
  view: RuntimeActivationView,
): Promise<OcrRuntimeRunResult> {
  if (options.signal?.aborted) throw abortError();
  assertAdmissionOpen();
  assertRuntimeStillActive(runtime, options, view);

  const published = currentManager;
  if (published?.matches(runtime)) {
    if (!published.canAccept()) {
      throw new Error("Accurate OCR runtime dispatcher is unavailable");
    }
    let result: OcrRuntimeRunResult;
    try {
      result = await probeManager(published, runtime, options, view);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      // rotate() is a readiness gate, not a passive health query. A published
      // process that cannot prove its sessions is no longer safe to admit.
      published.forceAbort(failure);
      await published.closed;
      throw failure;
    }
    assertAdmissionOpen();
    assertRuntimeStillActive(runtime, options, view);
    if (currentManager !== published) {
      throw new Error("OCR runtime dispatcher changed during readiness probe");
    }
    return result;
  }

  let candidate: OcrRuntimeManager;
  try {
    candidate = new OcrRuntimeManager(runtime, managerClosed);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  managers.add(candidate);
  let publishedCandidate = false;
  try {
    const result = await probeManager(candidate, runtime, options, view);
    assertAdmissionOpen();
    assertRuntimeStillActive(runtime, options, view);
    if (!candidate.canAccept()) {
      throw new Error("Accurate OCR runtime candidate exited before publication");
    }

    const previous = currentManager;
    currentManager = candidate;
    watchPublishedActivation(options);
    publishedCandidate = true;
    if (previous && previous !== candidate) previous.beginDrain();
    return result;
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    if (!publishedCandidate) {
      candidate.forceAbort(failure);
      await candidate.closed;
    }
    throw failure;
  }
}

function rotateForActivation(
  view: RuntimeActivationView,
  options: OcrRuntimeRunOptions,
): Promise<OcrRuntimeRunResult> {
  let timeoutMs: number;
  let runtime: CapturedRuntime;
  try {
    if (options.signal?.aborted) throw abortError();
    timeoutMs = resolveTimeoutMs(options);
    assertAdmissionOpen();
    runtime = activeRuntime(options, view);
    assertRuntimeStillActive(runtime, options, view);
  } catch (error) {
    return Promise.reject(error);
  }
  const deadline = performance.now() + timeoutMs;
  const desiredKey = `${view}:${runtime.fingerprint}`;

  const startWhenAvailable = async (): Promise<OcrRuntimeRunResult> => {
    while (rotationPromise) {
      if (rotationKey === desiredKey) {
        return await awaitWithDeadline(rotationPromise, deadline, timeoutMs, options.signal);
      }
      try {
        await awaitWithDeadline(rotationPromise, deadline, timeoutMs, options.signal);
      } catch {
        if (options.signal?.aborted) throw abortError();
        remainingTimeoutMs(deadline, timeoutMs);
      }
      assertAdmissionOpen();
      assertRuntimeStillActive(runtime, options, view);
    }

    let operation!: Promise<OcrRuntimeRunResult>;
    operation = performRotation(
      {
        ...options,
        // Rotation is shared process state. The initiating caller gets its own
        // abort/deadline view below, but cannot cancel the candidate out from under
        // other waiters. Descriptor revalidation still prevents a late publish
        // after an installer rollback.
        signal: undefined,
        timeoutMs: Math.max(DEFAULT_TIMEOUT_MS, timeoutMs),
      },
      runtime,
      view,
    ).finally(() => {
      if (rotationPromise === operation) {
        rotationPromise = null;
        rotationKey = null;
      }
    });
    rotationPromise = operation;
    rotationKey = desiredKey;
    return await awaitWithDeadline(operation, deadline, timeoutMs, options.signal);
  };

  return startWhenAvailable();
}

export function rotateOcrDispatcher(
  options: OcrRuntimeRunOptions = {},
): Promise<OcrRuntimeRunResult> {
  return rotateForActivation("committed", options);
}

/** Readiness handoff for the exact pending activation; never used for job admission. */
export function handoffOcrDispatcher(
  options: OcrRuntimeRunOptions = {},
): Promise<OcrRuntimeRunResult> {
  return rotateForActivation("pending", options);
}

export async function probeOcrDispatcher(
  options: OcrRuntimeRunOptions = {},
): Promise<OcrRuntimeRunResult> {
  if (options.signal?.aborted) throw abortError();
  const totalTimeoutMs = resolveTimeoutMs(options);
  const deadline = performance.now() + totalTimeoutMs;
  assertAdmissionOpen();
  const runtime = activeRuntime(options);
  assertRuntimeStillActive(runtime, options);
  if (rotationPromise) {
    await awaitWithDeadline(rotationPromise, deadline, totalTimeoutMs, options.signal);
  }
  assertAdmissionOpen();

  assertRuntimeStillActive(runtime, options);
  const published = currentManager;
  if (!published?.matches(runtime) || !published.canAccept()) {
    throw new Error("Accurate OCR runtime has no ready published dispatcher");
  }

  const result = await probeManager(published, runtime, {
    ...options,
    timeoutMs: remainingTimeoutMs(deadline, totalTimeoutMs),
  });
  assertAdmissionOpen();
  assertRuntimeStillActive(runtime, options);
  if (currentManager !== published) {
    throw new Error("OCR runtime dispatcher changed during readiness probe");
  }
  return result;
}

export async function runOcrRuntime(
  script: OcrRuntimeScript,
  args: readonly string[],
  options: OcrRuntimeRunOptions = {},
): Promise<OcrRuntimeRunResult> {
  validateRequest(script, args);
  if (options.signal?.aborted) throw abortError();
  if (admissionState !== "open") {
    throw new Error(`Accurate OCR runtime dispatcher is ${admissionState}`);
  }
  const prepared = prepareRequest(script, args, options);
  const totalTimeoutMs = prepared.timeoutMs;
  const deadline = performance.now() + totalTimeoutMs;

  const descriptor = readActiveRuntime("ocr", options);
  if (!descriptor) {
    throw new Error("Accurate OCR runtime is not active");
  }
  const runtime = captureDescriptor(descriptor);
  const lease = new GenerationLease(resolveAiDataDir(options), runtime.generation);

  try {
    assertRuntimeStillActive(runtime, options);
    assertAdmissionOpen();
    const pendingRotation = rotationPromise;
    if (pendingRotation) {
      try {
        await awaitWithDeadline(pendingRotation, deadline, totalTimeoutMs, options.signal);
      } catch (error) {
        // A failed candidate handoff may coincide with the installer restoring
        // the descriptor this request captured. In that case the still-
        // published old manager is exactly the safe runtime to use; failures
        // for any other active generation remain observable.
        if (
          options.signal?.aborted ||
          performance.now() >= deadline ||
          !currentManager?.matches(runtime) ||
          !currentManager.canAccept()
        ) {
          throw error;
        }
      }
      assertRuntimeStillActive(runtime, options);
      assertAdmissionOpen();
    }
    if (!currentManager?.matches(runtime)) {
      await awaitWithDeadline(
        rotateOcrDispatcher({
          ...options,
          timeoutMs: remainingTimeoutMs(deadline, totalTimeoutMs),
        }),
        deadline,
        totalTimeoutMs,
        options.signal,
      );
      assertRuntimeStillActive(runtime, options);
      assertAdmissionOpen();
    }
    return await getPublishedManager(runtime).submit(
      {
        ...prepared,
        timeoutMs: remainingTimeoutMs(deadline, totalTimeoutMs),
      },
      options.signal,
      lease,
    );
  } finally {
    lease.close();
  }
}

function finishLifecycle(state: Exclude<AdmissionState, "open">, force: boolean): Promise<void> {
  if (admissionState === state && lifecyclePromise) return lifecyclePromise;
  if (state === "draining" && admissionState === "shutdown" && lifecyclePromise) {
    return lifecyclePromise;
  }

  admissionState = state;
  if (activationWatchTimer) {
    clearInterval(activationWatchTimer);
    activationWatchTimer = null;
  }
  currentManager = null;
  const activeManagers = [...managers];
  if (force) {
    const error = new Error("OCR runtime dispatcher shut down");
    for (const manager of activeManagers) manager.forceAbort(error);
  } else {
    for (const manager of activeManagers) manager.beginDrain();
  }

  let operation!: Promise<void>;
  operation = Promise.allSettled(activeManagers.map((manager) => manager.closed))
    .then(() => {})
    .finally(() => {
      if (lifecyclePromise === operation) {
        lifecyclePromise = null;
        admissionState = "open";
      }
    });
  lifecyclePromise = operation;
  return operation;
}

export function drainOcrDispatcher(): Promise<void> {
  return finishLifecycle("draining", false);
}

export function shutdownOcrDispatcher(): Promise<void> {
  return finishLifecycle("shutdown", true);
}
