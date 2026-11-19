import { type AiInstallErrorKind, connectivityClass, SafeError } from "@snapotter/shared";

export interface AiInstallFailure {
  /** The installer's exit code; null when a signal ended it. */
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  /** The install watchdog killed it for stalling or running too long. */
  watchdogKilled?: boolean;
  /** The failure text. Only matched here, never sent anywhere. */
  message?: string;
  /** The underlying error, for its errno code and connectivity class. */
  error?: unknown;
}

const STORAGE_ERRNOS = new Set(["ENOSPC", "EDQUOT", "EROFS", "EACCES", "EPERM"]);

// Order matters: the checksum retry message mentions a failed re-download, and
// a disk-full download names the download too, so both win over network.
const MESSAGE_KINDS: ReadonlyArray<[RegExp, AiInstallErrorKind]> = [
  [/illegal instruction|SIGILL|\bAVX\b/i, "cpu_unsupported"],
  [
    /disk space|no space left|ENOSPC|EDQUOT|read-only file system|permission denied|EACCES|EROFS/i,
    "disk",
  ],
  [/checksum|sha-?256|integrity|signature/i, "checksum"],
  [
    /download|HTTP \d{3}|connection|network|name resolution|getaddrinfo|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|urlopen|SSL/i,
    "network",
  ],
  [/timed out|timeout/i, "timeout"],
];

function errnoCodes(err: unknown): string[] {
  const codes: string[] = [];
  for (let cur = err, depth = 0; cur && typeof cur === "object" && depth < 6; depth++) {
    const { code, cause } = cur as { code?: unknown; cause?: unknown };
    if (typeof code === "string") codes.push(code);
    cur = cause;
  }
  return codes;
}

/**
 * A low-cardinality reason for a failed AI bundle install, so telemetry can say
 * whether failures share one cause without carrying the raw message (#4821).
 */
export function classifyAiInstallFailure(failure: AiInstallFailure): AiInstallErrorKind {
  if (failure.watchdogKilled) return "timeout";
  // 137 is 128 + SIGKILL as a shell reports it; a direct kill arrives as the
  // signal. Either way the kernel's OOM killer is the usual sender in a container.
  if (failure.exitCode === 137 || failure.signal === "SIGKILL") return "oom";
  if (failure.exitCode === 132 || failure.signal === "SIGILL") return "cpu_unsupported";
  const codes = errnoCodes(failure.error);
  if (codes.some((c) => STORAGE_ERRNOS.has(c))) return "disk";
  if (failure.error !== undefined && connectivityClass(failure.error)) return "network";
  const message = failure.message ?? "";
  for (const [pattern, kind] of MESSAGE_KINDS) {
    if (pattern.test(message)) return kind;
  }
  return "other";
}

/**
 * The Sentry stand-in for a failed install. The message is constant and the
 * kind rides `code`, so Sentry groups one issue per cause; the raw installer
 * output stays out because it can carry paths and hostnames.
 */
export function aiInstallFailureError(kind: AiInstallErrorKind): SafeError {
  return new SafeError("AI bundle install failed", {
    kind: "operational",
    code: `AI_INSTALL_${kind.toUpperCase()}`,
  });
}
