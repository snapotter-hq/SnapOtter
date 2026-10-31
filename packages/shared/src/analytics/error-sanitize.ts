/**
 * Pure error-inspection helpers shared by the api and web Sentry scrubbers.
 * Everything here rebuilds safe strings from VETTED FIELDS ONLY; raw error
 * messages are never passed through (except SafeError, whose messages we
 * author). Returning null means "no safe rebuild known, use type-only".
 */
import { isSafeMessageError } from "../tool-errors.js";
import { redactMessage } from "./redact-message.js";

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
  "ENETUNREACH",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
  // undici (Node's fetch) reports a connect that never completed and a socket
  // the far end dropped under its own codes, inside a "fetch failed" TypeError
  // (#1908). Header and body timeouts stay out: the upstream answered there.
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
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
      l.name === "DatabaseError" ||
      l.name === "DrizzleQueryError" ||
      (typeof l.message === "string" && l.message.startsWith("Failed query")),
  );
}

// media-engine's runFfmpeg/runFfprobe reject with the whole stderr tail after
// the exit prefix. ffmpeg writes Input/Output/Stream headers and carriage
// return progress updates around the failure, then a generic shutdown cascade,
// so the generic 300-char front truncation in redactMessage keeps only noise
// (#2455). Select the actionable lines instead.
const MEDIA_EXIT_RE = /^(ffmpeg|ffprobe) exited (-?\d+|SIG[A-Z0-9]+):[ \t]*([\s\S]*)$/;
const MEDIA_EXIT_BODY_MAX = 250;
const MEDIA_EXIT_MAX_LINES = 3;
// -progress lines and default stderr progress updates. Audio-only runs start
// their periodic report with `size=`, not `frame=`.
const MEDIA_PROGRESS_RE =
  /^(?:frame|fps|q|size|Lsize|time|elapsed|bitrate|total_size|out_time(?:[_a-z]+)?|dup_frames|drop_frames|speed|progress)=/;
// Stream/container metadata and the version banner ffmpeg prints before work starts.
const MEDIA_HEADER_RE =
  /^(?:(?:Input|Output) #\d+|Stream #\d+|Stream mapping:|Duration:|Metadata:|Side data:|cpb:|Chapter #\d+|Program \d+|Press \[q\]|ffmpeg version |built with |configuration:|lib(?:avutil|avcodec|avformat|avdevice|avfilter|swscale|swresample|postproc) )/;
// Indented `key : value` rows under Input/Output #, e.g. `title : Holiday`,
// `encoder : Lavf61`. They can carry user metadata, so never surface them.
const MEDIA_METADATA_ROW_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,31}\s+:\s/;
// Post-run encoder/output statistics. Only statistic-shaped lines are dropped:
// an encoder-prefixed line that names an error (e.g. "height not divisible by
// 2") is still an error and must survive.
const MEDIA_STAT_RE =
  /^(?:\[[^\s\]]+ @ [^\]]+\] )?(?:frame [IPB]:|mb [IPB] |8x8 transform |ref [PB] L\d|kb\/s:|Qavg:|SSIM|PSNR|coded y|i(?:16|8c?|4) |p8x8|p16x16|p4x4|Weighted [PB]-Frames:|profile |using |264 - core|video:|audio:|subtitle:)/;
// Generic shutdown lines ffmpeg prints after the root cause. Dropping them
// keeps the budget for the actionable line, which comes FIRST in the cascade.
// Note: "Terminating thread with return code" has no colon before the code.
const MEDIA_CASCADE_RE =
  /^(?:\[[^\s\]]+ @ [^\]]+\] ){0,4}(?:Task finished with error code:|Terminating thread with return code\b|Error sending frames to consumers:|Error marking filters as finished|Nothing was written into output file|Could not open encoder before EOF|Last message repeated \d+ times|Conversion failed!$)/;
