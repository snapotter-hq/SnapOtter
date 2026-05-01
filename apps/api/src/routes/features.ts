/**
 * Feature bundle management routes.
 *
 * GET  /api/v1/features                           — List feature bundles and their statuses
 * POST /api/v1/admin/features/:bundleId/install    — Install a feature bundle (async)
 * POST /api/v1/admin/features/:bundleId/uninstall  — Uninstall a feature bundle
 * GET  /api/v1/admin/features/disk-usage           — Get AI model disk usage
 */

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { type Dirent, existsSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { shutdownDispatcher } from "@snapotter/ai";
import { ANALYTICS_EVENTS, FEATURE_BUNDLES } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { trackEvent } from "../lib/analytics.js";
import {
  acquireInstallLock,
  getAiDir,
  getFeatureStates,
  getManifestPath,
  getModelsDir,
  invalidateCache,
  isDockerEnvironment,
  isFeatureInstalled,
  markUninstalled,
  releaseInstallLock,
  setInstallProgress,
} from "../lib/feature-status.js";
import { requirePermission } from "../permissions.js";
import { requireAuth } from "../plugins/auth.js";
import { updateSingleFileProgress } from "./progress.js";

const venvPath = process.env.PYTHON_VENV_PATH || "/opt/venv";
const pythonPath = `${venvPath}/bin/python3`;

interface BundleIdParams {
  bundleId: string;
}

interface ManifestModel {
  id: string;
  path?: string;
}

interface ManifestBundle {
  models: ManifestModel[];
}

interface Manifest {
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

export async function registerFeatureRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/features — List feature bundles and their statuses
  app.get("/api/v1/features", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireAuth(request, reply);
    if (!user) return;

    // In non-Docker environments, all bundles are available natively
    if (!isDockerEnvironment()) {
      const bundles = Object.values(FEATURE_BUNDLES).map((bundle) => ({
        id: bundle.id,
        name: bundle.name,
        description: bundle.description,
        status: "installed" as const,
        installedVersion: null,
        estimatedSize: bundle.estimatedSize,
        enablesTools: bundle.enablesTools,
        progress: null,
        error: null,
      }));
      return reply.send({ bundles });
    }

    return reply.send({ bundles: getFeatureStates() });
  });

  // POST /api/v1/admin/features/:bundleId/install — Install a feature bundle
  app.post(
    "/api/v1/admin/features/:bundleId/install",
    async (request: FastifyRequest<{ Params: BundleIdParams }>, reply: FastifyReply) => {
      const admin = requirePermission("features:manage")(request, reply);
      if (!admin) return;

      const { bundleId } = request.params;

      if (!FEATURE_BUNDLES[bundleId]) {
        return reply.status(404).send({ error: `Unknown bundle: ${bundleId}` });
      }

      if (isFeatureInstalled(bundleId)) {
        return reply.status(409).send({ error: `Bundle "${bundleId}" is already installed` });
      }

      if (!acquireInstallLock(bundleId)) {
        return reply.status(409).send({ error: "Another install is already in progress" });
      }

      const jobId = crypto.randomUUID();
      const scriptPath = "/app/packages/ai/python/install_feature.py";
      const manifestPath = getManifestPath();
      const modelsDir = getModelsDir();

      const installStartTime = Date.now();
      const reqRef = request;

      const child = spawn(pythonPath, [scriptPath, bundleId, manifestPath, modelsDir], {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          BUNDLE_ID: bundleId,
          PIP_CACHE_DIR: join(getAiDir(), "pip-cache"),
        },
      });

      let stderrBuffer = "";
      let stdoutBuffer = "";
      const lastStderrLines: string[] = [];

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer) => {
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
              setInstallProgress(
                bundleId,
                { percent: parsed.progress, stage: parsed.stage ?? "" },
                null,
              );
              updateSingleFileProgress({
                jobId,
                phase: "processing",
                percent: parsed.progress,
                stage: parsed.stage,
              });
            }
          } catch {
            // Not JSON progress — rembg/pip output noise, keep in lastStderrLines for error reporting
          }
        }
      });

      child.on("close", (code) => {
        releaseInstallLock();

        if (code === 0) {
          invalidateCache();
          shutdownDispatcher();
          setInstallProgress(null, null, null);
          updateSingleFileProgress({ jobId, phase: "complete", percent: 100, stage: "Complete" });
          trackEvent(reqRef, ANALYTICS_EVENTS.AI_BUNDLE_ACTION, {
            bundle_id: bundleId,
            action: "installed",
            duration_ms: Date.now() - installStartTime,
          });
        } else {
          // Extract the structured error from Python's fail() function first.
          // fail() writes {"error": "..."} to stderr — prefer this over raw lines.
          let errorMsg: string | undefined;
          for (let i = lastStderrLines.length - 1; i >= 0; i--) {
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
            const meaningful = lastStderrLines.filter(
              (l) => !l.startsWith("{") && !l.includes("pthread_setaffinity_np"),
            );
            errorMsg =
              meaningful.join("\n") ||
              stdoutBuffer.trim() ||
              `Install failed with exit code ${code}`;
          }
          setInstallProgress(bundleId, null, errorMsg);
          updateSingleFileProgress({ jobId, phase: "failed", percent: 0, error: errorMsg });
        }
      });

      child.on("error", (err) => {
        releaseInstallLock();
        const errorMsg = `Failed to spawn install process: ${err.message}`;
        setInstallProgress(bundleId, null, errorMsg);
        updateSingleFileProgress({ jobId, phase: "failed", percent: 0, error: errorMsg });
      });

      return reply.status(202).send({ jobId });
    },
  );

  // POST /api/v1/admin/features/:bundleId/uninstall — Uninstall a feature bundle
  app.post(
    "/api/v1/admin/features/:bundleId/uninstall",
    async (request: FastifyRequest<{ Params: BundleIdParams }>, reply: FastifyReply) => {
      const admin = requirePermission("features:manage")(request, reply);
      if (!admin) return;

      const { bundleId } = request.params;

      if (!FEATURE_BUNDLES[bundleId]) {
        return reply.status(404).send({ error: `Unknown bundle: ${bundleId}` });
      }

      if (!isFeatureInstalled(bundleId)) {
        return reply.status(409).send({ error: `Bundle "${bundleId}" is not installed` });
      }

      // Read manifest to find model files to delete, but skip models
      // that are still needed by another installed bundle.
      const manifest = readManifest();
      if (manifest) {
        const manifestBundle = manifest.bundles[bundleId];
        if (manifestBundle) {
          // Collect model paths that OTHER installed bundles still need
          const sharedPaths = new Set<string>();
          for (const [otherId, otherBundle] of Object.entries(manifest.bundles)) {
            if (otherId === bundleId) continue;
            if (!isFeatureInstalled(otherId)) continue;
            for (const m of otherBundle.models ?? []) {
              if (m.path) sharedPaths.add(m.path);
            }
          }

          const modelsDir = getModelsDir();
          for (const model of manifestBundle.models) {
            if (!model.path) continue;
            if (sharedPaths.has(model.path)) continue; // still needed
            const modelPath = join(modelsDir, model.path);
            try {
              if (existsSync(modelPath)) {
                unlinkSync(modelPath);
              }
            } catch {
              // Best-effort deletion
            }
          }
        }
      }

      markUninstalled(bundleId);
      shutdownDispatcher();

      trackEvent(request, ANALYTICS_EVENTS.AI_BUNDLE_ACTION, {
        bundle_id: bundleId,
        action: "uninstalled",
        duration_ms: 0,
      });

      return reply.send({ ok: true });
    },
  );

  // GET /api/v1/admin/features/disk-usage — Get AI model disk usage
  app.get(
    "/api/v1/admin/features/disk-usage",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const admin = requirePermission("features:manage")(request, reply);
      if (!admin) return;

      const totalBytes = getDirSize(getAiDir());
      return reply.send({ totalBytes });
    },
  );
}
