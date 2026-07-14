import { execFile, type StdioOptions, spawn, spawnSync } from "node:child_process";
import { createHash, createPublicKey, randomUUID } from "node:crypto";
import { type BigIntStats, existsSync, constants as fsConstants, fstatSync } from "node:fs";
import {
  access,
  type FileHandle,
  link,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  statfs,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  assertOcrRuntimeMemory,
  canonicalRuntimeJson,
  loadOcrRuntimeTrustKeys,
  OCR_RUNTIME_INDEX_MAX_BYTES,
  type OcrRuntimeMemoryOptions,
  type OcrRuntimeTarget,
  type OcrRuntimeTrustKey,
  type VerifiedOcrRuntimeIndex,
  verifyRuntimeIndex,
} from "@snapotter/ai";

export type { OcrRuntimeTrustKey, VerifiedOcrRuntimeIndex };
export { canonicalRuntimeJson, loadOcrRuntimeTrustKeys, verifyRuntimeIndex };

const INDEX_MAX_BYTES = OCR_RUNTIME_INDEX_MAX_BYTES;
const SAFE_COMPONENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const MAX_INSTALLER_OUTPUT_BYTES = 64 * 1024;
const INSTALL_LOCK_BUSY_EXIT_CODE = 75;
const SHARED_STATE_DIRECTORY_MODE = 0o2770;
const DOWNLOAD_CACHE_DIRECTORY_MODE = 0o2770;
const DOWNLOAD_CACHE_FILE_MODE = 0o660;
const DOWNLOAD_TRASH_DIRECTORY_MODE = 0o2770;
const DOWNLOAD_TRASH_NAME = ".trash";
const UUID_V4_PATTERN_SOURCE =
  "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const TEMPORARY_INDEX_NAME_PATTERN = new RegExp(
  `^\\.[a-f0-9]{64}\\.${UUID_V4_PATTERN_SOURCE}\\.tmp$`,
);
const CACHE_OBJECT_NAME_PATTERN = new RegExp(
  `^(?:[a-f0-9]{64}\\.(?:part|tar\\.gz)|\\.[a-f0-9]{64}\\.${UUID_V4_PATTERN_SOURCE}\\.tmp)$`,
);
const CLEANUP_OBJECT_NAME_PATTERN = /^[a-f0-9]{64}\.(?:index\.json|tar\.gz)$/;
const QUARANTINE_NAME_PATTERN = new RegExp(
  `^delete-([0-9]+)-([0-9]+)-([0-9]+)-${UUID_V4_PATTERN_SOURCE}-((?:[a-f0-9]{64}\\.(?:part|tar\\.gz)|\\.[a-f0-9]{64}\\.${UUID_V4_PATTERN_SOURCE}\\.tmp))$`,
);
const MIN_INSTALL_FILESYSTEM_OVERHEAD_BYTES = 16 * 1024 * 1024;
const INSTALL_DESCRIPTOR_RESERVE_BYTES = 1024 * 1024;
const OCR_INSTALL_PROGRESS_HEARTBEAT_MS = 30_000;
const DEFAULT_RETRY_ATTEMPTS = 4;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const DEFAULT_RETRY_MAX_DELAY_MS = 10_000;
const DEFAULT_RETRY_MAX_TOTAL_DELAY_MS = 30_000;
const HARD_MAX_RETRY_ATTEMPTS = 6;
const HARD_MAX_RETRY_DELAY_MS = 30_000;
const HARD_MAX_RETRY_TOTAL_DELAY_MS = 120_000;
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);
const DEFAULT_SYSTEM_PYTHON = "/usr/bin/python3";
const PROJECT_ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const execFileAsync = promisify(execFile);

export interface DownloadOcrRuntimeReleaseOptions {
  aiDataDir: string;
  /** Open descriptor for this AI data directory's currently-held install.flock lease. */
  installLockFd: number;
  bundleRepo: string;
  version: string;
  target: OcrRuntimeTarget;
  trustKeys: readonly OcrRuntimeTrustKey[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  stallTimeoutMs?: number;
  /** Test seam for deterministic disk-capacity checks. */
  diskFreeBytes?: (path: string) => Promise<bigint>;
  /** Test seam for physical/cgroup memory admission. */
  memoryOptions?: OcrRuntimeMemoryOptions;
  /** Bounded transient-download retry policy and deterministic test seams. */
  retry?: OcrRuntimeDownloadRetryOptions;
  onProgress?: (percent: number, stage: string) => void;
}

export interface OcrRuntimeDownloadRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxTotalDelayMs?: number;
  random?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
  now?: () => number;
}

export interface DownloadedOcrRuntimeRelease extends VerifiedOcrRuntimeIndex {
  indexPath: string;
  archivePath: string;
}

export interface OcrRuntimeInstallerCommand {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

export interface RunOcrRuntimeInstallerOptions {
  release: DownloadedOcrRuntimeRelease;
  aiDataDir: string;
  mode?: "install" | "import";
  pythonPath?: string;
  installerPath?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Parent descriptor duplicated to child fd 3 to retain the kernel install lease. */
  installLockFd?: number;
}

export type OcrRuntimeMaintenanceAction =
  | "commit"
  | "deactivate"
  | "gc"
  | "reconcile"
  | "reset"
  | "rollback";

export async function waitWithOcrRuntimeHeartbeat<T>(
  operation: Promise<T>,
  onHeartbeat: () => void,
): Promise<T> {
  const heartbeat = setInterval(onHeartbeat, OCR_INSTALL_PROGRESS_HEARTBEAT_MS);
  heartbeat.unref();
  try {
    return await operation;
  } finally {
    clearInterval(heartbeat);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class RetryableOcrDownloadError extends Error {
  readonly retryAfterMs: number | null;

  constructor(message: string, retryAfterMs: number | null = null, options?: ErrorOptions) {
    super(message, options);
    this.name = "RetryableOcrDownloadError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class OcrRuntimeDiskSpaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrRuntimeDiskSpaceError";
  }
}

export class OcrRuntimeImportValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OcrRuntimeImportValidationError";
  }
}

interface ResolvedRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  maxTotalDelayMs: number;
  random: () => number;
  sleep?: (delayMs: number) => Promise<void>;
  now: () => number;
}

interface RetryBudget {
  totalDelayMs: number;
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return resolved;
}

function resolveRetryPolicy(
  options: OcrRuntimeDownloadRetryOptions | undefined,
): ResolvedRetryPolicy {
  const maxAttempts = boundedInteger(
    options?.maxAttempts,
    DEFAULT_RETRY_ATTEMPTS,
    1,
    HARD_MAX_RETRY_ATTEMPTS,
    "OCR runtime retry attempts",
  );
  const baseDelayMs = boundedInteger(
    options?.baseDelayMs,
    DEFAULT_RETRY_BASE_DELAY_MS,
    0,
    HARD_MAX_RETRY_DELAY_MS,
    "OCR runtime retry base delay",
  );
  const maxDelayMs = boundedInteger(
    options?.maxDelayMs,
    DEFAULT_RETRY_MAX_DELAY_MS,
    0,
    HARD_MAX_RETRY_DELAY_MS,
    "OCR runtime retry maximum delay",
  );
  const maxTotalDelayMs = boundedInteger(
    options?.maxTotalDelayMs,
    DEFAULT_RETRY_MAX_TOTAL_DELAY_MS,
    0,
    HARD_MAX_RETRY_TOTAL_DELAY_MS,
    "OCR runtime retry total delay",
  );
  if (baseDelayMs > maxDelayMs) {
    throw new Error("OCR runtime retry base delay cannot exceed its maximum delay");
  }
  return {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    maxTotalDelayMs,
    random: options?.random ?? Math.random,
    sleep: options?.sleep,
    now: options?.now ?? Date.now,
  };
}

function errorCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function isTransientNetworkError(error: unknown): boolean {
  if (error instanceof RetryableOcrDownloadError) return true;
  if (error instanceof DOMException && error.name === "AbortError") return false;
  if (error instanceof TypeError) return true;
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const code = errorCode(current);
    if (code && RETRYABLE_NETWORK_CODES.has(code)) return true;
    current = isRecord(current) ? current.cause : undefined;
  }
  return false;
}

function retryAfterMilliseconds(header: string | null, now: () => number): number | null {
  if (header === null) return null;
  const value = header.trim();
  if (/^\d+$/.test(value)) {
    return Number(value) * 1_000;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const currentTime = now();
  if (!Number.isFinite(currentTime)) {
    throw new Error("OCR runtime retry clock returned an invalid timestamp");
  }
  return Math.max(0, timestamp - currentTime);
}

function cancelResponseBody(response: Response): void {
  if (!response.body || response.bodyUsed) return;
  try {
    void response.body.cancel().catch(() => {});
  } catch {
    // Cancellation is best effort and must never defeat a download watchdog.
  }
}

function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>, reason: unknown): void {
  try {
    void reader.cancel(reason).catch(() => {});
  } catch {
    // Cancellation is best effort and must never defeat a download watchdog.
  }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Aborted", "AbortError");
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortReason(signal);
}

async function assertDownloadResponse(
  response: Response,
  label: string,
  now: () => number,
): Promise<void> {
  if (response.ok && response.body) return;
  const retryable = RETRYABLE_HTTP_STATUSES.has(response.status);
  const retryAfter = retryable ? response.headers.get("retry-after") : null;
  cancelResponseBody(response);
  const message = `Unable to download ${label}: HTTP ${response.status}`;
  if (retryable) {
    throw new RetryableOcrDownloadError(message, retryAfterMilliseconds(retryAfter, now));
  }
  throw new Error(message);
}