const MEDIA_TOOL_STAT_RE =
  /^(?:x264|x265) \[(?:info|warning)\]: |^\[AVIOContext @ [^\]]+\] Statistics:/;
// ffmpeg's own failure lines: prefer these over softer "not found"/"missing"
// notices, which can be harmless warnings from the demuxer.
const MEDIA_CAUSE_STRONG_RE =
  /\berror\b|\bunknown (?:encoder|decoder|filter|format|option)\b|\bnot divisible by 2\b|\binvalid\b|\bno such file\b|\bpermission denied\b|\bno space left\b|\bdisc quota\b|\bunsupported\b|\bnot supported\b|\breceived no packets\b|\bmoov atom not found\b|\btoo many bits\b|\bcould not\b|\bunable to\b|\bcannot\b|\bbroken pipe\b|\bno such filter\b|\bunrecognized\b|\bnot known\b|\bnot available\b|\bimpossible to\b/i;
// Follow-up lines that only say a stage failed. Keep them, but rank them below
// the line naming what actually failed.
const MEDIA_CAUSE_GENERIC_RE =
  /\berror (?:opening output files?|initializing the muxer|splitting the argument list|selecting an encoder|(?:re)?initializing filters|configuring filters)\b/i;
const MEDIA_CAUSE_WEAK_RE =
  /\bfailed\b|\bfailure\b|\bnot found\b|\bmissing\b|\bcorrupt\b|\btruncated\b|\bdenied\b|\bunexpected\b/i;

function isMediaNoise(line: string): boolean {
  return (
    MEDIA_PROGRESS_RE.test(line) ||
    MEDIA_HEADER_RE.test(line) ||
    MEDIA_METADATA_ROW_RE.test(line) ||
    MEDIA_STAT_RE.test(line) ||
    MEDIA_CASCADE_RE.test(line) ||
    MEDIA_TOOL_STAT_RE.test(line)
  );
}

interface MediaLine {
  line: string;
  index: number;
}

/** Collapses pointers, thread prefixes and counters so repeated errors don't eat the budget. */
function mediaLineShape(line: string): string {
  return line
    .replace(/^(?:\[[^\s\]]+ @ [^\]]+\] ){0,4}/, "")
    .replace(/0x[0-9a-f]+/gi, "0x")
    .replace(/\d+/g, "N");
}

/**
 * Rebuilds a safe summary for a media-engine "ffmpeg/ffprobe exited <code>"
 * message: the exit prefix plus the most actionable stderr lines (the root
 * cause first; ffmpeg appends boilerplate after it). Falls back to the tail of
 * whatever survives the noise filter. Returns null for any other message.
 */
function mediaExitSummary(message: string): string | null {
  const match = MEDIA_EXIT_RE.exec(message);
  if (!match) return null;
  const [, tool, code, body] = match;
  const prefix = `${tool} exited ${code}`;

  const lines: MediaLine[] = body
    .split(/\r\n|\r|\n/)
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => line.length > 0 && !isMediaNoise(line));

  const causes = lines.filter(
    ({ line }) =>
      MEDIA_CAUSE_STRONG_RE.test(line) ||
      MEDIA_CAUSE_GENERIC_RE.test(line) ||
      MEDIA_CAUSE_WEAK_RE.test(line),
  );
  const seen = new Set<string>();
  const specific: MediaLine[] = [];
  const generic: MediaLine[] = [];
  const weak: MediaLine[] = [];
  for (const entry of causes) {
    const shape = mediaLineShape(entry.line);
    if (seen.has(shape)) continue;
    seen.add(shape);
    if (MEDIA_CAUSE_STRONG_RE.test(entry.line)) specific.push(entry);
    else if (MEDIA_CAUSE_GENERIC_RE.test(entry.line)) generic.push(entry);
    else weak.push(entry);
  }
  const ranked = [...specific, ...generic, ...weak];

  // No recognisable cause: keep the tail of what is left, where a tool that
  // does not use ffmpeg's cascade wording puts its final message.
  const ordered = causes.length > 0 ? ranked : [...lines].reverse();

  const kept: MediaLine[] = [];
  let used = 0;
  for (const entry of ordered) {
    const cost = entry.line.length + (kept.length > 0 ? 3 : 0); // " | "
    if (used + cost <= MEDIA_EXIT_BODY_MAX) {
      kept.push(entry);
      used += cost;
    } else if (kept.length === 0) {
      // A single over-long line keeps its tail, where the reason sits.
      kept.push({ line: entry.line.slice(-MEDIA_EXIT_BODY_MAX), index: entry.index });
      used = MEDIA_EXIT_BODY_MAX;
    } else {
      // Don't skip a stronger cause for a shorter weaker one later in the list.
      break;
    }
    if (kept.length >= MEDIA_EXIT_MAX_LINES) break;
  }
  // Causes are emitted in priority order (root cause first); the fallback tail
  // is selected backwards, so restore its chronology.
  if (causes.length === 0) kept.sort((a, b) => a.index - b.index);
  if (kept.length === 0) return prefix;
  return `${prefix}: ${kept.map(({ line }) => line).join(" | ")}`;
}

