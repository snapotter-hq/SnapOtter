import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, posix, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { context, propagation, ROOT_CONTEXT, SpanStatusCode, trace } from "@opentelemetry/api";
import { isSafeMessageError, SafeError } from "@snapotter/shared";
import {
  type GpuFramework,
  type GpuFrameworks,
  missingBundleForScript,
  type SidecarMemoryOptions,
  sidecarMemoryRefusal,
} from "./feature-gate.js";
import { aiLog, describeUnexpectedExit } from "./log.js";
import { acquireVenvRead, tryAcquireVenvRead } from "./venv-lock.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON_DIR = resolve(__dirname, "../python");
const DEFAULT_PYTHON_TIMEOUT_MS = 600_000;

function appendEnvPath(base: string, suffix: string): string {
  const normalizedBase = base.replace(/\/+$/, "");
  return `${normalizedBase || "/"}${normalizedBase === "" ? "" : "/"}${suffix}`;
}

function resolvePythonTimeout(explicitTimeout?: number): number | undefined {
  const configured = process.env.PROCESSING_TIMEOUT_S?.trim();
  if (configured !== undefined && configured !== "") {
    const seconds = Number(configured);
    if (Number.isFinite(seconds)) {
      if (seconds === 0) return undefined;
      if (seconds > 0) return seconds * 1000;
    }
  }
  return explicitTimeout ?? DEFAULT_PYTHON_TIMEOUT_MS;
}

/**
 * Build a minimal environment for spawned Python processes.
 * Only passes through variables needed for venv, CUDA, model cache,
 * package resolution, and locale -- avoids leaking secrets or
 * application config from the parent process.
 */
export function buildMinimalEnv(): Record<string, string> {
  const env: Record<string, string> = {
    PYTHONUNBUFFERED: "1",
    LANG: process.env.LANG || "C.UTF-8",
  };
  const passthrough = [
    "PATH",
    "HOME",
    "VIRTUAL_ENV",
    "PYTHONPATH",
    "CUDA_VISIBLE_DEVICES",
    "LD_LIBRARY_PATH",
    // Application-specific vars the sidecar scripts depend on
    "DATA_DIR",
    "MODELS_PATH",
    "U2NET_HOME",
    "PROCESSING_TIMEOUT_S",
    "DISPATCHER_MAX_REQUESTS",
    "DISPATCHER_MAX_CONSECUTIVE_FAILURES",
    "PYTHON_VENV_PATH",
    "SNAPOTTER_GPU",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "OTEL_EXPORTER_OTLP_PROTOCOL",
    "OTEL_EXPORTER_OTLP_HEADERS",
  ];
  for (const key of passthrough) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key] as string;
    }
  }

  env.DATA_DIR ??= "./data";
  env.MODELS_PATH ??= appendEnvPath(env.DATA_DIR, "ai/models");

  // Runtime downloads require an explicit opt-in. Feature bundle installs are
  // unaffected: install_feature.py intentionally lifts Hugging Face's offline
  // flags in its own process while it installs the signed bundle.
  const allowModelDownload = process.env.SNAPOTTER_ALLOW_MODEL_DOWNLOAD?.toLowerCase();
  const modelDownloadsEnabled = allowModelDownload === "1" || allowModelDownload === "true";
  env.SNAPOTTER_ALLOW_MODEL_DOWNLOAD = modelDownloadsEnabled ? "1" : "0";
  if (!modelDownloadsEnabled) {
    env.HF_HUB_OFFLINE = "1";
    env.TRANSFORMERS_OFFLINE = "1";
  }
  return env;
}

/** Try venv first, then system python. */
function getPythonPath(): string {
  const venvPath = process.env.PYTHON_VENV_PATH || resolve(__dirname, "../../../.venv");
  const path = process.platform === "win32" ? win32 : posix;
  const venvPython = path.join(
    venvPath,
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python3",
  );
  return existsSync(venvPython) ? venvPython : process.platform === "win32" ? "python" : "python3";
}

/**
 * Extract a user-friendly error from a Python process error.
 */
const OOM_EXIT_TEXT =
  /out of memory|not enough memory|can't allocate memory|cannot allocate memory|\[errno 12\]|unable to allocate|failed to allocate|cudaerrormemoryallocation|cublas_status_alloc_failed|bad_alloc|memoryerror/i;

const FS_EXIT_MAP: Array<[RegExp, string]> = [
  [/\[errno 28\]|no space left on device/i, "ENOSPC"],
  [/\[errno 13\]|permission denied/i, "EACCES"],
  [/\[errno 30\]|read-only file system/i, "EROFS"],
  [/\[errno 24\]|too many open files/i, "EMFILE"],
];

function checkFsError(message: string): string | undefined {
  for (const [regex, code] of FS_EXIT_MAP) {
    if (regex.test(message)) return code;
  }
  return undefined;
}

/**
 * Build the error to reject a non-zero Python exit with. The extracted reason is
 * kept as the message (it is already surfaced to callers) but wrapped in a
 * SafeError so it survives the API's Sentry scrubber, which otherwise reduces a
 * plain Error to "Error: Error" (NODE-24). Classification is deliberate: a kill
 * signal / OS OOM (SIGKILL, exit 137) and a segfault (SIGSEGV, exit 139) are
 * operational, and their constant messages keep the "out of memory" text so
 * memory-aware callers still retry on a lighter model. Any other non-zero exit
 * is a bug, with the extracted reason (or an OOM reported in-band) preserved.
 */
