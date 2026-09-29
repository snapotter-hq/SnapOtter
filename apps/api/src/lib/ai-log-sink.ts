import { setAiLogger } from "@snapotter/ai";
import { logger } from "./logger.js";

/**
 * Send packages/ai diagnostics (the Python bridge, the OCR runtime check)
 * through the API's pino logger, so they reach LOG_DIR and the support bundle
 * instead of only stdout (#1500). Kept out of logger.ts so that importing the
 * logger doesn't pull in the whole AI package.
 */
export function routeAiLogsToPino(): void {
  setAiLogger({
    info: (message) => logger.info(message),
    warn: (message, error) =>
      error === undefined ? logger.warn(message) : logger.warn({ err: error }, message),
    error: (message, error) =>
      error === undefined ? logger.error(message) : logger.error({ err: error }, message),
  });
}