/** "at file.ts:NN" from the first in-app stack frame, mirroring errorSignature. */
function frameHint(err: unknown): string | null {
  const stack = (err as { stack?: unknown } | null)?.stack;
  if (typeof stack !== "string") return null;
  const line = stack.split("\n").find((l) => l.includes("/apps/") || l.includes("/packages/"));
  const m = line?.slice(0, 300).match(/([^/\\\s():]+):(\d+)/);
  return m ? `at ${m[1]}:${m[2]}` : null;
}

/** Safe replacement for exception.value, or null for type-only fallback. */
export function rebuildErrorValue(err: unknown): string | null {
  try {
    const links = chain(err);

    // 1. SafeError: our authored (or toSidecarError-wrapped) message, redacted,
    //    plus the redacted immediate cause so a wrapper title never hides detail.
    if (isSafeMessageError(err)) {
      let out = redactMessage(err.message);
      for (let i = 1; i < links.length; i++) {
        const m = links[i].message;
        if (typeof m === "string" && m.trim()) {
          const detail = redactMessage(m);
          if (detail && !out.includes(detail)) out = `${out}: ${detail}`;
          break;
        }
      }
      return out;
    }

    if (links.length === 0) return null;
    const top = links[0];

    // 2. Structured rebuilds: pg SQLSTATE, node E-code, reply, zod, http status.
    for (const l of links) {
      if (typeof l.code === "string" && SQLSTATE.test(l.code) && !NODE_CODE.test(l.code)) {
        return typeof l.routine === "string" && PG_ROUTINE.test(l.routine)
          ? `pg ${l.code} ${l.routine}`
          : `pg ${l.code}`;
      }
    }
    for (const l of links) {
      if (typeof l.code === "string" && NODE_CODE.test(l.code)) {
        // spawn failures carry `spawn <file as passed>` (#1588): keep the verb only.
        const verb = typeof l.syscall === "string" ? l.syscall.split(" ")[0] : "";
        return SAFE_NAME.test(verb) ? `${l.code} ${verb}` : l.code;
      }
    }
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

    // 3. Media-engine exit failures: ffmpeg/ffprobe put the failure last, so
    //    select the tail of the non-stat lines instead of front-truncating.
    if (typeof top.message === "string") {
      const media = mediaExitSummary(top.message);
      if (media) return redactMessage(media);
    }

    // 4. Non-empty message: keep it, redacted (the rich default).
    if (typeof top.message === "string" && top.message.trim().length > 0) {
      return redactMessage(top.message);
    }

    // 5. Empty message with a stack: derive a title from the first in-app frame.
    const hint = frameHint(err);
    if (hint) return hint;

    // 6. Nothing safe to surface: type-only.
    return null;
  } catch {
    return null;
  }
}

