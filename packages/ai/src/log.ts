/**
 * Where packages/ai sends its diagnostics. It defaults to the console so the
 * package works on its own; the API points it at its pino logger at startup,
 * so these lines reach LOG_DIR and the support bundle like the rest of the
 * server's logs (#1500).
 */
export interface AiLogger {
  info(message: string): void;
  warn(message: string, error?: unknown): void;
  error(message: string, error?: unknown): void;
}

// Looks up console at call time, so a test's console spy still sees the call.
const consoleLogger: AiLogger = {
  info: (message) => console.log(message),
  warn: (message, error) =>
    error === undefined ? console.warn(message) : console.warn(message, error),
  error: (message, error) =>
    error === undefined ? console.error(message) : console.error(message, error),
};

let sink: AiLogger = consoleLogger;

/** Send packages/ai logging to `logger`, or back to the console with null. */
export function setAiLogger(logger: AiLogger | null): void {
  sink = logger ?? consoleLogger;
}

export const aiLog: AiLogger = {
  info: (message) => sink.info(message),
  warn: (message, error) => sink.warn(message, error),
  error: (message, error) => sink.error(message, error),
};

const MAX_EXIT_DETAIL_CHARS = 500;

/**
 * One-line summary of a Python child that exited unexpectedly: its exit code,
 * its signal (an OOM kill shows as `code null, signal SIGKILL`), and the end of
 * its stderr. The stderr can quote upload paths and model names, so control
 * characters are flattened and only the tail is kept: one crash can't forge
 * or flood the rolling log files.
 */
export function describeUnexpectedExit(
  code: number | null,
  signal: NodeJS.Signals | null,
  stderrLines: readonly string[],
): string {
  const stderr = stderrLines
    .map((line) => line.replace(/[\p{Cc}\p{Cf}\s]+/gu, " ").trim())
    .filter(Boolean)
    .join(" | ")
    .slice(-MAX_EXIT_DETAIL_CHARS);
  return `exit code ${String(code)}, signal ${signal ?? "none"}${stderr ? `; last stderr: ${stderr}` : ""}`;
}