function retryDelayMs(error: unknown, completedAttempts: number, policy: ResolvedRetryPolicy) {
  if (error instanceof RetryableOcrDownloadError && error.retryAfterMs !== null) {
    return Math.min(error.retryAfterMs, policy.maxDelayMs);
  }
  const exponential = Math.min(
    policy.maxDelayMs,
    policy.baseDelayMs * 2 ** Math.max(0, completedAttempts - 1),
  );
  const random = policy.random();
  if (!Number.isFinite(random) || random < 0 || random >= 1) {
    throw new Error("OCR runtime retry random source must return a value in [0, 1)");
  }
  return Math.floor(exponential * (0.5 + random / 2));
}

async function sleepUntilRetry(
  delayMs: number,
  policy: ResolvedRetryPolicy,
  signal: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  if (!policy.sleep) {
    await new Promise<void>((resolveSleep, reject) => {
      let settled = false;
      const finish = (operation: () => void) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        operation();
      };
      const timer = setTimeout(() => finish(resolveSleep), delayMs);
      timer.unref();
      const onAbort = () => {
        clearTimeout(timer);
        finish(() => reject(abortReason(signal)));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    return;
  }
  let abortListener: (() => void) | undefined;
  try {
    await Promise.race([
      policy.sleep(delayMs),
      new Promise<never>((_resolve, reject) => {
        abortListener = () => reject(abortReason(signal));
        signal.addEventListener("abort", abortListener, { once: true });
      }),
    ]);
  } finally {
    if (abortListener) signal.removeEventListener("abort", abortListener);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function withTransientDownloadRetries<T>(
  label: string,
  operation: () => Promise<T>,
  policy: ResolvedRetryPolicy,
  budget: RetryBudget,
  signal: AbortSignal,
): Promise<T> {
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (signal.aborted || !(error instanceof RetryableOcrDownloadError)) throw error;
      if (attempt === policy.maxAttempts) {
        throw new Error(
          `${label} failed after ${attempt} attempts (${budget.totalDelayMs}ms retry delay): ${errorMessage(error)}`,
          { cause: error },
        );
      }
      const requestedDelayMs = retryDelayMs(error, attempt, policy);
      const remainingDelayMs = policy.maxTotalDelayMs - budget.totalDelayMs;
      if (requestedDelayMs > remainingDelayMs) {
        throw new Error(
          `${label} retry delay budget was exhausted after ${attempt} attempts: ${errorMessage(error)}`,
          { cause: error },
        );
      }
      await sleepUntilRetry(requestedDelayMs, policy, signal);
      budget.totalDelayMs += requestedDelayMs;
    }
  }
  throw new Error(`${label} retry loop ended unexpectedly`);
}

function releaseUrl(bundleRepo: string, version: string, relativePath: string): string {
  if (!REPOSITORY_PATTERN.test(bundleRepo)) {
    throw new Error("OCR runtime bundle repository is invalid");
  }
  if (!SAFE_COMPONENT_PATTERN.test(version)) {
    throw new Error("SnapOtter release version is invalid");
  }
  const path = relativePath
    .split("/")
    .map((component) => encodeURIComponent(component))
    .join("/");
  return `https://huggingface.co/${bundleRepo}/resolve/main/v${encodeURIComponent(version)}/v3/${path}`;
}

function assertTrustedDownloadUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const trustedHost =
    host === "huggingface.co" ||
    host.endsWith(".huggingface.co") ||
    host === "hf.co" ||
    host.endsWith(".hf.co") ||
    host === "xethub.com" ||
    host.endsWith(".xethub.com");
  if (url.protocol !== "https:" || !trustedHost || url.username || url.password) {
    throw new Error(`OCR runtime download redirect is not trusted: ${url.origin}`);
  }
  return url;
}

async function fetchTrusted(
  fetchImpl: typeof fetch,
  rawUrl: string,
  init: RequestInit,
): Promise<Response> {
  let url = assertTrustedDownloadUrl(rawUrl);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, { ...init, redirect: "manual" });
    } catch (error) {
      if (isTransientNetworkError(error)) {
        throw new RetryableOcrDownloadError(
          `OCR runtime network request failed: ${errorMessage(error)}`,
          null,
          { cause: error },
        );
      }
      throw error;
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    cancelResponseBody(response);
    if (!location || redirects === 5)
      throw new Error("OCR runtime download redirected too many times");
    let redirectUrl: string;
    try {
      redirectUrl = new URL(location, url).toString();
    } catch (error) {
      throw new Error("OCR runtime download redirect is invalid", { cause: error });
    }
    url = assertTrustedDownloadUrl(redirectUrl);
  }
  throw new Error("OCR runtime download redirected too many times");
}

async function readBoundedResponse(
  response: Response,
  maxBytes: number,
  label: string,
  signal?: AbortSignal,
  stallTimeoutMs = 5 * 60_000,
): Promise<Buffer> {
  if (!response.ok || !response.body) {
    cancelResponseBody(response);
    throw new Error(`Unable to download ${label}: HTTP ${response.status}`);
  }
  const contentLength = response.headers.get("content-length");
  const declaredLength = contentLength === null ? null : Number(contentLength);
  const contentEncoding = response.headers.get("content-encoding")?.trim().toLowerCase();
  const declaredLengthMatchesBody = !contentEncoding || contentEncoding === "identity";
  if (declaredLength !== null && (!Number.isSafeInteger(declaredLength) || declaredLength < 0)) {
    cancelResponseBody(response);
    throw new Error(`${label} returned an invalid Content-Length`);
  }
  if (declaredLength !== null && declaredLength > maxBytes) {
    cancelResponseBody(response);
    throw new Error(`${label} exceeds its size limit`);
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await readWithStallTimeout(reader, label, signal, stallTimeoutMs);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error(`${label} exceeds its size limit`);
      chunks.push(Buffer.from(value));
    }
    if (declaredLengthMatchesBody && declaredLength !== null && total < declaredLength) {
      throw new RetryableOcrDownloadError(
        `${label} response was truncated (${total}/${declaredLength} bytes)`,
      );
    }
    if (declaredLengthMatchesBody && declaredLength !== null && total > declaredLength) {
      throw new Error(`${label} response exceeded its declared Content-Length`);
    }
  } catch (error) {
    cancelReader(reader, error);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function readWithStallTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  label: string,
  signal: AbortSignal | undefined,
  stallTimeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal?.aborted) throw new Error(`${label} download was canceled or timed out`);
  let timer: NodeJS.Timeout | undefined;
  let abortListener: (() => void) | undefined;
  try {
    const waits: Array<Promise<ReadableStreamReadResult<Uint8Array>>> = [reader.read()];
    if (stallTimeoutMs > 0) {
      waits.push(
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(
              new RetryableOcrDownloadError(`${label} download stalled for ${stallTimeoutMs}ms`),
            );
          }, stallTimeoutMs);
          timer.unref();
        }),
      );
    }
    if (signal) {
      waits.push(
        new Promise<never>((_resolve, reject) => {
          abortListener = () => {
            reject(new Error(`${label} download was canceled or timed out`));
          };
          signal.addEventListener("abort", abortListener, { once: true });
        }),
      );
    }
    try {
      return await Promise.race(waits);
    } catch (error) {
      if (signal?.aborted || error instanceof RetryableOcrDownloadError) throw error;
      if (isTransientNetworkError(error)) {
        throw new RetryableOcrDownloadError(
          `${label} network stream failed: ${errorMessage(error)}`,
          null,
          { cause: error },
        );
      }
      throw error;
    }
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && abortListener) signal.removeEventListener("abort", abortListener);
  }
}

interface DirectoryIdentity {
  dev: bigint;
  ino: bigint;
}

interface OpenDownloadCache {
  publicPath: string;
  rootPath: string;
  trashRootPath: string;
  handle: FileHandle;
  trashHandle: FileHandle;
  identity: DirectoryIdentity;
}

function directoryIdentity(info: BigIntStats, path: string): DirectoryIdentity {
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`OCR runtime download cache path is not a real directory: ${path}`);
  }
  return { dev: info.dev, ino: info.ino };
}

