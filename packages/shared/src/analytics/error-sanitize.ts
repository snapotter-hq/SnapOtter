/**
 * Pure error-inspection helpers shared by the api and web Sentry scrubbers.
 * Everything here rebuilds safe strings from VETTED FIELDS ONLY; raw error
 * messages are never passed through (except SafeError, whose messages we
 * author). Returning null means "no safe rebuild known, use type-only".
 */
import { isSafeMessageError } from "../tool-errors.js";

interface ErrLike {
  name?: unknown;
  code?: unknown;
  syscall?: unknown;
  severity?: unknown;
  routine?: unknown;
  message?: unknown;
  cause?: unknown;
  issues?: unknown;
  status?: unknown;
}

const NODE_CODE = /^E[A-Z0-9_]+$/;
const SQLSTATE = /^[0-9A-Z]{5}$/;
const PG_CONNECTIVITY = /^(08|57P0[123])/;
const PG_ROUTINE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const REPLY_TOKEN = /^[A-Z][A-Z0-9_]{1,19}$/;
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_$]{0,63}$/;
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const NET_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
]);

function chain(err: unknown, max = 6): ErrLike[] {
  const out: ErrLike[] = [];
  let cur = err;
  while (cur && typeof cur === "object" && out.length < max) {
    out.push(cur as ErrLike);
    cur = (cur as ErrLike).cause;
  }
  return out;
}

function looksLikePg(links: ErrLike[]): boolean {
  return links.some(
    (l) =>
      (typeof l.code === "string" && SQLSTATE.test(l.code) && !NODE_CODE.test(l.code)) ||
      l.severity !== undefined ||
      l.name === "PostgresError" ||
      l.name === "DrizzleQueryError" ||
      (typeof l.message === "string" && l.message.startsWith("Failed query")),
  );
}

/** Safe replacement for exception.value, or null for type-only fallback. */
export function rebuildErrorValue(err: unknown): string | null {
  try {
    if (isSafeMessageError(err)) return err.message;
    const links = chain(err);
    if (links.length === 0) return null;

    for (const l of links) {
      if (typeof l.code === "string" && SQLSTATE.test(l.code) && !NODE_CODE.test(l.code)) {
        return typeof l.routine === "string" && PG_ROUTINE.test(l.routine)
          ? `pg ${l.code} ${l.routine}`
          : `pg ${l.code}`;
      }
    }
    for (const l of links) {
      if (typeof l.code === "string" && NODE_CODE.test(l.code)) {
        // syscall is libuv vocabulary or "spawn <server-binary>", never user args.
        return typeof l.syscall === "string" ? `${l.code} ${l.syscall}` : l.code;
      }
    }
    const top = links[0];
    if (top.name === "ReplyError" && typeof top.message === "string") {
      const token = top.message.split(" ")[0];
      return REPLY_TOKEN.test(token) ? `reply ${token}` : "reply";
    }
    if (top.name === "ZodError" && Array.isArray(top.issues) && top.issues[0]) {
      const issue = top.issues[0] as { code?: string; path?: Array<string | number> };
      const path = (issue.path ?? [])
        .map((seg) => {
          if (typeof seg === "number") return String(seg);
          return typeof seg === "string" && SAFE_PATH_SEGMENT.test(seg) ? seg : "~";
        })
        .join(".");
      return `zod ${issue.code ?? "invalid"} at ${path}`;
    }
    if (typeof top.status === "number") {
      const name =
        typeof top.name === "string" && SAFE_NAME.test(top.name) ? top.name : "HttpError";
      return `${name} ${top.status}`;
    }
    return null;
  } catch {
    return null;
  }
}

export type ConnectivityClass = "pg-unavailable" | "redis-unavailable" | "net-unavailable";

/** Infra-connectivity classification used for fingerprinting + throttling. */
export function connectivityClass(err: unknown): ConnectivityClass | null {
  try {
    const links = chain(err);
    if (links.length === 0) return null;
    if (links.some((l) => l.name === "MaxRetriesPerRequestError")) return "redis-unavailable";
    const hasPgState = links.some(
      (l) => typeof l.code === "string" && SQLSTATE.test(l.code) && PG_CONNECTIVITY.test(l.code),
    );
    const hasNetCode = links.some((l) => typeof l.code === "string" && NET_CODES.has(l.code));
    if (hasPgState || (hasNetCode && looksLikePg(links))) return "pg-unavailable";
    if (hasNetCode) return "net-unavailable";
    return null;
  } catch {
    return null;
  }
}

/** Client went away mid-request; operational noise, never reported. */
export function isClientAbort(err: unknown): boolean {
  try {
    const links = chain(err);
    if (links.length === 0) return false;
    const top = links[0];
    if (top.code === "ECONNRESET" || top.code === "ERR_STREAM_PREMATURE_CLOSE") return true;
    return links.some(
      (l) =>
        l.name === "RequestAbortedError" ||
        l.name === "AbortError" ||
        (typeof l.message === "string" &&
          /^(request aborted|premature close|aborted)$/i.test(l.message)),
    );
  } catch {
    return false;
  }
}
