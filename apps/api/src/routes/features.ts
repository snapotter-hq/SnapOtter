/**
 * Feature bundle management routes.
 *
 * GET  /api/v1/features                           - List feature bundles and their statuses
 * POST /api/v1/admin/features/:bundleId/install       - Install a feature bundle (async)
 * POST /api/v1/admin/tools/:toolId/features/install   - Install every bundle a tool requires
 * POST /api/v1/admin/features/:bundleId/uninstall     - Uninstall a feature bundle
 * POST /api/v1/admin/features/reset                   - Wipe the AI venv/models, reset all bundles
 * GET  /api/v1/admin/features/disk-usage              - Get AI model disk usage
 * POST /api/v1/admin/features/import                  - Import an offline bundle archive
 */

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import {
  createReadStream,
  type Dirent,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { chmod, mkdir, mkdtemp, open, rm as rmAsync } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  acquireVenvLock,
  drainOcrDispatcher,
  getOcrRuntimeCapability,
  getOcrRuntimeEffectiveMemoryBytes,
  handoffOcrDispatcher,
  probeOcrDispatcher,
  rotateOcrDispatcher,
  selectOcrRuntimeTarget,
  shutdownDispatcher,
} from "@snapotter/ai";
import {
  ANALYTICS_EVENTS,
  APP_VERSION,
  FEATURE_BUNDLES,
  getOptionalBundleForTool,
  getRequiredBundlesForTool,
} from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config.js";
import { trackEvent } from "../lib/analytics.js";
import {
  clearActive,
  dequeue,
  enqueue,
  getActiveBundleId,
  peekQueue,
  setActive,
} from "../lib/feature-install-queue.js";
import {
  acquireInstallLock,
  advanceAiMutationEpoch,
  cleanupInterruptedFeatureImports,
  getAiDir,
  getAiMutationEpoch,
  getFeatureStates,
  getInstallingBundle,
  getInstallLockFdForChild,
  getInstallScriptPath,
  getManifestPath,
  getModelsDir,
  ImportLockError,
  ImportValidationError,
  importBundleArchive,
  invalidateCache,
  isDockerEnvironment,
  isFeatureInstalled,
  markUninstalled,
  releaseInstallLock,
  resetAiEnvironment,
  setInstallProgress,
  verifyBundleModels,
} from "../lib/feature-status.js";
import { evaluateInstallWatchdog } from "../lib/install-watchdog.js";
import { multipartParts } from "../lib/multipart-parts.js";
import {
  assertOcrRuntimeInstallDiskSpace,
  downloadVerifiedRuntimeRelease,
  loadOcrRuntimeTrustKeys,
  OcrRuntimeDiskSpaceError,
  OcrRuntimeImportValidationError,
  prepareOfflineRuntimeIndex,
  prepareOfflineRuntimeRelease,
  purgeOcrRuntimeDownloads,
  remainingInstallerTimeoutMs,
  runOcrRuntimeInstaller,
  runOcrRuntimeMaintenance,
  waitWithOcrRuntimeHeartbeat,
  writeBufferFully,
} from "../lib/ocr-runtime-install.js";
import { requirePermission } from "../permissions.js";
import { requireAuth } from "../plugins/auth.js";
import { updateSingleFileProgress } from "./progress.js";

const venvPath = process.env.PYTHON_VENV_PATH || "/opt/venv";
const pythonPath = `${venvPath}/bin/python3`;

async function handoffInstalledOcrRuntime(
  installResult: Record<string, unknown>,
  installLockFd: number,
): Promise<void> {
  const generation = installResult.generation;
  if (typeof generation !== "string" || !generation) {
    throw new Error("OCR runtime installer did not return its activated generation");
  }
  const runtimeOptions = { aiDataDir: getAiDir() };
  try {
    await handoffOcrDispatcher(runtimeOptions);
    const commitOptions = {
      aiDataDir: getAiDir(),
      expectedGeneration: generation,
      installLockFd,
    };
    try {
      await runOcrRuntimeMaintenance("commit", commitOptions);
    } catch (commitError) {
      try {
        await runOcrRuntimeMaintenance("commit", commitOptions);
      } catch (retryError) {
        throw new AggregateError(
          [commitError, retryError],
          "OCR runtime activation commit failed twice",
        );
      }
    }
    return;
  } catch (activationError) {
    let rollback: Record<string, unknown>;
    try {
      rollback = await runOcrRuntimeMaintenance("rollback", {
        aiDataDir: getAiDir(),
        expectedGeneration: generation,
        installLockFd,
      });
    } catch (rollbackError) {
      throw new Error("OCR runtime handoff failed and activation rollback also failed", {
        cause: new AggregateError([activationError, rollbackError]),
      });
    }

    if (rollback.committed === true) {
      if (rollback.committedGeneration !== generation) {
        throw new Error("OCR runtime rollback returned a mismatched committed generation", {
          cause: activationError,
        });
      }
      // Both commit subprocesses may have atomically committed and then lost
      // their output. Exact committed state is the successful terminal state.
      return;
    }

    if (typeof rollback.restoredGeneration === "string") {
      try {
        await probeOcrDispatcher(runtimeOptions);
      } catch {
        try {
          await rotateOcrDispatcher(runtimeOptions);
        } catch (recoveryError) {
          throw new Error(
            "OCR runtime handoff failed; the prior descriptor was restored but its local dispatcher could not be recovered",
            { cause: new AggregateError([activationError, recoveryError]) },
          );
        }
      }
    }
    throw new Error("OCR runtime readiness handoff failed; activation was rolled back", {
      cause: activationError,
    });
  }
}

