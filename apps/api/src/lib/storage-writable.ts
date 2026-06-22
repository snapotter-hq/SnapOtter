import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "../config.js";

// Error codes that specifically mean "the running user may not write here".
// Distinct from capacity (ENOSPC) or other I/O faults, which are handled
// elsewhere and must not be misreported as a permissions problem.
const NOT_WRITABLE_CODES = new Set(["EACCES", "EPERM", "EROFS"]);

/**
 * Returns true if `dir` can be created (when missing) and written to by the
 * current process. Creates the directory recursively, writes a short-lived
 * probe file, then removes it. Permission/read-only failures (EACCES, EPERM,
 * EROFS) resolve to false; any other error is rethrown so genuine faults are
 * not silently swallowed.
 */
export async function isDirWritable(dir: string): Promise<boolean> {
  try {
    await mkdir(dir, { recursive: true });
    const probe = join(dir, `.snapotter-write-probe-${randomUUID()}`);
    await writeFile(probe, "");
    await rm(probe, { force: true });
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code && NOT_WRITABLE_CODES.has(code)) return false;
    throw err;
  }
}

/** Best-effort current uid/gid as strings ("?" where getuid is unavailable). */
function currentIds(): { uid: string; gid: string } {
  const uid = typeof process.getuid === "function" ? String(process.getuid()) : "?";
  const gid = typeof process.getgid === "function" ? String(process.getgid()) : "?";
  return { uid, gid };
}

/**
 * Actionable error text for a storage directory the process cannot write to.
 * Names the directory and the running uid/gid, then lists the supported fixes
 * for the common "container runs under a foreign/non-root UID" deployments
 * (TrueNAS, Kubernetes runAsUser, OpenShift, bind mounts).
 */
export function storagePermissionMessage(dir: string): string {
  const { uid, gid } = currentIds();
  return [
    `Storage directory "${dir}" is not writable by the current user (uid=${uid} gid=${gid}).`,
    "SnapOtter cannot upload, process, or store files until this is fixed. Common fixes:",
    `  - Host volume owned by another user: on the host run "chown -R ${uid}:${gid} <host-path>"` +
      " (or set the container user to match the volume's owner).",
    "  - Running as a non-root user (TrueNAS, Kubernetes runAsUser, OpenShift): run the container" +
      " as root (the default entrypoint self-corrects), set PUID/PGID to match the volume, or grant" +
      " the process supplementary group 0 (Kubernetes fsGroup: 0).",
    "  See https://docs.snapotter.com/guide/deployment#storage-permissions",
  ].join("\n");
}

/**
 * Verifies the local storage directories (WORKSPACE_PATH for processing,
 * FILES_STORAGE_PATH for the saved library) are writable, throwing an Error
 * with actionable remediation if not. No-op in S3 storage mode. Called at boot
 * so a permissions misconfiguration fails fast with a clear message instead of
 * surfacing as a cryptic EACCES on the first file operation.
 */
export async function assertStorageWritable(): Promise<void> {
  if (env.STORAGE_MODE === "s3") return;
  for (const dir of [env.WORKSPACE_PATH, env.FILES_STORAGE_PATH]) {
    if (!(await isDirWritable(dir))) {
      throw new Error(storagePermissionMessage(dir));
    }
  }
}
