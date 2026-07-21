import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Resolve a Python 3 binary path that actually exists.
 * Checks the configured venv first, then falls back to system python3.
 * Returns null when no usable python3 is found.
 */
function resolvePython(): string | null {
  const venv = process.env.PYTHON_VENV_PATH || join(process.cwd(), ".venv");
  if (existsSync(`${venv}/bin/python3`)) return `${venv}/bin/python3`;
  const res = spawnSync("which", ["python3"], { encoding: "utf8" });
  if (res.status === 0 && res.stdout.trim()) {
    const bin = res.stdout.trim();
    const parts = bin.split("/");
    if (parts.length >= 3) {
      const prefix = parts.slice(0, -2).join("/");
      if (existsSync(`${prefix}/bin/python3`)) return `${prefix}/bin/python3`;
    }
  }
  return null;
}

export const pythonBin = resolvePython();

/** Check whether a Python module is importable by the resolved interpreter. */
export function pythonWith(mod: string): boolean {
  if (!pythonBin) return false;
  const res = spawnSync(pythonBin, ["-c", `import ${mod}`], { encoding: "utf8" });
  return res.status === 0;
}

export const hasPython = pythonBin !== null;
export const hasFitz = hasPython && pythonWith("fitz");
export const hasPikepdf = hasPython && pythonWith("pikepdf");