function startOcrInstall(bundleId: string, jobId: string, installLockFd: number): void {
  const installStartTime = Date.now();
  const installDeadline =
    env.INSTALL_MAX_MS > 0 ? performance.now() + env.INSTALL_MAX_MS : undefined;
  void (async () => {
    setInstallProgress(bundleId, { percent: 0, stage: "Preparing OCR runtime" }, null);
    let finalized = false;
    const finalize = () => {
      if (finalized) return false;
      finalized = true;
      releaseInstallLock();
      clearActive();
      return true;
    };
    try {
      const target = resolveOcrInstallTarget();
      const manifest = readManifest();
      const bundleRepo = manifest?.bundleRepo;
      if (!bundleRepo) throw new Error("OCR runtime bundle repository is not configured");
      const trustKeys = loadOcrRuntimeTrustKeys(
        process.env.SNAPOTTER_OCR_RUNTIME_TRUST_STORE || undefined,
      );
      const release = await downloadVerifiedRuntimeRelease({
        aiDataDir: getAiDir(),
        installLockFd,
        bundleRepo,
        version: APP_VERSION,
        target,
        trustKeys,
        timeoutMs: env.INSTALL_MAX_MS,
        stallTimeoutMs: env.INSTALL_STALL_MS,
        onProgress: (percent, stage) => {
          setInstallProgress(bundleId, { percent, stage }, null);
          void updateSingleFileProgress({ jobId, phase: "processing", percent, stage });
        },
      });
      const activationStage = "Activating OCR runtime: extracting, verifying, and testing";
      const reportActivation = () => {
        setInstallProgress(bundleId, { percent: 92, stage: activationStage }, null);
        void updateSingleFileProgress({
          jobId,
          phase: "processing",
          percent: 92,
          stage: activationStage,
        });
      };
      reportActivation();
      const installResult = await waitWithOcrRuntimeHeartbeat(
        runOcrRuntimeInstaller({
          release,
          aiDataDir: getAiDir(),
          installLockFd,
          timeoutMs: remainingInstallerTimeoutMs(installDeadline, performance.now()),
        }),
        reportActivation,
      );
      await handoffInstalledOcrRuntime(installResult, installLockFd);
      scheduleOcrRuntimeGc();
      try {
        await purgeOcrRuntimeDownloads(getAiDir(), installLockFd);
      } catch (error) {
        console.warn("[ocr-runtime] Unable to purge verified download cache:", error);
      }
      if (!finalize()) return;
      invalidateCache();
      setInstallProgress(bundleId, null, null);
      await updateSingleFileProgress({
        jobId,
        phase: "complete",
        percent: 100,
        stage: "Complete",
        result: { bundleId },
      });
      trackEvent(ANALYTICS_EVENTS.AI_BUNDLE_ACTION, {
        bundle_id: bundleId,
        action: "installed",
        duration_ms: Date.now() - installStartTime,
      });
    } catch (error) {
      if (!finalize()) return;
      const errorMessage = error instanceof Error ? error.message : String(error);
      setInstallProgress(bundleId, null, errorMessage);
      await updateSingleFileProgress({
        jobId,
        phase: "failed",
        percent: 0,
        error: errorMessage,
      });
    } finally {
      pump();
    }
  })();
}

/**
 * Spawn the installer child for a bundle and wire up progress / analytics /
 * error reporting. The child is detached from any HTTP request, so it finalizes
 * via its own close/error handlers regardless of the connection. On exit it
 * releases the venv + file locks, clears the active slot, and pumps the queue
 * so the next waiting bundle starts automatically.
 *
 * Precondition: the file install lock is already held for `bundleId` and the
 * queue's active slot is already set to it (pump() does both before calling).
 */