/**
 * The most specific, non-sensitive error code in the cause chain, for the
 * Sentry `error_code` tag. A top-level operational SafeError's own code wins
 * outright: reportError fingerprints operational events by this code, so the
 * same condition must not split by whatever it wraps (#1413). A bug-kind
 * SafeError is excluded: bug events keep per-frame grouping, and its code is
 * often derived from settings (an output format), so a wrapped errno is the
 * better clue there. Otherwise prefers a pg SQLSTATE, then a node E-code, else
 * the first short string code found. Returns null when none is present.
 * reportError used to read only the top-level `.code`, but pg/undici bury the
 * real code under a drizzle/wrapper Error whose own `.code` is undefined, so
 * the tag was always empty on those events.
 */
export function extractErrorCode(err: unknown): string | null {
  try {
    // A marker-copied SafeError may lack `kind`; like classifyError, treat
    // that as operational.
    if (isSafeMessageError(err) && err.kind !== "bug") {
      const own = (err as { code?: unknown }).code;
      if (typeof own === "string" && own.length > 0 && own.length <= 40) return own;
    }
    let fallback: string | null = null;
    for (const l of chain(err)) {
      const code = l.code;
      if (typeof code !== "string" || code.length === 0 || code.length > 40) continue;
      if (SQLSTATE.test(code) && !NODE_CODE.test(code)) return code;
      if (NODE_CODE.test(code)) return code;
      if (fallback === null) fallback = code;
    }
    return fallback;
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
    if (hasNetCode || links.some((l) => l.name === "TimeoutError" && "$metadata" in l)) {
      return "net-unavailable";
    }
    return null;
  } catch {
    return null;
  }
}

// pg SQLSTATE classes that mean the deployment's database is misconfigured,
// resource-starved or damaged (the operator's environment), not that our code
// is wrong: class 28 (invalid authorization), 53 (insufficient resources), 57
// (operator intervention), 58 (system error: 58P01 undefined_file, 58P02
// duplicate_file, 58030 io_error - Postgres cannot open a relation file, so the
// data directory is damaged or unreadable, #4202). 42501 is
// insufficient_privilege, the one access code in class 42 (otherwise our query
// bugs). Connection loss (class 08 / 57P0x) is already covered by
// connectivityClass; overlap here is harmless.
const ENVIRONMENTAL_PG_CLASS = /^(28|53|57|58)/;

/**
 * True when the error chain carries a pg SQLSTATE indicating an environmental
 * database problem (bad credentials, missing privilege, exhausted resources,
 * operator shutdown) rather than a bug in our queries. Lets self-hosters' DB
 * misconfiguration classify as operational instead of a code bug.
 */
export function isEnvironmentalDbError(err: unknown): boolean {
  try {
    return chain(err).some((l) => {
      if (typeof l.code !== "string" || !SQLSTATE.test(l.code) || NODE_CODE.test(l.code)) {
        return false;
      }
      return ENVIRONMENTAL_PG_CLASS.test(l.code) || l.code === "42501";
    });
  } catch {
    return false;
  }
}

/** Client went away mid-request; operational noise, never reported. */
export function isClientAbort(err: unknown): boolean {
  try {
    const links = chain(err);
    if (links.length === 0 || looksLikePg(links)) return false;
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

/**
 * An HTTP status as a Sentry `status_code` tag value, or undefined for anything
 * that isn't an integer from 100 to 599. SafeError messages stay constant
 * (tool-errors.ts), so a status travels as this tag instead (#1351). Strict on
 * purpose: the value comes from a response, and the tag must never become a
 * channel for free-form text.
 */
export function httpStatusTag(value: unknown): string | undefined {
  if (typeof value === "string" && /^[1-5]\d\d$/.test(value)) return value;
  if (typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599) {
    return String(value);
  }
  return undefined;
}
