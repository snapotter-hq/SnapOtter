import { execFileSync, type StdioOptions, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  type Dirent,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import {
  getOcrRuntimeCapability,
  getOcrRuntimeEffectiveMemoryBytes,
  selectOcrRuntimeTarget,
} from "@snapotter/ai";
import type { FeatureBundleState, FeatureStatus } from "@snapotter/shared";
import { FEATURE_BUNDLES, getRequiredBundlesForTool } from "@snapotter/shared";
import * as tar from "tar";
import { getQueuedBundleIds } from "./feature-install-queue.js";

// ── Paths ───────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../../..");

const DATA_DIR = process.env.DATA_DIR || "./data";
const AI_DIR = join(DATA_DIR, "ai");
const MODELS_DIR = join(AI_DIR, "models");
const INSTALLED_PATH = join(AI_DIR, "installed.json");
const INSTALLED_TMP_PATH = `${INSTALLED_PATH}.tmp`;
// Keep this ephemeral O_EXCL path for rolling compatibility with releases
// that predate kernel locking.
const LOCK_PATH = join(AI_DIR, "install.lock");
// flock must target a permanent inode. Unlinking its path while locked would
// allow a second process to create and lock a different inode concurrently.
const KERNEL_LOCK_PATH = join(AI_DIR, "install.flock");
const MUTATION_EPOCH_PATH = join(AI_DIR, "install-mutation.epoch");
// Breadcrumb the installer drops right before it writes into the shared venv
// site-packages and clears the instant that write completes. A survivor on boot
// means the process died mid-write, so the venv may be torn (see move_tree).
const VENV_WRITING_MARKER = join(AI_DIR, "venv.writing");
const LOCK_OWNED_OFFLINE_IMPORT_PREFIX = ".offline-import-v2-";
const LEGACY_OFFLINE_IMPORT_PREFIX = ".offline-import-";
const LEGACY_OFFLINE_IMPORT_STALE_MS = 35 * 60 * 1000;
const MANIFEST_PATH =
  process.env.FEATURE_MANIFEST_PATH || join(PROJECT_ROOT, "docker/feature-manifest.json");

export function getAiDir(): string {
  return AI_DIR;
}

export function getModelsDir(): string {
  return MODELS_DIR;
}

export function getManifestPath(): string {
  return MANIFEST_PATH;
}

export function getInstallScriptPath(): string {
  return join(PROJECT_ROOT, "packages/ai/python/install_feature.py");
}

/**
 * Remove upload/extraction staging only while this process owns install.flock.
 * New v2 uploads are always lock-owned. Pre-v2 upload directories are age
 * gated so a rolling-upgrade replica that still stages before locking is not
 * disrupted during the server's 30-minute request window.
 */
export function cleanupInterruptedFeatureImports(nowMs = Date.now()): boolean {
  getInstallLockFdForChild();
  let entries: Dirent[];
  try {
    entries = readdirSync(AI_DIR, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    return false;
  }

  let complete = true;
  for (const entry of entries) {
    const lockOwned =
      entry.name.startsWith(LOCK_OWNED_OFFLINE_IMPORT_PREFIX) || entry.name.startsWith("import-");
    const legacyUpload =
      !entry.name.startsWith(LOCK_OWNED_OFFLINE_IMPORT_PREFIX) &&
      entry.name.startsWith(LEGACY_OFFLINE_IMPORT_PREFIX);
    if (!lockOwned && !legacyUpload) continue;

    const path = join(AI_DIR, entry.name);
    try {
      const info = lstatSync(path);
      if (legacyUpload && Math.max(0, nowMs - info.mtimeMs) <= LEGACY_OFFLINE_IMPORT_STALE_MS) {
        continue;
      }
      if (info.isSymbolicLink()) unlinkSync(path);
      else rmSync(path, { recursive: true, force: true });
      console.info(`[feature-status] Deleted orphaned ${entry.name}/`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") complete = false;
    }
  }
  return complete;
}

// ── Directory setup ─────────────────────────────────────────────────────

export function ensureAiDirs(): void {
  if (!isDockerEnvironment()) return;
  try {
    mkdirSync(join(AI_DIR, "venv"), { recursive: true });
    mkdirSync(MODELS_DIR, { recursive: true });
    mkdirSync(join(AI_DIR, "pip-cache"), { recursive: true });
  } catch (err: unknown) {
    // Never refuse to boot over the AI data dir. AI tools simply report as not
    // installed until DATA_DIR points somewhere writable.
    const code = (err as NodeJS.ErrnoException).code;
    console.error(
      `WARNING: Cannot create AI directories under "${AI_DIR}" (${code}). AI features will be unavailable. Set DATA_DIR to a writable path (or check volume permissions / PUID / PGID in Docker).`,
    );
  }
}

// ── Docker detection ────────────────────────────────────────────────────

export function isDockerEnvironment(): boolean {
  return existsSync("/.dockerenv") || existsSync(MANIFEST_PATH);
}

// ── installed.json cache ────────────────────────────────────────────────

interface InstalledBundle {
  version: string;
  installedAt: string;
  models: string[];
}

interface InstalledData {
  bundles: Record<string, InstalledBundle>;
}

let installedCache: InstalledData | null = null;

/**
 * Coerce a parsed installed.json into a well-formed InstalledData. The file can
 * be valid JSON but the wrong shape (`{}`, `{"bundles": null}`, a bare array,
 * a number, or an older format) which would otherwise crash callers that do
 * `Object.keys(data.bundles)`, `id in data.bundles`, or `data.bundles[id]`
 * (seen in production as a fatal boot TypeError, "Cannot convert undefined or
 * null to object"). Any unusable shape degrades to an empty install set,
 * matching the corrupt-JSON fallback below.
 */
function normalizeInstalled(parsed: unknown): InstalledData {
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const bundles = (parsed as { bundles?: unknown }).bundles;
    if (typeof bundles === "object" && bundles !== null && !Array.isArray(bundles)) {
      return parsed as InstalledData;
    }
  }
  return { bundles: {} };
}

function readInstalled(): InstalledData {
  if (installedCache) return installedCache;

  if (!existsSync(INSTALLED_PATH)) {
    installedCache = { bundles: {} };
    return installedCache;
  }

  try {
    const raw = readFileSync(INSTALLED_PATH, "utf-8");
    installedCache = normalizeInstalled(JSON.parse(raw));
  } catch {
    console.warn("[feature-status] installed.json is corrupt or unreadable, treating as empty");
    installedCache = { bundles: {} };
  }

  return installedCache;
}

function writeInstalled(data: InstalledData): void {
  writeFileSync(INSTALLED_TMP_PATH, JSON.stringify(data, null, 2), "utf-8");
  renameSync(INSTALLED_TMP_PATH, INSTALLED_PATH);
}

export function invalidateCache(): void {
  installedCache = null;
}

// ── Install status queries ──────────────────────────────────────────────

export function isFeatureInstalled(bundleId: string): boolean {
  if (bundleId === "ocr") {
    return getOcrRuntimeCapability({ aiDataDir: AI_DIR }).available;
  }
  const data = readInstalled();
  return bundleId in data.bundles;
}

export function isToolInstalled(toolId: string): boolean {
  const required = getRequiredBundlesForTool(toolId);
  if (required.length === 0) return true;
  return required.every((bundleId) => isFeatureInstalled(bundleId));
}

/**
 * The first required bundle for a tool that is not yet installed, or null when
 * the tool needs no bundle or all of them are installed. A tool can require
 * more than one bundle (see TOOL_EXTRA_BUNDLES), so this is what tells the user
 * exactly which feature to install next.
 */
export function getFirstMissingBundleForTool(toolId: string): string | null {
  for (const bundleId of getRequiredBundlesForTool(toolId)) {
    if (!isFeatureInstalled(bundleId)) return bundleId;
  }
  return null;
}

// ── Install status mutations ────────────────────────────────────────────

export function markInstalled(bundleId: string, version: string, models: string[]): void {
  const data = readInstalled();
  data.bundles[bundleId] = {
    version,
    installedAt: new Date().toISOString(),
    models,
  };
  writeInstalled(data);
  invalidateCache();
}

export function markUninstalled(bundleId: string): void {
  const data = readInstalled();
  delete data.bundles[bundleId];
  writeInstalled(data);
  invalidateCache();
}

// ── Install lock (file-based) ───────────────────────────────────────────

interface LockData {
  bundleId: string;
  startedAt: string;
  ownerToken?: string;
  pid?: number;
}

const LOCK_HEARTBEAT_MS = 30 * 1000;
const LEGACY_LOCK_STALE_MS = 45 * 60 * 1000;
const LOCK_BUSY_EXIT_CODE = 75;
const MAX_LOCK_METADATA_BYTES = 64 * 1024;
let ownedInstallLockToken: string | null = null;
let ownedInstallLockFd: number | null = null;
let ownedInstallMarkerFd: number | null = null;
let ownedInstallMarkerIdentity: { dev: number; ino: number } | null = null;
let installLockHeartbeat: NodeJS.Timeout | null = null;

function stopInstallLockHeartbeat(): void {
  if (installLockHeartbeat) clearInterval(installLockHeartbeat);
  installLockHeartbeat = null;
}

function startInstallLockHeartbeat(ownerToken: string): void {
  stopInstallLockHeartbeat();
  installLockHeartbeat = setInterval(() => {
    try {
      if (ownedInstallLockToken !== ownerToken || ownedInstallMarkerFd === null) {
        stopInstallLockHeartbeat();
        return;
      }
      // A same-value positional write refreshes mtime using only the write
      // permission already proven by open(O_RDWR). futimes/fchmod require file
      // ownership on many shared-volume setups, even when fsGroup correctly
      // grants another replica read/write access to the permanent inode.
      const info = fstatSync(ownedInstallMarkerFd);
      if (info.size < 1) return;
      const lastByte = Buffer.allocUnsafe(1);
      if (readSync(ownedInstallMarkerFd, lastByte, 0, 1, info.size - 1) !== 1) return;
      writeSync(ownedInstallMarkerFd, lastByte, 0, 1, info.size - 1);
    } catch {
      stopInstallLockHeartbeat();
    }
  }, LOCK_HEARTBEAT_MS);
  installLockHeartbeat.unref();
}

/**
 * Apply a nonblocking POSIX flock to an inherited descriptor. The lock belongs
 * to Node's open file description after the helper exits, so the kernel drops
 * it automatically on close or process death. util-linux is present in the
 * official image; stdlib fcntl keeps local macOS development deterministic.
 */
function acquireKernelInstallLock(fd: number): boolean {
  const stdio: StdioOptions = ["ignore", "ignore", "pipe", fd];
  const result = existsSync("/usr/bin/flock")
    ? spawnSync(
        "/usr/bin/flock",
        ["--exclusive", "--nonblock", "--conflict-exit-code", String(LOCK_BUSY_EXIT_CODE), "3"],
        {
          stdio,
          timeout: 5_000,
        },
      )
    : spawnSync(
        process.env.SNAPOTTER_SYSTEM_PYTHON || "/usr/bin/python3",
        [
          "-c",
          `import fcntl, sys
try:
    fcntl.flock(3, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit(${LOCK_BUSY_EXIT_CODE})`,
        ],
        { stdio, timeout: 5_000 },
      );

  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (result.status === LOCK_BUSY_EXIT_CODE) return false;
  throw new Error(
    `Kernel install-lock helper failed with status ${String(result.status)}: ${result.stderr?.toString().trim() || "no error output"}`,
  );
}

function openKernelInstallLockFile(): number {
  const fd = openSync(
    KERNEL_LOCK_PATH,
    constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW,
    0o660,
  );
  try {
    const opened = fstatSync(fd);
    const linked = lstatSync(KERNEL_LOCK_PATH);
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      linked.isSymbolicLink() ||
      !linked.isFile() ||
      linked.dev !== opened.dev ||
      linked.ino !== opened.ino
    ) {
      throw new Error("AI install lock path is not a private regular file");
    }
    const mode = opened.mode & 0o777;
    if (mode !== 0o660) {
      try {
        fchmodSync(fd, 0o660);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        // A permanent lock inode may have been created by another pod UID and
        // shared through fsGroup. Opening O_RDWR already proved this replica's
        // access; do not require ownership merely to reapply an identical-safe
        // mode. Still fail closed if the inherited inode is world-accessible.
        if ((code !== "EPERM" && code !== "EACCES") || (mode & 0o007) !== 0) {
          throw error;
        }
      }
    }
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

function applyGroupSharedMode(fd: number): void {
  const opened = fstatSync(fd);
  const mode = opened.mode & 0o777;
  if (mode === 0o660) return;
  try {
    fchmodSync(fd, 0o660);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // An inode created by another pod UID can still be writable through an
    // fsGroup or ACL. Opening O_RDWR already proved access. Do not require
    // ownership just to reapply a private mode, but reject world access.
    if ((code !== "EPERM" && code !== "EACCES") || (mode & 0o007) !== 0) {
      throw error;
    }
  }
}

function readFd(fd: number): string {
  const info = fstatSync(fd);
  const length = Math.min(info.size, MAX_LOCK_METADATA_BYTES);
  if (length === 0) return "";
  const buffer = Buffer.alloc(length);
  const bytesRead = readSync(fd, buffer, 0, length, 0);
  return buffer.subarray(0, bytesRead).toString("utf8");
}

interface InstallMarkerSnapshot {
  fd: number;
  dev: number;
  ino: number;
  mtimeMs: number;
  lock: Partial<LockData> | null;
}

function openInstallMarker(): InstallMarkerSnapshot {
  const fd = openSync(LOCK_PATH, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd);
    const linked = lstatSync(LOCK_PATH);
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      linked.isSymbolicLink() ||
      !linked.isFile() ||
      linked.dev !== opened.dev ||
      linked.ino !== opened.ino
    ) {
      throw new Error("AI install marker path is not a private regular file");
    }
    let lock: Partial<LockData> | null = null;
    try {
      const parsed = JSON.parse(readFd(fd)) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        lock = parsed as Partial<LockData>;
      }
    } catch {
      // An old holder can be between O_EXCL creation and its metadata write.
    }
    return {
      fd,
      dev: opened.dev,
      ino: opened.ino,
      mtimeMs: opened.mtimeMs,
      lock,
    };
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

function markerStillNamesSnapshot(snapshot: Pick<InstallMarkerSnapshot, "dev" | "ino">): boolean {
  try {
    const linked = lstatSync(LOCK_PATH);
    return (
      !linked.isSymbolicLink() &&
      linked.isFile() &&
      linked.dev === snapshot.dev &&
      linked.ino === snapshot.ino
    );
  } catch {
    return false;
  }
}

function removeInstallMarker(snapshot: Pick<InstallMarkerSnapshot, "dev" | "ino">): boolean {
  if (!markerStillNamesSnapshot(snapshot)) return false;
  unlinkSync(LOCK_PATH);
  return true;
}

function createInstallMarker(lock: LockData): InstallMarkerSnapshot {
  const fd = openSync(
    LOCK_PATH,
    constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o660,
  );
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1) {
      throw new Error("AI install marker path is not a private regular file");
    }
    applyGroupSharedMode(fd);
    writeFileSync(fd, JSON.stringify(lock, null, 2), "utf8");
    fsyncSync(fd);
    const finalInfo = fstatSync(fd);
    return {
      fd,
      dev: finalInfo.dev,
      ino: finalInfo.ino,
      mtimeMs: finalInfo.mtimeMs,
      lock,
    };
  } catch (error) {
    const opened = fstatSync(fd);
    try {
      removeInstallMarker({ dev: opened.dev, ino: opened.ino });
    } catch {
      // Preserve the marker creation failure.
    }
    closeSync(fd);
    throw error;
  }
}

