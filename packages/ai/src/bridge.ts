import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON_DIR = resolve(__dirname, "../python");

/** Try venv first, then system python. */
function getPythonPath(): string {
  const venvPath =
    process.env.PYTHON_VENV_PATH || resolve(__dirname, "../../../.venv");
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

export interface ProgressCallback {
  (percent: number, stage: string): void;
}

/**
 * Run a Python script with real-time progress streaming via stderr.
 * Falls back to system python3 if the venv is not available.
 *
 * Python scripts emit progress as JSON lines to stderr:
 *   {"progress": 50, "stage": "Processing..."}
 *
 * Non-JSON stderr lines are collected as error output (backward compatible).
 */
export function runPythonWithProgress(
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
            if (
              typeof parsed.progress === "number" &&
              typeof parsed.stage === "string"
            ) {
              options.onProgress?.(parsed.progress, parsed.stage);
              continue;
            }
          } catch {
            // Not JSON — collect as regular stderr
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

