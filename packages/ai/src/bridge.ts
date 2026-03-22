import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON_DIR = resolve(__dirname, "../python");

/** Try venv first, then system python. */
function getPythonPath(): string {
  const venvPath = process.env.PYTHON_VENV_PATH || resolve(__dirname, "../../../.venv");
  return `${venvPath}/bin/python3`;
}

/**
 * Extract a user-friendly error from a Python process error.
 * Python scripts print JSON to stderr/stdout on failure — try to parse it.
 */
function extractPythonError(error: unknown): string {
  if (error && typeof error === "object") {
    const execError = error as {
      stderr?: string;
      stdout?: string;
      message?: string;
    };
    // Try stdout first (Python scripts write JSON errors there), then stderr
    for (const output of [execError.stdout, execError.stderr]) {
      if (output) {
        try {
          const parsed = JSON.parse(output.trim());
          if (parsed.error) return parsed.error;
        } catch {
          // Not JSON, check for human-readable content
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

/**
 * Run a Python script from packages/ai/python/ with the given arguments.
 * Falls back to system python3 if the venv is not available.
 */
export async function runPythonScript(
  scriptName: string,
  args: string[],
  timeoutMs = 300000, // 5 min default
): Promise<{ stdout: string; stderr: string }> {
  const scriptPath = resolve(PYTHON_DIR, scriptName);
  const pythonPath = getPythonPath();

  const execOpts = {
    timeout: timeoutMs,
    maxBuffer: 50 * 1024 * 1024, // 50MB
  };

  try {
    const { stdout, stderr } = await execFileAsync(
      pythonPath,
      [scriptPath, ...args],
      execOpts,
    );
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (venvError: unknown) {
    // Only fall back to system python if the venv python binary doesn't exist
    // (ENOENT). If the script itself failed, re-throw — don't hide the error.
    const isNotFound =
      venvError &&
      typeof venvError === "object" &&
      "code" in venvError &&
      (venvError as { code?: string }).code === "ENOENT";

    if (!isNotFound) {
      const message = extractPythonError(venvError);
      throw new Error(message);
    }

    // venv python not found — try system python3 as fallback
    try {
      const { stdout, stderr } = await execFileAsync(
        "python3",
        [scriptPath, ...args],
        execOpts,
      );
      return { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (fallbackError: unknown) {
      const message = extractPythonError(fallbackError);
      throw new Error(message);
    }
  }
}