function pythonExitError(
  code: number | null,
  signal: string | null,
  extracted: string,
  info?: PythonErrorInfo | null,
): SafeError {
  if (signal === "SIGSEGV" || code === 139) {
    return new SafeError("Process crashed (segmentation fault)", {
      kind: "operational",
      code: `exit-${code ?? signal ?? "unknown"}`,
    });
  }
  if (signal === "SIGKILL" || code === 137) {
    return new SafeError("Process killed (out of memory) -- try a lighter model or smaller image", {
      kind: "operational",
      code: `exit-${code ?? signal ?? "unknown"}`,
    });
  }
  const message = extracted || `Python script exited with code ${code}`;
  const fsCode = checkFsError(message);
  const err = new SafeError(message, {
    kind: fsCode ? "operational" : OOM_EXIT_TEXT.test(message) ? "operational" : "bug",
    code: fsCode || `exit-${code ?? "unknown"}`,
  });
  if (info) {
    Object.assign(err, { pythonType: info.type, pythonFrames: info.frames });
  }
  return err;
}

/**
 * Wrap a sidecar-reported failure (a `{success: false, error}` payload or a
 * thrown reason) in a SafeError so its message survives the API's Sentry
 * scrubber, which reduces a plain Error to "Error: Error" (NODE-24, NODE-2N,
 * NODE-1R). The specific sidecar reason is kept as the message, matching
 * pythonExitError; an empty reason falls back to the tool's constant message.
 * Memory-allocation reasons classify as operational (the deployment's
 * hardware), everything else as a bug. Errors we already author (the bridge's
 * SafeError timeout/OOM) pass through unchanged so their kind is not masked.
 */
export function toSidecarError(reason: unknown, fallback: string): Error {
  if (isSafeMessageError(reason)) return reason;
  const message = (reason instanceof Error ? reason.message : String(reason ?? "")).trim();
  const fsCode = checkFsError(message);
  return new SafeError(message || fallback, {
    kind: fsCode ? "operational" : OOM_EXIT_TEXT.test(message) ? "operational" : "bug",
    code: fsCode,
  });
}

function parsePythonJsonCandidates(output: string): Array<Record<string, unknown>> {
  const trimmed = output.trim();
  if (!trimmed) return [];

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return [parsed as Record<string, unknown>];
    }
    return [];
  } catch {
    // Fall back to scanning individual lines in reverse when diagnostic output
    // precedes a JSON error line.
  }

  const results: Array<Record<string, unknown>> = [];
  const lines = trimmed.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line?.startsWith("{")) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        results.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Not a standalone JSON object line.
    }
  }
  return results;
}

function extractStructuredErrorMessage(output: string): string | null {
  for (const parsed of parsePythonJsonCandidates(output)) {
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error;
    }
    const errorInfo = parsed.errorInfo as { type?: unknown } | undefined;
    if (typeof errorInfo?.type === "string" && errorInfo.type.trim()) {
      return errorInfo.type.trim();
    }
  }
  return null;
}

function isJsonObjectString(text: string): boolean {
  if (!text.startsWith("{")) return false;
  try {
    const parsed: unknown = JSON.parse(text);
    return !!parsed && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function extractTracebackErrorLine(output: string): string | null {
  const lines = output
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let lastTracebackIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]?.startsWith("Traceback")) {
      lastTracebackIdx = i;
      break;
    }
  }
  if (lastTracebackIdx === -1) return null;
  for (let i = lines.length - 1; i > lastTracebackIdx; i--) {
    const line = lines[i];
    if (!line || line.startsWith("Traceback")) continue;
    if (/^\[[a-zA-Z0-9_.-]+\]\s/.test(line) || isJsonObjectString(line)) continue;
    return line;
  }
  return null;
}