function startInstall(bundleId: string, jobId: string, installLockFd: number): void {
  if (bundleId === "ocr") {
    startOcrInstall(bundleId, jobId, installLockFd);
    return;
  }
  const scriptPath = getInstallScriptPath();
  const manifestPath = getManifestPath();
  const modelsDir = getModelsDir();
  const installStartTime = Date.now();

  void (async () => {
    // Mark the install as started right away: a zero-percent frame claims the
    // progress slot and clears any stale error left by a previous failed
    // attempt of this bundle, so a retry never shows the old failure.
    setInstallProgress(bundleId, { percent: 0, stage: "" }, null);

    // Hold the venv lock across the whole install so no AI tool job loads
    // native libs from the venv while pip is rewriting them (that segfaults
    // the sidecar). This awaits any in-flight AI job before the installer
    // starts; the lock is released when the installer process exits.
    const releaseVenv = await acquireVenvLock();
    let venvReleased = false;
    const releaseVenvOnce = () => {
      if (!venvReleased) {
        venvReleased = true;
        releaseVenv();
      }
    };

    // A failed spawn fires BOTH "error" and "close", so both handlers funnel
    // their teardown through this once-guard. Without it the second event
    // would release the file lock and active slot that pump() just handed to
    // the next queued bundle, letting two installers run into the same venv
    // at once (the corruption the lock exists to prevent).
    // Install watchdog: a wedged installer (dead download socket, hung pip)
    // otherwise holds the venv writer lock forever and blocks every other
    // install with no way out but a server restart. Track the last progress
    // frame; if the child goes silent past the stall budget, or blows the
    // absolute ceiling, kill it so its close handler frees the locks and the
    // user sees a retryable failure.
    let lastProgressAt = Date.now();
    let watchdog: ReturnType<typeof setInterval> | null = null;
    let killGrace: ReturnType<typeof setTimeout> | null = null;
    let watchdogError: string | null = null;
    const clearWatchdog = () => {
      if (watchdog) {
        clearInterval(watchdog);
        watchdog = null;
      }
      if (killGrace) {
        clearTimeout(killGrace);
        killGrace = null;
      }
    };

    let finalized = false;
    const finalizeOnce = (): boolean => {
      if (finalized) return false;
      finalized = true;
      clearWatchdog();
      releaseVenvOnce();
      releaseInstallLock();
      clearActive();
      return true;
    };

    const child = spawn(pythonPath, [scriptPath, bundleId, manifestPath, modelsDir], {
      stdio: ["ignore", "pipe", "pipe", installLockFd],
      env: {
        ...process.env,
        BUNDLE_ID: bundleId,
        PIP_CACHE_DIR: join(getAiDir(), "pip-cache"),
      },
    });

    const stallMs = env.INSTALL_STALL_MS;
    const maxMs = env.INSTALL_MAX_MS;
    if (stallMs > 0 || maxMs > 0) {
      watchdog = setInterval(() => {
        const verdict = evaluateInstallWatchdog(
          Date.now(),
          lastProgressAt,
          installStartTime,
          stallMs,
          maxMs,
        );
        if (!verdict.kill) return;
        watchdogError = verdict.reason;
        setInstallProgress(bundleId, null, watchdogError);
        if (watchdog) {
          clearInterval(watchdog);
          watchdog = null;
        }
        try {
          child.kill("SIGTERM");
        } catch {
          // child already gone
        }
        // Escalate to SIGKILL if SIGTERM does not land (e.g. a C extension
        // ignoring the signal); the close handler clears this grace timer.
        killGrace = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // already gone
          }
        }, 10_000);
      }, 30_000);
      watchdog.unref?.();
    }

    let stderrBuffer = "";
    let stdoutBuffer = "";
    const lastStderrLines: string[] = [];

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString();

      const lines = stderrBuffer.split("\n");
      stderrBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        lastStderrLines.push(trimmed);
        if (lastStderrLines.length > 20) lastStderrLines.shift();

        try {
          const parsed = JSON.parse(trimmed) as { progress?: number; stage?: string };
          if (typeof parsed.progress === "number") {
            lastProgressAt = Date.now();
            setInstallProgress(
              bundleId,
              { percent: parsed.progress, stage: parsed.stage ?? "" },
              null,
            );
            void updateSingleFileProgress({
              jobId,
              phase: "processing",
              percent: parsed.progress,
              stage: parsed.stage,
            });
          }
        } catch {
          // Not JSON progress - rembg/pip output noise, keep in lastStderrLines for error reporting
        }
      }
    });

    child.on("close", (code) => {
      if (!finalizeOnce()) return;

      if (code === 0) {
        invalidateCache();
        shutdownDispatcher();
        setInstallProgress(bundleId, null, null);
        void updateSingleFileProgress({
          jobId,
          phase: "complete",
          percent: 100,
          stage: "Complete",
          result: { bundleId },
        });
        trackEvent(ANALYTICS_EVENTS.AI_BUNDLE_ACTION, {
          bundle_id: bundleId,
          action: "installed",
          duration_ms: Date.now() - installStartTime,
        });
      } else {
        // A watchdog kill wins: the child's exit code/stderr would otherwise
        // read as a generic signal death and bury why it was stopped.
        let errorMsg: string | undefined = watchdogError ?? undefined;
        // Extract the structured error from Python's fail() function first.
        // fail() writes {"error": "..."} to stderr - prefer this over raw lines.
        for (let i = lastStderrLines.length - 1; !errorMsg && i >= 0; i--) {
          const line = lastStderrLines[i];
          if (line.startsWith("{")) {
            try {
              const parsed = JSON.parse(line) as Record<string, unknown>;
              if (typeof parsed.error === "string") {
                errorMsg = parsed.error;
                break;
              }
            } catch {
              // Not valid JSON
            }
          }
        }
        if (!errorMsg) {
          if (code === 137) {
            errorMsg =
              "Installation was killed due to insufficient memory. " +
              "Try increasing the container's memory limit (e.g. mem_limit: 6g in docker-compose.yml) and retry.";
          } else {
            const meaningful = lastStderrLines.filter(
              (l) =>
                !l.startsWith("{") &&
                !l.includes("pthread_setaffinity_np") &&
                !l.includes("\x1b[") &&
                !l.includes("━") &&
                !/^\s*\d+%\|/.test(l),
            );
            errorMsg =
              meaningful.join("\n") ||
              stdoutBuffer.trim() ||
              `Install failed with exit code ${code}`;
          }
        }
        setInstallProgress(bundleId, null, errorMsg);
        void updateSingleFileProgress({ jobId, phase: "failed", percent: 0, error: errorMsg });
      }

      // Record the outcome BEFORE starting the next install, so the next
      // bundle's first progress frame cannot race with (or be wiped by) this
      // install's completion/failure bookkeeping.
      pump();
    });

    child.on("error", (err) => {
      if (!finalizeOnce()) return;
      const errorMsg = `Failed to spawn install process: ${err.message}`;
      setInstallProgress(bundleId, null, errorMsg);
      void updateSingleFileProgress({ jobId, phase: "failed", percent: 0, error: errorMsg });
      pump();
    });
  })();
}

/**
 * Start the next queued install if nothing is running and the file lock is
 * free. If the lock is held (an offline import is in progress) the head stays
 * queued and gets pumped again when the import releases the lock.
 */
const INSTALL_QUEUE_RETRY_MS = 1_000;
const OCR_RUNTIME_GC_DELAY_MS = 6 * 60_000;
let pumpRetryTimer: NodeJS.Timeout | undefined;
let ocrRuntimeGcTimer: NodeJS.Timeout | undefined;

function schedulePumpRetry(): void {
  if (pumpRetryTimer) return;
  pumpRetryTimer = setTimeout(() => {
    pumpRetryTimer = undefined;
    const error = pump();
    if (error) console.error("[feature-install-queue] Unable to acquire install lease:", error);
  }, INSTALL_QUEUE_RETRY_MS);
  pumpRetryTimer.unref();
}

