import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { env } from "../config.js";

/**
 * Create a workspace directory structure for a processing job.
 * Returns the workspace root path.
 */
export async function createWorkspace(jobId: string): Promise<string> {
  const root = getWorkspacePath(jobId);
  await mkdir(join(root, "input"), { recursive: true });
  await mkdir(join(root, "output"), { recursive: true });
  return root;
}

/**
 * Get the workspace root path for a job.
 */
export function getWorkspacePath(jobId: string): string {
  if (jobId.includes("..") || jobId.includes("/") || jobId.includes("\\") || jobId.includes("\0")) {
    throw new Error("Invalid job ID");
  }
  return join(env.WORKSPACE_PATH, jobId);
}

/**
 * Remove the entire workspace directory for a job.
 */
export async function cleanupWorkspace(jobId: string): Promise<void> {
  const root = getWorkspacePath(jobId);
  await rm(root, { recursive: true, force: true });
}