/** Claim the legacy marker while the permanent kernel lease is held. */
function claimInstallMarker(lock: LockData): InstallMarkerSnapshot | null {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return createInstallMarker(lock);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }

    let existing: InstallMarkerSnapshot;
    try {
      existing = openInstallMarker();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    try {
      // A token-bearing marker came from a new replica. Since we already hold
      // the permanent flock, it is necessarily a crash remnant. Tokenless
      // markers belong to old replicas and retain their historic 45m timeout.
      const belongsToNewReplica = typeof existing.lock?.ownerToken === "string";
      const ageMs = Math.max(0, Date.now() - existing.mtimeMs);
      if (belongsToNewReplica || ageMs > LEGACY_LOCK_STALE_MS) {
        if (removeInstallMarker(existing)) {
          if (!belongsToNewReplica) {
            console.warn(
              `[feature-status] Removed stale legacy install lock (age: ${Math.round(ageMs / 1000)}s)`,
            );
          }
          continue;
        }
      }
      return null;
    } finally {
      closeSync(existing.fd);
    }
  }
  return null;
}

function markerMetadata(snapshot: InstallMarkerSnapshot): {
  bundleId: string;
  startedAt: string;
} {
  if (typeof snapshot.lock?.bundleId === "string" && typeof snapshot.lock.startedAt === "string") {
    return { bundleId: snapshot.lock.bundleId, startedAt: snapshot.lock.startedAt };
  }
  return { bundleId: "unknown", startedAt: new Date(snapshot.mtimeMs).toISOString() };
}