function clearPumpRetry(): void {
  if (pumpRetryTimer) clearTimeout(pumpRetryTimer);
  pumpRetryTimer = undefined;
}

function scheduleOcrRuntimeGc(delayMs = OCR_RUNTIME_GC_DELAY_MS): void {
  if (ocrRuntimeGcTimer) return;
  ocrRuntimeGcTimer = setTimeout(() => {
    ocrRuntimeGcTimer = undefined;
    let acquired: boolean;
    try {
      acquired = acquireInstallLock("__ocr_gc__");
    } catch (error) {
      console.warn("[ocr-runtime] Deferred generation cleanup could not acquire its lease:", error);
      scheduleOcrRuntimeGc(OCR_RUNTIME_GC_DELAY_MS);
      return;
    }
    if (!acquired) {
      scheduleOcrRuntimeGc(INSTALL_QUEUE_RETRY_MS);
      return;
    }
    const installLockFd = getInstallLockFdForChild();
    void runOcrRuntimeMaintenance("gc", { aiDataDir: getAiDir(), installLockFd })
      .catch((error) => {
        console.warn("[ocr-runtime] Deferred generation cleanup failed:", error);
        scheduleOcrRuntimeGc(OCR_RUNTIME_GC_DELAY_MS);
      })
      .finally(() => {
        releaseInstallLock();
        pump();
      });
  }, delayMs);
  ocrRuntimeGcTimer.unref();
}

function failQueuedInstall(head: NonNullable<ReturnType<typeof peekQueue>>, error: unknown): Error {
  const failure = error instanceof Error ? error : new Error(String(error));
  dequeue();
  setInstallProgress(head.bundleId, null, failure.message);
  void updateSingleFileProgress({
    jobId: head.jobId,
    phase: "failed",
    percent: 0,
    error: failure.message,
  });
  queueMicrotask(() => {
    const nextError = pump();
    if (nextError) {
      console.error("[feature-install-queue] Unable to acquire install lease:", nextError);
    }
  });
  return failure;
}

function pump(): Error | null {
  if (getActiveBundleId()) return null;
  const head = peekQueue();
  if (!head) {
    clearPumpRetry();
    return null;
  }
  let acquired: boolean;
  try {
    acquired = acquireInstallLock(head.bundleId);
  } catch (error) {
    clearPumpRetry();
    return failQueuedInstall(head, error);
  }
  if (!acquired) {
    schedulePumpRetry();
    return null;
  }
  clearPumpRetry();
  let currentMutationEpoch: string;
  try {
    currentMutationEpoch = getAiMutationEpoch();
  } catch (error) {
    releaseInstallLock();
    return failQueuedInstall(head, error);
  }
  if (head.mutationEpoch !== currentMutationEpoch) {
    dequeue();
    releaseInstallLock();
    const message = "Install cancelled because the AI environment was reset or uninstalled";
    setInstallProgress(head.bundleId, null, message);
    void updateSingleFileProgress({
      jobId: head.jobId,
      phase: "failed",
      percent: 0,
      error: message,
    });
    queueMicrotask(pump);
    return null;
  }
  invalidateCache();
  if (isFeatureInstalled(head.bundleId)) {
    dequeue();
    releaseInstallLock();
    setInstallProgress(head.bundleId, null, null);
    void updateSingleFileProgress({
      jobId: head.jobId,
      phase: "complete",
      percent: 100,
      stage: "Already installed by another server",
      result: { bundleId: head.bundleId },
    });
    queueMicrotask(pump);
    return null;
  }
  dequeue();
  setActive(head);
  startInstall(head.bundleId, head.jobId, getInstallLockFdForChild());
  return null;
}

interface BundleIdParams {
  bundleId: string;
}

interface ToolIdParams {
  toolId: string;
}

interface EnqueuedBundleInstall {
  bundleId: string;
  jobId: string;
  queued: boolean;
}

interface ToolBundleInstallResult {
  bundleId: string;
  jobId?: string;
  queued: boolean;
  skipped?: boolean;
}

interface ManifestModel {
  id: string;
  path?: string;
  downloadFn?: string;
  args?: string[];
}

interface ManifestBundle {
  models: ManifestModel[];
  targets?: Record<string, { minimumMemoryBytes?: number }>;
}

interface Manifest {
  bundleRepo?: string;
  bundles: Record<string, ManifestBundle>;
}

function readManifest(): Manifest | null {
  const manifestPath = getManifestPath();
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest;
  } catch {
    return null;
  }
}

type SupportedOcrRuntimeTarget = Exclude<ReturnType<typeof selectOcrRuntimeTarget>, null>;

function resolveOcrInstallTarget(): SupportedOcrRuntimeTarget {
  const target = selectOcrRuntimeTarget();
  if (!target) throw new Error("Accurate OCR is not supported on this host");
  const minimumMemoryBytes = readManifest()?.bundles.ocr?.targets?.[target]?.minimumMemoryBytes;
  if (minimumMemoryBytes && minimumMemoryBytes > 0) {
    const effectiveMemoryBytes = getOcrRuntimeEffectiveMemoryBytes();
    if (effectiveMemoryBytes < minimumMemoryBytes) {
      throw new Error(
        `Accurate OCR requires ${minimumMemoryBytes / 1024 ** 3} GiB configured memory, but this container has ${effectiveMemoryBytes / 1024 ** 3} GiB; Fast OCR remains available`,
      );
    }
  }
  return target;
}

function getOcrInstallPreflightError(): { statusCode: 409 | 503; error: string } | null {
  try {
    resolveOcrInstallTarget();
  } catch (error) {
    return {
      statusCode: 409,
      error: error instanceof Error ? error.message : "Accurate OCR is not supported",
    };
  }
  try {
    loadOcrRuntimeTrustKeys(process.env.SNAPOTTER_OCR_RUNTIME_TRUST_STORE || undefined);
  } catch (error) {
    return {
      statusCode: 503,
      error: error instanceof Error ? error.message : "OCR runtime trust is not configured",
    };
  }
  return null;
}

