import { isSafeMessageError } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { reportError } from "../lib/error-report.js";
import { stripInternalPaths } from "../lib/errors.js";

/**
 * Renders every error that escapes a route. A 4xx keeps its message; a 5xx is
 * masked behind a generic sentence unless it is a SafeError that was authored
 * with an HTTP status (the workspace cap, the disk floor), whose message is
 * ours and constant, so it is safe to show. Masking those too left a full
 * workspace (503) with nothing the user could act on: every request on the
 * instance failed with "Internal server error" until the TTL sweep freed
 * space (#1161). SafeErrors without a status keep the mask: the AI bridge
 * builds them from the sidecar's stderr, and they are only ever meant for
 * Sentry and the worker's own sanitizer.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode === 429) {
      request.log.warn({ url: request.url, method: request.method }, "Rate limit exceeded");
    } else if (statusCode >= 500) {
      request.log.error(
        { err: error, url: request.url, method: request.method },
        "Unhandled request error",
      );
      void reportError(error, {
        source: "http",
        route: request.routeOptions?.url ?? undefined,
        method: request.method,
        statusCode,
      });
    } else {
      request.log.warn({ err: error, url: request.url, method: request.method }, "Request error");
    }
    const safe = isSafeMessageError(error) && error.statusCode !== undefined;
    reply.status(statusCode).send({
      error:
        statusCode >= 500 && !safe ? "Internal server error" : stripInternalPaths(error.message),
      ...(statusCode < 500 && { details: stripInternalPaths(error.message) }),
      ...(safe && error.code ? { code: error.code } : {}),
    });
  });
}
