import { readdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { env } from "../config.js";

export function startCleanupCron() {
  // Ensure workspace directory exists
  mkdirSync(env.WORKSPACE_PATH, { recursive: true });

  const intervalMs = env.CLEANUP_INTERVAL_MINUTES * 60 * 1000;
  const maxAgeMs = env.FILE_MAX_AGE_HOURS * 60 * 60 * 1000;

  const cleanup = async () => {
    try {
      const entries = await readdir(env.WORKSPACE_PATH, { withFileTypes: true }).catch(() => []);
      const now = Date.now();
      let cleaned = 0;

      for (const entry of entries) {
        const fullPath = join(env.WORKSPACE_PATH, entry.name);
        try {
          const stats = await stat(fullPath);
          if (now - stats.mtimeMs > maxAgeMs) {
            await rm(fullPath, { recursive: true });
            cleaned++;
          }
        } catch {
          // Skip files that can't be stat'd
        }
      }

      if (cleaned > 0) {
        console.log(`Cleanup: removed ${cleaned} expired workspace entries`);
      }
    } catch (err) {
      console.error("Cleanup error:", err);
    }
  };

  // Run on startup
  cleanup();

  // Schedule recurring cleanup
  setInterval(cleanup, intervalMs);
  console.log(`Cleanup scheduled: every ${env.CLEANUP_INTERVAL_MINUTES}m, max age ${env.FILE_MAX_AGE_HOURS}h`);
}
