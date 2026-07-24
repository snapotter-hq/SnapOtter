import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";

interface PythonResolutionOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fileExists?: (path: string) => boolean;
  locate?: (command: "where" | "which", executable: "python" | "python3") => readonly string[];
  platform?: NodeJS.Platform;
}

function locatePython(command: "where" | "which", executable: "python" | "python3"): string[] {
  const result = spawnSync(command, [executable], { encoding: "utf8" });
  if (result.status !== 0 || typeof result.stdout !== "string") return [];
  return result.stdout
    .split(/\r?\n/u)
    .map((path) => path.trim())
    .filter(Boolean);
}

/**
 * Resolve a Python 3 binary path that actually exists.
 * Checks the configured venv first, then falls back to system python3.
 * Returns null when no usable python3 is found.
 */
export function resolvePython({
  cwd = process.cwd(),
  env = process.env,
  fileExists = existsSync,
  locate = locatePython,
  platform = process.platform,
}: PythonResolutionOptions = {}): string | null {
  const path = platform === "win32" ? win32 : posix;
  const venv = env.PYTHON_VENV_PATH || path.join(cwd, ".venv");
  const venvPython = path.join(venv, platform === "win32" ? "Scripts/python.exe" : "bin/python3");
  if (fileExists(venvPython)) return venvPython;

  const locator = platform === "win32" ? "where" : "which";
  const executable = platform === "win32" ? "python" : "python3";
  return locate(locator, executable).find(fileExists) ?? null;
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

export interface GeneratedPythonCapabilities {
  fitz: boolean;
  markdown: boolean;
  pdf2docx: boolean;
  pikepdf: boolean;
  weasyprint: boolean;
}

const GENERATED_PYTHON_CAPABILITIES: GeneratedPythonCapabilities = {
  fitz: hasFitz,
  markdown: hasPython && pythonWith("markdown"),
  pdf2docx: hasPython && pythonWith("pdf2docx"),
  pikepdf: hasPikepdf,
  weasyprint: hasPython && pythonWith("weasyprint"),
};

const GENERATED_TOOL_MODULES: Readonly<
  Record<string, readonly (keyof GeneratedPythonCapabilities)[]>
> = {
  "flatten-pdf": ["fitz"],
  "html-to-pdf": ["weasyprint"],
  "markdown-to-pdf": ["weasyprint", "markdown"],
  "pdf-metadata": ["pikepdf"],
  "pdf-to-text": ["fitz"],
  "pdf-to-word": ["pdf2docx"],
  "redact-pdf": ["fitz"],
  "sign-pdf": ["fitz"],
};

/** Return the missing Python module for generated source and HTTP campaigns. */
export function findMissingGeneratedPythonPrerequisite(
  toolId: string,
  settings: unknown,
  capabilities: GeneratedPythonCapabilities = GENERATED_PYTHON_CAPABILITIES,
): string | undefined {
  let modules = GENERATED_TOOL_MODULES[toolId];
  if (toolId === "epub-convert") {
    const format =
      settings && typeof settings === "object" && "format" in settings
        ? (settings as { format?: unknown }).format
        : undefined;
    modules = format === "pdf" ? ["weasyprint"] : [];
  }

  const missing = modules?.find((moduleName) => !capabilities[moduleName]);
  return missing ? `Python module ${missing} is unavailable in this source environment` : undefined;
}