function extractPythonError(error: unknown): string {
  if (error && typeof error === "object") {
    const pErr = error as {
      stderr?: string;
      stdout?: string;
      message?: string;
    };
    const outputs = [pErr.stdout, pErr.stderr];
    for (const output of outputs) {
      if (!output) continue;
      const structured = extractStructuredErrorMessage(output);
      if (structured) return structured;
    }
    for (const output of outputs) {
      if (!output) continue;
      const tbLine = extractTracebackErrorLine(output);
      if (tbLine) return tbLine;
    }
    for (const output of [pErr.stderr, pErr.stdout]) {
      const trimmed = output?.trim();
      if (!trimmed || isJsonObjectString(trimmed)) continue;
      const rawLines = trimmed.split("\n");
      if (rawLines.some((l) => l.trim().startsWith("Traceback"))) continue;
      const nonJsonLines = rawLines.filter((l) => {
        const t = l.trim();
        return Boolean(t) && !isJsonObjectString(t);
      });
      const candidate = nonJsonLines.join("\n").trim();
      if (candidate) return candidate;
    }
    if (pErr.message) return pErr.message;
    // Return empty string for {stdout, stderr} objects with no useful content
    // so the caller's fallback message (e.g. exit code) kicks in.
    return "";
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export interface PythonErrorInfo {
  type?: string;
  frames: Array<{ file: string; line: number; func: string }>;
}

/** Read the structured {type, frames} envelope from a sidecar failure, or null. */
export function extractPythonErrorInfo(error: unknown): PythonErrorInfo | null {
  if (!error || typeof error !== "object") return null;
  const pErr = error as { stdout?: string; stderr?: string };
  for (const output of [pErr.stdout, pErr.stderr]) {
    if (!output) continue;
    for (const parsed of parsePythonJsonCandidates(output)) {
      const info = parsed.errorInfo as PythonErrorInfo | undefined;
      if (info && Array.isArray(info.frames)) {
        return {
          type: typeof info.type === "string" ? info.type : undefined,
          frames: info.frames
            .filter(
              (f): f is { file: string; line: number; func: string } =>
                !!f &&
                typeof (f as { file?: unknown }).file === "string" &&
                typeof (f as { line?: unknown }).line === "number" &&
                typeof (f as { func?: unknown }).func === "string",
            )
            .slice(0, 20),
        };
      }
    }
  }
  return null;
}

export type ProgressCallback = (percent: number, stage: string) => void;

export interface PythonRunOptions {
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
  timeout?: number;
  toolId?: string;
  memoryOptions?: SidecarMemoryOptions;
}

function parseGpuFrameworks(raw: unknown): GpuFrameworks | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const out: GpuFrameworks = {};
  if (typeof obj.torch === "boolean") out.torch = obj.torch;
  if (typeof obj.onnx === "boolean") out.onnx = obj.onnx;
  if (typeof obj.ctranslate2 === "boolean") out.ctranslate2 = obj.ctranslate2;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function isNvidiaDevicePresent(
  deviceExists: (path: string) => boolean = existsSync,
): boolean {
  const gpuEnv = process.env.SNAPOTTER_GPU?.trim().toLowerCase();
  if (gpuEnv === "0" || gpuEnv === "false" || gpuEnv === "no") return false;
  const visible = process.env.CUDA_VISIBLE_DEVICES?.trim();
  if (visible === "" || visible === "-1" || visible?.toLowerCase() === "none") return false;
  return deviceExists("/dev/nvidiactl") || deviceExists("/dev/nvidia0");
}

function pythonAbortError(): Error {
  const error = new SafeError("Python script canceled", {
    kind: "operational",
    code: "canceled",
  });
  error.name = "AbortError";
  return error;
}

function isTimeoutAbortReason(reason: unknown): boolean {
  if (reason === "timeout") return true;
  return (
    typeof reason === "object" &&
    reason !== null &&
    (reason as { name?: unknown }).name === "TimeoutError"
  );
}

// ── PythonDispatcher class ─────────────────────────────────────────

interface PendingRequest {
  resolve: (result: { stdout: string; stderr: string }) => void;
  reject: (err: Error) => void;
  onProgress?: ProgressCallback;
  stderrLines: string[];
  /** Which child generation this request was written to (see startChild). */
  generation: number;
}

// Crash recovery constants
const CRASH_WINDOW_MS = 60_000;
const MAX_CONSECUTIVE_CRASHES = 5;
const BASE_BACKOFF_MS = 1_000;
// Enough to hold a Python traceback's tail without keeping a whole log per child.
const EXIT_STDERR_TAIL_LINES = 20;
const DEFAULT_MAX_CONSECUTIVE_SCRIPT_FAILURES = 3;

const CUDA_POISON_RE =
  /cuda\s+(?:failure|error|driver)|cudaerror|cudnn_status|cublas_status_(?:not_initialized|internal_error|execution_failed)|ort_runtime_exception|onnxruntimeerror|device-side\s+assert|illegal\s+memory\s+access|unspecified\s+launch\s+failure/i;

const PRE_EXEC_GATE_ERRORS = new Set([
  "invalid_script_name",
  "script_not_allowed",
  "feature_not_installed",
]);

function resolveMaxConsecutiveScriptFailures(): number {
  const configured = process.env.DISPATCHER_MAX_CONSECUTIVE_FAILURES?.trim();
  if (configured !== undefined && configured !== "") {
    const parsed = Number(configured);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }
  return DEFAULT_MAX_CONSECUTIVE_SCRIPT_FAILURES;
}

function classifyDispatcherResponseFailure(
  exitCode: unknown,
  stdout: string,
  stderr: string,
  extracted: string,
  infoType?: string,
): { status: "succeeded" | "failed" | "ignored"; cudaPoison: boolean } {
  for (const parsed of parsePythonJsonCandidates(stdout)) {
    const errVal = typeof parsed.error === "string" ? parsed.error.trim() : "";
    if (errVal === "canceled" || PRE_EXEC_GATE_ERRORS.has(errVal)) {
      return { status: "ignored", cudaPoison: false };
    }
    const failed =
      exitCode !== 0 || parsed.success === false || (errVal.length > 0 && parsed.success !== true);
    if (!failed) return { status: "succeeded", cudaPoison: false };
    const combined = `${infoType ?? ""}\n${extracted}\n${errVal}\n${stdout}\n${stderr}`;
    return { status: "failed", cudaPoison: CUDA_POISON_RE.test(combined) };
  }
  if (exitCode !== 0) {
    if (extracted === "canceled" || PRE_EXEC_GATE_ERRORS.has(extracted)) {
      return { status: "ignored", cudaPoison: false };
    }
    const combined = `${infoType ?? ""}\n${extracted}\n${stdout}\n${stderr}`;
    return { status: "failed", cudaPoison: CUDA_POISON_RE.test(combined) };
  }
  return { status: "succeeded", cudaPoison: false };
}

export type DispatcherRecycleReason = "cuda_error" | "consecutive_failures" | "max_requests";

export interface DispatcherStatus {
  running: boolean;
  ready: boolean;
  failed: boolean;
  gpu: boolean;
  pid: number | null;
  consecutiveCrashes: number;
  consecutiveScriptFailures: number;
  lastRecycleReason: DispatcherRecycleReason | null;
}

/**
 * A single Python dispatcher instance parameterized by profile.
 * The "ai" profile loads heavy ML libraries at startup; the "docs"
 * profile starts lean with only document-processing scripts allowed.
 */
export class PythonDispatcher {
  private profile: "ai" | "docs";
  private child: ChildProcess | null = null;
  private childReady = false;
  private childFailed = false;
  private gpuAvail = false;
  private gpuFrameworks: GpuFrameworks | undefined = undefined;
  private gpuProbed = false;
  private pending = new Map<string, PendingRequest>();
  private crashes = 0;
  private lastCrashTs = 0;
  private backoffEnd = 0;
  private consecutiveScriptFailures = 0;
  private childScriptFailures = 0;
  private lastRecycleReason: DispatcherRecycleReason | null = null;
  /**
   * Monotonic child counter. Each spawned child and every request written to
   * it carry the generation current at spawn time, so a stale child's late
   * close/error events (SIGTERM delivery can lag a replacement spawn) only
   * ever touch their own generation's pending requests.
   */
  private generation = 0;
  /**
   * Children we SIGTERMed on purpose (shutdown/reload). Tracked per child
   * rather than as an instance-wide flag: an instance flag reset by the next
   * spawn would let the stale child's close event record a phantom crash and
   * null out the fresh child. The request-timeout kill path deliberately does
   * NOT add to this set, so a genuinely hung script still counts as a crash.
   */
  private stoppedChildren = new WeakSet<ChildProcess>();

  constructor(opts: { profile: "ai" | "docs" }) {
    this.profile = opts.profile;
  }

  private buildEnv(): Record<string, string> {
    const env = buildMinimalEnv();
    env.DISPATCHER_PROFILE = this.profile;
    return env;
  }

  /**
   * @param exit what the dead child reported (see describeUnexpectedExit), so
   * the log says why it died, not only how many times.
   */
  private recordCrash(exit?: string): void {
    const now = Date.now();
    if (now - this.lastCrashTs > CRASH_WINDOW_MS) {
      this.crashes = 1;
    } else {
      this.crashes++;
    }
    this.lastCrashTs = now;
    const detail = exit ? ` (${exit})` : "";

    if (this.crashes >= MAX_CONSECUTIVE_CRASHES) {
      aiLog.error(
        `[bridge] Dispatcher crashed ${this.crashes} times in ${CRASH_WINDOW_MS / 1000}s, disabling permanently${detail}`,
      );
      this.childFailed = true;
      return;
    }

    const delay = BASE_BACKOFF_MS * 2 ** (this.crashes - 1);
    this.backoffEnd = now + delay;
    aiLog.warn(
      `[bridge] Dispatcher crash #${this.crashes}, backing off ${delay}ms before restart${detail}`,
    );
  }

  /**
   * Reject and drop the pending requests written to one child generation.
   * Always rejects with a SafeError: these rejections reach tool wrappers and
   * (when the per-request retry cannot save them) Sentry, where a plain Error
   * is scrubbed to "Error: Error". run()'s crash-retry matches on the exact
   * message, so callers must keep the two dispatcher-crash messages verbatim.
   */
  private rejectPendingForGeneration(generation: number, error: Error): void {
    for (const [id, req] of this.pending.entries()) {
      if (req.generation !== generation) continue;
      req.reject(error);
      this.pending.delete(id);
    }
  }

  /**
   * Cleanly retire the current dispatcher child without counting it as a crash
   * against MAX_CONSECUTIVE_CRASHES. Used when a script failure indicates a
   * poisoned CUDA/ORT context or reaches the consecutive script failure limit.
   */
  private recycleChild(
    proc: ChildProcess,
    generation: number,
    reason: DispatcherRecycleReason,
  ): void {
    this.lastRecycleReason = reason;
    this.childScriptFailures = 0;
    this.stoppedChildren.add(proc);
    aiLog.warn(`[bridge] Recycling Python dispatcher (${reason})`);
    if (this.child === proc) {
      this.child = null;
      this.childReady = false;
    }
    this.rejectPendingForGeneration(
      generation,
      new SafeError("Python dispatcher exited unexpectedly", {
        kind: "operational",
        code: "dispatcher-exit",
      }),
    );
    proc.stdin?.end();
    if (!proc.killed) {
      proc.kill("SIGTERM");
    }
  }

  private recordScriptOutcome(
    proc: ChildProcess,
    generation: number,
    outcome: { status: "succeeded" | "failed" | "ignored"; cudaPoison: boolean },
  ): void {
    if (outcome.status === "ignored") {
      return;
    }
    if (outcome.status === "succeeded") {
      this.consecutiveScriptFailures = 0;
      this.childScriptFailures = 0;
      return;
    }
    this.consecutiveScriptFailures++;
    this.childScriptFailures++;
    if (outcome.cudaPoison) {
      this.recycleChild(proc, generation, "cuda_error");
      return;
    }
    const maxFailures = resolveMaxConsecutiveScriptFailures();
    if (maxFailures > 0 && this.childScriptFailures >= maxFailures) {
      this.recycleChild(proc, generation, "consecutive_failures");
    }
  }

  private startChild(): ChildProcess | null {
    if (this.childFailed) return null;
    this.generation++;
    const gen = this.generation;
    this.childReady = false;
    this.childScriptFailures = 0;

    try {
      // Under the root context: the child outlives whichever job started
      // it, and its pipe events inherit the context it was spawned in, so
      // every line it logs would carry that one job's trace id (#1500).
      // Each request's own trace context goes to Python with the request.
      const proc = context.with(ROOT_CONTEXT, () =>
        spawn(getPythonPath(), [resolve(PYTHON_DIR, "dispatcher.py")], {
          stdio: ["pipe", "pipe", "pipe"],
          env: this.buildEnv(),
        }),
      );

      proc.stdin?.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EPIPE" || err.code === "ERR_STREAM_DESTROYED") {
          this.rejectPendingForGeneration(
            gen,
            new SafeError("Python dispatcher stdin closed unexpectedly", {
              kind: "operational",
              code: "dispatcher-stdin-closed",
            }),
          );
          // An intentional shutdown() ends stdin then SIGTERMs the child,
          // which can surface here as an EPIPE/ERR_STREAM_DESTROYED. That is
          // not a crash: counting or logging it would let repeated legitimate
          // restarts (shutdownDispatcher() runs after every AI bundle install)
          // emit spurious errors and trip the crash limit to permanently
          // disable the dispatcher. Guard mirrors the "close" handler below.
          if (!this.stoppedChildren.has(proc)) {
            aiLog.error(
              `[bridge] Dispatcher stdin pipe broken (${err.code}), rejecting pending requests`,
              err,
            );
            this.recordCrash();
          }
          if (this.child === proc) {
            this.child = null;
            this.childReady = false;
          }
        }
      });

      let stderrBuf = "";
      let stdoutBuf = "";
      // Kept per child, not per request: a crash with nothing pending still
      // needs the traceback that explains it.
      const stderrTail: string[] = [];

      const handleStderrLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        if (trimmed.startsWith("{")) {
          try {
            const parsed = JSON.parse(trimmed);

            // Readiness signal. Ignore it from a superseded child so a stale
            // process can't mark a not-yet-ready replacement as ready.
            if (parsed?.ready === true) {
              if (this.child === proc) {
                this.childReady = true;
                this.gpuAvail = parsed.gpu === true;
                this.gpuFrameworks = parseGpuFrameworks(parsed.gpuFrameworks);
                this.gpuProbed = true;
                this.crashes = 0;
                aiLog.info(`[bridge] Python dispatcher ready (GPU: ${parsed.gpu === true})`);
              }
              return;
            }

            // Progress event - route to the currently active request
            if (typeof parsed?.progress === "number" && typeof parsed?.stage === "string") {
              // Progress goes to this child's pending requests (only one
              // should be active at a time since Python processes synchronously)
              for (const req of this.pending.values()) {
                if (req.generation === gen) req.onProgress?.(parsed.progress, parsed.stage);
              }
              return;
            }

            // Diagnostic notices are forwarded so they reach docker logs
            // instead of being silently dropped for matching neither shape.
            if (typeof parsed?.info === "string") {
              aiLog.info(`[python] ${parsed.info}`);
              return;
            }
            if (typeof parsed?.warning === "string") {
              aiLog.warn(`[python] ${parsed.warning}`);
              return;
            }
          } catch {
            // Malformed JSON object - collect as regular stderr.
          }
        } else if (trimmed.startsWith("[")) {
          if (trimmed.includes("[dispatcher] Reached max requests")) {
            this.lastRecycleReason = "max_requests";
          } else if (trimmed.includes("[dispatcher] CUDA/ORT runtime failure detected")) {
            this.lastRecycleReason = "cuda_error";
          } else if (trimmed.includes("[dispatcher] Reached consecutive script failure limit")) {
            this.lastRecycleReason = "consecutive_failures";
          }
          // Forward diagnostic messages to Node.js logger and collect as regular stderr.
          aiLog.info(`[python] ${trimmed}`);
        }
        stderrTail.push(trimmed);
        if (stderrTail.length > EXIT_STDERR_TAIL_LINES) stderrTail.shift();
        for (const req of this.pending.values()) {
          if (req.generation === gen) req.stderrLines.push(trimmed);
        }
      };

      proc.stderr?.on("data", (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        const lines = stderrBuf.split("\n");
        stderrBuf = lines.pop() ?? "";

        for (const line of lines) {
          handleStderrLine(line);
        }
      });

      proc.stdout?.on("data", (chunk: Buffer) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split("\n");
        stdoutBuf = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const response = JSON.parse(trimmed);
            const reqId = response.id;
            const req = this.pending.get(reqId);
            if (req) {
              this.pending.delete(reqId);
              const stdoutStr = typeof response.stdout === "string" ? response.stdout : "";
              const stderrStr = req.stderrLines.join("\n");
              const raw = { stdout: stdoutStr, stderr: stderrStr };
              const extracted = response.exitCode !== 0 ? extractPythonError(raw) : "";
              const info = response.exitCode !== 0 ? extractPythonErrorInfo(raw) : null;
              const outcome = classifyDispatcherResponseFailure(
                response.exitCode,
                stdoutStr,
                stderrStr,
                extracted,
                info?.type,
              );
              this.recordScriptOutcome(proc, gen, outcome);
              if (response.exitCode !== 0) {
                req.reject(pythonExitError(response.exitCode, null, extracted, info));
              } else {
                req.resolve({
                  stdout: stdoutStr,
                  stderr: stderrStr,
                });
              }
            }
          } catch {
            // Not a valid response line
          }
        }
      });

      proc.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") {
          aiLog.error(`[bridge] Dispatcher error: ${err.message} (code: ${err.code})`, err);
          this.childFailed = true;
        } else if (!this.stoppedChildren.has(proc)) {
          // Skip error logging and crash accounting when we initiated the
          // teardown (shutdown() marks the child stopped before killing it);
          // mirrors "close".
          aiLog.error(`[bridge] Dispatcher error: ${err.message} (code: ${err.code})`, err);
          this.recordCrash();
        }
        this.rejectPendingForGeneration(
          gen,
          new SafeError(extractPythonError(err) || "Python dispatcher process error", {
            kind: "operational",
            code: err.code ?? "dispatcher-error",
          }),
        );
        if (this.child === proc) {
          this.child = null;
          this.childReady = false;
        }
      });

      proc.on("close", (code, signal) => {
        if (this.child === proc) {
          this.child = null;
          this.childReady = false;
        }
        this.rejectPendingForGeneration(
          gen,
          new SafeError("Python dispatcher exited unexpectedly", {
            kind: "operational",
            code: "dispatcher-exit",
          }),
        );
        if (stderrBuf.trim()) {
          handleStderrLine(stderrBuf);
          stderrBuf = "";
        }
        if (code !== 0 && !this.stoppedChildren.has(proc)) {
          this.recordCrash(describeUnexpectedExit(code, signal, stderrTail));
        }
      });

      return proc;
    } catch {
      this.childFailed = true;
      return null;
    }
  }

  private getChild(): ChildProcess | null {
    if (this.childFailed) return null;
    if (!this.child || this.child.killed) {
      if (Date.now() < this.backoffEnd) return null;
      this.child = this.startChild();
    }
    return this.child;
  }

  /**
   * Send a request to the persistent Python dispatcher.
   * Returns null if the dispatcher is unavailable (caller should fall back).
   */
  private dispatcherRun(
    scriptName: string,
    args: string[],
    options: PythonRunOptions = {},
  ): Promise<{ stdout: string; stderr: string }> | null {
    if (options.signal?.aborted) return Promise.reject(pythonAbortError());
    const proc = this.getChild();
    const stdin = proc?.stdin;
    if (!proc || !stdin || !this.childReady) return null;

    const id = randomUUID();
    const timeout = resolvePythonTimeout(options.timeout);

    return new Promise((resolvePromise, rejectPromise) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort: (() => void) | undefined;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (onAbort) options.signal?.removeEventListener("abort", onAbort);
      };

      const wrappedResolve = (result: { stdout: string; stderr: string }) => {
        cleanup();
        resolvePromise(result);
      };

      const wrappedReject = (err: Error) => {
        cleanup();
        rejectPromise(err);
      };

      if (timeout !== undefined) {
        timer = setTimeout(() => {
          this.pending.delete(id);
          // Kill the stuck dispatcher so it restarts on the next request instead of
          // blocking all subsequent operations behind the timed-out script.
          if (this.child === proc) {
            this.child = null;
            this.childReady = false;
          }
          if (!proc.killed) {
            proc.kill("SIGTERM");
          }
          wrappedReject(
            new SafeError("Python script timed out", {
              kind: "operational",
              code: "timeout",
            }),
          );
        }, timeout);
      }

      this.pending.set(id, {
        resolve: wrappedResolve,
        reject: wrappedReject,
        onProgress: options.onProgress,
        stderrLines: [],
        // getChild() above either reused or just spawned the child this
        // request is written to, so the current generation is its generation.
        generation: this.generation,
      });

      onAbort = () => {
        this.pending.delete(id);
        // The dispatcher executes synchronously and has no request-level cancel
        // protocol, so stopping the process is the only way to stop Python work.
        // Treat user cancellation as intentional teardown, not a dispatcher
        // crash; a deadline abort ("timeout" / TimeoutError) leaves proc out of
        // stoppedChildren so a hung script still counts as a crash on close.
        // Guard on !proc.killed so a sibling request canceled after a timeout
        // already signaled proc cannot retroactively mask the timeout crash.
        if (!proc.killed && !isTimeoutAbortReason(options.signal?.reason)) {
          this.stoppedChildren.add(proc);
        }
        if (this.child === proc) {
          this.child = null;
          this.childReady = false;
        }
        if (!proc.killed) proc.kill("SIGTERM");
        wrappedReject(pythonAbortError());
      };
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.signal?.aborted) {
        onAbort();
        return;
      }

      const msg: Record<string, unknown> = { id, script: scriptName.replace(".py", ""), args };
      const otelCarrier: Record<string, string> = {};
      propagation.inject(context.active(), otelCarrier);
      if (otelCarrier.traceparent) {
        msg._otel = {
          traceparent: otelCarrier.traceparent,
          tracestate: otelCarrier.tracestate,
        };
      }
      const request = JSON.stringify(msg);
      try {
        stdin.write(`${request}\n`);
      } catch {
        this.pending.delete(id);
        wrappedReject(
          new SafeError("Python dispatcher stdin closed unexpectedly", {
            kind: "operational",
            code: "dispatcher-stdin-closed",
          }),
        );
      }
    });
  }

  // ── Per-request fallback (original implementation) ──────────────

  private runPerRequest(
    scriptName: string,
    args: string[],
    options: PythonRunOptions = {},
  ): Promise<{ stdout: string; stderr: string }> {
    if (options.signal?.aborted) return Promise.reject(pythonAbortError());
    // Mirror the dispatcher's feature gate. The persistent dispatcher rejects
    // scripts whose bundle is not installed (in Python); this fallback spawns
    // scripts directly, so without the same check it would run them ungated
    // when the dispatcher is down (e.g. right after a model repair). Reject
    // with the same message the dispatcher path surfaces.
    if (missingBundleForScript(scriptName)) {
      return Promise.reject(
        new SafeError("feature_not_installed", {
          kind: "operational",
          code: "feature_not_installed",
        }),
      );
    }
    const scriptPath = resolve(PYTHON_DIR, scriptName);
    const timeout = resolvePythonTimeout(options.timeout);

    return new Promise((resolvePromise, rejectPromise) => {
      let activeAttempt = 0;
      let activeProcess: ChildProcess | null = null;
      let activeTimer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;

      const cleanup = () => {
        if (activeTimer) clearTimeout(activeTimer);
        options.signal?.removeEventListener("abort", onAbort);
      };
      const rejectOnce = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        rejectPromise(error);
      };
      const resolveOnce = (result: { stdout: string; stderr: string }) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolvePromise(result);
      };
      const onAbort = () => {
        if (settled) return;
        const processToStop = activeProcess;
        // Invalidate callbacks from the killed attempt before signaling it.
        activeAttempt++;
        if (processToStop && !processToStop.killed) processToStop.kill("SIGTERM");
        rejectOnce(pythonAbortError());
      };

      const trySpawn = (pythonBin: string, isFallback: boolean) => {
        if (settled) return;
        const attempt = ++activeAttempt;
        const proc = spawn(pythonBin, [scriptPath, ...args], {
          stdio: ["ignore", "pipe", "pipe"],
          env: this.buildEnv(),
        });
        activeProcess = proc;

        let stdout = "";
        const stderrLines: string[] = [];
        let stderrBuffer = "";
        let timedOut = false;

        const timer =
          timeout === undefined
            ? undefined
            : setTimeout(() => {
                if (attempt !== activeAttempt) return;
                timedOut = true;
                proc.kill("SIGTERM");
              }, timeout);
        activeTimer = timer;

        proc.stdout.on("data", (chunk: Buffer) => {
          if (attempt !== activeAttempt) return;
          stdout += chunk.toString();
        });

        const handleStderrLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;

          if (trimmed.startsWith("{")) {
            try {
              const parsed = JSON.parse(trimmed);
              if (typeof parsed?.progress === "number" && typeof parsed?.stage === "string") {
                if (!timedOut) options.onProgress?.(parsed.progress, parsed.stage);
                return;
              }
              if (typeof parsed?.info === "string") {
                aiLog.info(`[python] ${parsed.info}`);
                return;
              }
              if (typeof parsed?.warning === "string") {
                aiLog.warn(`[python] ${parsed.warning}`);
                return;
              }
            } catch {
              // Malformed JSON object - collect as regular stderr.
            }
          } else if (trimmed.startsWith("[")) {
            // Forward diagnostic messages to Node.js logger and collect as regular stderr.
            aiLog.info(`[python] ${trimmed}`);
          }
          stderrLines.push(trimmed);
        };

        proc.stderr.on("data", (chunk: Buffer) => {
          if (attempt !== activeAttempt) return;
          stderrBuffer += chunk.toString();
          const lines = stderrBuffer.split("\n");
          stderrBuffer = lines.pop() ?? "";

          for (const line of lines) {
            handleStderrLine(line);
          }
        });

        proc.on("error", (err: NodeJS.ErrnoException) => {
          if (timer) clearTimeout(timer);
          if (attempt !== activeAttempt) return;
          if (err.code === "ENOENT" && !isFallback) {
            trySpawn("python3", true);
          } else {
            rejectOnce(
              new SafeError(extractPythonError(err) || "Failed to start Python process", {
                kind: "operational",
                code: err.code ?? "spawn-error",
              }),
            );
          }
        });

        proc.on("close", (code, signal) => {
          if (timer) clearTimeout(timer);
          if (attempt !== activeAttempt) return;

          if (stderrBuffer.trim()) {
            handleStderrLine(stderrBuffer);
          }

          if (timedOut) {
            rejectOnce(
              new SafeError("Python script timed out", { kind: "operational", code: "timeout" }),
            );
            return;
          }

          const stderr = stderrLines.join("\n");

          if (code !== 0) {
            const raw = { stdout: stdout.trim(), stderr };
            rejectOnce(
              pythonExitError(code, signal, extractPythonError(raw), extractPythonErrorInfo(raw)),
            );
            return;
          }

          resolveOnce({ stdout: stdout.trim(), stderr });
        });
      };

      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.signal?.aborted) {
        onAbort();
        return;
      }
      trySpawn(getPythonPath(), false);
    });
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Whether the Python dispatcher detected a CUDA GPU at startup, optionally
   * scoped to a specific inference framework (`torch`, `onnx`, `ctranslate2`).
   * Falls back to `this.gpuAvail` when `framework` is omitted or when
   * `this.gpuFrameworks` was not populated.
   */
  isGpuAvailable(framework?: GpuFramework): boolean {
    if (framework !== undefined) {
      return this.gpuFrameworks?.[framework] ?? this.gpuAvail;
    }
    return this.gpuAvail;
  }

  getStatus(): DispatcherStatus {
    return {
      running: this.child !== null && !this.child.killed,
      ready: this.childReady,
      failed: this.childFailed,
      gpu: this.gpuAvail,
      pid: this.child?.pid ?? null,
      consecutiveCrashes: this.crashes,
      consecutiveScriptFailures: this.consecutiveScriptFailures,
      lastRecycleReason: this.lastRecycleReason,
    };
  }

  /**
   * Shut down the persistent dispatcher process.
   */
  shutdown(): void {
    // Clear per-framework probe state so a shutdown after installing or
    // resetting AI bundles re-probes on the next spawn instead of refusing
    // newly installed GPU frameworks against pre-install state.
    this.gpuProbed = false;
    this.gpuFrameworks = undefined;
    this.childScriptFailures = 0;
    if (this.child && !this.child.killed) {
      const proc = this.child;
      const gen = this.generation;
      this.stoppedChildren.add(proc);
      this.child = null;
      this.childReady = false;
      this.rejectPendingForGeneration(
        gen,
        new SafeError("Python dispatcher exited unexpectedly", {
          kind: "operational",
          code: "dispatcher-exit",
        }),
      );
      proc.stdin?.end();
      proc.kill("SIGTERM");
    }
  }

  /**
   * Eagerly start the Python dispatcher and wait for its readiness signal.
   * Returns the GPU status once ready, or {ready: false} on timeout/failure.
   * Safe to call multiple times -- idempotent if the dispatcher is already running.
   */
  init(timeoutMs = 30_000): Promise<{ ready: boolean; gpu: boolean }> {
    if (this.childReady) {
      return Promise.resolve({ ready: true, gpu: this.gpuAvail });
    }
    if (this.childFailed) {
      return Promise.resolve({ ready: false, gpu: false });
    }

    const proc = this.getChild();
    if (!proc) {
      return Promise.resolve({ ready: false, gpu: false });
    }

    return new Promise((resolvePromise) => {
      const timer = setTimeout(() => {
        clearInterval(poll);
        resolvePromise({ ready: false, gpu: false });
      }, timeoutMs);

      const poll = setInterval(() => {
        if (this.childReady) {
          clearTimeout(timer);
          clearInterval(poll);
          resolvePromise({ ready: true, gpu: this.gpuAvail });
        } else if (this.childFailed) {
          clearTimeout(timer);
          clearInterval(poll);
          resolvePromise({ ready: false, gpu: false });
        }
      }, 50);
    });
  }

  /**
   * Run a Python script with real-time progress streaming via stderr.
   *
   * Tries the persistent dispatcher first for warm-start performance.
   * Falls back to per-request spawning if the dispatcher is unavailable.
   */
  run(
    scriptName: string,
    args: string[],
    options: PythonRunOptions = {},
  ): Promise<{ stdout: string; stderr: string }> {
    const tracer = trace.getTracer("snapotter-sidecar");
    const span = trace.getActiveSpan()
      ? tracer.startSpan("sidecar.execute", {
          attributes: {
            "sidecar.script": scriptName.replace(".py", ""),
            "sidecar.profile": this.profile,
          },
        })
      : null;

    const doRun = (): Promise<{ stdout: string; stderr: string }> => {
      if (this.profile === "ai") {
        const gpuAvailable =
          options.memoryOptions?.gpuAvailable ??
          (this.gpuProbed
            ? this.gpuAvail
            : isNvidiaDevicePresent(options.memoryOptions?.deviceExists));
        const gpuFrameworks =
          options.memoryOptions?.gpuFrameworks ??
          (options.memoryOptions?.gpuAvailable === undefined && this.gpuProbed
            ? this.gpuFrameworks
            : undefined);
        const toolId = options.toolId ?? options.memoryOptions?.toolId;
        const refusal = sidecarMemoryRefusal(scriptName, {
          ...options.memoryOptions,
          ...(toolId !== undefined ? { toolId } : {}),
          gpuAvailable,
          ...(gpuFrameworks !== undefined ? { gpuFrameworks } : {}),
        });
        if (refusal) {
          return Promise.reject(
            new SafeError(refusal, {
              kind: "operational",
              code: "insufficient-memory",
            }),
          );
        }
      }

      // Try persistent dispatcher first
      const dispatcherPromise = this.dispatcherRun(scriptName, args, options);
      if (dispatcherPromise) {
        return dispatcherPromise.catch((err: Error) => {
          if (
            err.message === "Python dispatcher exited unexpectedly" ||
            err.message === "Python dispatcher stdin closed unexpectedly"
          ) {
            aiLog.warn(
              `[bridge] Dispatcher crashed during ${scriptName}, retrying with per-request process`,
            );
            return this.runPerRequest(scriptName, args, options).then((result) => ({
              ...result,
              stderr: `${result.stderr}\n[bridge] retried after dispatcher crash`,
            }));
          }
          throw err;
        });
      }

      // Fall back to per-request spawning
      return this.runPerRequest(scriptName, args, options);
    };

    const runWithSpan = (): Promise<{ stdout: string; stderr: string }> => {
      if (!span) return doRun();
      return doRun().then(
        (result) => {
          span.end();
          return result;
        },
        (err) => {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err instanceof Error ? err.message : String(err),
          });
          span.recordException(err instanceof Error ? err : new Error(String(err)));
          span.end();
          throw err;
        },
      );
    };

    // Serialize against bundle installs that mutate the shared venv: a job that
    // dlopens native libs (torch / onnxruntime CUDA) while pip rewrites them
    // segfaults the sidecar. In the common case the lock is free, so acquire it
    // synchronously and run inline (no microtask deferral, preserving the prior
    // call timing); only when an install holds it do we await.
    const release = tryAcquireVenvRead();
    if (release) return runWithSpan().finally(release);
    return acquireVenvRead().then((r) => runWithSpan().finally(r));
  }
}

