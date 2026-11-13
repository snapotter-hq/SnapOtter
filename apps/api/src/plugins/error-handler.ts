import { isSafeMessageError } from "@snapotter/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { markUpstreamError, reportError } from "../lib/error-report.js";
import { stripInternalPaths } from "../lib/errors.js";
import { multipartFailure } from "../lib/multipart-parts.js";

// Stable fallback codes for errors that carry no SafeError code. Clients can
// branch on these without parsing the message. Keep the list in step with the
// error catalog in apps/docs/api/errors.md.
const STATUS_ERROR_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "AUTH_REQUIRED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "UNPROCESSABLE_ENTITY",
  429: "RATE_LIMITED",
  500: "INTERNAL_ERROR",
  501: "NOT_IMPLEMENTED",
  503: "SERVICE_UNAVAILABLE",
  507: "INSUFFICIENT_STORAGE",
};

export function errorCodeForStatus(statusCode: number): string {
  return STATUS_ERROR_CODES[statusCode] ?? (statusCode >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST");
}

function isRequestClientGone(request: FastifyRequest): boolean {
  const raw = request.raw as
    | {
        aborted?: boolean;
        destroyed?: boolean;
        complete?: boolean;
        socket?: { destroyed?: boolean } | null;
      }
    | undefined;
  if (!raw) return false;
  if (raw.aborted || raw.socket?.destroyed) return true;
  return Boolean(raw.destroyed && !raw.complete);
}

/**
 * Logs a request error and reports 5xx faults to Sentry. Shared with the
 * scoped SCIM error handler so both surfaces record the same log line and
 * telemetry context before formatting their own response body (#2230).
 */
export function logAndReportRequestError(
  error: Error & { statusCode?: number },
  request: FastifyRequest,
): number {
  const statusCode = error.statusCode ?? 500;
  if (statusCode === 429) {
    request.log.warn({ url: request.url, method: request.method }, "Rate limit exceeded");
  } else if (statusCode >= 500) {
    request.log.error(
      { err: error, url: request.url, method: request.method },
      "Unhandled request error",
    );
    if (request.raw && !isRequestClientGone(request)) {
      markUpstreamError(error);
    }
    void reportError(error, {
      source: "http",
      route: request.routeOptions?.url ?? undefined,
      method: request.method,
      statusCode,
    });
  } else {
    request.log.warn({ err: error, url: request.url, method: request.method }, "Request error");
  }
  return statusCode;
}

/**
 * Renders every error that escapes a route. A 4xx keeps its message; a 5xx is
 * masked behind a generic sentence unless it is a SafeError that was authored
 * with an HTTP status (the workspace cap, the disk floor), whose message is
 * ours and constant, so it is safe to show. Masking those too left a full
 * workspace (503) with nothing the user could act on: every request on the
 * instance failed with "Internal server error" until the TTL sweep freed
 * space (#1161). SafeErrors without a status keep the mask: the AI bridge
 * builds them from the sidecar's stderr, and they are only ever meant for
 * Sentry and the worker's own sanitizer. An over-limit multipart file's 413
 * answers through multipartFailure() instead, like the routes that catch it
 * (#2225).
 */
// Every JSON body gets the envelope: error bodies get a stable `code` and the
// `requestId`, including bodies a route sends directly with reply.send() and
// never reaches the handler. A route that sets its own code keeps it. A 202
// with a statusUrl also gets a Location header, so clients can follow it
// without parsing the body.
export function addResponseEnvelope(app: FastifyInstance): void {
  app.addHook("onSend", async (request, reply, payload) => {
    if (typeof payload !== "string") return payload;
    if (reply.statusCode < 400 && reply.statusCode !== 202) return payload;
    const type = reply.getHeader("content-type");
    if (typeof type !== "string" || !type.includes("application/json")) return payload;
    let body: unknown;
    try {
      body = JSON.parse(payload);
    } catch {
      return payload;
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return payload;
    const record = body as Record<string, unknown>;

    if (reply.statusCode === 202) {
      if (typeof record.statusUrl === "string") reply.header("Location", record.statusUrl);
      return payload;
    }
    if (typeof record.error !== "string") return payload;
    const enveloped = {
      ...record,
      code: typeof record.code === "string" ? record.code : errorCodeForStatus(reply.statusCode),
      requestId: record.requestId ?? request.id,
    };
    return JSON.stringify(enveloped);
  });
}

export function registerErrorHandler(app: FastifyInstance): void {
  addResponseEnvelope(app);
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    const statusCode = logAndReportRequestError(error, request);
    // An over-limit file whose error escaped a route's multipart read (the
    // routes tests/unit/api/multipart-failure-drift.test.ts pins on this
    // handler) gets the same 413 multipartFailure() gives the routes that
    // catch it, not the bare "request file too large" (#2225). Keyed on the
    // code as well as the status, because Fastify's own 413 for a body over
    // bodyLimit isn't a file over the upload limit.
    if (statusCode === 413 && (error as { code?: unknown }).code === "FST_REQ_FILE_TOO_LARGE") {
      const failure = multipartFailure(error);
      reply.status(failure.status).send(failure.body);
      return;
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
