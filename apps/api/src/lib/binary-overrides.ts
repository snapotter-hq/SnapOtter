import { accessSync, constants, statSync } from "node:fs";

/**
 * The engine binary overrides `.env.example` documents and the published
 * Compose files forward (#1091). Each resolver returns the override string
 * unchecked, so a typo or a host path boots clean and every job that needs
 * the binary then dies at spawn (#1310). The boot check here names the
 * variable and the path instead.
 */
export const BINARY_OVERRIDE_VARS = [
  "FFMPEG_PATH",
  "FFPROBE_PATH",
  "QPDF_PATH",
  "SOFFICE_PATH",
  "PDFCPU_PATH",
] as const;

export interface BinaryOverrideProblem {
  variable: (typeof BINARY_OVERRIDE_VARS)[number];
  path: string;
  reason: "does not exist" | "is not executable";
}

type ExecutableProbe = (path: string) => BinaryOverrideProblem["reason"] | null;

/**
 * Null when the path is an executable regular file, otherwise why it is not.
 * The file check comes first: `access(X_OK)` passes on any searchable
 * directory, and the install dir given instead of the binary is the likely
 * shape of this mistake.
 */
const MISSING_CODES = new Set(["ENOENT", "ENOTDIR", "ELOOP", "ENAMETOOLONG"]);

function probeExecutable(path: string): BinaryOverrideProblem["reason"] | null {
  try {
    if (!statSync(path).isFile()) return "is not executable";
    accessSync(path, constants.X_OK);
    return null;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "";
    return MISSING_CODES.has(code) ? "does not exist" : "is not executable";
  }
}

/**
 * Every set override whose path cannot be executed. Empty and unset values are
 * the documented "use the image's own binary" and are never probed.
 */
export function checkBinaryOverrides(
  source: Record<string, string | undefined>,
  isExecutable: ExecutableProbe = probeExecutable,
): BinaryOverrideProblem[] {
  const problems: BinaryOverrideProblem[] = [];
  for (const variable of BINARY_OVERRIDE_VARS) {
    const path = source[variable];
    if (!path) continue;
    const reason = isExecutable(path);
    if (reason) problems.push({ variable, path, reason });
  }
  return problems;
}

/** One boot-log line per problem, naming what to fix. */
export function binaryOverrideWarning(problem: BinaryOverrideProblem): string {
  return `${problem.variable}=${problem.path} ${problem.reason}; jobs that need this binary will fail until it points at an executable file or is unset`;
}

/**
 * True when the engine could not be started at all. Node marks every failure
 * of the spawn itself with a syscall of `spawn <path>` (or `spawnSync`),
 * whatever the errno: ENOENT for a missing path, EACCES for a directory or no
 * execute bit, ENOEXEC for a binary built for another architecture, ENOTDIR
 * for a path routed through a file. The memory-limit shim in
 * @snapotter/shared reproduces the same shape. A non-zero exit, a timeout or
 * a parse error carries no syscall and is about the input or the run, not
 * the configuration; so is an ENOENT from reading the input file, whose
 * syscall is "open".
 */
export function isBinarySpawnFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const { syscall, code } = err as NodeJS.ErrnoException;
  return typeof syscall === "string" && syscall.startsWith("spawn") && code !== undefined;
}

/**
 * A failed `ffmpeg -encoders` probe is `info` for the image's own binary (a
 * transient fault, jobs fail open) but a misconfiguration when the admin set
 * FFMPEG_PATH explicitly, and `info` sits below most production log filters.
 */
export function probeFailureLevel(ffmpegPath: string | undefined): "warn" | "info" {
  return ffmpegPath ? "warn" : "info";
}
