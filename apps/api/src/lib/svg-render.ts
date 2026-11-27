import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { ToolInputError } from "@snapotter/shared";
import { env } from "../config.js";
import { DecoderUnavailableError } from "./format-decoders.js";
import { bakeSvgDensity } from "./svg-density.js";

const SHARP_PATH = createRequire(import.meta.url).resolve("sharp");
const CHILD_DEADLINE_GRACE_MS = 1000;
const RENDER_FAILED_EXIT = 2;

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
    process.stdout.write(await image.png().toBuffer());
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
  /** Override the deadline; defaults to JOB_TIMEOUT_FAST_S, where 0 means none. */
  deadlineMs?: number;
  signal?: AbortSignal;
}

export function svgRenderDeadlineMs(): number {
  return env.JOB_TIMEOUT_FAST_S * 1000;
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

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["-e", CHILD_SOURCE, SHARP_PATH, JSON.stringify(childOptions)],
      { env: childEnv(), stdio: ["pipe", "pipe", "pipe"] },
    );
    const stdout: Buffer[] = [];
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

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    // The child can exit before reading all of stdin (killed, or a bad header).
    child.stdin.on("error", () => {});
    child.on("error", (err) =>
      finish(new DecoderUnavailableError(RENDERER_UNAVAILABLE_MESSAGE, err)),
    );
    child.on("close", (code, signal) => {
      if (timedOut) return finish(svgTooComplexError(deadlineMs));
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