// ── Singleton AI dispatcher (preserves existing module-level API) ──

let aiDispatcher: PythonDispatcher | null = null;

function getAiDispatcher(): PythonDispatcher {
  if (!aiDispatcher) aiDispatcher = new PythonDispatcher({ profile: "ai" });
  return aiDispatcher;
}

/**
 * Whether the Python dispatcher detected a CUDA GPU at startup, optionally
 * scoped to a specific inference framework (`torch`, `onnx`, `ctranslate2`).
 */
export function isGpuAvailable(framework?: GpuFramework): boolean {
  return getAiDispatcher().isGpuAvailable(framework);
}

export function getDispatcherStatus(): DispatcherStatus {
  return getAiDispatcher().getStatus();
}

/**
 * Shut down the persistent dispatcher process.
 */
export function shutdownDispatcher(): void {
  getAiDispatcher().shutdown();
}

/**
 * Eagerly start the Python dispatcher and wait for its readiness signal.
 * Returns the GPU status once ready, or {ready: false} on timeout/failure.
 * Safe to call multiple times -- idempotent if the dispatcher is already running.
 */
export function initDispatcher(timeoutMs = 30_000): Promise<{ ready: boolean; gpu: boolean }> {
  return getAiDispatcher().init(timeoutMs);
}

/**
 * Run a Python script with real-time progress streaming via stderr.
 *
 * Tries the persistent dispatcher first for warm-start performance.
 * Falls back to per-request spawning if the dispatcher is unavailable.
 */