function queueBundleInstallIfNeeded(bundleId: string): EnqueuedBundleInstall | null {
  if (isFeatureInstalled(bundleId)) {
    if (bundleId === "ocr") return null;
    const modelError = verifyBundleModels(bundleId);
    if (!modelError) return null;
    markUninstalled(bundleId);
  }

  // Queue the install on the server so the POST is durable: enqueue()
  // dedups an already-active/queued bundle and returns the effective jobId,
  // then pump() starts it immediately if nothing else is installing. A bundle
  // that lands behind another install stays queued server-side and starts
  // automatically when the running install finishes.
  const jobId = crypto.randomUUID();
  const effectiveJobId = enqueue({ bundleId, jobId, mutationEpoch: getAiMutationEpoch() });
  const pumpError = pump();
  if (pumpError) throw pumpError;

  // queued === true means it did NOT start right now (another install is
  // active, or an offline import holds the lock). The client polls queued
  // bundles and opens SSE only for the active install.
  return {
    bundleId,
    jobId: effectiveJobId,
    queued: getActiveBundleId() !== bundleId,
  };
}

/** Recursively calculate total size of a directory in bytes. */
function getDirSize(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;

  let total = 0;
  let entries: Dirent[];
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirSize(fullPath);
    } else if (entry.isFile()) {
      try {
        total += statSync(fullPath).size;
      } catch {
        // File may have been deleted between readdir and stat
      }
    }
  }
  return total;
}

const OFFLINE_INDEX_MAX_BYTES = 16 * 1024 * 1024;
const OFFLINE_OCR_ARCHIVE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const OFFLINE_LEGACY_ARCHIVE_MAX_BYTES = 20 * 1024 * 1024 * 1024;

class OfflineImportRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflineImportRecoveryError";
  }
}