function removeOwnedInstallMarker(
  fd: number,
  identity: { dev: number; ino: number },
  ownerToken: string,
): void {
  let parsed: Partial<LockData> | null = null;
  try {
    parsed = JSON.parse(readFd(fd)) as Partial<LockData>;
  } catch {
    return;
  }
  if (parsed.ownerToken !== ownerToken) return;
  removeInstallMarker(identity);
}

export function acquireInstallLock(bundleId: string): boolean {
  if (ownedInstallLockFd !== null || ownedInstallMarkerFd !== null) return false;
  let kernelFd: number | null = null;
  let marker: InstallMarkerSnapshot | null = null;
  try {
    kernelFd = openKernelInstallLockFile();
    if (!acquireKernelInstallLock(kernelFd)) {
      closeSync(kernelFd);
      return false;
    }
    const ownerToken = randomUUID();
    const lock: LockData = {
      bundleId,
      startedAt: new Date().toISOString(),
      ownerToken,
      pid: process.pid,
    };
    marker = claimInstallMarker(lock);
    if (!marker) {
      closeSync(kernelFd);
      return false;
    }
    ownedInstallLockFd = kernelFd;
    ownedInstallMarkerFd = marker.fd;
    ownedInstallMarkerIdentity = { dev: marker.dev, ino: marker.ino };
    ownedInstallLockToken = ownerToken;
    startInstallLockHeartbeat(ownerToken);
    return true;
  } catch (error) {
    if (marker !== null) {
      try {
        closeSync(marker.fd);
      } catch {
        // Preserve the acquisition failure.
      }
    }
    if (kernelFd !== null) {
      try {
        closeSync(kernelFd);
      } catch {
        // Preserve the acquisition failure.
      }
    }
    throw new Error(
      `Unable to acquire the AI install lock: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export function releaseInstallLock(): void {
  if (ownedInstallLockFd === null) return;
  const kernelFd = ownedInstallLockFd;
  const markerFd = ownedInstallMarkerFd;
  const markerIdentity = ownedInstallMarkerIdentity;
  const ownerToken = ownedInstallLockToken;
  ownedInstallLockFd = null;
  ownedInstallMarkerFd = null;
  ownedInstallMarkerIdentity = null;
  ownedInstallLockToken = null;
  stopInstallLockHeartbeat();
  try {
    // Remove only our marker while the permanent lease prevents another new
    // replica from replacing it underneath the token/inode ownership checks.
    if (markerFd !== null && markerIdentity !== null && ownerToken !== null) {
      removeOwnedInstallMarker(markerFd, markerIdentity, ownerToken);
    }
  } catch (error) {
    // The permanent kernel lease is authoritative. A leftover token-bearing
    // marker is safe and will be removed by the next new acquirer once it
    // proves the flock is free; teardown must never strand in-memory state.
    console.warn("[feature-status] Unable to remove install marker during release:", error);
  } finally {
    if (markerFd !== null) {
      try {
        closeSync(markerFd);
      } catch {
        // Continue to the authoritative kernel descriptor.
      }
    }
    try {
      closeSync(kernelFd);
    } catch {
      // There is no useful recovery from an already-invalid descriptor.
    }
  }
}

/**
 * Descriptor to duplicate into a child that mutates AI install state. Keeping
 * this open in the child preserves the same kernel lease if the API controller
 * dies before the child exits.
 */
export function getInstallLockFdForChild(): number {
  if (ownedInstallLockFd === null) {
    throw new Error("AI install lock is not held by this process");
  }
  return ownedInstallLockFd;
}

export function getInstallingBundle(): {
  bundleId: string;
  startedAt: string;
} | null {
  let marker: InstallMarkerSnapshot;
  try {
    marker = openInstallMarker();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return { bundleId: "unknown", startedAt: new Date().toISOString() };
  }
  const observed = markerMetadata(marker);
  try {
    if (ownedInstallMarkerFd !== null) return observed;

    // New replicas hold the permanent flock. Old replicas own only a fresh,
    // tokenless marker, so that marker remains authoritative when flock probes
    // free. A token-bearing marker with a free flock is a crashed new owner.
    let kernelFd: number | null = null;
    try {
      kernelFd = openKernelInstallLockFile();
      if (!acquireKernelInstallLock(kernelFd)) return observed;
      const belongsToNewReplica = typeof marker.lock?.ownerToken === "string";
      const ageMs = Math.max(0, Date.now() - marker.mtimeMs);
      if (belongsToNewReplica || ageMs > LEGACY_LOCK_STALE_MS) {
        removeInstallMarker(marker);
        return null;
      }
      return observed;
    } catch {
      // Fail closed for status when the filesystem/helper cannot prove that a
      // marker is abandoned. Install paths surface the operational error.
      return observed;
    } finally {
      if (kernelFd !== null) closeSync(kernelFd);
    }
  } finally {
    closeSync(marker.fd);
  }
}

const INITIAL_AI_MUTATION_EPOCH = "initial";

/**
 * Shared generation for destructive AI-environment changes. Queue entries keep
 * the value observed when submitted; once reset/uninstall publishes a new
 * value, every replica can reject work that was authorized against old state.
 */
export function getAiMutationEpoch(): string {
  for (let attempt = 0; attempt < 3; attempt++) {
    let fd: number | null = null;
    try {
      fd = openSync(MUTATION_EPOCH_PATH, constants.O_RDONLY | constants.O_NOFOLLOW);
      const opened = fstatSync(fd);
      const linked = lstatSync(MUTATION_EPOCH_PATH);
      if (linked.dev !== opened.dev || linked.ino !== opened.ino) {
        // Atomic publication can replace the path between open and lstat.
        // Retry rather than turning that expected race into a failed POST.
        continue;
      }
      if (!opened.isFile() || opened.nlink !== 1 || linked.isSymbolicLink() || !linked.isFile()) {
        throw new Error("AI mutation epoch path is not a private regular file");
      }
      if (opened.size > 128) throw new Error("AI mutation epoch is unexpectedly large");
      const epoch = readFd(fd).trim();
      if (!epoch) throw new Error("AI mutation epoch is empty");
      return epoch;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return INITIAL_AI_MUTATION_EPOCH;
      throw error;
    } finally {
      if (fd !== null) closeSync(fd);
    }
  }
  throw new Error("Unable to read a stable AI mutation epoch snapshot");
}

/** Atomically invalidate queue entries submitted before a destructive change. */
export function advanceAiMutationEpoch(): string {
  if (ownedInstallLockFd === null) {
    throw new Error("The AI install lock must be held before advancing the mutation epoch");
  }
  const next = randomUUID();
  const tempPath = join(AI_DIR, `.install-mutation.${next}.tmp`);
  let fd: number | null = null;
  try {
    fd = openSync(
      tempPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o660,
    );
    applyGroupSharedMode(fd);
    writeFileSync(fd, `${next}\n`, "utf8");
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(tempPath, MUTATION_EPOCH_PATH);
    return next;
  } catch (error) {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // Preserve the publication failure.
      }
    }
    try {
      unlinkSync(tempPath);
    } catch {
      // The temp file was either never created or was already renamed.
    }
    throw error;
  }
}

/**
 * Wipe the shared AI venv, downloaded models, and pip cache, then reset
 * installed.json to empty. For self-hosters whose venv already has stale or
 * conflicting package files from a previous bundle version (the class of bug
 * in project_ai_bundle_numpy_abi_strand): uninstalling a bundle only removes
 * its model weights, never the shared site-packages it wrote into, so a
 * reinstall just overlays corrected files on top of the old ones rather than
 * replacing them. This is the blunt, reliable alternative: everything AI
 * related is deleted and every bundle needs reinstalling (a fresh download
 * from the HuggingFace bundle repo), but there is no partial/stale state left
 * to reason about afterward.
 */
export function resetAiEnvironment(
  options: { installLockHeld?: boolean; mutationEpochAdvanced?: boolean } = {},
): void {
  const ownsLock = options.installLockHeld !== true;
  if (ownsLock && !acquireInstallLock("__reset__")) {
    const installing = getInstallingBundle();
    throw new Error(
      `Cannot reset: a bundle install is already in progress (${installing?.bundleId ?? "unknown"})`,
    );
  }

  try {
    if (options.mutationEpochAdvanced !== true) advanceAiMutationEpoch();
    rmSync(MODELS_DIR, { recursive: true, force: true });
    rmSync(join(AI_DIR, "pip-cache"), { recursive: true, force: true });
    writeInstalled({ bundles: {} });
    invalidateCache();

    // Reseed the venv from the image's baked /opt/venv (base packages: numpy,
    // Pillow, opencv) via the same script the entrypoint uses on a base-venv
    // upgrade. A fresh install right after a reset needs a real, working venv
    // to install into -- leaving an empty directory (no python3 binary) would
    // make the very next install fail with "spawn .../python3 ENOENT".
    if (existsSync("/opt/venv")) {
      execFileSync("/usr/local/bin/reseed-ai-venv.sh", {
        stdio: ["ignore", "ignore", "ignore", getInstallLockFdForChild()],
        timeout: 120_000,
      });
    } else {
      // Not a Docker image build (local dev, or a test fixture): nothing to
      // reseed from, just leave an empty directory.
      rmSync(join(AI_DIR, "venv"), { recursive: true, force: true });
    }
    ensureAiDirs();
  } finally {
    if (ownsLock) releaseInstallLock();
  }
}

// ── Progress tracking (in-memory, for SSE) ──────────────────────────────

let currentProgress: {
  bundleId: string;
  progress: { percent: number; stage: string } | null;
} | null = null;

/**
 * Failed-install errors keyed by bundle. Errors live outside the single
 * progress slot because the queue pump starts the next install immediately
 * after a failure: if the error sat in the slot, the next bundle's first
 * progress frame would overwrite it and the failure would never surface to
 * GET /features. An entry clears when a new install of the same bundle
 * starts (its first setInstallProgress call with a null error).
 */
const installErrors = new Map<string, string>();

export function setInstallProgress(
  bundleId: string | null,
  progress: { percent: number; stage: string } | null,
  error: string | null,
): void {
  if (!bundleId) {
    currentProgress = null;
    installErrors.clear();
    return;
  }
  if (error !== null) {
    installErrors.set(bundleId, error);
    if (currentProgress?.bundleId === bundleId) currentProgress = null;
    return;
  }
  installErrors.delete(bundleId);
  if (progress === null) {
    if (currentProgress?.bundleId === bundleId) currentProgress = null;
    return;
  }
  currentProgress = { bundleId, progress };
}

// ── Manifest reading ────────────────────────────────────────────────────

interface ManifestModel {
  id: string;
  path?: string;
  downloadFn?: string;
  args?: string[];
  minSize?: number;
}

interface ManifestArchive {
  compressedSize?: number;
  extractedSize?: number;
}

interface ManifestTarget {
  compressedSizeEstimate?: number;
  extractedSizeEstimate?: number;
  minimumMemoryBytes?: number;
}

interface ManifestBundle {
  models: ManifestModel[];
  archives?: Record<string, ManifestArchive>;
  targets?: Record<string, ManifestTarget>;
}

interface Manifest {
  bundles: Record<string, ManifestBundle>;
}

/**
 * Bundle archive key for this host, mirroring detect_arch() in
 * install_feature.py exactly so the size we surface matches what actually gets
 * downloaded. Only "amd64-gpu" and "arm64-cpu" archives are published; amd64
 * always resolves to the GPU variant (there is no CPU-only amd64 archive).
 */
function bundleArchKey(): string {
  return process.arch === "arm64" ? "arm64-cpu" : "amd64-gpu";
}

function readManifest(): Manifest | null {
  if (!existsSync(MANIFEST_PATH)) return null;
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as Manifest;
  } catch {
    return null;
  }
}

// ── Startup recovery ────────────────────────────────────────────────────

function deleteDownloadingFiles(dir: string): void {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".downloading")) {
      const fullPath = join(entry.parentPath ?? entry.path, entry.name);
      try {
        unlinkSync(fullPath);
        console.info(`[feature-status] Deleted partial download: ${fullPath}`);
      } catch {
        // best-effort
      }
    }
  }
}

export function recoverInterruptedInstalls(): boolean {
  if (!existsSync(AI_DIR)) {
    invalidateCache();
    return true;
  }

  // A second API replica can start while the first is actively mutating this
  // shared volume. Never erase its lock, downloads, staging, or venv marker.
  if (!acquireInstallLock("__recovery__")) {
    console.info("[feature-status] Another replica owns the install lease; recovery deferred");
    return false;
  }

  let recoveryIncomplete = false;
  try {
    // 1. Delete partial downloads
    deleteDownloadingFiles(MODELS_DIR);

    // 2. Delete stale tmp file
    if (existsSync(INSTALLED_TMP_PATH)) {
      try {
        unlinkSync(INSTALLED_TMP_PATH);
        console.info("[feature-status] Deleted stale installed.json.tmp");
      } catch {
        // best-effort
      }
    }

    // 3. Delete bootstrapping venv
    const bootstrappingDir = join(AI_DIR, "venv.bootstrapping");
    if (existsSync(bootstrappingDir)) {
      try {
        rmSync(bootstrappingDir, { recursive: true, force: true });
        console.info("[feature-status] Deleted stale venv.bootstrapping/");
      } catch {
        // best-effort
      }
    }

    // 4. Heal a torn shared venv. If the venv-writing breadcrumb survived, an
    // install died while rewriting the shared site-packages, which can leave a
    // package half-replaced and break EVERY AI tool (not just the one installing).
    // Model weight files under MODELS_DIR are unaffected, so the safe, automatic
    // recovery is to reseed the venv from the image base and reset the install
    // ledger; the user reinstalls bundles from a known-good state. This is the
    // same repair as "Reset AI Environment", done automatically on next boot so a
    // crash-broken install self-heals instead of leaving mysteriously dead tools.
    if (existsSync(VENV_WRITING_MARKER)) {
      let consumeMarker = false;
      if (isDockerEnvironment()) {
        if (existsSync("/opt/venv")) {
          console.warn(
            "[feature-status] An install was interrupted mid venv-write; reseeding the AI venv to a clean state and clearing installed bundles (reinstall to restore).",
          );
          try {
            execFileSync("/usr/local/bin/reseed-ai-venv.sh", {
              stdio: ["ignore", "ignore", "ignore", getInstallLockFdForChild()],
              timeout: 120_000,
            });
            writeInstalled({ bundles: {} });
            consumeMarker = true;
          } catch (err) {
            recoveryIncomplete = true;
            console.error(
              "[feature-status] Failed to reseed AI venv after interrupted install; retaining venv.writing for retry:",
              err,
            );
          }
        } else {
          recoveryIncomplete = true;
          console.error(
            "[feature-status] Cannot recover an interrupted AI venv write because /opt/venv is missing; retaining venv.writing for retry.",
          );
        }
      } else {
        // Local/unmanaged development has no image-owned base venv to restore.
        // Retrying cannot change that, so surface the risk once and let the
        // developer repair/reinstall the affected environment manually.
        console.warn(
          "[feature-status] An install was interrupted mid venv-write (non-Docker); the AI venv may be inconsistent. Reinstall the affected bundle.",
        );
        consumeMarker = true;
      }
      if (consumeMarker) {
        try {
          unlinkSync(VENV_WRITING_MARKER);
        } catch (error) {
          recoveryIncomplete = true;
          console.error(
            "[feature-status] AI venv recovery completed but venv.writing could not be cleared; retaining recovery retry:",
            error,
          );
        }
      }
    }

    // 5. Verify installed bundles still have their model files
    const manifest = readManifest();
    if (manifest) {
      const data = readInstalled();
      for (const bundleId of Object.keys(data.bundles)) {
        const manifestBundle = manifest.bundles[bundleId];
        if (!manifestBundle) continue;

        for (const model of manifestBundle.models) {
          if (model.path) {
            const modelPath = join(MODELS_DIR, model.path);
            if (!existsSync(modelPath)) {
              console.warn(
                `[feature-status] Bundle "${bundleId}" missing model file: ${model.path}`,
              );
              break;
            }
            if (model.minSize != null && model.minSize > 0) {
              try {
                const st = statSync(modelPath);
                if (st.size < model.minSize) {
                  console.warn(
                    `[feature-status] Bundle "${bundleId}" model "${model.path}" is undersized (${st.size} < ${model.minSize})`,
                  );
                  break;
                }
              } catch {
                console.warn(
                  `[feature-status] Bundle "${bundleId}" cannot stat model: ${model.path}`,
                );
                break;
              }
            }
          } else if (model.downloadFn === "rembg_session" && model.args?.[0]) {
            const filePath = join(MODELS_DIR, "rembg", `${model.args[0]}.onnx`);
            if (!existsSync(filePath)) {
              console.warn(
                `[feature-status] Bundle "${bundleId}" missing rembg model: ${model.args[0]}`,
              );
              break;
            }
          } else if (model.downloadFn === "hf_snapshot" && model.args?.[1]) {
            const dirPath = join(MODELS_DIR, model.args[1]);
            if (!existsSync(dirPath)) {
              console.warn(
                `[feature-status] Bundle "${bundleId}" missing model directory: ${model.args[1]}`,
              );
              break;
            }
          }
        }
      }
    }

    // 6. Delete upload/extraction staging abandoned without a live kernel
    // lease. A failed cleanup keeps startup recovery pending for a later retry.
    if (!cleanupInterruptedFeatureImports()) recoveryIncomplete = true;

    // 7. Delete staging-{bundleId}/ directories (incomplete extraction)
    try {
      const aiEntries = readdirSync(AI_DIR, { withFileTypes: true });
      for (const entry of aiEntries) {
        if (entry.isDirectory() && entry.name.startsWith("staging-")) {
          const stagingPath = join(AI_DIR, entry.name);
          rmSync(stagingPath, { recursive: true, force: true });
          console.info(`[feature-status] Deleted orphaned ${entry.name}/`);
        }
      }
    } catch {
      // AI_DIR may not exist yet
    }

    // 8. Clean up staging/ download directory (partial downloads, orphaned tars)
    const downloadStaging = join(AI_DIR, "staging");
    if (existsSync(downloadStaging)) {
      try {
        const files = readdirSync(downloadStaging);
        for (const file of files) {
          const filePath = join(downloadStaging, file);
          if (file.endsWith(".partial") || file.endsWith(".meta")) {
            unlinkSync(filePath);
            console.info(`[feature-status] Deleted stale download file: ${file}`);
          } else if (file.endsWith(".tar.gz")) {
            unlinkSync(filePath);
            console.info(`[feature-status] Deleted orphaned archive: ${file}`);
          }
        }
      } catch {
        // best-effort
      }
    }

    invalidateCache();
    return !recoveryIncomplete;
  } finally {
    releaseInstallLock();
  }
}

interface InterruptedInstallRecoveryOptions {
  retryMs?: number;
  /** Return false when post-recovery work lost a lease race and must be retried. */
  onRecovered?: () => boolean | undefined | Promise<boolean | undefined>;
}

const DEFAULT_RECOVERY_RETRY_MS = 5_000;
let interruptedInstallRecoveryTimer: NodeJS.Timeout | null = null;
let interruptedInstallRecoveryGeneration = 0;

/** Stop a pending startup-recovery retry (primarily for orderly shutdown/tests). */
export function stopInterruptedInstallRecovery(): void {
  interruptedInstallRecoveryGeneration += 1;
  if (interruptedInstallRecoveryTimer) clearTimeout(interruptedInstallRecoveryTimer);
  interruptedInstallRecoveryTimer = null;
}

/**
 * Run crash recovery now, retrying while another replica owns the shared
 * install lease. A one-shot attempt is insufficient: that owner can itself
 * crash later, leaving a torn venv and no surviving replica scheduled to heal
 * it. The timer is unref'd so recovery never keeps an otherwise-idle process
 * alive.
 */
export function startInterruptedInstallRecovery(
  options: InterruptedInstallRecoveryOptions = {},
): void {
  const retryMs = options.retryMs ?? DEFAULT_RECOVERY_RETRY_MS;
  if (!Number.isSafeInteger(retryMs) || retryMs < 1) {
    throw new Error("Interrupted-install recovery retry must be a positive integer");
  }
  stopInterruptedInstallRecovery();
  const generation = interruptedInstallRecoveryGeneration;

  const scheduleRetry = () => {
    if (generation !== interruptedInstallRecoveryGeneration) return;
    interruptedInstallRecoveryTimer = setTimeout(attempt, retryMs);
    interruptedInstallRecoveryTimer.unref();
  };

  const attempt = () => {
    if (generation !== interruptedInstallRecoveryGeneration) return;
    interruptedInstallRecoveryTimer = null;
    let recovered = false;
    try {
      recovered = recoverInterruptedInstalls();
    } catch (error) {
      console.warn(
        `[feature-status] Interrupted-install recovery failed; retrying: ${(error as Error).message}`,
      );
    }
    if (recovered) {
      if (!options.onRecovered) return;
      let postRecovery: boolean | undefined | Promise<boolean | undefined>;
      try {
        postRecovery = options.onRecovered();
      } catch (error) {
        console.warn(
          `[feature-status] Post-recovery startup cleanup failed: ${(error as Error).message}`,
        );
        scheduleRetry();
        return;
      }
      void Promise.resolve(postRecovery)
        .then((completed) => {
          if (completed === false) scheduleRetry();
        })
        .catch((error) => {
          console.warn(
            `[feature-status] Post-recovery startup cleanup failed: ${(error as Error).message}`,
          );
          scheduleRetry();
        });
      return;
    }
    scheduleRetry();
  };

  attempt();
}

// ── Feature states (composite view) ─────────────────────────────────────

export function verifyBundleModels(bundleId: string): string | null {
  const manifest = readManifest();
  if (!manifest) return null;

  const manifestBundle = manifest.bundles[bundleId];
  if (!manifestBundle) return null;

  for (const model of manifestBundle.models) {
    if (model.path) {
      const modelPath = join(MODELS_DIR, model.path);
      if (!existsSync(modelPath)) {
        return `Missing model file: ${model.path}`;
      }
      if (model.minSize != null && model.minSize > 0) {
        try {
          const st = statSync(modelPath);
          if (st.size < model.minSize) {
            return `Model "${model.path}" is undersized (${st.size} < ${model.minSize})`;
          }
        } catch {
          return `Cannot read model file: ${model.path}`;
        }
      }
    } else if (model.downloadFn === "rembg_session" && model.args?.[0]) {
      const filePath = join(MODELS_DIR, "rembg", `${model.args[0]}.onnx`);
      if (!existsSync(filePath)) {
        return `Missing rembg model: ${model.args[0]}`;
      }
    } else if (model.downloadFn === "hf_snapshot" && model.args?.[1]) {
      const dirPath = join(MODELS_DIR, model.args[1]);
      if (!existsSync(dirPath)) {
        return `Missing model directory: ${model.args[1]}`;
      }
    }
  }

  return null;
}

export function getFeatureStates(): FeatureBundleState[] {
  const installed = readInstalled();
  const lock = getInstallingBundle();
  const manifest = readManifest();
  const arch = bundleArchKey();
  const queuedIds = new Set(getQueuedBundleIds());
  const ocrCapability = getOcrRuntimeCapability({ aiDataDir: AI_DIR });
  const selectedOcrTarget = ocrCapability.available
    ? ocrCapability.descriptor.artifact.target
    : selectOcrRuntimeTarget();
  const selectedOcrEstimate = selectedOcrTarget
    ? manifest?.bundles.ocr?.targets?.[selectedOcrTarget]
    : undefined;
  const requiredOcrMemoryBytes =
    selectedOcrEstimate?.minimumMemoryBytes && selectedOcrEstimate.minimumMemoryBytes > 0
      ? selectedOcrEstimate.minimumMemoryBytes
      : null;
  let effectiveOcrMemoryBytes: number | null = null;
  let ocrMemoryCapacityUnknown = false;
  if (selectedOcrTarget) {
    try {
      effectiveOcrMemoryBytes = getOcrRuntimeEffectiveMemoryBytes();
    } catch {
      ocrMemoryCapacityUnknown = true;
    }
  }
  const ocrMemoryCompatible =
    !ocrMemoryCapacityUnknown &&
    (requiredOcrMemoryBytes === null ||
      effectiveOcrMemoryBytes === null ||
      effectiveOcrMemoryBytes >= requiredOcrMemoryBytes);
  const ocrUnavailableReason =
    !ocrCapability.available &&
    ocrCapability.reason === "descriptor-missing" &&
    ocrMemoryCapacityUnknown
      ? "memory-capacity-unknown"
      : !ocrCapability.available &&
          ocrCapability.reason === "descriptor-missing" &&
          !ocrMemoryCompatible
        ? "insufficient-memory"
        : ocrCapability.available
          ? null
          : ocrCapability.reason;
  const ocrInsufficientMemoryError =
    ocrUnavailableReason === "insufficient-memory" &&
    requiredOcrMemoryBytes !== null &&
    effectiveOcrMemoryBytes !== null
      ? `Accurate OCR requires ${requiredOcrMemoryBytes / 1024 ** 3} GiB configured memory, but this container has ${effectiveOcrMemoryBytes / 1024 ** 3} GiB; Fast OCR remains available`
      : null;

  return Object.values(FEATURE_BUNDLES).map((bundle) => {
    // The legacy ledger is authoritative for legacy bundles only. OCR v3 is
    // installed precisely when its canonical active descriptor resolves to a
    // compatible, healthy generation; an old Paddle entry must not unlock it.
    const installedBundle = bundle.id === "ocr" ? undefined : installed.bundles[bundle.id];
    let status: FeatureStatus = "not_installed";
    let error: string | null = null;
    let progress: { percent: number; stage: string } | null = null;

    const installError = installErrors.get(bundle.id) ?? null;
    if (lock && lock.bundleId === bundle.id) {
      status = "installing";
      if (currentProgress && currentProgress.bundleId === bundle.id) {
        progress = currentProgress.progress;
      }
      if (installError) {
        status = "error";
        error = installError;
      }
    } else if (bundle.id === "ocr") {
      if (ocrCapability.available) {
        status = "installed";
      } else if (queuedIds.has(bundle.id)) {
        status = "queued";
      } else if (installError) {
        status = "error";
        error = installError;
      } else if (ocrCapability.status !== "missing") {
        status = "error";
        error =
          ocrCapability.reason === "descriptor-invalid"
            ? "OCR runtime descriptor is invalid"
            : ocrCapability.reason === "insufficient-memory" && ocrInsufficientMemoryError
              ? ocrInsufficientMemoryError
              : ocrCapability.reason === "memory-capacity-unknown"
                ? "Accurate OCR cannot safely determine this container's memory limit; Fast OCR remains available"
                : ocrCapability.reason === "artifact-incompatible"
                  ? "OCR runtime artifact is incompatible with this host or SnapOtter version"
                  : "OCR accurate runtime is not supported on this host";
      } else if (ocrInsufficientMemoryError) {
        error = ocrInsufficientMemoryError;
      } else if (ocrUnavailableReason === "memory-capacity-unknown") {
        error =
          "Accurate OCR cannot safely determine this container's memory limit; Fast OCR remains available";
      }
    } else if (installedBundle) {
      // Verify model files exist and are properly sized
      const modelError = verifyBundleModels(bundle.id);
      if (modelError) {
        status = "error";
        error = modelError;
      } else {
        status = "installed";
      }
    } else if (queuedIds.has(bundle.id)) {
      // Waiting behind the active install in the server-side queue.
      status = "queued";
    } else if (installError) {
      status = "error";
      error = installError;
    }

    const manifestBundle = manifest?.bundles[bundle.id];
    const archives = manifestBundle?.archives;
    const archive =
      bundle.id === "ocr"
        ? ((selectedOcrTarget ? archives?.[selectedOcrTarget] : undefined) ?? archives?.[arch])
        : archives?.[arch];
    const targetEstimate =
      bundle.id === "ocr" && selectedOcrTarget
        ? manifestBundle?.targets?.[selectedOcrTarget]
        : undefined;
    const downloadBytes =
      archive?.compressedSize && archive.compressedSize > 0
        ? archive.compressedSize
        : targetEstimate?.compressedSizeEstimate && targetEstimate.compressedSizeEstimate > 0
          ? targetEstimate.compressedSizeEstimate
          : null;
    const installedBytes =
      archive?.extractedSize && archive.extractedSize > 0
        ? archive.extractedSize
        : targetEstimate?.extractedSizeEstimate && targetEstimate.extractedSizeEstimate > 0
          ? targetEstimate.extractedSizeEstimate
          : null;

    const baseState: FeatureBundleState = {
      id: bundle.id,
      name: bundle.name,
      description: bundle.description,
      status,
      installedVersion:
        bundle.id === "ocr"
          ? ocrCapability.available
            ? ocrCapability.descriptor.artifact.version
            : null
          : (installedBundle?.version ?? null),
      estimatedSize: bundle.estimatedSize,
      downloadBytes,
      installedBytes,
      enablesTools: bundle.enablesTools,
      progress,
      error,
    };

    if (bundle.id !== "ocr") return baseState;

    const compatibility = !ocrCapability.available
      ? ocrCapability.status === "invalid"
        ? "invalid"
        : ocrUnavailableReason === "unsupported-host" ||
            ocrUnavailableReason === "insufficient-memory" ||
            ocrUnavailableReason === "memory-capacity-unknown" ||
            !selectedOcrTarget
          ? "incompatible"
          : "compatible"
      : "compatible";

    return {
      ...baseState,
      compatibility,
      compatibilityReason: ocrUnavailableReason,
      selectedTarget: selectedOcrTarget,
      missingDownloadBytes:
        compatibility !== "compatible" ? null : ocrCapability.available ? 0 : downloadBytes,
      healthyGeneration: ocrCapability.available ? ocrCapability.descriptor.generation : null,
      availableQualities: ["fast", ...(ocrCapability.available ? ocrCapability.qualities : [])],
      requiredMemoryBytes: requiredOcrMemoryBytes,
      effectiveMemoryBytes: effectiveOcrMemoryBytes,
    };
  });
}

// ── Offline bundle import ──────────────────────────────────────────────
//
// Archive format (v1):
//   Gzipped tar containing:
//     bundle.json  - { bundleId, version, models: string[] }
//     models/...   - files mirroring MODELS_DIR layout
//
// v1 validates bundleId against the manifest but does NOT verify per-file
// checksums. Transport integrity is the operator's responsibility; a
// checksum manifest is a phase-3 candidate.
//
// Security: symlink/hardlink and other non-file entry types are rejected
// during extraction. Only "File" and "Directory" entries are permitted.

interface BundleDescriptor {
  bundleId: string;
  version: string;
  models: string[];
}

const IMPORT_MAX_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB cumulative
const IMPORT_MAX_ENTRIES = 10_000;

export async function importBundleArchive(
  stream: Readable,
  options: { installLockFd?: number } = {},
): Promise<{ bundleId: string; version: string; models: string[] }> {
  const stagingId = `import-${randomUUID()}`;
  const stagingDir = join(AI_DIR, stagingId);
  const ownsInstallLock = options.installLockFd === undefined;
  let acquiredInstallLock = false;
  let installLockFd = options.installLockFd ?? -1;

  try {
    if (ownsInstallLock) {
      if (!acquireInstallLock("__import__")) {
        throw new ImportLockError("Another install or import is already in progress");
      }
      acquiredInstallLock = true;
      installLockFd = getInstallLockFdForChild();
    } else {
      if (!Number.isSafeInteger(installLockFd) || installLockFd < 0) {
        throw new ImportLockError("A valid inherited AI install lock descriptor is required");
      }
      try {
        const lockInfo = fstatSync(installLockFd);
        if (!lockInfo.isFile()) {
          throw new ImportLockError("Inherited AI install lock descriptor is not a regular file");
        }
      } catch (error) {
        if (error instanceof ImportLockError) throw error;
        throw new ImportLockError(
          `Inherited AI install lock descriptor is not open: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    mkdirSync(stagingDir, { recursive: true, mode: 0o2770 });
    chmodSync(stagingDir, 0o2770);

    // Extract with safety guards
    let cumulativeBytes = 0;
    let entryCount = 0;

    await new Promise<void>((res, rej) => {
      const extractor = tar.extract({
        cwd: stagingDir,
        strip: 0,
        filter: (entryPath, entry) => {
          // Reject non-file entry types (symlinks, hardlinks, devices, FIFOs, etc.)
          if ("type" in entry && entry.type !== "File" && entry.type !== "Directory") {
            rej(new ImportValidationError(`Unsupported entry type ${entry.type}: ${entryPath}`));
            return false;
          }
          // Reject absolute paths and path traversal
          if (entryPath.startsWith("/") || entryPath.split("/").includes("..")) {
            rej(new ImportValidationError(`Blocked unsafe archive entry: ${entryPath}`));
            return false;
          }
          entryCount++;
          if (entryCount > IMPORT_MAX_ENTRIES) {
            rej(new ImportValidationError(`Archive exceeds ${IMPORT_MAX_ENTRIES} entry limit`));
            return false;
          }
          // Track cumulative size from tar headers (avoids consuming
          // entry data which would prevent extraction to disk)
          const entrySize = "size" in entry ? (entry.size as number) : 0;
          cumulativeBytes += entrySize;
          if (cumulativeBytes > IMPORT_MAX_BYTES) {
            rej(new ImportValidationError("Archive exceeds 20 GB cumulative size limit"));
            return false;
          }
          return true;
        },
      });

      stream.pipe(extractor);
      extractor.on("finish", () => res());
      extractor.on("error", rej);
      stream.on("error", rej);
    }).catch((err: unknown) => {
      // Malformed uploads (non-gzip data, corrupt/truncated gzip, garbage
      // tar) surface as ZlibError or tar parse errors here. Map them to a
      // 400-able validation error instead of letting them escape as a 500
      // (Sentry NODE-1Z). Fatal node-tar parse errors always carry tarCode
      // (TAR_ABORT, TAR_BAD_ARCHIVE); recoverable ones never reach "error".
      if (err instanceof ImportValidationError) throw err;
      const name = (err as Error | null)?.name ?? "";
      const msg = String((err as Error | null)?.message ?? "");
      const tarCode = (err as { tarCode?: unknown } | null)?.tarCode;
      if (
        name === "ZlibError" ||
        typeof tarCode === "string" ||
        /unexpected end of (file|data)|invalid tar|incorrect header check|zlib/i.test(msg)
      ) {
        throw new ImportValidationError("Not a valid bundle archive");
      }
      throw err;
    });

    // Read and validate bundle.json
    const bundlePath = join(stagingDir, "bundle.json");
    if (!existsSync(bundlePath)) {
      throw new ImportValidationError("Archive is missing bundle.json at root");
    }

    let descriptor: BundleDescriptor;
    try {
      descriptor = JSON.parse(readFileSync(bundlePath, "utf-8")) as BundleDescriptor;
    } catch {
      throw new ImportValidationError("bundle.json is not valid JSON");
    }

    if (!descriptor.bundleId || typeof descriptor.bundleId !== "string") {
      throw new ImportValidationError("bundle.json: bundleId must be a non-empty string");
    }
    if (!descriptor.version || typeof descriptor.version !== "string") {
      throw new ImportValidationError("bundle.json: version must be a non-empty string");
    }
    if (
      !Array.isArray(descriptor.models) ||
      !descriptor.models.every((m) => typeof m === "string")
    ) {
      throw new ImportValidationError("bundle.json: models must be an array of strings");
    }

    // Validate individual model paths against traversal
    for (const model of descriptor.models) {
      if (!model || model.includes("..") || model.startsWith("/") || model.includes("\\")) {
        throw new ImportValidationError(`bundle.json: invalid model path "${model}"`);
      }
    }

    // Validate bundleId against the manifest
    const manifest = readManifest();
    if (!manifest) {
      throw new ImportValidationError("Feature manifest not found; cannot validate bundle");
    }
    if (!manifest.bundles[descriptor.bundleId]) {
      throw new ImportValidationError(
        `Unknown bundleId "${descriptor.bundleId}"; not in feature manifest`,
      );
    }
    if (descriptor.bundleId === "ocr") {
      throw new ImportValidationError(
        "Legacy OCR bundle archives are no longer supported. Import the signed OCR v3 index and matching runtime archive instead.",
      );
    }

    // Move models/* into MODELS_DIR
    const stagingModels = join(stagingDir, "models");
    if (existsSync(stagingModels)) {
      mkdirSync(MODELS_DIR, { recursive: true });
      moveTreeRecursive(stagingModels, MODELS_DIR);
    }

    // Move site-packages/* into venv site-packages
    const stagingSitePackages = join(stagingDir, "site-packages");
    if (existsSync(stagingSitePackages)) {
      const venvPath = process.env.PYTHON_VENV_PATH || join(AI_DIR, "venv");
      let sitePackagesDir = "";
      const libDir = join(venvPath, "lib");
      if (existsSync(libDir)) {
        const pyDirs = readdirSync(libDir).filter((d) => d.startsWith("python"));
        if (pyDirs.length > 0) {
          sitePackagesDir = join(libDir, pyDirs[0], "site-packages");
        }
      }
      if (sitePackagesDir && existsSync(sitePackagesDir)) {
        moveTreeRecursive(stagingSitePackages, sitePackagesDir);
      }
    }

    // Apply fixups (NCCL wheel) if present
    const stagingFixups = join(stagingDir, "fixups");
    if (existsSync(stagingFixups)) {
      const wheels = readdirSync(stagingFixups).filter((f) => f.endsWith(".whl"));
      if (wheels.length > 0) {
        const venvPython = `${process.env.PYTHON_VENV_PATH || join(AI_DIR, "venv")}/bin/python3`;
        for (const wheel of wheels) {
          try {
            execFileSync(
              venvPython,
              [
                "-m",
                "pip",
                "install",
                "--no-index",
                `--find-links=${stagingFixups}`,
                wheel.split("-")[0],
              ],
              {
                stdio: ["ignore", "ignore", "ignore", installLockFd],
                timeout: 30_000,
              },
            );
          } catch {
            // Non-fatal
          }
        }
      }
    }

    markInstalled(descriptor.bundleId, descriptor.version, descriptor.models);

    return {
      bundleId: descriptor.bundleId,
      version: descriptor.version,
      models: descriptor.models,
    };
  } finally {
    // Clean up staging dir (best-effort)
    try {
      rmSync(stagingDir, { recursive: true, force: true });
    } catch {
      // staging cleanup is best-effort
    }
    if (acquiredInstallLock) releaseInstallLock();
  }
}

/** Recursively move entries from src into dest, merging directories. */
function moveTreeRecursive(src: string, dest: string): void {
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      moveTreeRecursive(srcPath, destPath);
    } else {
      mkdirSync(dirname(destPath), { recursive: true });
      try {
        renameSync(srcPath, destPath);
      } catch (err: unknown) {
        // EXDEV: cross-device link (staging on different fs than MODELS_DIR).
        // Staging is under AI_DIR so same-fs is expected, but fall back to
        // copy+unlink for robustness (e.g. /tmp overlay mounts).
        if ((err as NodeJS.ErrnoException).code === "EXDEV") {
          copyFileSync(srcPath, destPath);
          unlinkSync(srcPath);
        } else {
          throw err;
        }
      }
    }
  }
}

// ── Import-specific error types ────────────────────────────────────────

export class ImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportValidationError";
  }
}

export class ImportLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportLockError";
  }
}
