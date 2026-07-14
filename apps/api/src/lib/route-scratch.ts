import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "../config.js";

const SAFE_SCRATCH_PREFIX = /^[a-z][a-z0-9-]{0,31}$/;

function routeScratchRoot(): string {
  return env.SCRATCH_PATH || join(tmpdir(), "snapotter-scratch");
}

/**
 * Own a request-scoped scratch root for exactly one operation.
 *
 * Keeping creation and recursive cleanup in one primitive makes early HTTP
 * returns and thrown decoder errors follow the same cleanup path.
 */
export async function withRouteScratch<T>(
  prefix: string,
  operation: (path: string) => Promise<T>,
): Promise<T> {
  if (!SAFE_SCRATCH_PREFIX.test(prefix)) {
    throw new Error("Route scratch prefix must be a safe path component");
  }
  const root = routeScratchRoot();
  let path: string;
  try {
    await mkdir(root, { recursive: true });
    path = await mkdtemp(join(root, `${prefix}-`));
  } catch (error) {
    const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
    if (error instanceof Error && code && ["EACCES", "EDQUOT", "ENOSPC", "EROFS"].includes(code)) {
      throw Object.assign(error, { statusCode: 503 });
    }
    throw error;
  }
  try {
    return await operation(path);
  } finally {
    await rm(path, { recursive: true, force: true });
  }
}