function sameDirectory(left: DirectoryIdentity, right: DirectoryIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function descriptorRoot(handle: FileHandle, fallbackPath: string): string {
  // Official OCR runtimes are Linux-only. /proc/self/fd keeps every child
  // lookup anchored to the directory object even if a public parent is renamed
  // or replaced while a network request is in flight. macOS uses the canonical
  // path only for host-side unit tests; no macOS runtime target is installable.
  return process.platform === "linux" ? `/proc/self/fd/${handle.fd}` : fallbackPath;
}

async function assertDownloadCacheAttached(cache: OpenDownloadCache): Promise<void> {
  try {
    const descriptor = directoryIdentity(
      await cache.handle.stat({ bigint: true }),
      cache.publicPath,
    );
    const publicEntry = directoryIdentity(
      await lstat(cache.publicPath, { bigint: true }),
      cache.publicPath,
    );
    if (!sameDirectory(descriptor, cache.identity) || !sameDirectory(publicEntry, cache.identity)) {
      throw new Error("identity mismatch");
    }
  } catch (error) {
    throw new Error("OCR runtime download cache directory changed during installation", {
      cause: error,
    });
  }
}

function permissionMode(info: BigIntStats): number {
  return Number(info.mode & 0o7777n);
}

async function applyExactSharedMode(
  handle: FileHandle,
  desiredMode: number,
  path: string,
): Promise<void> {
  const current = await handle.stat({ bigint: true });
  if (permissionMode(current) === desiredMode) return;
  try {
    await handle.chmod(desiredMode);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const observed = await handle.stat({ bigint: true });
    if (code === "EPERM" || code === "EACCES") {
      const observedMode = permissionMode(observed);
      // Cache bytes are signed public release artifacts, so legacy/fsGroup
      // volumes may retain harmless other-read/execute bits. Never accept
      // other-write, a sticky ownership trap, or privilege special bits.
      const forbiddenBits = observed.isDirectory() ? 0o5002 : 0o7002;
      if ((observedMode & forbiddenBits) === 0) {
        // A prior replica UID can own an inode shared through fsGroup or a
        // volume ACL. Opening proves the access used by file callers; for a
        // directory, explicitly prove create/delete-class write + traversal
        // access without leaving a crash-strandable probe inode behind.
        if (observed.isDirectory()) {
          await access(descriptorRoot(handle, path), fsConstants.W_OK | fsConstants.X_OK);
        }
        return;
      }
    }
    throw new Error(`OCR runtime cache path has unsafe permissions: ${path}`, { cause: error });
  }
  const hardened = await handle.stat({ bigint: true });
  if (permissionMode(hardened) !== desiredMode) {
    throw new Error(`OCR runtime cache path did not retain its required permissions: ${path}`);
  }
}

async function openRealDirectoryHandle(
  operationPath: string,
  displayPath: string,
): Promise<{ handle: FileHandle; identity: DirectoryIdentity }> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      operationPath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | (fsConstants.O_DIRECTORY ?? 0),
    );
    const descriptorIdentity = directoryIdentity(await handle.stat({ bigint: true }), displayPath);
    const entryIdentity = directoryIdentity(
      await lstat(operationPath, { bigint: true }),
      displayPath,
    );
    if (!sameDirectory(descriptorIdentity, entryIdentity)) {
      throw new Error(`OCR runtime state directory changed while opening: ${displayPath}`);
    }
    return { handle, identity: descriptorIdentity };
  } catch (error) {
    await handle?.close().catch(() => {});
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ELOOP" || code === "ENOTDIR") {
      throw new Error(`OCR runtime state path is not a real directory: ${displayPath}`, {
        cause: error,
      });
    }
    throw error;
  }
}

