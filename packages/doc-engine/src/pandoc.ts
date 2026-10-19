import { spawn, spawnSync } from "node:child_process";
import { markToolInputError, wrapWithMemoryLimit } from "@snapotter/shared";

/** Resolve the pandoc binary, honoring PANDOC_PATH for parity with the other doc-engine wrappers. */
function pandocBin(): string {
  return process.env.PANDOC_PATH || "pandoc";
}

let cachedAvailable: boolean | null = null;

/** True when a pandoc binary is on PATH (gates local tests; the image installs it). */
export function pandocAvailable(): boolean {
  if (cachedAvailable !== null) return cachedAvailable;
  const r = spawnSync(pandocBin(), ["--version"], { stdio: "ignore" });
  cachedAvailable = r.status === 0;
  return cachedAvailable;
}

/** Detect pandoc major version once (2.x vs 3.x) to choose the self-contained flag. */
let cachedSelfContainedArgs: string[] | null = null;

function selfContainedArgs(): string[] {
  if (cachedSelfContainedArgs !== null) return cachedSelfContainedArgs;
  const r = spawnSync(pandocBin(), ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (r.status !== 0 || !r.stdout) {
    // Fallback to 3.x flags without caching if the version probe failed.
    return ["--embed-resources", "--standalone"];
  }
  // First line: "pandoc 2.17.1.1" or "pandoc 3.1.2"
  const match = r.stdout.match(/pandoc\s+(\d+)/);
  if (!match) {
    return ["--embed-resources", "--standalone"];
  }
  const major = Number(match[1]);
  cachedSelfContainedArgs =
    major >= 3 ? ["--embed-resources", "--standalone"] : ["--self-contained"];
  return cachedSelfContainedArgs;
}

export interface PandocOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Inline images/css as data: URIs (pandoc 2.x: --self-contained; 3.x: --embed-resources). */
  selfContained?: boolean;
  /** Extra args appended verbatim (e.g. ["--standalone"]). */
  extraArgs?: string[];
}

// Pandoc exit codes 44 (PandocXMLError), 63 (PandocDocxError),
// 64 (PandocParseError / PandocEpubSubdirectoryError), and
// 91 (PandocUTF8DecodingError), plus stderr signatures for corrupt/DRM
// containers and malformed metadata blocks. These mean the caller's input
// file is unreadable or invalid, not a server bug.
const PANDOC_INPUT_ERROR_CODES = new Set([44, 63, 64, 91]);
const PANDOC_INPUT_ERROR_PATTERNS = [
  /No entry on path: META-INF\/container\.xml/i,
  /Couldn't extract ePub file/i,
  /couldn't (?:parse|unpack) docx/i,
  /Invalid XML in/i,
  /Invalid UTF-8 stream|UTF-8 decoding error/i,
  /Error parsing .* metadata/i,
];

function stripGhcBacktrace(stderr: string): string {
  return stderr
    .replace(/\n+HasCallStack backtrace:[\s\S]*$/, "")
    .replace(/^(?:\[WARNING\][^\n]*\n)+/, "")
    .replace(/\n{2,}/g, "\n")
    .trimEnd();
}

export function markIfPandocInputError<E extends Error>(
  err: E,
  code: number | null,
  stderr: string,
): E {
  if (
    (code !== null && PANDOC_INPUT_ERROR_CODES.has(code)) ||
    PANDOC_INPUT_ERROR_PATTERNS.some((re) => re.test(stderr))
  ) {
    return markToolInputError(err);
  }
  return err;
}

export function buildPandocArgs(
  inPath: string,
  outPath: string,
  opts: PandocOptions = {},
): string[] {
  const args = ["--sandbox", inPath, "-o", outPath];
  if (opts.selfContained) {
    args.push(...selfContainedArgs());
  }
  if (opts.extraArgs) {
    args.push(...opts.extraArgs);
  }
  return args;
}

/** Runs pandoc in -> out; rejects with the stderr tail on failure. */
export function runPandoc(
  inPath: string,
  outPath: string,
  opts: PandocOptions = {},
): Promise<void> {
  if (opts.signal?.aborted) {
    return Promise.reject(new Error("Canceled"));
  }
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const args = buildPandocArgs(inPath, outPath, opts);
  return new Promise<void>((resolvePromise, reject) => {
    const [limBin, limArgs] = wrapWithMemoryLimit(pandocBin(), args);
    const child = spawn(limBin, limArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      child.kill("SIGKILL");
      reject(new Error("Canceled"));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      opts.signal?.removeEventListener("abort", onAbort);
      child.kill("SIGKILL");
      reject(new Error(`pandoc timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stderr.on("data", (c: Buffer) => {
      err = (err + c.toString("utf8")).slice(-4096);
    });
    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      reject(e);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      if (code === 0) resolvePromise();
      else {
        const cleanedErr = stripGhcBacktrace(err).slice(-1000);
        const failure = new Error(`pandoc exited ${code ?? signal}: ${cleanedErr}`);
        reject(markIfPandocInputError(failure, code, err));
      }
    });
    opts.signal?.addEventListener("abort", onAbort, { once: true });
  });
}
