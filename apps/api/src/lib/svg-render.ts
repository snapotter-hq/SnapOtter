import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { ToolInputError } from "@snapotter/shared";
import { env } from "../config.js";
import { DecoderUnavailableError } from "./format-decoders.js";
import { bakeSvgDensity } from "./svg-density.js";

const SHARP_PATH = createRequire(import.meta.url).resolve("sharp");
const CHILD_DEADLINE_GRACE_MS = 1000;
const RENDER_FAILED_EXIT = 2;
// Share of the job budget the render may use, so a job that spent time before
// the render still reports SVG_TOO_COMPLEX instead of the generic job timeout.
const DEADLINE_BUDGET_SHARE = 0.75;
// sharp's default limitInputPixels, which applies when the caller sets no cap.
const SHARP_DEFAULT_PIXEL_LIMIT = 0x3fff * 0x3fff;
// An 8-bit RGBA PNG of incompressible pixels stays under 5 bytes per pixel.
const OUTPUT_BYTES_PER_PIXEL = 5;
const OUTPUT_SLACK_BYTES = 1024 * 1024;
// A hostile file is asked for again on every thumbnail, preview and batch pass.
// Remembering its timeout spares a full deadline per request (#5345). The
// memory is short so a file that only timed out on a loaded host soon gets
// another chance.
const TIMEOUT_MEMORY_MS = 60 * 1000;
const TIMEOUT_MEMORY_MAX_ENTRIES = 256;

// Runs as `node -e` so it needs no file on disk next to the compiled module.
// One libvips thread keeps a hostile file to a single core until the deadline.
// libvips works off the main thread, so the child's own timer still fires
// mid-render and ends it even if the API process died before it could kill it.
const CHILD_SOURCE = `
const [sharpPath, optionsJson] = process.argv.slice(1);
const options = JSON.parse(optionsJson);
if (options.selfDeadlineMs > 0) setTimeout(() => process.exit(3), options.selfDeadlineMs).unref();
const sharp = require(sharpPath);
sharp.concurrency(1);
sharp.cache(false);
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", async () => {
  try {
    let image = sharp(Buffer.concat(chunks), {
      density: options.density,
      limitInputPixels: options.limitInputPixels,
    });
    if (options.outputDensity !== undefined) image = image.withDensity(options.outputDensity);
    // The tool re-encodes this PNG, so spend as little of the deadline on it as possible.
    process.stdout.write(await image.png({ compressionLevel: 1 }).toBuffer());
  } catch (err) {
    process.stderr.write(String((err && err.message) || err));
    process.exitCode = ${RENDER_FAILED_EXIT};
  }
});
`;

export interface RenderSvgOptions {
  /** Pixels per inch to rasterize at; 72 matches what `sharp(svg)` does by default. */
  density?: number;
  /** sharp's limitInputPixels for the render. */
  maxPixels?: number;
  /** Override the deadline; defaults to most of JOB_TIMEOUT_FAST_S, where 0 means none. */
  deadlineMs?: number;
  signal?: AbortSignal;
}

// Insertion order doubles as age order: entries are only ever added or evicted.
const timedOutRenders = new Map<string, number>();

function timedOutKey(svg: Buffer, options: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(options)).update(svg).digest("hex");
}

function hasTimedOut(key: string): boolean {
  const expiresAt = timedOutRenders.get(key);
  if (expiresAt === undefined) return false;
  if (expiresAt > Date.now()) return true;
  timedOutRenders.delete(key);
  return false;
}

function rememberTimeout(key: string): void {
  timedOutRenders.delete(key);
  timedOutRenders.set(key, Date.now() + TIMEOUT_MEMORY_MS);
  if (timedOutRenders.size > TIMEOUT_MEMORY_MAX_ENTRIES) {
    timedOutRenders.delete(timedOutRenders.keys().next().value as string);
  }
}

export function svgRenderDeadlineMs(): number {
  return Math.round(env.JOB_TIMEOUT_FAST_S * 1000 * DEADLINE_BUDGET_SHARE);
}

function maxOutputBytes(maxPixels: number | undefined): number {
  return (maxPixels ?? SHARP_DEFAULT_PIXEL_LIMIT) * OUTPUT_BYTES_PER_PIXEL + OUTPUT_SLACK_BYTES;
}

export function svgTooComplexError(deadlineMs: number): ToolInputError {
  return new ToolInputError(
    `This SVG took longer than ${Math.round(deadlineMs / 1000)}s to render. Simplify its filters or repeated shapes and try again.`,
    { code: "SVG_TOO_COMPLEX" },
  );
}

const RENDERER_UNAVAILABLE_MESSAGE = "The SVG renderer couldn't run. Try again shortly.";

