import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { context, propagation, SpanStatusCode, trace } from "@opentelemetry/api";
import { missingBundleForScript } from "./feature-gate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON_DIR = resolve(__dirname, "../python");

/**
 * Build a minimal environment for spawned Python processes.
 * Only passes through variables needed for venv, CUDA, model cache,
 * package resolution, and locale -- avoids leaking secrets or
 * application config from the parent process.
 */
function buildMinimalEnv(): Record<string, string> {
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
  return env;
}

/** Try venv first, then system python. */
function getPythonPath(): string {
  const venvPath = process.env.PYTHON_VENV_PATH || resolve(__dirname, "../../../.venv");
  return `${venvPath}/bin/python3`;
}

/**
 * Extract a user-friendly error from a Python process error.
 */
function extractPythonError(error: unknown): string {
  if (error && typeof error === "object") {
    const pErr = error as {
      stderr?: string;
      stdout?: string;
      message?: string;
    };
    for (const output of [pErr.stdout, pErr.stderr]) {
      if (output) {
        try {
          const parsed = JSON.parse(output.trim());
          if (parsed.error) return parsed.error;
        } catch {
          const trimmed = output.trim();
          if (trimmed && !trimmed.startsWith("Traceback")) {
            return trimmed;
          }
          // Extract the last meaningful line from a Python Traceback
          if (trimmed) {
            const lines = trimmed
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean);
            const lastLine = lines[lines.length - 1];
            if (lastLine && lastLine !== "Traceback (most recent call last):") {
              return lastLine;
            }
          }
        }
      }
    }
    if (pErr.message) return pErr.message;
    // Return empty string for {stdout, stderr} objects with no useful content
    // so the caller's fallback message (e.g. exit code) kicks in.
    return "";
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export type ProgressCallback = (percent: number, stage: string) => void;

// ── PythonDispatcher class ─────────────────────────────────────────

interface PendingRequest {
  resolve: (result: { stdout: string; stderr: string }) => void;
  reject: (err: Error) => void;
  onProgress?: ProgressCallback;
  stderrLines: string[];
}

// Crash recovery constants
const CRASH_WINDOW_MS = 60_000;
const MAX_CONSECUTIVE_CRASHES = 5;
const BASE_BACKOFF_MS = 1_000;

export interface DispatcherStatus {
  running: boolean;
  ready: boolean;
  failed: boolean;
  gpu: boolean;
  pid: number | null;
  consecutiveCrashes: number;
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
  private pending = new Map<string, PendingRequest>();
  private stdoutBuf = "";
  private crashes = 0;
  private lastCrashTs = 0;
  private backoffEnd = 0;

  constructor(opts: { profile: "ai" | "docs" }) {
    this.profile = opts.profile;
  }

  private buildEnv(): Record<string, string> {
    const env = buildMinimalEnv();
    env.DISPATCHER_PROFILE = this.profile;
    return env;
  }

  private recordCrash(): void {
    const now = Date.now();
    if (now - this.lastCrashTs > CRASH_WINDOW_MS) {
      this.crashes = 1;
    } else {
      this.crashes++;
    }
    this.lastCrashTs = now;

    if (this.crashes >= MAX_CONSECUTIVE_CRASHES) {
      console.error(
        `[bridge] Dispatcher crashed ${this.crashes} times in ${CRASH_WINDOW_MS / 1000}s, disabling permanently`,
      );
      this.childFailed = true;
      return;
    }

    const delay = BASE_BACKOFF_MS * 2 ** (this.crashes - 1);
    this.backoffEnd = now + delay;
    console.warn(
      `[bridge] Dispatcher crash #${this.crashes}, backing off ${delay}ms before restart`,
    );
  }

  private startChild(): ChildProcess | null {
    if (this.childFailed) return null;

    try {
      const proc = spawn(getPythonPath(), [resolve(PYTHON_DIR, "dispatcher.py")], {
        stdio: ["pipe", "pipe", "pipe"],
        env: this.buildEnv(),
      });

      proc.stdin?.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EPIPE" || err.code === "ERR_STREAM_DESTROYED") {
          console.error(
            `[bridge] Dispatcher stdin pipe broken (${err.code}), rejecting pending requests`,
          );
          for (const [id, req] of this.pending.entries()) {
            req.reject(new Error("Python dispatcher stdin closed unexpectedly"));
            this.pending.delete(id);
          }
          this.recordCrash();
          this.child = null;
          this.childReady = false;
        }
      });

      let stderrBuf = "";

      proc.stderr?.on("data", (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        const lines = stderrBuf.split("\n");
        stderrBuf = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const parsed = JSON.parse(trimmed);

            // Readiness signal
            if (parsed.ready === true) {
              this.childReady = true;
              this.gpuAvail = parsed.gpu === true;
              this.crashes = 0;
              console.log(`[bridge] Python dispatcher ready (GPU: ${parsed.gpu === true})`);
              continue;
            }

            // Progress event - route to the currently active request
            if (typeof parsed.progress === "number" && typeof parsed.stage === "string") {
              // Progress goes to all pending requests (only one should be active at a time
              // since Python processes synchronously)
              for (const req of this.pending.values()) {
                req.onProgress?.(parsed.progress, parsed.stage);
              }
            }
          } catch {
            // Not JSON - forward diagnostic messages to Node.js logger,
            // collect the rest as error output for pending requests.
            if (trimmed.startsWith("[")) {
              console.log(`[python] ${trimmed}`);
            }
            for (const req of this.pending.values()) {
              req.stderrLines.push(trimmed);
            }
          }
        }
      });

      proc.stdout?.on("data", (chunk: Buffer) => {
        this.stdoutBuf += chunk.toString();
        const lines = this.stdoutBuf.split("\n");
        this.stdoutBuf = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const response = JSON.parse(trimmed);
            const reqId = response.id;
            const req = this.pending.get(reqId);
            if (req) {
              this.pending.delete(reqId);
              if (response.exitCode !== 0) {
                const errText =
                  extractPythonError({
                    stdout: response.stdout,
                    stderr: req.stderrLines.join("\n"),
                  }) ||
                  (response.exitCode === 137
                    ? "Process killed (out of memory) -- try a lighter model or smaller image"
                    : response.exitCode === 139
                      ? "Process crashed (segmentation fault)"
                      : `Python script exited with code ${response.exitCode}`);
                req.reject(new Error(errText));
              } else {
                req.resolve({
                  stdout: response.stdout || "",
                  stderr: req.stderrLines.join("\n"),
                });
              }
            }
          } catch {
            // Not a valid response line
          }
        }
      });

      proc.on("error", (err: NodeJS.ErrnoException) => {
        console.error(`[bridge] Dispatcher error: ${err.message} (code: ${err.code})`);
        if (err.code === "ENOENT") {
          this.childFailed = true;
        } else {
          this.recordCrash();
        }
        for (const [id, req] of this.pending.entries()) {
          req.reject(new Error(extractPythonError(err)));
          this.pending.delete(id);
        }
        this.child = null;
        this.childReady = false;
      });

      proc.on("close", (code) => {
        for (const [id, req] of this.pending.entries()) {
          req.reject(new Error("Python dispatcher exited unexpectedly"));
          this.pending.delete(id);
        }
        if (code !== 0) {
          this.recordCrash();
        }
        this.child = null;
        this.childReady = false;
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
    options: { onProgress?: ProgressCallback; timeout?: number } = {},
  ): Promise<{ stdout: string; stderr: string }> | null {
    const proc = this.getChild();
    if (!proc || !proc.stdin || !this.childReady) return null;

    const id = randomUUID();
    const timeout =
      options.timeout ??
      (process.env.PROCESSING_TIMEOUT_S && parseInt(process.env.PROCESSING_TIMEOUT_S, 10) > 0
        ? parseInt(process.env.PROCESSING_TIMEOUT_S, 10) * 1000
        : 600000);

    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        // Kill the stuck dispatcher so it restarts on the next request instead of
        // blocking all subsequent operations behind the timed-out script.
        if (this.child && !this.child.killed) {
          this.child.kill("SIGTERM");
        }
        rejectPromise(new Error("Python script timed out"));
      }, timeout);

      const wrappedResolve = (result: { stdout: string; stderr: string }) => {
        clearTimeout(timer);
        resolvePromise(result);
      };

      const wrappedReject = (err: Error) => {
        clearTimeout(timer);
        rejectPromise(err);
      };

      this.pending.set(id, {
        resolve: wrappedResolve,
        reject: wrappedReject,
        onProgress: options.onProgress,
        stderrLines: [],
      });

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
        proc.stdin!.write(request + "\n");
      } catch {
        this.pending.delete(id);
        clearTimeout(timer);
        rejectPromise(new Error("Python dispatcher stdin closed unexpectedly"));
      }
    });
  }

  // ── Per-request fallback (original implementation) ──────────────

  private runPerRequest(
    scriptName: string,
    args: string[],
    options: {
      onProgress?: ProgressCallback;
      timeout?: number;
    } = {},
  ): Promise<{ stdout: string; stderr: string }> {
    // Mirror the dispatcher's feature gate. The persistent dispatcher rejects
    // scripts whose bundle is not installed (in Python); this fallback spawns
    // scripts directly, so without the same check it would run them ungated
    // when the dispatcher is down (e.g. right after a model repair). Reject
    // with the same message the dispatcher path surfaces.
    if (missingBundleForScript(scriptName)) {
      return Promise.reject(new Error("feature_not_installed"));
    }
    const scriptPath = resolve(PYTHON_DIR, scriptName);
    const timeout =
      options.timeout ??
      (process.env.PROCESSING_TIMEOUT_S && parseInt(process.env.PROCESSING_TIMEOUT_S, 10) > 0
        ? parseInt(process.env.PROCESSING_TIMEOUT_S, 10) * 1000
        : 600000);

    return new Promise((resolvePromise, rejectPromise) => {
      const trySpawn = (pythonBin: string, isFallback: boolean) => {
        const proc = spawn(pythonBin, [scriptPath, ...args], {
          stdio: ["ignore", "pipe", "pipe"],
          env: this.buildEnv(),
        });

        let stdout = "";
        const stderrLines: string[] = [];
        let stderrBuffer = "";
        let timedOut = false;

        const timer = setTimeout(() => {
          timedOut = true;
          proc.kill("SIGTERM");
        }, timeout);

        proc.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });

        proc.stderr.on("data", (chunk: Buffer) => {
          stderrBuffer += chunk.toString();
          const lines = stderrBuffer.split("\n");
          stderrBuffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              const parsed = JSON.parse(trimmed);
              if (typeof parsed.progress === "number" && typeof parsed.stage === "string") {
                options.onProgress?.(parsed.progress, parsed.stage);
                continue;
              }
            } catch {
              // Not JSON - collect as regular stderr
            }
            stderrLines.push(trimmed);
          }
        });

        proc.on("error", (err: NodeJS.ErrnoException) => {
          clearTimeout(timer);
          if (err.code === "ENOENT" && !isFallback) {
            trySpawn("python3", true);
          } else {
            rejectPromise(new Error(extractPythonError(err)));
          }
        });

        proc.on("close", (code, signal) => {
          clearTimeout(timer);

          if (stderrBuffer.trim()) {
            stderrLines.push(stderrBuffer.trim());
          }

          if (timedOut) {
            rejectPromise(new Error("Python script timed out"));
            return;
          }

          const stderr = stderrLines.join("\n");

          if (code !== 0) {
            // When the process was killed by a signal, use a clear message
            // instead of surfacing unrelated stderr (e.g. CUDA warnings).
            const signalMsg =
              signal === "SIGKILL" || code === 137
                ? "Process killed (out of memory) -- try a lighter model or smaller image"
                : signal === "SIGSEGV" || code === 139
                  ? "Process crashed (segmentation fault)"
                  : null;
            const errorText =
              signalMsg ||
              extractPythonError({ stdout: stdout.trim(), stderr }) ||
              `Python script exited with code ${code}`;
            rejectPromise(new Error(errorText));
            return;
          }

          resolvePromise({ stdout: stdout.trim(), stderr });
        });
      };

      trySpawn(getPythonPath(), false);
    });
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Whether the Python dispatcher detected a CUDA GPU at startup.
   */
  isGpuAvailable(): boolean {
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
    };
  }

  /**
   * Shut down the persistent dispatcher process.
   */
  shutdown(): void {
    if (this.child && !this.child.killed) {
      this.child.stdin?.end();
      this.child.kill("SIGTERM");
      this.child = null;
      this.childReady = false;
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
    options: {
      onProgress?: ProgressCallback;
      timeout?: number;
    } = {},
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
      // Try persistent dispatcher first
      const dispatcherPromise = this.dispatcherRun(scriptName, args, options);
      if (dispatcherPromise) {
        return dispatcherPromise.catch((err: Error) => {
          if (
            err.message === "Python dispatcher exited unexpectedly" ||
            err.message === "Python dispatcher stdin closed unexpectedly"
          ) {
            console.warn(
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
  }
}

// ── Singleton AI dispatcher (preserves existing module-level API) ──

let aiDispatcher: PythonDispatcher | null = null;

function getAiDispatcher(): PythonDispatcher {
  if (!aiDispatcher) aiDispatcher = new PythonDispatcher({ profile: "ai" });
  return aiDispatcher;
}

/**
 * Whether the Python dispatcher detected a CUDA GPU at startup.
 */
export function isGpuAvailable(): boolean {
  return getAiDispatcher().isGpuAvailable();
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
  options: {
    onProgress?: ProgressCallback;
    timeout?: number;
  } = {},
): Promise<{ stdout: string; stderr: string }> {
  return getAiDispatcher().run(scriptName, args, options);
}

// biome-ignore lint/suspicious/noExplicitAny: matches JSON.parse return type
export function parseStdoutJson(stdout: string): any {
  const matched = stdout.match(/\{[\s\S]*\}$/);
  if (!matched) throw new Error("No JSON response from Python script");
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
  opts?: { timeoutMs?: number },
): Promise<string> {
  // Ensure .py extension: the dispatcher protocol strips it for the
  // in-process path, while the per-request fallback needs it for the
  // file path on disk.
  const scriptFile = script.endsWith(".py") ? script : `${script}.py`;
  const result = await getDocsDispatcher().run(
    scriptFile,
    [JSON.stringify(args)],
    opts?.timeoutMs ? { timeout: opts.timeoutMs } : undefined,
  );
  return result.stdout;
}

export async function shutdownDocsDispatcher(): Promise<void> {
  docsDispatcher?.shutdown();
  docsDispatcher = null;
}
