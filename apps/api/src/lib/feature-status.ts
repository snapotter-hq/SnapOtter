import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
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
const LOCK_PATH = join(AI_DIR, "install.lock");
// Breadcrumb the installer drops right before it writes into the shared venv
// site-packages and clears the instant that write completes. A survivor on boot
// means the process died mid-write, so the venv may be torn (see move_tree).
const VENV_WRITING_MARKER = join(AI_DIR, "venv.writing");
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
}

const LOCK_STALE_MS = 45 * 60 * 1000;

export function acquireInstallLock(bundleId: string): boolean {
  // If a lock exists, check its age. OOM-killed processes or crashes
  // may leave a stale lock file behind; treat anything older than 45
  // minutes as abandoned.
  if (existsSync(LOCK_PATH)) {
    try {
      const age = Date.now() - statSync(LOCK_PATH).mtimeMs;
      if (age > LOCK_STALE_MS) {
        unlinkSync(LOCK_PATH);
        console.warn(
          `[feature-status] Removed stale install lock (age: ${Math.round(age / 1000)}s)`,
        );
      }
    } catch {
      // stat/unlink failed -- fall through to O_EXCL which will fail too
    }
  }
  try {
    const fd = openSync(LOCK_PATH, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL);
    const lock: LockData = {
      bundleId,
      startedAt: new Date().toISOString(),
    };
    writeFileSync(fd, JSON.stringify(lock, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

export function releaseInstallLock(): void {
  try {
    unlinkSync(LOCK_PATH);
  } catch {
    // Lock already gone
  }
}

export function getInstallingBundle(): {
  bundleId: string;
  startedAt: string;
} | null {
  if (!existsSync(LOCK_PATH)) return null;

  try {
    const raw = readFileSync(LOCK_PATH, "utf-8");
    const lock = JSON.parse(raw) as LockData;
    return { bundleId: lock.bundleId, startedAt: lock.startedAt };
  } catch {
    try {
      unlinkSync(LOCK_PATH);
    } catch {
      // already gone
    }
    return null;
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
export function resetAiEnvironment(): void {
  if (!acquireInstallLock("__reset__")) {
    const installing = getInstallingBundle();
    throw new Error(
      `Cannot reset: a bundle install is already in progress (${installing?.bundleId ?? "unknown"})`,
    );
  }

  try {
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
      execFileSync("/usr/local/bin/reseed-ai-venv.sh", { stdio: "ignore", timeout: 120_000 });
    } else {
      // Not a Docker image build (local dev, or a test fixture): nothing to
      // reseed from, just leave an empty directory.
      rmSync(join(AI_DIR, "venv"), { recursive: true, force: true });
    }
    ensureAiDirs();
  } finally {
    releaseInstallLock();
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

interface ManifestBundle {
  models: ManifestModel[];
  archives?: Record<string, ManifestArchive>;
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

export function recoverInterruptedInstalls(): void {
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

  // 4. Delete stale lock — if the server is starting up, any previous install is dead
  if (existsSync(LOCK_PATH)) {
    try {
      const raw = readFileSync(LOCK_PATH, "utf-8");
      const lock = JSON.parse(raw) as LockData;
      unlinkSync(LOCK_PATH);
      console.warn(
        `[feature-status] Removed stale install lock for "${lock.bundleId}" (server restarted)`,
      );
    } catch {
      try {
        unlinkSync(LOCK_PATH);
      } catch {
        // already gone
      }
    }
  }

  // 4b. Heal a torn shared venv. If the venv-writing breadcrumb survived, an
  // install died while rewriting the shared site-packages, which can leave a
  // package half-replaced and break EVERY AI tool (not just the one installing).
  // Model weight files under MODELS_DIR are unaffected, so the safe, automatic
  // recovery is to reseed the venv from the image base and reset the install
  // ledger; the user reinstalls bundles from a known-good state. This is the
  // same repair as "Reset AI Environment", done automatically on next boot so a
  // crash-broken install self-heals instead of leaving mysteriously dead tools.
  if (existsSync(VENV_WRITING_MARKER)) {
    if (isDockerEnvironment() && existsSync("/opt/venv")) {
      console.warn(
        "[feature-status] An install was interrupted mid venv-write; reseeding the AI venv to a clean state and clearing installed bundles (reinstall to restore).",
      );
      try {
        execFileSync("/usr/local/bin/reseed-ai-venv.sh", { stdio: "ignore", timeout: 120_000 });
        writeInstalled({ bundles: {} });
      } catch (err) {
        console.error("[feature-status] Failed to reseed AI venv after interrupted install:", err);
      }
    } else {
      console.warn(
        "[feature-status] An install was interrupted mid venv-write (non-Docker); the AI venv may be inconsistent. Reinstall the affected bundle.",
      );
    }
    try {
      unlinkSync(VENV_WRITING_MARKER);
    } catch {
      // best-effort
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
            console.warn(`[feature-status] Bundle "${bundleId}" missing model file: ${model.path}`);
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

  // 6. Delete staging-{bundleId}/ directories (incomplete extraction)
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

  // 7. Clean up staging/ download directory (partial downloads, orphaned tars)
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

  return Object.values(FEATURE_BUNDLES).map((bundle) => {
    const installedBundle = installed.bundles[bundle.id];
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

    const archive = manifest?.bundles[bundle.id]?.archives?.[arch];
    const downloadBytes =
      archive?.compressedSize && archive.compressedSize > 0 ? archive.compressedSize : null;
    const installedBytes =
      archive?.extractedSize && archive.extractedSize > 0 ? archive.extractedSize : null;

    return {
      id: bundle.id,
      name: bundle.name,
      description: bundle.description,
      status,
      installedVersion: installedBundle?.version ?? null,
      estimatedSize: bundle.estimatedSize,
      downloadBytes,
      installedBytes,
      enablesTools: bundle.enablesTools,
      progress,
      error,
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
): Promise<{ bundleId: string; version: string; models: string[] }> {
  const stagingId = `import-${randomUUID()}`;
  const stagingDir = join(AI_DIR, stagingId);

  if (!acquireInstallLock("__import__")) {
    throw new ImportLockError("Another install or import is already in progress");
  }

  try {
    mkdirSync(stagingDir, { recursive: true });

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
              { stdio: "ignore", timeout: 30_000 },
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
    releaseInstallLock();
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
