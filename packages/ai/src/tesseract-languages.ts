import { spawn } from "node:child_process";

const MAX_INVENTORY_OUTPUT_BYTES = 64 * 1024;
const FORCE_KILL_DELAY_MS = 1_000;

export const SUPPORTED_TESSERACT_TRAINEDDATA = [
  "eng",
  "deu",
  "fra",
  "spa",
  "chi_sim",
  "jpn",
] as const;

export interface TesseractLanguageInventoryOptions {
  executable: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

const inventoryCache = new Map<string, ReadonlySet<string>>();

function cacheKey(executable: string): string {
  return `${executable}\0${process.env.TESSDATA_PREFIX ?? ""}`;
}

/** Clear the process-local inventory after an installation or in isolated tests. */
export function clearTesseractLanguageInventoryCache(): void {
  inventoryCache.clear();
}

/** Return a defensive copy when this executable was already preflighted. */
export function getCachedTesseractLanguages(executable: string): ReadonlySet<string> | undefined {
  const cached = inventoryCache.get(cacheKey(executable));
  return cached ? new Set(cached) : undefined;
}

function abortError(): Error {
  const error = new Error("Tesseract language-pack preflight was canceled");
  error.name = "AbortError";
  return error;
}

function parseLanguageInventory(stdout: string): ReadonlySet<string> {
  const lines = stdout.replaceAll("\r\n", "\n").split("\n");
  while (lines.at(-1) === "") lines.pop();
  const header = lines.shift();
  const match = header?.match(/^List of available languages in .+ \((\d+)\):$/u);
  if (!match) {
    throw new Error(
      "Tesseract --list-langs returned malformed output; cannot verify installed traineddata.",
    );
  }
  const declaredCount = Number(match[1]);
  if (
    !Number.isSafeInteger(declaredCount) ||
    lines.length !== declaredCount ||
    lines.some(
      (language) =>
        !/^[A-Za-z0-9][A-Za-z0-9_./-]*$/u.test(language) ||
        language.includes("..") ||
        language.endsWith("/"),
    ) ||
    new Set(lines).size !== lines.length
  ) {
    if (Number.isSafeInteger(declaredCount) && lines.length !== declaredCount) {
      throw new Error(
        `Tesseract --list-langs declared ${declaredCount} languages but returned ${lines.length}.`,
      );
    }
    throw new Error(
      "Tesseract --list-langs returned malformed output; cannot verify installed traineddata.",
    );
  }
  return new Set(lines);
}

/**
 * Ask the selected executable which traineddata it can actually load. Successful
 * inventories are cached per executable and TESSDATA_PREFIX for the process.
 */
export async function getInstalledTesseractLanguages(
  options: TesseractLanguageInventoryOptions,
): Promise<ReadonlySet<string>> {
  if (!options.executable) throw new Error("Tesseract executable path is empty");
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("Tesseract language-pack preflight timeout must be positive");
  }
  if (options.signal?.aborted) throw abortError();

  const key = cacheKey(options.executable);
  const cached = inventoryCache.get(key);
  if (cached) return new Set(cached);

  const installed = await new Promise<ReadonlySet<string>>((resolve, reject) => {
    const child = spawn(options.executable, ["--list-langs"], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let terminationError: Error | undefined;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const timeoutTimer = setTimeout(() => {
      terminate(
        new Error(
          `Tesseract language-pack preflight timed out after ${Math.floor(options.timeoutMs)}ms`,
        ),
      );
    }, options.timeoutMs);
    timeoutTimer.unref();

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      options.signal?.removeEventListener("abort", onAbort);
    };

    const finish = (error?: Error, result?: ReadonlySet<string>) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(result as ReadonlySet<string>);
    };

    function terminate(error: Error) {
      if (settled || terminationError) return;
      terminationError = error;
      try {
        child.kill("SIGTERM");
      } catch {
        // The close/error event retains process ownership and settles the call.
      }
      forceKillTimer = setTimeout(() => {
        if (!settled) {
          try {
            child.kill("SIGKILL");
          } catch {
            // Wait for close before releasing the request.
          }
        }
      }, FORCE_KILL_DELAY_MS);
      forceKillTimer.unref();
    }

    const onAbort = () => terminate(abortError());
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) terminate(abortError());

    child.stdout.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      stdoutBytes += buffer.length;
      if (stdoutBytes > MAX_INVENTORY_OUTPUT_BYTES) {
        terminate(new Error("Tesseract --list-langs stdout exceeded 65536 bytes"));
        return;
      }
      stdoutChunks.push(buffer);
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      stderrBytes += buffer.length;
      if (stderrBytes > MAX_INVENTORY_OUTPUT_BYTES) {
        terminate(new Error("Tesseract --list-langs stderr exceeded 65536 bytes"));
        return;
      }
      stderrChunks.push(buffer);
    });

    child.once("error", (error: NodeJS.ErrnoException) => {
      if (terminationError) return;
      if (error.code === "ENOENT") {
        finish(
          new Error(
            "Tesseract executable not found while checking installed language packs. Install Tesseract or set TESSERACT_PATH.",
            { cause: error },
          ),
        );
        return;
      }
      finish(new Error(`Unable to run Tesseract --list-langs: ${error.message}`, { cause: error }));
    });

    child.once("close", (code, signal) => {
      if (terminationError) {
        finish(terminationError);
        return;
      }
      if (code !== 0) {
        const detail = Buffer.concat(stderrChunks).toString("utf8").trim();
        const status = code === null ? `signal ${signal ?? "unknown"}` : `code ${code}`;
        finish(
          new Error(
            `Unable to inspect Tesseract language packs: --list-langs exited with ${status}${detail ? `: ${detail}` : ""}`,
          ),
        );
        return;
      }
      try {
        finish(undefined, parseLanguageInventory(Buffer.concat(stdoutChunks).toString("utf8")));
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });

  inventoryCache.set(key, installed);
  return new Set(installed);
}
