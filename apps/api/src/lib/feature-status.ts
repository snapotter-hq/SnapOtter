import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { FeatureBundleState, FeatureStatus } from "@ashim/shared";
import { FEATURE_BUNDLES, TOOL_BUNDLE_MAP } from "@ashim/shared";

// ── Paths ───────────────────────────────────────────────────────────────

const DATA_DIR = process.env.DATA_DIR || "/data";
const AI_DIR = join(DATA_DIR, "ai");
const MODELS_DIR = join(AI_DIR, "models");
const INSTALLED_PATH = join(AI_DIR, "installed.json");
const INSTALLED_TMP_PATH = `${INSTALLED_PATH}.tmp`;
const LOCK_PATH = join(AI_DIR, "install.lock");
const MANIFEST_PATH = process.env.FEATURE_MANIFEST_PATH || "/app/docker/feature-manifest.json";

export function getAiDir(): string {
  return AI_DIR;
}

export function getModelsDir(): string {
  return MODELS_DIR;
}

export function getManifestPath(): string {
  return MANIFEST_PATH;
}

// ── Directory setup ─────────────────────────────────────────────────────

export function ensureAiDirs(): void {
  if (!isDockerEnvironment()) return;
  mkdirSync(join(AI_DIR, "venv"), { recursive: true });
  mkdirSync(MODELS_DIR, { recursive: true });
  mkdirSync(join(AI_DIR, "pip-cache"), { recursive: true });
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

function readInstalled(): InstalledData {
  if (installedCache) return installedCache;

  if (!existsSync(INSTALLED_PATH)) {
    installedCache = { bundles: {} };
    return installedCache;
  }

  try {
    const raw = readFileSync(INSTALLED_PATH, "utf-8");
    installedCache = JSON.parse(raw) as InstalledData;
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
  const bundleId = TOOL_BUNDLE_MAP[toolId];
  if (!bundleId) return true;
  return isFeatureInstalled(bundleId);
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

export function acquireInstallLock(bundleId: string): boolean {
  if (existsSync(LOCK_PATH)) {
    return false;
  }

  const lock: LockData = {
    bundleId,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2), "utf-8");
  return true;
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

// ── Progress tracking (in-memory, for SSE) ──────────────────────────────

let currentProgress: {
  bundleId: string;
  progress: { percent: number; stage: string } | null;
  error: string | null;
} | null = null;

export function setInstallProgress(
  bundleId: string | null,
  progress: { percent: number; stage: string } | null,
  error: string | null,
): void {
  if (!bundleId) {
    currentProgress = null;
    return;
  }
  currentProgress = { bundleId, progress, error };
}

// ── Manifest reading ────────────────────────────────────────────────────

interface ManifestModel {
  id: string;
  path?: string;
  minSize?: number;
}

interface ManifestBundle {
  models: ManifestModel[];
}

interface Manifest {
  bundles: Record<string, ManifestBundle>;
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

  // 5. Verify installed bundles still have their model files
  const manifest = readManifest();
  if (manifest) {
    const data = readInstalled();
    for (const bundleId of Object.keys(data.bundles)) {
      const manifestBundle = manifest.bundles[bundleId];
      if (!manifestBundle) continue;

      for (const model of manifestBundle.models) {
        if (!model.path) continue;
        const modelPath = join(MODELS_DIR, model.path);
        if (!existsSync(modelPath)) {
          console.warn(`[feature-status] Bundle "${bundleId}" missing model file: ${model.path}`);
          // Don't remove from installed.json — getFeatureStates will surface the error
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
            // stat failed, treat as missing
            console.warn(`[feature-status] Bundle "${bundleId}" cannot stat model: ${model.path}`);
            break;
          }
        }
      }
    }
  }

  invalidateCache();
}

// ── Feature states (composite view) ─────────────────────────────────────

function verifyBundleModels(bundleId: string): string | null {
  const manifest = readManifest();
  if (!manifest) return null;

  const manifestBundle = manifest.bundles[bundleId];
  if (!manifestBundle) return null;

  for (const model of manifestBundle.models) {
    if (!model.path) continue;
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
  }

  return null;
}

export function getFeatureStates(): FeatureBundleState[] {
  const installed = readInstalled();
  const lock = getInstallingBundle();

  return Object.values(FEATURE_BUNDLES).map((bundle) => {
    const installedBundle = installed.bundles[bundle.id];
    let status: FeatureStatus = "not_installed";
    let error: string | null = null;
    let progress: { percent: number; stage: string } | null = null;

    if (lock && lock.bundleId === bundle.id) {
      status = "installing";
      if (currentProgress && currentProgress.bundleId === bundle.id) {
        progress = currentProgress.progress;
        if (currentProgress.error) {
          status = "error";
          error = currentProgress.error;
        }
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
    } else if (currentProgress?.bundleId === bundle.id && currentProgress.error) {
      status = "error";
      error = currentProgress.error;
    }

    return {
      id: bundle.id,
      name: bundle.name,
      description: bundle.description,
      status,
      installedVersion: installedBundle?.version ?? null,
      estimatedSize: bundle.estimatedSize,
      enablesTools: bundle.enablesTools,
      progress,
      error,
    };
  });
}
