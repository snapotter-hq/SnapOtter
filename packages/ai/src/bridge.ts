import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON_DIR = resolve(__dirname, "../python");

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
    const execError = error as {
      stderr?: string;
      stdout?: string;
      message?: string;
    };
    for (const output of [execError.stdout, execError.stderr]) {
      if (output) {
        try {
          const parsed = JSON.parse(output.trim());
          if (parsed.error) return parsed.error;
        } catch {
          const trimmed = output.trim();
          if (trimmed && !trimmed.startsWith("Traceback")) {
            return trimmed;
          }
        }
      }
    }
    if (execError.message) return execError.message;
  }
  return String(error);
}

export type ProgressCallback = (percent: number, stage: string) => void;

// ── Persistent dispatcher ───────────────────────────────────────────

interface PendingRequest {
  resolve: (result: { stdout: string; stderr: string }) => void;
  reject: (err: Error) => void;
  onProgress?: ProgressCallback;
  stderrLines: string[];
}

let dispatcher: ChildProcess | null = null;
let dispatcherReady = false;
let dispatcherFailed = false;
// biome-ignore lint/style/useConst: reassigned on dispatcher readiness signal
let dispatcherGpuAvailable = false;
const pendingRequests = new Map<string, PendingRequest>();
let stdoutBuffer = "";

function startDispatcher(): ChildProcess | null {
  if (dispatcherFailed) return null;

  try {
    const child = spawn(getPythonPath(), [resolve(PYTHON_DIR, "dispatcher.py")], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderrBuffer = "";

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
      const lines = stderrBuffer.split("\n");
      stderrBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const parsed = JSON.parse(trimmed);

          // Readiness signal
          if (parsed.ready === true) {
            dispatcherReady = true;
            dispatcherGpuAvailable = parsed.gpu === true;
            continue;
          }

          // Progress event - route to the currently active request
          if (typeof parsed.progress === "number" && typeof parsed.stage === "string") {
            // Progress goes to all pending requests (only one should be active at a time
            // since Python processes synchronously)
            for (const req of pendingRequests.values()) {
              req.onProgress?.(parsed.progress, parsed.stage);
            }
          }
        } catch {
          // Not JSON - collect as error output for pending requests
          for (const req of pendingRequests.values()) {
            req.stderrLines.push(trimmed);
          }
        }
      }
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const response = JSON.parse(trimmed);
          const reqId = response.id;
          const pending = pendingRequests.get(reqId);
          if (pending) {
            pendingRequests.delete(reqId);
            if (response.exitCode !== 0) {
              pending.reject(
                new Error(
                  extractPythonError({
                    stdout: response.stdout,
                    stderr: pending.stderrLines.join("\n"),
                  }) || `Python script exited with code ${response.exitCode}`,
                ),
              );
            } else {
              pending.resolve({
                stdout: response.stdout || "",
                stderr: pending.stderrLines.join("\n"),
              });
            }
          }
        } catch {
          // Not a valid response line
        }
      }
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        // Venv python not found - mark as failed, will fall back to per-request
        dispatcherFailed = true;
      }
      // Reject all pending requests
      for (const [id, req] of pendingRequests.entries()) {
        req.reject(new Error(extractPythonError(err)));
        pendingRequests.delete(id);
      }
      dispatcher = null;
      dispatcherReady = false;
    });

    child.on("close", () => {
      // Reject all pending requests
      for (const [id, req] of pendingRequests.entries()) {
        req.reject(new Error("Python dispatcher exited unexpectedly"));
        pendingRequests.delete(id);
      }
      dispatcher = null;
      dispatcherReady = false;
    });

    return child;
  } catch {
    dispatcherFailed = true;
    return null;
  }
}

function getDispatcher(): ChildProcess | null {
  if (dispatcherFailed) return null;
  if (!dispatcher || dispatcher.killed) {
    dispatcher = startDispatcher();
  }
  return dispatcher;
}

/**
 * Send a request to the persistent Python dispatcher.
 * Returns null if the dispatcher is unavailable (caller should fall back).
 */
function dispatcherRun(
  scriptName: string,
  args: string[],
  options: { onProgress?: ProgressCallback; timeout?: number } = {},
): Promise<{ stdout: string; stderr: string }> | null {
  const proc = getDispatcher();
  if (!proc || !proc.stdin || !dispatcherReady) return null;

  const id = randomUUID();
  const timeout = options.timeout ?? 300000;

  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
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

    pendingRequests.set(id, {
      resolve: wrappedResolve,
      reject: wrappedReject,
      onProgress: options.onProgress,
      stderrLines: [],
    });

    const request = JSON.stringify({ id, script: scriptName.replace(".py", ""), args });
    proc.stdin!.write(request + "\n");
  });
}

/**
 * Whether the Python dispatcher detected a CUDA GPU at startup.
 */
export function isGpuAvailable(): boolean {
  return dispatcherGpuAvailable;
}

/**
 * Shut down the persistent dispatcher process.
 */
export function shutdownDispatcher(): void {
  if (dispatcher && !dispatcher.killed) {
    dispatcher.stdin?.end();
    dispatcher.kill("SIGTERM");
    dispatcher = null;
    dispatcherReady = false;
  }
}

// ── Per-request fallback (original implementation) ──────────────────

function runPythonPerRequest(
  scriptName: string,
  args: string[],
  options: {
    onProgress?: ProgressCallback;
    timeout?: number;
  } = {},
): Promise<{ stdout: string; stderr: string }> {
  const scriptPath = resolve(PYTHON_DIR, scriptName);
  const timeout = options.timeout ?? 300000;

  return new Promise((resolvePromise, rejectPromise) => {
    const trySpawn = (pythonBin: string, isFallback: boolean) => {
      const child = spawn(pythonBin, [scriptPath, ...args], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      const stderrLines: string[] = [];
      let stderrBuffer = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeout);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer) => {
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

      child.on("error", (err: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        if (err.code === "ENOENT" && !isFallback) {
          trySpawn("python3", true);
        } else {
          rejectPromise(new Error(extractPythonError(err)));
        }
      });

      child.on("close", (code) => {
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
          const errorText =
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

// ── Public API (unchanged signature) ────────────────────────────────

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
  // Try persistent dispatcher first
  const dispatcherPromise = dispatcherRun(scriptName, args, options);
  if (dispatcherPromise) {
    return dispatcherPromise;
  }

  // Fall back to per-request spawning
  return runPythonPerRequest(scriptName, args, options);
}