function isOfflineImportStorageError(error: unknown): boolean {
  let current = error;
  for (let depth = 0; current instanceof Error && depth < 4; depth++) {
    const code = (current as NodeJS.ErrnoException).code;
    if (code === "ENOSPC" || code === "EDQUOT") return true;
    if (
      /insufficient (disk|storage) space|no space left on device|disk quota/i.test(current.message)
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

async function writeBoundedUpload(
  stream: NodeJS.ReadableStream & AsyncIterable<Buffer | Uint8Array | string>,
  path: string,
  maximumBytes: number,
  label: string,
  options: {
    expectedBytes?: number;
    beforeWrite?: (persistedBytes: number) => Promise<void>;
  } = {},
): Promise<void> {
  const file = await open(path, "wx", 0o600);
  let total = 0;
  try {
    await options.beforeWrite?.(0);
    for await (const rawChunk of stream) {
      const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
      const nextTotal = total + chunk.byteLength;
      if (nextTotal > maximumBytes) throw new ImportValidationError(`${label} is too large`);
      await options.beforeWrite?.(total);
      await writeBufferFully(file, chunk);
      total = nextTotal;
    }
    if (options.expectedBytes !== undefined && total !== options.expectedBytes) {
      throw new ImportValidationError(
        `${label} size does not match the signed index: expected ${options.expectedBytes} bytes, received ${total}`,
      );
    }
    await file.sync();
  } catch (error) {
    await rmAsync(path, { force: true });
    throw error;
  } finally {
    await file.close();
  }
}

export async function registerFeatureRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/features - List feature bundles and their statuses
  app.get(
    "/api/v1/features",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      // In non-Docker environments, all bundles are available natively
      if (!isDockerEnvironment()) {
        const ocrCapability = getOcrRuntimeCapability();
        const selectedOcrTarget = ocrCapability.available
          ? ocrCapability.descriptor.artifact.target
          : selectOcrRuntimeTarget();
        const bundles = Object.values(FEATURE_BUNDLES).map((bundle) => {
          const base = {
            id: bundle.id,
            name: bundle.name,
            description: bundle.description,
            status: "installed" as const,
            installedVersion: null,
            estimatedSize: bundle.estimatedSize,
            // Native mode runs legacy models in-process. OCR is different: Fast
            // is built in, but its optional immutable runtime remains capability-
            // driven and is unsupported by default outside controlled containers.
            downloadBytes: null,
            installedBytes: null,
            enablesTools: bundle.enablesTools,
            progress: null,
            error: null,
          };
          if (bundle.id !== "ocr") return base;

          const invalid = !ocrCapability.available && ocrCapability.status === "invalid";
          const incompatible = !ocrCapability.available && ocrCapability.status === "incompatible";
          return {
            ...base,
            status: ocrCapability.available
              ? ("installed" as const)
              : invalid
                ? ("error" as const)
                : ("not_installed" as const),
            installedVersion: ocrCapability.available
              ? ocrCapability.descriptor.artifact.version
              : null,
            compatibility: invalid
              ? ("invalid" as const)
              : incompatible
                ? ("incompatible" as const)
                : ("compatible" as const),
            compatibilityReason: ocrCapability.available ? null : ocrCapability.reason,
            selectedTarget: selectedOcrTarget,
            missingDownloadBytes: null,
            healthyGeneration: ocrCapability.available ? ocrCapability.descriptor.generation : null,
            availableQualities: [
              "fast" as const,
              ...(ocrCapability.available ? ocrCapability.qualities : []),
            ],
            error:
              !ocrCapability.available && ocrCapability.reason === "unsupported-host"
                ? "Accurate OCR is not supported on this host; Fast OCR remains available"
                : invalid
                  ? "OCR runtime descriptor is invalid"
                  : null,
          };
        });
        return reply.send({ bundles });
      }

      return reply.send({ bundles: getFeatureStates() });
    },
  );

  // POST /api/v1/admin/features/:bundleId/install - Install a feature bundle
  app.post(
    "/api/v1/admin/features/:bundleId/install",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: BundleIdParams }>, reply: FastifyReply) => {
      const admin = await requirePermission("features:manage")(request, reply);
      if (!admin) return;

      const { bundleId } = request.params;

      if (!FEATURE_BUNDLES[bundleId]) {
        return reply.status(404).send({ error: `Unknown bundle: ${bundleId}` });
      }

      if (bundleId === "ocr") {
        const preflightError = getOcrInstallPreflightError();
        if (preflightError) {
          return reply.status(preflightError.statusCode).send({ error: preflightError.error });
        }
      }

      const result = queueBundleInstallIfNeeded(bundleId);
      if (!result) {
        return reply.status(409).send({ error: `Bundle "${bundleId}" is already installed` });
      }

      return reply.status(202).send({ jobId: result.jobId, queued: result.queued });
    },
  );

  // POST /api/v1/admin/tools/:toolId/features/install - Install all bundles a tool needs
  app.post(
    "/api/v1/admin/tools/:toolId/features/install",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: ToolIdParams }>, reply: FastifyReply) => {
      const admin = await requirePermission("features:manage")(request, reply);
      if (!admin) return;

      const { toolId } = request.params;
      const requiredBundles = getRequiredBundlesForTool(toolId);
      const optionalBundle = requiredBundles.length === 0 ? getOptionalBundleForTool(toolId) : null;
      const installBundles =
        requiredBundles.length > 0 ? requiredBundles : optionalBundle ? [optionalBundle.id] : [];
      if (installBundles.length === 0) {
        return reply.status(404).send({ error: `No feature bundles required for tool: ${toolId}` });
      }

      const bundles: ToolBundleInstallResult[] = [];
      for (const bundleId of installBundles) {
        if (!FEATURE_BUNDLES[bundleId]) {
          return reply.status(404).send({ error: `Unknown bundle: ${bundleId}` });
        }
        if (bundleId === "ocr") {
          const preflightError = getOcrInstallPreflightError();
          if (preflightError) {
            return reply.status(preflightError.statusCode).send({ error: preflightError.error });
          }
        }

        const result = queueBundleInstallIfNeeded(bundleId);
        bundles.push(result ?? { bundleId, queued: false, skipped: true });
      }

      return reply.status(202).send({ bundles });
    },
  );

  // POST /api/v1/admin/features/:bundleId/uninstall - Uninstall a feature bundle
  app.post(
    "/api/v1/admin/features/:bundleId/uninstall",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: BundleIdParams }>, reply: FastifyReply) => {
      const admin = await requirePermission("features:manage")(request, reply);
      if (!admin) return;

      const { bundleId } = request.params;

      if (!FEATURE_BUNDLES[bundleId]) {
        return reply.status(404).send({ error: `Unknown bundle: ${bundleId}` });
      }

      if (bundleId !== "ocr" && !isFeatureInstalled(bundleId)) {
        return reply.status(409).send({ error: `Bundle "${bundleId}" is not installed` });
      }

      if (bundleId === "ocr") {
        if (!acquireInstallLock("__ocr_uninstall__")) {
          return reply.status(409).send({ error: "Another AI install or import is in progress" });
        }
        const installLockFd = getInstallLockFdForChild();
        try {
          advanceAiMutationEpoch();
          // Remove the shared descriptor first so no replica can acquire a new
          // generation lease while local executions are being drained.
          await runOcrRuntimeMaintenance("deactivate", { aiDataDir: getAiDir(), installLockFd });
          await drainOcrDispatcher();
          await runOcrRuntimeMaintenance("gc", { aiDataDir: getAiDir(), installLockFd });
          await purgeOcrRuntimeDownloads(getAiDir(), installLockFd);
          markUninstalled(bundleId);
          setInstallProgress(bundleId, null, null);
          trackEvent(ANALYTICS_EVENTS.AI_BUNDLE_ACTION, {
            bundle_id: bundleId,
            action: "uninstalled",
            duration_ms: 0,
          });
          return reply.send({ ok: true });
        } catch (error) {
          return reply.status(409).send({
            error: error instanceof Error ? error.message : "OCR runtime uninstall failed",
          });
        } finally {
          releaseInstallLock();
          scheduleOcrRuntimeGc();
          pump();
        }
      }

      if (!acquireInstallLock("__uninstall__")) {
        return reply.status(409).send({ error: "Another AI install or import is in progress" });
      }
      try {
        advanceAiMutationEpoch();
        const manifest = readManifest();
        if (manifest) {
          const manifestBundle = manifest.bundles[bundleId];
          if (manifestBundle) {
            const protectedFiles = new Set<string>();
            const protectedDirs = new Set<string>();
            for (const [otherId, otherBundle] of Object.entries(manifest.bundles)) {
              if (otherId === bundleId || !isFeatureInstalled(otherId)) continue;
              for (const m of otherBundle.models ?? []) {
                if (m.path) protectedFiles.add(m.path);
                if (m.downloadFn === "rembg_session" && m.args?.[0]) {
                  protectedFiles.add(`rembg/${m.args[0]}.onnx`);
                }
                if (m.downloadFn === "hf_snapshot" && m.args?.[1]) {
                  protectedDirs.add(m.args[1]);
                }
              }
            }

            const modelsDir = getModelsDir();
            for (const model of manifestBundle.models) {
              try {
                if (model.path && !protectedFiles.has(model.path)) {
                  const modelPath = join(modelsDir, model.path);
                  if (existsSync(modelPath)) unlinkSync(modelPath);
                } else if (model.downloadFn === "rembg_session" && model.args?.[0]) {
                  const relPath = `rembg/${model.args[0]}.onnx`;
                  if (!protectedFiles.has(relPath)) {
                    const filePath = join(modelsDir, relPath);
                    if (existsSync(filePath)) unlinkSync(filePath);
                  }
                } else if (!model.path && model.downloadFn === "hf_snapshot" && model.args?.[1]) {
                  const subdir = model.args[1];
                  if (!protectedDirs.has(subdir)) {
                    const dirPath = join(modelsDir, subdir);
                    if (existsSync(dirPath)) rmSync(dirPath, { recursive: true, force: true });
                  }
                }
              } catch {
                // Best-effort deletion
              }
            }
          }
        }

        markUninstalled(bundleId);
        shutdownDispatcher();

        trackEvent(ANALYTICS_EVENTS.AI_BUNDLE_ACTION, {
          bundle_id: bundleId,
          action: "uninstalled",
          duration_ms: 0,
        });

        return reply.send({ ok: true });
      } finally {
        releaseInstallLock();
        pump();
      }
    },
  );

  // POST /api/v1/admin/features/reset - Wipe the AI venv/models/pip-cache and
  // reset every bundle to not-installed. Existing installs can't self-heal a
  // stale/conflicting venv via uninstall+reinstall alone (uninstall only
  // removes model weights), so this is the reliable full reset.
  app.post(
    "/api/v1/admin/features/reset",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const admin = await requirePermission("features:manage")(_request, reply);
      if (!admin) return;

      if (!acquireInstallLock("__reset__")) {
        const installing = getInstallingBundle();
        return reply.status(409).send({
          error: `Cannot reset: a bundle install is already in progress (${installing?.bundleId ?? "unknown"})`,
        });
      }
      const installLockFd = getInstallLockFdForChild();
      try {
        advanceAiMutationEpoch();
        // Reset routing first across every replica, then drain local children
        // and run a second GC after their leases have closed.
        await runOcrRuntimeMaintenance("reset", { aiDataDir: getAiDir(), installLockFd });
        await drainOcrDispatcher();
        await runOcrRuntimeMaintenance("gc", { aiDataDir: getAiDir(), installLockFd });
        await purgeOcrRuntimeDownloads(getAiDir(), installLockFd);
        resetAiEnvironment({ installLockHeld: true, mutationEpochAdvanced: true });
      } catch (err) {
        return reply.status(409).send({
          error: err instanceof Error ? err.message : "Reset failed",
        });
      } finally {
        releaseInstallLock();
        scheduleOcrRuntimeGc();
        pump();
      }
      shutdownDispatcher();

      trackEvent(ANALYTICS_EVENTS.AI_BUNDLE_ACTION, {
        bundle_id: "all",
        action: "reset_environment",
        duration_ms: 0,
      });

      return reply.send({ ok: true });
    },
  );

  // GET /api/v1/admin/features/disk-usage - Get AI model disk usage
  app.get(
    "/api/v1/admin/features/disk-usage",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const admin = await requirePermission("features:manage")(request, reply);
      if (!admin) return;

      const totalBytes = getDirSize(getAiDir());
      return reply.send({ totalBytes });
    },
  );

  // POST /api/v1/admin/features/import - Import an offline bundle archive
  app.post(
    "/api/v1/admin/features/import",
    {
      bodyLimit: OFFLINE_LEGACY_ARCHIVE_MAX_BYTES + 32 * 1024 * 1024,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const admin = await requirePermission("features:manage")(request, reply);
      if (!admin) return;

      let uploadDirectory: string | null = null;
      let legacyResult: Awaited<ReturnType<typeof importBundleArchive>> | null = null;
      let hasLegacy = false;
      let hasIndex = false;
      let hasArchive = false;
      let ownsInstallLock = false;
      let target: SupportedOcrRuntimeTarget | null = null;
      let trustKeys: ReturnType<typeof loadOcrRuntimeTrustKeys> | null = null;
      let verifiedIndex: Awaited<ReturnType<typeof prepareOfflineRuntimeIndex>> | null = null;
      try {
        // Creating the shared root does not stage request data and is required
        // before the permanent install-lock inode can be opened after a fresh
        // or previously-unwritable volume is mounted.
        await mkdir(getAiDir(), { recursive: true, mode: 0o2770 });
        // The lease covers staging as well as installation. Otherwise several
        // replicas can consume the shared volume before any of them reaches
        // the install lock, invalidating every capacity preflight.
        if (!acquireInstallLock("__offline_import__")) {
          throw new ImportLockError("Another install or import is already in progress");
        }
        ownsInstallLock = true;
        const installLockFd = getInstallLockFdForChild();
        if (!cleanupInterruptedFeatureImports()) {
          throw new OfflineImportRecoveryError(
            "Interrupted offline import staging could not be cleaned up safely",
          );
        }

        // Runtime archives can be gigabytes. Stage them on the configured AI
        // data volume instead of the container's usually-small root /tmp.
        uploadDirectory = await mkdtemp(join(getAiDir(), ".offline-import-v2-"));
        await chmod(uploadDirectory, 0o2770);
        const indexPath = join(uploadDirectory, "ocr-index.json");
        const archivePath = join(uploadDirectory, "ocr-runtime.tar.gz");
        const legacyPath = join(uploadDirectory, "legacy-bundle.tar.gz");

        for await (const part of multipartParts(request, {
          fileSize: OFFLINE_LEGACY_ARCHIVE_MAX_BYTES,
          files: 2,
        })) {
          if (part.type !== "file") {
            throw new ImportValidationError(`Unexpected multipart field: ${part.fieldname}`);
          }
          if (part.fieldname === "file") {
            if (hasLegacy || hasIndex || hasArchive) {
              throw new ImportValidationError(
                "Provide either one legacy bundle or OCR index/archive files",
              );
            }
            await writeBoundedUpload(
              part.file,
              legacyPath,
              OFFLINE_LEGACY_ARCHIVE_MAX_BYTES,
              "Legacy bundle archive",
            );
            hasLegacy = true;
          } else if (part.fieldname === "index") {
            if (hasLegacy || hasIndex) {
              throw new ImportValidationError("Duplicate or mixed OCR runtime index upload");
            }
            await writeBoundedUpload(
              part.file,
              indexPath,
              OFFLINE_INDEX_MAX_BYTES,
              "OCR runtime index",
            );
            try {
              target = resolveOcrInstallTarget();
            } catch (error) {
              throw new ImportValidationError(
                error instanceof Error
                  ? error.message
                  : "Accurate OCR is not supported on this host",
              );
            }
            trustKeys = loadOcrRuntimeTrustKeys(
              process.env.SNAPOTTER_OCR_RUNTIME_TRUST_STORE || undefined,
            );
            verifiedIndex = await prepareOfflineRuntimeIndex({
              indexPath,
              target,
              trustKeys,
              version: APP_VERSION,
            });
            if (verifiedIndex.archiveSize > OFFLINE_OCR_ARCHIVE_MAX_BYTES) {
              throw new ImportValidationError(
                `Signed OCR runtime archive exceeds the ${OFFLINE_OCR_ARCHIVE_MAX_BYTES}-byte offline import limit`,
              );
            }
            hasIndex = true;
          } else if (part.fieldname === "archive") {
            if (hasLegacy || hasArchive) {
              throw new ImportValidationError("Duplicate or mixed OCR runtime archive upload");
            }
            if (!verifiedIndex) {
              throw new ImportValidationError(
                "The signed OCR runtime index must be uploaded before the archive",
              );
            }
            const authenticatedIndex = verifiedIndex;
            const stagingDirectory = uploadDirectory;
            await writeBoundedUpload(
              part.file,
              archivePath,
              authenticatedIndex.archiveSize,
              "OCR runtime archive",
              {
                expectedBytes: authenticatedIndex.archiveSize,
                beforeWrite: async (persistedBytes) => {
                  await assertOcrRuntimeInstallDiskSpace({
                    path: stagingDirectory,
                    remainingArchiveBytes: authenticatedIndex.archiveSize - persistedBytes,
                    expandedSize: authenticatedIndex.archiveExpandedSize,
                    authenticatedIndexBytes: authenticatedIndex.canonicalIndexBytes,
                    operation: "import",
                  });
                },
              },
            );
            hasArchive = true;
          } else {
            throw new ImportValidationError(`Unexpected bundle file field: ${part.fieldname}`);
          }
          if (part.file.truncated)
            throw new ImportValidationError("Offline bundle upload was truncated");
        }

        if (hasLegacy) {
          legacyResult = await importBundleArchive(createReadStream(legacyPath), {
            installLockFd,
          });
          invalidateCache();
          shutdownDispatcher();
          trackEvent(ANALYTICS_EVENTS.AI_BUNDLE_ACTION, {
            bundle_id: legacyResult.bundleId,
            action: "imported",
            duration_ms: 0,
          });
          return {
            bundleId: legacyResult.bundleId,
            version: legacyResult.version,
          };
        }
        if (!hasIndex || !hasArchive) {
          throw new ImportValidationError(
            "OCR runtime import requires both index and archive file fields",
          );
        }
        if (!target || !trustKeys || !verifiedIndex) {
          throw new ImportValidationError("OCR runtime index was not authenticated");
        }
        const release = await prepareOfflineRuntimeRelease({
          indexPath,
          archivePath,
          target,
          trustKeys,
          version: APP_VERSION,
        });
        const installResult = await runOcrRuntimeInstaller({
          release,
          aiDataDir: getAiDir(),
          installLockFd,
          mode: "import",
          timeoutMs: env.INSTALL_MAX_MS,
        });
        await handoffInstalledOcrRuntime(installResult, installLockFd);
        invalidateCache();
        trackEvent(ANALYTICS_EVENTS.AI_BUNDLE_ACTION, {
          bundle_id: "ocr",
          action: "imported",
          duration_ms: 0,
        });
        return {
          bundleId: "ocr",
          version: String(release.artifact.version),
        };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Offline OCR runtime import failed";
        // Vitest can evaluate the route and helper through separate module
        // graphs; the stable error name also keeps the HTTP contract intact
        // across that boundary.
        if (
          err instanceof ImportLockError ||
          (err instanceof Error && err.name === "ImportLockError")
        ) {
          reply.status(409);
          return { error: errorMessage };
        }
        if (
          err instanceof ImportValidationError ||
          err instanceof OcrRuntimeImportValidationError ||
          (err instanceof Error &&
            (err.name === "ImportValidationError" ||
              err.name === "OcrRuntimeImportValidationError"))
        ) {
          reply.status(400);
          return { error: errorMessage };
        }
        if (
          err instanceof OcrRuntimeDiskSpaceError ||
          (err instanceof Error && err.name === "OcrRuntimeDiskSpaceError") ||
          isOfflineImportStorageError(err)
        ) {
          reply.status(507);
          return { error: errorMessage };
        }
        if (err instanceof OfflineImportRecoveryError) {
          reply.status(500);
          return { error: err.message };
        }
        // Only explicit import/input validation failures are client errors.
        // Installer, dispatcher handoff, commit, and rollback failures are
        // server-side faults and must remain retryable/observable as 5xx.
        reply.status(500);
        return { error: errorMessage };
      } finally {
        try {
          if (uploadDirectory) {
            await rmAsync(uploadDirectory, { recursive: true, force: true });
          }
        } finally {
          if (ownsInstallLock) releaseInstallLock();
          pump();
        }
      }
    },
  );
}