async function openChildDirectory(
  parentHandle: FileHandle,
  parentFallbackPath: string,
  name: string,
  publicPath: string,
  options: { create: boolean; mode: number },
): Promise<FileHandle> {
  const operationPath = join(descriptorRoot(parentHandle, parentFallbackPath), name);
  let created = false;
  if (options.create) {
    try {
      await mkdir(operationPath, { mode: options.mode });
      created = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  const opened = await openRealDirectoryHandle(operationPath, publicPath);
  try {
    await applyExactSharedMode(opened.handle, options.mode, publicPath);
    if (created) {
      await opened.handle.sync();
      await parentHandle.sync();
    }
    return opened.handle;
  } catch (error) {
    await opened.handle.close();
    throw error;
  }
}

async function initializeDownloadCache(
  publicPath: string,
  handle: FileHandle,
): Promise<OpenDownloadCache> {
  let trashHandle: FileHandle | undefined;
  try {
    const descriptorIdentity = directoryIdentity(await handle.stat({ bigint: true }), publicPath);
    const publicIdentity = directoryIdentity(await lstat(publicPath, { bigint: true }), publicPath);
    if (!sameDirectory(descriptorIdentity, publicIdentity)) {
      throw new Error("OCR runtime download cache changed while it was being opened");
    }
    await applyExactSharedMode(handle, DOWNLOAD_CACHE_DIRECTORY_MODE, publicPath);
    const rootPath = descriptorRoot(handle, publicPath);
    const trashPath = join(rootPath, DOWNLOAD_TRASH_NAME);
    let trashCreated = false;
    try {
      await mkdir(trashPath, { mode: DOWNLOAD_TRASH_DIRECTORY_MODE });
      trashCreated = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    trashHandle = await open(
      trashPath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | (fsConstants.O_DIRECTORY ?? 0),
    );
    const trashDescriptor = directoryIdentity(await trashHandle.stat({ bigint: true }), trashPath);
    const trashEntry = directoryIdentity(await lstat(trashPath, { bigint: true }), trashPath);
    if (!sameDirectory(trashDescriptor, trashEntry)) {
      throw new Error("OCR runtime download quarantine changed while it was being opened");
    }
    await applyExactSharedMode(trashHandle, DOWNLOAD_TRASH_DIRECTORY_MODE, trashPath);
    if (trashCreated) {
      await trashHandle.sync();
      await handle.sync();
    }
    const cache: OpenDownloadCache = {
      publicPath,
      rootPath,
      trashRootPath: descriptorRoot(trashHandle, trashPath),
      handle,
      trashHandle,
      identity: descriptorIdentity,
    };
    await reconcileDownloadTrash(cache);
    await reconcileTemporaryIndexFiles(cache);
    await assertDownloadCacheAttached(cache);
    return cache;
  } catch (error) {
    await trashHandle?.close().catch(() => {});
    await handle.close().catch(() => {});
    throw error;
  }
}

async function openDownloadCacheTree(
  aiDataDir: string,
  create: boolean,
): Promise<OpenDownloadCache | null> {
  const root = resolve(aiDataDir);
  if (create) {
    await mkdir(root, {
      recursive: true,
      mode: SHARED_STATE_DIRECTORY_MODE,
    });
  }

  let rootHandle: FileHandle | undefined;
  let v3Handle: FileHandle | undefined;
  let downloadsHandle: FileHandle | undefined;
  try {
    try {
      rootHandle = (await openRealDirectoryHandle(root, root)).handle;
    } catch (error) {
      if (!create && (error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    if (create) {
      await applyExactSharedMode(rootHandle, SHARED_STATE_DIRECTORY_MODE, root);
      await rootHandle.sync();
    }
    const rootOperationPath = descriptorRoot(rootHandle, root);
    const v3PublicPath = join(root, "v3");
    try {
      v3Handle = await openChildDirectory(rootHandle, root, "v3", v3PublicPath, {
        create,
        mode: SHARED_STATE_DIRECTORY_MODE,
      });
    } catch (error) {
      if (!create && (error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    const downloadsPublicPath = join(v3PublicPath, "downloads");
    try {
      downloadsHandle = await openChildDirectory(
        v3Handle,
        join(rootOperationPath, "v3"),
        "downloads",
        downloadsPublicPath,
        { create, mode: DOWNLOAD_CACHE_DIRECTORY_MODE },
      );
    } catch (error) {
      if (!create && (error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    const ownedDownloadsHandle = downloadsHandle;
    downloadsHandle = undefined;
    return await initializeDownloadCache(downloadsPublicPath, ownedDownloadsHandle);
  } finally {
    await downloadsHandle?.close().catch(() => {});
    await v3Handle?.close().catch(() => {});
    await rootHandle?.close().catch(() => {});
  }
}

async function ensureDownloadsDirectory(aiDataDir: string): Promise<OpenDownloadCache> {
  const cache = await openDownloadCacheTree(aiDataDir, true);
  if (!cache) throw new Error("Unable to create the OCR runtime download cache");
  return cache;
}

function ensureKernelInstallLease(fd: number): void {
  const stdio: StdioOptions = ["ignore", "ignore", "pipe", fd];
  const result = existsSync("/usr/bin/flock")
    ? spawnSync(
        "/usr/bin/flock",
        [
          "--exclusive",
          "--nonblock",
          "--conflict-exit-code",
          String(INSTALL_LOCK_BUSY_EXIT_CODE),
          "3",
        ],
        { stdio, timeout: 5_000 },
      )
    : spawnSync(
        process.env.SNAPOTTER_SYSTEM_PYTHON || DEFAULT_SYSTEM_PYTHON,
        [
          "-c",
          `import fcntl, sys
try:
    fcntl.flock(3, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit(${INSTALL_LOCK_BUSY_EXIT_CODE})`,
        ],
        { stdio, timeout: 5_000 },
      );
  if (result.error) throw result.error;
  if (result.status === 0) return;
  if (result.status === INSTALL_LOCK_BUSY_EXIT_CODE) {
    throw new Error("another replica holds the install lease");
  }
  throw new Error(
    `install-lease helper failed with status ${String(result.status)}: ${result.stderr?.toString().trim() || "no error output"}`,
  );
}

const activeInstallLeaseMutations = new Set<string>();

async function acquireInstallLeaseMutation(
  aiDataDir: string,
  installLockFd: number,
): Promise<() => void> {
  let mutationKey: string | undefined;
  try {
    if (!Number.isSafeInteger(installLockFd) || installLockFd < 0) {
      throw new Error("invalid descriptor");
    }
    const descriptor = fstatSync(installLockFd, { bigint: true });
    const lockPath = join(resolve(aiDataDir), "install.flock");
    let entry = await lstat(lockPath, { bigint: true });
    if (
      !descriptor.isFile() ||
      descriptor.nlink !== 1n ||
      !entry.isFile() ||
      entry.isSymbolicLink() ||
      entry.nlink !== 1n ||
      descriptor.dev !== entry.dev ||
      descriptor.ino !== entry.ino
    ) {
      throw new Error("descriptor identity mismatch");
    }
    mutationKey = `${descriptor.dev}:${descriptor.ino}`;
    if (activeInstallLeaseMutations.has(mutationKey)) {
      throw new Error("another cache mutation is already using this install lease");
    }
    activeInstallLeaseMutations.add(mutationKey);
    // flock is attached to the open-file description. The helper inherits a
    // duplicate of this exact fd: an existing lease is reasserted, a free fd
    // becomes leased for the caller's lifetime, and a competing replica fails.
    ensureKernelInstallLease(installLockFd);
    entry = await lstat(lockPath, { bigint: true });
    if (
      !entry.isFile() ||
      entry.isSymbolicLink() ||
      entry.nlink !== 1n ||
      descriptor.dev !== entry.dev ||
      descriptor.ino !== entry.ino
    ) {
      throw new Error("install lease path changed during acquisition");
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      activeInstallLeaseMutations.delete(mutationKey as string);
    };
  } catch (error) {
    if (mutationKey) activeInstallLeaseMutations.delete(mutationKey);
    throw new Error("The shared AI install lease must be held before mutating OCR downloads", {
      cause: error,
    });
  }
}

async function withInstallLeaseMutation<T>(
  aiDataDir: string,
  installLockFd: number,
  operation: () => Promise<T>,
): Promise<T> {
  const releaseMutation = await acquireInstallLeaseMutation(aiDataDir, installLockFd);
  try {
    return await operation();
  } finally {
    releaseMutation();
  }
}

function downloadCachePath(cache: OpenDownloadCache, name: string): string {
  return join(cache.rootPath, name);
}

function publicDownloadCachePath(cache: OpenDownloadCache, name: string): string {
  return join(cache.publicPath, name);
}

interface RegularFileIdentity {
  ctimeNs: bigint;
  dev: bigint;
  ino: bigint;
  size: bigint;
}

function regularFileIdentity(info: BigIntStats, path: string): RegularFileIdentity {
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n) {
    throw new Error(`OCR runtime download path is not a private regular file: ${path}`);
  }
  return { ctimeNs: info.ctimeNs, dev: info.dev, ino: info.ino, size: info.size };
}

function sameFileObject(left: RegularFileIdentity, right: RegularFileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size;
}

function sameFileIdentity(left: RegularFileIdentity, right: RegularFileIdentity): boolean {
  return sameFileObject(left, right) && left.ctimeNs === right.ctimeNs;
}

async function existingRegularFileIdentity(path: string): Promise<RegularFileIdentity | null> {
  try {
    return regularFileIdentity(await lstat(path, { bigint: true }), path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function sha256FileHandle(
  file: FileHandle,
  expectedSize: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let position = 0;
  while (position < expectedSize) {
    throwIfAborted(signal);
    const { bytesRead } = await file.read(
      buffer,
      0,
      Math.min(buffer.length, expectedSize - position),
      position,
    );
    throwIfAborted(signal);
    if (bytesRead === 0) return null;
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  throwIfAborted(signal);
  return hash.digest("hex");
}

async function cachedFileEquals(path: string, expected: Buffer): Promise<boolean> {
  const expectedIdentity = await existingRegularFileIdentity(path);
  if (expectedIdentity === null || expectedIdentity.size !== BigInt(expected.length)) return false;

  const file = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const opened = regularFileIdentity(await file.stat({ bigint: true }), path);
    if (!sameFileIdentity(opened, expectedIdentity)) return false;
    await applyExactSharedMode(file, DOWNLOAD_CACHE_FILE_MODE, path);
    const before = regularFileIdentity(await file.stat({ bigint: true }), path);
    const contents = await file.readFile();
    const after = regularFileIdentity(await file.stat({ bigint: true }), path);
    return sameFileIdentity(before, after) && contents.equals(expected);
  } finally {
    await file.close();
  }
}

async function persistVerifiedIndex(
  cache: OpenDownloadCache,
  indexName: string,
  rawIndex: Buffer,
  indexDigest: string,
): Promise<void> {
  const indexPath = downloadCachePath(cache, indexName);
  if (await cachedFileEquals(indexPath, rawIndex)) return;

  const temporaryIndex = downloadCachePath(cache, `.${indexDigest}.${randomUUID()}.tmp`);
  let file: FileHandle | undefined;
  try {
    file = await open(
      temporaryIndex,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      DOWNLOAD_CACHE_FILE_MODE,
    );
    await applyExactSharedMode(file, DOWNLOAD_CACHE_FILE_MODE, temporaryIndex);
    await writeBufferFully(file, rawIndex);
    await file.sync();
    await file.close();
    file = undefined;
    await rename(temporaryIndex, indexPath);
    await cache.handle.sync();
    if (!(await cachedFileEquals(indexPath, rawIndex))) {
      throw new Error("Cached OCR runtime index changed while it was being persisted");
    }
  } finally {
    await file?.close().catch(() => {});
    await rm(temporaryIndex, { force: true });
  }
}

async function verifyArchiveHandle(
  file: FileHandle,
  path: string,
  expectedSize: number,
  expectedSha256: string,
  signal?: AbortSignal,
): Promise<RegularFileIdentity | null> {
  throwIfAborted(signal);
  const before = regularFileIdentity(await file.stat({ bigint: true }), path);
  if (before.size !== BigInt(expectedSize)) return null;
  const digest = await sha256FileHandle(file, expectedSize, signal);
  const after = regularFileIdentity(await file.stat({ bigint: true }), path);
  throwIfAborted(signal);
  if (!sameFileIdentity(before, after) || digest !== expectedSha256) return null;
  return after;
}

async function verifyArchiveFile(
  path: string,
  expectedSize: number,
  expectedSha256: string,
  signal?: AbortSignal,
) {
  return (await inspectArchiveFile(path, expectedSize, expectedSha256, signal)).verified;
}

async function inspectArchiveFile(
  path: string,
  expectedSize: number,
  expectedSha256: string,
  signal?: AbortSignal,
  hardenCacheMode = false,
): Promise<{ identity: RegularFileIdentity; verified: boolean }> {
  const file = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    throwIfAborted(signal);
    if (hardenCacheMode) await applyExactSharedMode(file, DOWNLOAD_CACHE_FILE_MODE, path);
    const before = regularFileIdentity(await file.stat({ bigint: true }), path);
    const digest =
      before.size === BigInt(expectedSize)
        ? await sha256FileHandle(file, expectedSize, signal)
        : null;
    const after = regularFileIdentity(await file.stat({ bigint: true }), path);
    throwIfAborted(signal);
    if (!sameFileIdentity(before, after)) {
      throw new Error("OCR runtime cached archive changed while it was being verified");
    }
    return {
      identity: after,
      verified: digest === expectedSha256,
    };
  } finally {
    await file.close();
  }
}

async function openCurrentPartial(
  path: string,
): Promise<{ file: FileHandle; identity: RegularFileIdentity } | null> {
  let file: FileHandle;
  try {
    file = await open(path, fsConstants.O_RDWR | fsConstants.O_APPEND | fsConstants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("OCR runtime partial archive changed while the download was in progress", {
      cause: error,
    });
  }
  try {
    regularFileIdentity(await file.stat({ bigint: true }), path);
    await applyExactSharedMode(file, DOWNLOAD_CACHE_FILE_MODE, path);
    const identity = regularFileIdentity(await file.stat({ bigint: true }), path);
    await assertPathIdentity(path, identity);
    return { file, identity };
  } catch (error) {
    await file.close();
    throw error;
  }
}

async function assertPinnedPartialIdentity(
  file: FileHandle,
  path: string,
  expected: RegularFileIdentity,
): Promise<void> {
  try {
    const descriptorIdentity = regularFileIdentity(await file.stat({ bigint: true }), path);
    if (!sameFileIdentity(descriptorIdentity, expected)) {
      throw new Error("descriptor identity mismatch");
    }
    await assertPathIdentity(path, expected);
  } catch (error) {
    throw new Error("OCR runtime partial archive changed while the download was in progress", {
      cause: error,
    });
  }
}

async function createPartial(path: string): Promise<FileHandle> {
  let file: FileHandle;
  try {
    file = await open(
      path,
      fsConstants.O_RDWR | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      DOWNLOAD_CACHE_FILE_MODE,
    );
  } catch (error) {
    throw new Error("OCR runtime partial archive could not be created safely", { cause: error });
  }
  try {
    const identity = regularFileIdentity(await file.stat({ bigint: true }), path);
    if (identity.size !== 0n) {
      throw new Error("New OCR runtime partial archive was unexpectedly non-empty");
    }
    await applyExactSharedMode(file, DOWNLOAD_CACHE_FILE_MODE, path);
    return file;
  } catch (error) {
    await file.close();
    throw error;
  }
}

async function assertPathIdentity(path: string, expected: RegularFileIdentity): Promise<void> {
  const actual = await existingRegularFileIdentity(path);
  if (actual === null || !sameFileIdentity(actual, expected)) {
    throw new Error("OCR runtime partial archive changed while the download was in progress");
  }
}

function quarantineName(publicName: string, expected: RegularFileIdentity): string {
  if (!CACHE_OBJECT_NAME_PATTERN.test(publicName)) {
    throw new Error("OCR runtime cache removal received an unsafe object name");
  }
  return `delete-${expected.dev}-${expected.ino}-${expected.size}-${randomUUID()}-${publicName}`;
}

function parseQuarantineName(name: string): {
  publicName: string;
  expected: Pick<RegularFileIdentity, "dev" | "ino" | "size">;
} {
  const match = QUARANTINE_NAME_PATTERN.exec(name);
  if (!match) throw new Error(`Unexpected OCR runtime quarantine entry: ${name}`);
  return {
    expected: { dev: BigInt(match[1]), ino: BigInt(match[2]), size: BigInt(match[3]) },
    publicName: match[4],
  };
}

function quarantineObjectMatches(
  info: BigIntStats,
  expected: Pick<RegularFileIdentity, "dev" | "ino" | "size">,
  allowCrashRestoreLink: boolean,
): boolean {
  return (
    info.isFile() &&
    !info.isSymbolicLink() &&
    (allowCrashRestoreLink ? info.nlink === 1n || info.nlink === 2n : info.nlink === 1n) &&
    info.dev === expected.dev &&
    info.ino === expected.ino &&
    info.size === expected.size
  );
}

async function syncDownloadCache(cache: OpenDownloadCache): Promise<void> {
  await cache.trashHandle.sync();
  await cache.handle.sync();
}

async function restoreQuarantinedEntry(
  cache: OpenDownloadCache,
  publicName: string,
  quarantineEntryName: string,
): Promise<void> {
  const path = downloadCachePath(cache, publicName);
  const quarantinePath = join(cache.trashRootPath, quarantineEntryName);
  try {
    const quarantined = await lstat(quarantinePath, { bigint: true });
    if (
      !quarantined.isFile() ||
      quarantined.isSymbolicLink() ||
      quarantined.nlink < 1n ||
      quarantined.nlink > 2n
    ) {
      throw new Error("quarantine entry is not a recoverable regular file");
    }

    let publicEntry: BigIntStats | null;
    try {
      publicEntry = await lstat(path, { bigint: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      publicEntry = null;
    }

    if (publicEntry) {
      if (
        !publicEntry.isFile() ||
        publicEntry.isSymbolicLink() ||
        publicEntry.dev !== quarantined.dev ||
        publicEntry.ino !== quarantined.ino
      ) {
        throw new Error("a different cache entry already occupies the restore path");
      }
      // Recovery may observe link() completed before the prior process could
      // fsync or unlink the quarantine name. Make the public link durable first.
      await cache.handle.sync();
    } else {
      if (quarantined.nlink !== 1n) {
        throw new Error("quarantine entry has an unexplained external hard link");
      }
      // link() is an atomic no-overwrite restore. Durably publish the restored
      // name before removing the only recovery link from quarantine.
      await link(quarantinePath, path);
      const restored = await lstat(path, { bigint: true });
      if (restored.dev !== quarantined.dev || restored.ino !== quarantined.ino) {
        throw new Error("restored cache entry identity mismatch");
      }
      await cache.handle.sync();
    }
    await rm(quarantinePath);
    await cache.trashHandle.sync();
  } catch (error) {
    throw new Error(
      `OCR runtime cache entry changed while the download was in progress; preserved quarantine at ${quarantinePath}`,
      { cause: error },
    );
  }
}

async function reconcileDownloadTrash(cache: OpenDownloadCache): Promise<void> {
  const entries = await readdir(cache.trashRootPath);
  for (const name of entries) {
    const { expected, publicName } = parseQuarantineName(name);
    const quarantinePath = join(cache.trashRootPath, name);
    const info = await lstat(quarantinePath, { bigint: true });
    if (quarantineObjectMatches(info, expected, true)) {
      if (info.nlink === 2n) {
        // A restore link reached the public directory. Make that link durable
        // before deleting the recovery link, just like the live restore path.
        await restoreQuarantinedEntry(cache, publicName, name);
      } else {
        // The intended object was durably detached before deletion completed.
        await rm(quarantinePath);
        await cache.trashHandle.sync();
      }
      continue;
    }
    // A crash may occur after a swapped entry was detached but before the live
    // mismatch path restored it. Restore without overwrite; otherwise preserve
    // the lease-serialized quarantine and fail for explicit operator cleanup.
    await restoreQuarantinedEntry(cache, publicName, name);
  }
  if (entries.length > 0) await syncDownloadCache(cache);
}

async function reconcileTemporaryIndexFiles(cache: OpenDownloadCache): Promise<void> {
  for (const name of await readdir(cache.rootPath)) {
    if (!TEMPORARY_INDEX_NAME_PATTERN.test(name)) continue;
    const identity = await existingRegularFileIdentity(downloadCachePath(cache, name));
    if (!identity) continue;
    await quarantineAndRemove(cache, name, identity);
  }
}

async function quarantineAndRemove(
  cache: OpenDownloadCache,
  publicName: string,
  expected: RegularFileIdentity,
): Promise<void> {
  const quarantineEntryName = quarantineName(publicName, expected);
  const path = downloadCachePath(cache, publicName);
  const quarantinePath = join(cache.trashRootPath, quarantineEntryName);
  try {
    // Same-filesystem rename atomically detaches exactly one public entry into
    // the descriptor-rooted quarantine. Every cooperating replica holds the
    // same kernel install lease before touching this group-shared directory.
    await rename(path, quarantinePath);
    await syncDownloadCache(cache);
  } catch (error) {
    throw new Error("OCR runtime cache entry changed while the download was in progress", {
      cause: error,
    });
  }

  let quarantined: BigIntStats;
  try {
    quarantined = await lstat(quarantinePath, { bigint: true });
  } catch (error) {
    await restoreQuarantinedEntry(cache, publicName, quarantineEntryName);
    throw new Error("OCR runtime cache entry changed while the download was in progress", {
      cause: error,
    });
  }
  if (!quarantineObjectMatches(quarantined, expected, false)) {
    await restoreQuarantinedEntry(cache, publicName, quarantineEntryName);
    throw new Error("OCR runtime cache entry changed while the download was in progress");
  }

  await rm(quarantinePath);
  await syncDownloadCache(cache);
}

async function removeExistingPartial(
  cache: OpenDownloadCache,
  publicName: string,
  expected: RegularFileIdentity,
): Promise<void> {
  await quarantineAndRemove(cache, publicName, expected);
}

async function promotePartial(
  cache: OpenDownloadCache,
  file: FileHandle,
  partialPath: string,
  finalPath: string,
  expected: RegularFileIdentity,
): Promise<void> {
  const descriptorIdentity = regularFileIdentity(await file.stat({ bigint: true }), partialPath);
  if (!sameFileIdentity(descriptorIdentity, expected)) {
    throw new Error("OCR runtime partial archive changed while the download was in progress");
  }
  await assertPathIdentity(partialPath, expected);
  await rename(partialPath, finalPath);
  await cache.handle.sync();
  const promoted = await existingRegularFileIdentity(finalPath);
  // POSIX filesystems may update ctime during rename, so verify the stable
  // object identity after promotion rather than the pre-rename metadata time.
  if (promoted === null || !sameFileObject(promoted, expected)) {
    throw new Error("OCR runtime partial archive changed while it was being promoted");
  }
}

async function filesystemFreeBytes(path: string): Promise<bigint> {
  const info = await statfs(path, { bigint: true });
  return info.bavail * info.bsize;
}

export async function assertOcrRuntimeInstallDiskSpace(options: {
  path: string;
  remainingArchiveBytes: number;
  expandedSize: number;
  authenticatedIndexBytes?: number;
  operation: "download" | "import";
  diskFreeBytes?: (path: string) => Promise<bigint>;
}): Promise<void> {
  const authenticatedIndexBytes = options.authenticatedIndexBytes ?? 0;
  for (const [label, value] of [
    ["remaining archive bytes", options.remainingArchiveBytes],
    ["expanded size", options.expandedSize],
    ["authenticated index bytes", authenticatedIndexBytes],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative safe integer`);
    }
  }
  const filesystemOverhead = Math.max(
    MIN_INSTALL_FILESYSTEM_OVERHEAD_BYTES,
    Math.floor(options.expandedSize / 50),
  );
  const required =
    BigInt(options.remainingArchiveBytes) +
    BigInt(options.expandedSize) +
    BigInt(filesystemOverhead) +
    BigInt(INSTALL_DESCRIPTOR_RESERVE_BYTES) +
    BigInt(authenticatedIndexBytes);
  const available = await (options.diskFreeBytes ?? filesystemFreeBytes)(options.path);
  if (available < required) {
    throw new OcrRuntimeDiskSpaceError(
      `insufficient disk space before OCR runtime ${options.operation}: ${required} bytes required, ${available} available`,
    );
  }
}

export interface WritableFileHandle {
  write(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number | null,
  ): Promise<{ bytesWritten: number }>;
}

/** POSIX permits successful short writes; persist the complete chunk before accounting for it. */
export async function writeBufferFully(
  file: WritableFileHandle,
  buffer: Uint8Array,
): Promise<number> {
  let persisted = 0;
  while (persisted < buffer.byteLength) {
    const { bytesWritten } = await file.write(
      buffer,
      persisted,
      buffer.byteLength - persisted,
      null,
    );
    const remaining = buffer.byteLength - persisted;
    if (!Number.isSafeInteger(bytesWritten) || bytesWritten <= 0 || bytesWritten > remaining) {
      throw new Error("OCR runtime archive write returned an invalid byte count");
    }
    persisted += bytesWritten;
  }
  return persisted;
}

async function downloadArchive(
  url: string,
  cache: OpenDownloadCache,
  digest: string,
  expectedSize: number,
  expandedSize: number,
  authenticatedIndexBytes: number,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
  stallTimeoutMs?: number,
  onProgress?: (percent: number, stage: string) => void,
  diskFreeBytes: (path: string) => Promise<bigint> = filesystemFreeBytes,
  retryNow: () => number = Date.now,
): Promise<string> {
  const finalName = `${digest}.tar.gz`;
  const finalPath = downloadCachePath(cache, finalName);
  const finalPublicPath = publicDownloadCachePath(cache, finalName);
  const finalIdentity = await existingRegularFileIdentity(finalPath);
  if (finalIdentity !== null) {
    const inspection = await inspectArchiveFile(finalPath, expectedSize, digest, signal, true);
    if (inspection.verified) {
      return finalPublicPath;
    }
    await quarantineAndRemove(cache, finalName, inspection.identity);
  }

  const partialName = `${digest}.part`;
  const partialPath = downloadCachePath(cache, partialName);
  let pinnedPartial = await openCurrentPartial(partialPath);
  try {
    let offset = 0;
    if (pinnedPartial !== null) {
      if (pinnedPartial.identity.size > BigInt(expectedSize)) {
        await assertPinnedPartialIdentity(pinnedPartial.file, partialPath, pinnedPartial.identity);
        await removeExistingPartial(cache, partialName, pinnedPartial.identity);
        await pinnedPartial.file.close();
        pinnedPartial = null;
      } else {
        offset = Number(pinnedPartial.identity.size);
      }
    }

    if (offset === expectedSize && pinnedPartial !== null) {
      const verifiedIdentity = await verifyArchiveHandle(
        pinnedPartial.file,
        partialPath,
        expectedSize,
        digest,
        signal,
      );
      if (verifiedIdentity !== null) {
        await promotePartial(cache, pinnedPartial.file, partialPath, finalPath, verifiedIdentity);
        return finalPublicPath;
      }
      await assertPinnedPartialIdentity(pinnedPartial.file, partialPath, pinnedPartial.identity);
      await removeExistingPartial(cache, partialName, pinnedPartial.identity);
      await pinnedPartial.file.close();
      pinnedPartial = null;
      offset = 0;
    }

    await assertOcrRuntimeInstallDiskSpace({
      path: cache.rootPath,
      remainingArchiveBytes: expectedSize - offset,
      expandedSize,
      authenticatedIndexBytes,
      operation: "download",
      diskFreeBytes,
    });

    const headers = new Headers({
      accept: "application/octet-stream",
      "accept-encoding": "identity",
      "user-agent": "SnapOtter-OCR-runtime-installer/1",
    });
    if (offset > 0) headers.set("range", `bytes=${offset}-`);
    const response = await fetchTrusted(fetchImpl, url, { headers, signal });
    await assertDownloadResponse(response, "OCR runtime archive", retryNow);
    if (!response.body) throw new Error("OCR runtime archive response did not contain a body");

    let append = false;
    if (offset > 0 && response.status === 206) {
      const expectedRange = `bytes ${offset}-${expectedSize - 1}/${expectedSize}`;
      if (response.headers.get("content-range") !== expectedRange) {
        cancelResponseBody(response);
        throw new Error("OCR runtime archive server returned a mismatched resume range");
      }
      if (pinnedPartial === null) {
        cancelResponseBody(response);
        throw new Error("OCR runtime partial archive disappeared before resume");
      }
      try {
        await assertPinnedPartialIdentity(pinnedPartial.file, partialPath, pinnedPartial.identity);
      } catch (error) {
        cancelResponseBody(response);
        throw error;
      }
      append = true;
    } else if (response.status === 200) {
      if (pinnedPartial !== null) {
        try {
          await assertPinnedPartialIdentity(
            pinnedPartial.file,
            partialPath,
            pinnedPartial.identity,
          );
          await removeExistingPartial(cache, partialName, pinnedPartial.identity);
          await pinnedPartial.file.close();
          pinnedPartial = null;
        } catch (error) {
          cancelResponseBody(response);
          throw error;
        }
      }
      offset = 0;
    } else {
      cancelResponseBody(response);
      throw new Error(`Unable to download OCR runtime archive: HTTP ${response.status}`);
    }

    let file: FileHandle;
    try {
      if (append) {
        if (pinnedPartial === null) {
          throw new Error("OCR runtime partial archive disappeared before resume");
        }
        file = pinnedPartial.file;
        pinnedPartial = null;
      } else {
        file = await createPartial(partialPath);
      }
    } catch (error) {
      cancelResponseBody(response);
      throw error;
    }
    let reader: ReadableStreamDefaultReader<Uint8Array>;
    try {
      reader = response.body.getReader();
    } catch (error) {
      cancelResponseBody(response);
      await file.close();
      throw error;
    }
    let written = offset;
    let partialSynced = false;
    try {
      while (true) {
        const { done, value } = await readWithStallTimeout(
          reader,
          "OCR runtime archive",
          signal,
          stallTimeoutMs ?? 5 * 60_000,
        );
        if (done) break;
        if (written + value.byteLength > expectedSize) {
          throw new Error("OCR runtime archive exceeded its signed size");
        }
        written += await writeBufferFully(file, value);
        const percent = 10 + Math.floor((written / expectedSize) * 78);
        onProgress?.(Math.min(percent, 88), "Downloading OCR runtime");
      }
      await file.sync();
      partialSynced = true;
      if (written !== expectedSize) {
        throw new RetryableOcrDownloadError(
          `OCR runtime archive is truncated (${written}/${expectedSize} bytes)`,
        );
      }

      onProgress?.(90, "Verifying OCR runtime archive");
      const verifiedIdentity = await verifyArchiveHandle(
        file,
        partialPath,
        expectedSize,
        digest,
        signal,
      );
      if (verifiedIdentity === null) {
        if (append) {
          const corruptIdentity = regularFileIdentity(
            await file.stat({ bigint: true }),
            partialPath,
          );
          await assertPinnedPartialIdentity(file, partialPath, corruptIdentity);
          await removeExistingPartial(cache, partialName, corruptIdentity);
          throw new RetryableOcrDownloadError(
            "OCR runtime resumed archive failed SHA-256 verification; restarting from byte zero",
          );
        }
        throw new Error("OCR runtime archive failed SHA-256 verification");
      }
      await promotePartial(cache, file, partialPath, finalPath, verifiedIdentity);
      return finalPublicPath;
    } catch (error) {
      cancelReader(reader, error);
      if (!partialSynced) await file.sync();
      throw error;
    } finally {
      reader.releaseLock();
      await file.close();
    }
  } finally {
    await pinnedPartial?.file.close().catch(() => {});
  }
}

export async function downloadVerifiedRuntimeRelease(
  options: DownloadOcrRuntimeReleaseOptions,
): Promise<DownloadedOcrRuntimeRelease> {
  return withInstallLeaseMutation(options.aiDataDir, options.installLockFd, () =>
    downloadVerifiedRuntimeReleaseUnderLease(options),
  );
}

async function downloadVerifiedRuntimeReleaseUnderLease(
  options: DownloadOcrRuntimeReleaseOptions,
): Promise<DownloadedOcrRuntimeRelease> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const retryPolicy = resolveRetryPolicy(options.retry);
  const timeoutMs = options.timeoutMs ?? 2 * 60 * 60_000;
  const stallTimeoutMs = options.stallTimeoutMs ?? 5 * 60_000;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 0 ||
    !Number.isSafeInteger(stallTimeoutMs) ||
    stallTimeoutMs < 0
  ) {
    throw new Error("OCR runtime download timeouts must be non-negative integers");
  }
  const controller = new AbortController();
  const retryBudget: RetryBudget = { totalDelayMs: 0 };
  const timeout = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  let downloadCache: OpenDownloadCache | undefined;
  timeout?.unref();
  try {
    downloadCache = await ensureDownloadsDirectory(options.aiDataDir);
    throwIfAborted(controller.signal);
    options.onProgress?.(2, "Downloading signed OCR runtime index");
    const rawIndex = await withTransientDownloadRetries(
      "OCR runtime index download",
      async () => {
        const indexResponse = await fetchTrusted(
          fetchImpl,
          releaseUrl(options.bundleRepo, options.version, "ocr-runtime-index.json"),
          {
            headers: {
              accept: "application/json",
              "accept-encoding": "identity",
              "user-agent": "SnapOtter-OCR-runtime-installer/1",
            },
            signal: controller.signal,
          },
        );
        await assertDownloadResponse(indexResponse, "OCR runtime index", retryPolicy.now);
        return readBoundedResponse(
          indexResponse,
          INDEX_MAX_BYTES,
          "OCR runtime index",
          controller.signal,
          stallTimeoutMs,
        );
      },
      retryPolicy,
      retryBudget,
      controller.signal,
    );
    throwIfAborted(controller.signal);
    options.onProgress?.(5, "Verifying signed OCR runtime index");
    const verified = verifyRuntimeIndex(
      rawIndex,
      options.target,
      options.trustKeys,
      options.version,
    );
    assertOcrRuntimeMemory(verified.minimumMemoryBytes, options.memoryOptions);

    const indexDigest = createHash("sha256").update(rawIndex).digest("hex");
    const indexName = `${indexDigest}.index.json`;
    const indexPath = publicDownloadCachePath(downloadCache, indexName);
    await persistVerifiedIndex(downloadCache, indexName, rawIndex, indexDigest);
    throwIfAborted(controller.signal);

    const archivePath = await withTransientDownloadRetries(
      "OCR runtime archive download",
      () =>
        downloadArchive(
          releaseUrl(options.bundleRepo, options.version, verified.archiveFile),
          downloadCache as OpenDownloadCache,
          verified.archiveSha256,
          verified.archiveSize,
          verified.archiveExpandedSize,
          rawIndex.byteLength,
          fetchImpl,
          controller.signal,
          stallTimeoutMs,
          options.onProgress,
          options.diskFreeBytes,
          retryPolicy.now,
        ),
      retryPolicy,
      retryBudget,
      controller.signal,
    );
    throwIfAborted(controller.signal);
    await assertDownloadCacheAttached(downloadCache);
    return { ...verified, indexPath, archivePath };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`OCR runtime download timed out after ${timeoutMs}ms`, { cause: error });
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    await downloadCache?.trashHandle.close().catch(() => {});
    await downloadCache?.handle.close().catch(() => {});
  }
}

export async function prepareOfflineRuntimeIndex(options: {
  indexPath: string;
  target: OcrRuntimeTarget;
  trustKeys: readonly OcrRuntimeTrustKey[];
  version: string;
  /** Test seam for physical/cgroup memory admission. */
  memoryOptions?: OcrRuntimeMemoryOptions;
}): Promise<VerifiedOcrRuntimeIndex & { canonicalIndexBytes: number }> {
  const indexInfo = await lstat(options.indexPath);
  if (!indexInfo.isFile() || indexInfo.isSymbolicLink() || indexInfo.size > INDEX_MAX_BYTES) {
    throw new Error("Offline OCR runtime index is not a safe regular file");
  }
  const rawIndex = await readFile(options.indexPath);
  for (const trustKey of options.trustKeys) {
    let publicKey: ReturnType<typeof createPublicKey>;
    try {
      publicKey = createPublicKey(trustKey.publicKey);
    } catch (error) {
      throw new Error(`Trusted OCR runtime key "${trustKey.keyId}" is invalid`, { cause: error });
    }
    if (publicKey.asymmetricKeyType !== "ed25519") {
      throw new Error(`Trusted OCR runtime key "${trustKey.keyId}" is not Ed25519`);
    }
  }
  let verified: VerifiedOcrRuntimeIndex;
  try {
    verified = verifyRuntimeIndex(rawIndex, options.target, options.trustKeys, options.version);
  } catch (error) {
    throw new OcrRuntimeImportValidationError(errorMessage(error), { cause: error });
  }
  assertOcrRuntimeMemory(verified.minimumMemoryBytes, options.memoryOptions);
  return { ...verified, canonicalIndexBytes: rawIndex.byteLength };
}

export async function prepareOfflineRuntimeRelease(options: {
  indexPath: string;
  archivePath: string;
  target: OcrRuntimeTarget;
  trustKeys: readonly OcrRuntimeTrustKey[];
  version: string;
  /** Test seam for physical/cgroup memory admission. */
  memoryOptions?: OcrRuntimeMemoryOptions;
}): Promise<DownloadedOcrRuntimeRelease> {
  const { canonicalIndexBytes: _canonicalIndexBytes, ...verified } =
    await prepareOfflineRuntimeIndex(options);
  const archiveInfo = await lstat(options.archivePath);
  if (!archiveInfo.isFile() || archiveInfo.isSymbolicLink()) {
    throw new Error("Offline OCR runtime archive is not a safe regular file");
  }
  if (
    !(await verifyArchiveFile(options.archivePath, verified.archiveSize, verified.archiveSha256))
  ) {
    throw new OcrRuntimeImportValidationError(
      "Offline OCR runtime archive does not match the signed index",
    );
  }
  return {
    ...verified,
    indexPath: options.indexPath,
    archivePath: options.archivePath,
  };
}

function expectedDownloadsRoot(aiDataDir: string): string {
  return join(resolve(aiDataDir), "v3", "downloads");
}

export async function cleanupDownloadedRuntimeRelease(
  aiDataDir: string,
  release: Pick<DownloadedOcrRuntimeRelease, "indexPath" | "archivePath">,
  installLockFd: number,
): Promise<void> {
  return withInstallLeaseMutation(aiDataDir, installLockFd, () =>
    cleanupDownloadedRuntimeReleaseUnderLease(aiDataDir, release),
  );
}

async function cleanupDownloadedRuntimeReleaseUnderLease(
  aiDataDir: string,
  release: Pick<DownloadedOcrRuntimeRelease, "indexPath" | "archivePath">,
): Promise<void> {
  const downloadsRoot = expectedDownloadsRoot(aiDataDir);
  let cache: OpenDownloadCache | undefined;
  try {
    cache = (await openDownloadCacheTree(aiDataDir, false)) ?? undefined;
    if (!cache) return;
    for (const path of [release.indexPath, release.archivePath]) {
      const resolvedPath = resolve(path);
      if (!resolvedPath.startsWith(`${downloadsRoot}/`)) {
        throw new Error("Refusing to clean an OCR runtime object outside the download cache");
      }
      const name = resolvedPath.slice(downloadsRoot.length + 1);
      if (!CLEANUP_OBJECT_NAME_PATTERN.test(name)) {
        throw new Error("Refusing to clean an unexpected OCR runtime cache object");
      }
      const operationPath = downloadCachePath(cache, name);
      let info: Awaited<ReturnType<typeof lstat>>;
      try {
        info = await lstat(operationPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      if (!info.isFile() && !info.isSymbolicLink()) {
        throw new Error(`Unexpected entry in OCR runtime downloads: ${name}`);
      }
      await rm(operationPath);
    }
    await cache.handle.sync();
    await assertDownloadCacheAttached(cache);
  } finally {
    await cache?.trashHandle.close().catch(() => {});
    await cache?.handle.close().catch(() => {});
  }
}

export async function purgeOcrRuntimeDownloads(
  aiDataDir: string,
  installLockFd: number,
): Promise<void> {
  return withInstallLeaseMutation(aiDataDir, installLockFd, () =>
    purgeOcrRuntimeDownloadsUnderLease(aiDataDir),
  );
}

async function purgeOcrRuntimeDownloadsUnderLease(aiDataDir: string): Promise<void> {
  let cache: OpenDownloadCache | undefined;
  try {
    cache = (await openDownloadCacheTree(aiDataDir, false)) ?? undefined;
    if (!cache) return;
    for (const name of await readdir(cache.rootPath)) {
      if (name === DOWNLOAD_TRASH_NAME) {
        if ((await readdir(cache.trashRootPath)).length !== 0) {
          throw new Error("OCR runtime download quarantine could not be reconciled");
        }
        continue;
      }
      const path = downloadCachePath(cache, name);
      const entry = await lstat(path);
      if (!entry.isFile() && !entry.isSymbolicLink()) {
        throw new Error(`Unexpected entry in OCR runtime downloads: ${name}`);
      }
      await rm(path);
    }
    await cache.handle.sync();
    await assertDownloadCacheAttached(cache);
  } finally {
    await cache?.trashHandle.close().catch(() => {});
    await cache?.handle.close().catch(() => {});
  }
}

export function buildOcrRuntimeInstallerCommand(
  options: RunOcrRuntimeInstallerOptions,
): OcrRuntimeInstallerCommand {
  const executable =
    options.pythonPath ?? process.env.SNAPOTTER_SYSTEM_PYTHON ?? DEFAULT_SYSTEM_PYTHON;
  const installerPath =
    options.installerPath ?? join(PROJECT_ROOT, "packages", "ai", "python", "install_runtime.py");
  const smokeCommand = ["{runtime}/venv/bin/python", "{runtime}/ocr_runner.py", "--smoke"];
  return {
    executable,
    args: [
      installerPath,
      options.mode ?? "install",
      "--ai-data-dir",
      resolve(options.aiDataDir),
      "--index",
      options.release.indexPath,
      "--archive",
      options.release.archivePath,
      "--family",
      "ocr",
      "--target",
      String(options.release.artifact.target),
      "--expected-index-sha256",
      createHash("sha256").update(options.release.canonicalIndex).digest("hex"),
      "--smoke-command",
      JSON.stringify(smokeCommand),
      "--preverified-index",
    ],
    env: runtimeInstallerEnvironment(),
  };
}

function runtimeInstallerEnvironment(): NodeJS.ProcessEnv {
  return {
    HOME: "/tmp",
    LANG: "C.UTF-8",
    PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    HF_HUB_OFFLINE: "1",
    NO_PROXY: "*",
    PIP_NO_INDEX: "1",
    PYTHONNOUSERSITE: "1",
    SNAPOTTER_ALLOW_MODEL_DOWNLOAD: "0",
    SNAPOTTER_NETWORK_DISABLED: "1",
    TRANSFORMERS_OFFLINE: "1",
    no_proxy: "*",
  };
}

function appendBounded(current: string, chunk: Buffer, channel: string): string {
  const nextBytes = Buffer.byteLength(current) + chunk.byteLength;
  if (nextBytes > MAX_INSTALLER_OUTPUT_BYTES) {
    throw new Error(
      `OCR runtime installer ${channel} exceeded ${MAX_INSTALLER_OUTPUT_BYTES} bytes`,
    );
  }
  return current + chunk.toString("utf8");
}

function installerError(stderr: string, stdout: string, code: number | null): Error {
  for (const line of stderr.trim().split("\n").reverse()) {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isRecord(parsed) && typeof parsed.error === "string" && parsed.error) {
        return new Error(parsed.error);
      }
    } catch {
      // Non-JSON diagnostics are bounded and used below.
    }
  }
  const detail = stderr.trim() || stdout.trim();
  return new Error(
    detail ? `OCR runtime installation failed: ${detail}` : `OCR runtime installer exited ${code}`,
  );
}

export function runOcrRuntimeInstaller(
  options: RunOcrRuntimeInstallerOptions,
): Promise<Record<string, unknown>> {
  const command = buildOcrRuntimeInstallerCommand(options);
  const timeoutMs = options.timeoutMs ?? 2 * 60 * 60_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) {
    return Promise.reject(
      new Error("OCR runtime installer timeout must be a non-negative integer"),
    );
  }
  if (options.signal?.aborted) {
    const reason = abortReason(options.signal);
    return Promise.reject(reason instanceof Error ? reason : new Error(String(reason)));
  }
  return new Promise((resolvePromise, rejectPromise) => {
    if (
      options.installLockFd !== undefined &&
      (!Number.isSafeInteger(options.installLockFd) || options.installLockFd < 0)
    ) {
      rejectPromise(
        new Error("OCR runtime install-lock descriptor must be a non-negative integer"),
      );
      return;
    }
    // POSIX detached children lead a dedicated session/process group, so a
    // timeout can terminate smoke-test descendants without touching the API's
    // own group. Windows has no negative-PID group signaling and falls back to
    // ChildProcess.kill() below.
    const useProcessGroup = process.platform !== "win32";
    const child = spawn(command.executable, command.args, {
      detached: useProcessGroup,
      env: command.env,
      shell: false,
      stdio:
        options.installLockFd === undefined
          ? ["ignore", "pipe", "pipe"]
          : ["ignore", "pipe", "pipe", options.installLockFd],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let pendingFailure: Error | null = null;
    let forceKillTimer: NodeJS.Timeout | null = null;
    let timeout: NodeJS.Timeout | null = null;
    let abortListener: (() => void) | null = null;
    let childClosed = false;
    let groupTerminationPending = false;
    let forceKillCompleted = false;

    const finish = (error?: Error, value?: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (abortListener) options.signal?.removeEventListener("abort", abortListener);
      if (error) rejectPromise(error);
      else resolvePromise(value ?? {});
    };

    const signalInstallerTree = (signal: NodeJS.Signals): boolean => {
      if (
        useProcessGroup &&
        typeof child.pid === "number" &&
        child.pid > 0 &&
        child.pid !== process.pid
      ) {
        try {
          process.kill(-child.pid, signal);
          return true;
        } catch {
          // The platform or runtime may not support negative-PID signaling.
          // Direct signaling preserves the prior cross-platform behavior.
        }
      }
      try {
        child.kill(signal);
      } catch {
        // A concurrent close/error event owns settlement.
      }
      return false;
    };

    const terminate = (error: Error) => {
      if (settled || pendingFailure) return;
      pendingFailure = error;
      groupTerminationPending = signalInstallerTree("SIGTERM");
      forceKillTimer = setTimeout(() => {
        signalInstallerTree("SIGKILL");
        forceKillCompleted = true;
        // close proves the lock-owning installer has exited; the synchronous
        // group SIGKILL above proves its remaining descendants were signaled.
        if (childClosed && pendingFailure) finish(pendingFailure);
      }, 5_000);
      forceKillTimer.unref();
    };

    timeout =
      timeoutMs > 0
        ? setTimeout(() => {
            terminate(new Error(`OCR runtime installer timed out after ${timeoutMs}ms`));
          }, timeoutMs)
        : null;
    timeout?.unref();
    if (options.signal) {
      abortListener = () => {
        const reason = abortReason(options.signal as AbortSignal);
        terminate(reason instanceof Error ? reason : new Error(String(reason)));
      };
      options.signal.addEventListener("abort", abortListener, { once: true });
      if (options.signal.aborted) abortListener();
    }

    const capture = (channel: "stdout" | "stderr", chunk: Buffer) => {
      try {
        if (channel === "stdout") stdout = appendBounded(stdout, chunk, channel);
        else stderr = appendBounded(stderr, chunk, channel);
      } catch (error) {
        terminate(error instanceof Error ? error : new Error(String(error)));
      }
    };
    child.stdout?.on("data", (chunk: Buffer) => capture("stdout", chunk));
    child.stderr?.on("data", (chunk: Buffer) => capture("stderr", chunk));
    child.once("error", (error) => {
      // A timeout/output-limit termination can itself make kill() emit an
      // error. The installer may still be alive, so retain ownership until
      // close proves it has exited. Before termination, this is a spawn error
      // and there is no live child to wait for.
      if (pendingFailure) return;
      finish(
        new Error(`Unable to start OCR runtime installer: ${error.message}`, { cause: error }),
      );
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      childClosed = true;
      if (pendingFailure) {
        // A detached descendant can outlive the group leader. Retain the
        // install lease until escalation has synchronously signaled the whole
        // process group. Escalate immediately when the leader closes instead
        // of leaving a process-group ID available for reuse during the grace
        // period; direct-signaling fallbacks can settle on child close.
        if (groupTerminationPending && !forceKillCompleted) {
          signalInstallerTree("SIGKILL");
          forceKillCompleted = true;
        }
        finish(pendingFailure);
        return;
      }
      if (signal || code !== 0) {
        // The installer may have died while its smoke child was still alive.
        // Its dedicated group makes immediate descendant cleanup safe.
        signalInstallerTree("SIGKILL");
      }
      if (signal && code === null) {
        finish(new Error(`OCR runtime installer was terminated by ${signal}`));
        return;
      }
      if (code !== 0) {
        finish(installerError(stderr, stdout, code));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim()) as unknown;
        if (!isRecord(parsed) || parsed.family !== "ocr" || typeof parsed.generation !== "string") {
          throw new Error("OCR runtime installer returned an invalid result");
        }
        finish(undefined, parsed);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

function runInheritedLockMaintenance(
  executable: string,
  args: string[],
  options: { installLockFd: number; timeoutMs: number },
): Promise<{ stdout: string; stderr: string }> {
  if (!Number.isSafeInteger(options.installLockFd) || options.installLockFd < 0) {
    return Promise.reject(
      new Error("OCR runtime install-lock descriptor must be a non-negative integer"),
    );
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 0) {
    return Promise.reject(new Error("OCR runtime maintenance timeout must be non-negative"));
  }

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, args, {
      env: runtimeInstallerEnvironment(),
      shell: false,
      // Child fd 3 is a dup of the parent's locked open-file description.
      // If the API process dies, the mutator retains the lease until it exits.
      stdio: ["ignore", "pipe", "pipe", options.installLockFd],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let pendingFailure: Error | null = null;
    let forceKillTimer: NodeJS.Timeout | null = null;

    const clearTimers = () => {
      if (timeout) clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimers();
      if (error) rejectPromise(error);
      else resolvePromise({ stdout, stderr });
    };
    const terminate = (error: Error) => {
      if (settled || pendingFailure) return;
      pendingFailure = error;
      try {
        child.kill("SIGTERM");
      } catch {
        // Retain the inherited lease until close proves the child is gone.
      }
      forceKillTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // Child already exited.
        }
      }, 5_000);
      forceKillTimer.unref();
    };
    const timeout =
      options.timeoutMs > 0
        ? setTimeout(() => {
            terminate(new Error(`OCR runtime maintenance timed out after ${options.timeoutMs}ms`));
          }, options.timeoutMs)
        : null;
    timeout?.unref();

    child.stdout?.on("data", (chunk: Buffer) => {
      try {
        stdout = appendBounded(stdout, chunk, "stdout");
      } catch (error) {
        terminate(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      try {
        stderr = appendBounded(stderr, chunk, "stderr");
      } catch (error) {
        terminate(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.once("error", (error) => {
      if (pendingFailure) return;
      finish(
        new Error(`Unable to start OCR runtime maintenance: ${error.message}`, { cause: error }),
      );
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      if (pendingFailure) {
        finish(pendingFailure);
        return;
      }
      if (code !== 0) {
        const detail = stderr.trim() || (signal ? `terminated by ${signal}` : `exited ${code}`);
        finish(
          Object.assign(new Error(`OCR runtime maintenance failed: ${detail}`), {
            code,
            stderr,
            stdout,
          }),
        );
        return;
      }
      finish();
    });
  });
}

export async function runOcrRuntimeMaintenance(
  action: OcrRuntimeMaintenanceAction,
  options: {
    aiDataDir: string;
    pythonPath?: string;
    installerPath?: string;
    timeoutMs?: number;
    expectedGeneration?: string;
    /** Parent descriptor duplicated to child fd 3 to retain the kernel install lease. */
    installLockFd?: number;
  },
): Promise<Record<string, unknown>> {
  const executable =
    options.pythonPath ?? process.env.SNAPOTTER_SYSTEM_PYTHON ?? DEFAULT_SYSTEM_PYTHON;
  const installerPath =
    options.installerPath ?? join(PROJECT_ROOT, "packages", "ai", "python", "install_runtime.py");
  const args = [installerPath, action, "--ai-data-dir", resolve(options.aiDataDir)];
  if (action === "commit" || action === "deactivate" || action === "rollback") {
    args.push("--family", "ocr");
  }
  if (action === "commit" || action === "rollback") {
    if (
      typeof options.expectedGeneration !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(options.expectedGeneration)
    ) {
      throw new Error(`OCR runtime ${action} requires a valid expected generation`);
    }
    args.push("--expected-generation", options.expectedGeneration);
  }
  if (action === "gc") args.push("--keep-unreferenced", "0");
  try {
    const result =
      options.installLockFd === undefined
        ? await execFileAsync(executable, args, {
            encoding: "utf8",
            env: runtimeInstallerEnvironment(),
            maxBuffer: MAX_INSTALLER_OUTPUT_BYTES,
            timeout: options.timeoutMs ?? 120_000,
            windowsHide: true,
          })
        : await runInheritedLockMaintenance(executable, args, {
            installLockFd: options.installLockFd,
            timeoutMs: options.timeoutMs ?? 120_000,
          });
    const parsed = JSON.parse(result.stdout.trim()) as unknown;
    if (!isRecord(parsed)) throw new Error("OCR runtime maintenance returned an invalid result");
    return parsed;
  } catch (error) {
    if (isRecord(error) && typeof error.stderr === "string") {
      throw installerError(
        error.stderr,
        typeof error.stdout === "string" ? error.stdout : "",
        null,
      );
    }
    throw error;
  }
}