// What sharp, libvips, glib and fontconfig read. The child parses untrusted
// input, so it doesn't get the API's database URL, keys or tokens.
const CHILD_ENV_NAMES = new Set(["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "SystemRoot"]);
const CHILD_ENV_PREFIXES = ["LC_", "LD_", "DYLD_", "FONTCONFIG_", "XDG_", "VIPS_", "SHARP_", "G_"];

function childEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) =>
        CHILD_ENV_NAMES.has(name) || CHILD_ENV_PREFIXES.some((prefix) => name.startsWith(prefix)),
    ),
  );
}

/**
 * Rasterize an SVG to PNG in a child process that is SIGKILLed at the
 * deadline (#5153). librsvg repaints a filtered element once per `<use>`, so
 * a few hundred bytes can keep a core busy for hours, and nothing in-process
 * can stop it: sharp's `timeout` is only checked between regions, and the
 * first region of a filtered render costs about as much as the whole image.
 *
 * Render failures are rethrown as plain Errors carrying sharp's message, so
 * callers keep mapping them with the same pixel-limit and undecodable checks
 * they apply to an in-process sharp error. A child that can't start or dies
 * some other way is a DecoderUnavailableError, the 503 every image route
 * already answers for a missing decoder.
 */
export function renderSvgToPng(svg: Buffer, opts: RenderSvgOptions = {}): Promise<Buffer> {
  const requested = opts.density ?? 72;
  const baked = bakeSvgDensity(svg, requested);
  const deadlineMs = opts.deadlineMs ?? svgRenderDeadlineMs();
  const childOptions = {
    density: baked.density,
    // Rendering at 72 would tag the PNG as 72 DPI; keep the requested value.
    outputDensity: baked.density === requested ? undefined : requested,
    limitInputPixels: opts.maxPixels ?? true,
    // Later than ours, so a live parent's kill wins and reports the timeout.
    selfDeadlineMs: deadlineMs > 0 ? deadlineMs + CHILD_DEADLINE_GRACE_MS : 0,
  };
  opts.signal?.throwIfAborted();
  // Hashing is skipped while nothing is remembered, the common case.
  if (deadlineMs > 0 && timedOutRenders.size > 0) {
    if (hasTimedOut(timedOutKey(baked.buffer, childOptions))) {
      return Promise.reject(svgTooComplexError(deadlineMs));
    }
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["-e", CHILD_SOURCE, SHARP_PATH, JSON.stringify(childOptions)],
      { env: childEnv(), stdio: ["pipe", "pipe", "pipe"] },
    );
    const outputLimit = maxOutputBytes(opts.maxPixels);
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let outputOverflow = false;
    const stderr: Buffer[] = [];
    let timedOut = false;
    let settled = false;

    const timer =
      deadlineMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, deadlineMs)
        : undefined;
    const onAbort = () => child.kill("SIGKILL");
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    const finish = (err: unknown, value?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      if (err) reject(err);
      else resolve(value as Buffer);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      if (outputOverflow) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > outputLimit) {
        // Past what the pixel cap allows, so the child is misbehaving.
        outputOverflow = true;
        stdout.length = 0;
        child.kill("SIGKILL");
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    // The child can exit before reading all of stdin (killed, or a bad header).
    child.stdin.on("error", () => {});
    child.on("error", (err) =>
      finish(new DecoderUnavailableError(RENDERER_UNAVAILABLE_MESSAGE, err)),
    );
    child.on("close", (code, signal) => {
      if (outputOverflow) {
        return finish(
          new DecoderUnavailableError(
            RENDERER_UNAVAILABLE_MESSAGE,
            new Error(`SVG render process wrote more than ${outputLimit} bytes`),
          ),
        );
      }
      // A deadline that fires after the child finished still leaves a complete result.
      if (timedOut && code !== 0) {
        rememberTimeout(timedOutKey(baked.buffer, childOptions));
        return finish(svgTooComplexError(deadlineMs));
      }
      if (opts.signal?.aborted) return finish(opts.signal.reason);
      if (code === 0) return finish(null, Buffer.concat(stdout));
      const message = Buffer.concat(stderr).toString("utf-8").trim();
      if (code === RENDER_FAILED_EXIT) return finish(new Error(message || "SVG rendering failed"));
      // Killed by the OOM killer, crashed in native code, or anything else
      // that isn't sharp rejecting the file: the server's fault, not the SVG's.
      const exit = signal ?? `code ${code}`;
      finish(
        new DecoderUnavailableError(
          RENDERER_UNAVAILABLE_MESSAGE,
          new Error(`SVG render process exited with ${exit}${message ? `: ${message}` : ""}`),
        ),
      );
    });

    child.stdin.end(baked.buffer);
  });
}