export function runPythonWithProgress(
  scriptName: string,
  args: string[],
  options: PythonRunOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  return getAiDispatcher().run(scriptName, args, options);
}

// biome-ignore lint/suspicious/noExplicitAny: matches JSON.parse return type
export function parseStdoutJson(stdout: string): any {
  const matched = stdout.match(/\{[\s\S]*\}$/);
  if (!matched) {
    // SafeError so the broken-contract reason reaches Sentry instead of the
    // scrubber's type-only "Error: Error" fallback.
    throw new SafeError("No JSON response from Python script", { kind: "bug", code: "no-json" });
  }
  return JSON.parse(matched[0]);
}

// ── Docs-profile dispatcher ──────────────────────────────────────

let docsDispatcher: PythonDispatcher | null = null;

/** Lazy docs-profile dispatcher instance (same protocol, no new IPC). */
export function getDocsDispatcher(): PythonDispatcher {
  if (!docsDispatcher) docsDispatcher = new PythonDispatcher({ profile: "docs" });
  return docsDispatcher;
}

export async function runDocsScript(
  script: string,
  args: Record<string, unknown>,
  opts?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<string> {
  // Ensure .py extension: the dispatcher protocol strips it for the
  // in-process path, while the per-request fallback needs it for the
  // file path on disk.
  const scriptFile = script.endsWith(".py") ? script : `${script}.py`;
  const runOpts: PythonRunOptions = {};
  if (opts?.timeoutMs !== undefined) runOpts.timeout = opts.timeoutMs;
  if (opts?.signal !== undefined) runOpts.signal = opts.signal;
  const result = await getDocsDispatcher().run(
    scriptFile,
    [JSON.stringify(args)],
    Object.keys(runOpts).length > 0 ? runOpts : undefined,
  );
  return result.stdout;
}

export async function shutdownDocsDispatcher(): Promise<void> {
  docsDispatcher?.shutdown();
  docsDispatcher = null;
}
