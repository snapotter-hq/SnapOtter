import { spawn, spawnSync } from "node:child_process";

let cachedAvailable: boolean | null = null;

/** True when a pandoc binary is on PATH (gates local tests; the image installs it). */
export function pandocAvailable(): boolean {
  if (cachedAvailable !== null) return cachedAvailable;
  const r = spawnSync("pandoc", ["--version"], { stdio: "ignore" });
  cachedAvailable = r.status === 0;
  return cachedAvailable;
}

/** Detect pandoc major version once (2.x vs 3.x) to choose the self-contained flag. */
let cachedSelfContainedArgs: string[] | null = null;

function selfContainedArgs(): string[] {
  if (cachedSelfContainedArgs !== null) return cachedSelfContainedArgs;
  const r = spawnSync("pandoc", ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (r.status !== 0 || !r.stdout) {
    // Fallback to 2.x flag if we cannot determine the version.
    cachedSelfContainedArgs = ["--self-contained"];
    return cachedSelfContainedArgs;
  }
  // First line: "pandoc 2.17.1.1" or "pandoc 3.1.2"
  const match = r.stdout.match(/pandoc\s+(\d+)/);
  const major = match ? Number(match[1]) : 2;
  cachedSelfContainedArgs =
    major >= 3 ? ["--embed-resources", "--standalone"] : ["--self-contained"];
  return cachedSelfContainedArgs;
}

export interface PandocOptions {
  timeoutMs?: number;
  /** Inline images/css as data: URIs (pandoc 2.x: --self-contained; 3.x: --embed-resources). */
  selfContained?: boolean;
  /** Extra args appended verbatim (e.g. ["--standalone"]). */
  extraArgs?: string[];
}

/** Runs pandoc in -> out; rejects with the stderr tail on failure. */
export function runPandoc(
  inPath: string,
  outPath: string,
  opts: PandocOptions = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const args = [inPath, "-o", outPath];
  if (opts.selfContained) {
    args.push(...selfContainedArgs());
  }
  if (opts.extraArgs) {
    args.push(...opts.extraArgs);
  }
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn("pandoc", args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
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
      reject(e);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolvePromise();
      else reject(new Error(`pandoc exited ${code ?? signal}: ${err.slice(-1000)}`));
    });
  });
}
