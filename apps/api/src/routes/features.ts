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
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { shutdownDispatcher } from "@ashim/ai";
import { FEATURE_BUNDLES } from "@ashim/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
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
import { requireAdmin, requireAuth } from "../plugins/auth.js";
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
  const entries = readdirSync(dirPath, { withFileTypes: true });
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
      const admin = requireAdmin(request, reply);
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
      const scriptPath = join(process.cwd(), "packages/ai/python/install_feature.py");

      const child = spawn(pythonPath, [scriptPath, bundleId], {
        stdio: ["ignore", "ignore", "pipe"],
        env: {
          ...process.env,
          BUNDLE_ID: bundleId,
        },
      });

      let stderrBuffer = "";

      child.stderr.on("data", (chunk: Buffer) => {
        stderrBuffer += chunk.toString();

        // Process complete lines
        const lines = stderrBuffer.split("\n");
        // Keep the last incomplete line in the buffer
        stderrBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

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
            // Not JSON — ignore non-progress stderr output
          }
        }
      });

      child.on("close", (code) => {
        releaseInstallLock();

        if (code === 0) {
          invalidateCache();
          shutdownDispatcher();
          setInstallProgress(bundleId, { percent: 100, stage: "Complete" }, null);
          updateSingleFileProgress({ jobId, phase: "complete", percent: 100, stage: "Complete" });
        } else {
          const errorMsg = `Install failed with exit code ${code}`;
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
      const admin = requireAdmin(request, reply);
      if (!admin) return;

      const { bundleId } = request.params;

      if (!FEATURE_BUNDLES[bundleId]) {
        return reply.status(404).send({ error: `Unknown bundle: ${bundleId}` });
      }

      if (!isFeatureInstalled(bundleId)) {
        return reply.status(409).send({ error: `Bundle "${bundleId}" is not installed` });
      }

      // Read manifest to find model files to delete
      const manifest = readManifest();
      if (manifest) {
        const manifestBundle = manifest.bundles[bundleId];
        if (manifestBundle) {
          const modelsDir = getModelsDir();
          for (const model of manifestBundle.models) {
            if (!model.path) continue;
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

      return reply.send({ ok: true });
    },
  );

  // GET /api/v1/admin/features/disk-usage — Get AI model disk usage
  app.get(
    "/api/v1/admin/features/disk-usage",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const admin = requireAdmin(request, reply);
      if (!admin) return;

      const totalBytes = getDirSize(getAiDir());
      return reply.send({ totalBytes });
    },
  );
}
