import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { SafeError } from "@snapotter/shared";

/** The AI wrappers that stage files around a sidecar call. Part of the error code. */
export type ScratchWrapper =
  | "upscale"
  | "restore"
  | "denoise"
  | "face-enhance"
  | "inpaint"
  | "remove-bg";

type ScratchStep = "write-input" | "read-output";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function isEnoent(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === "ENOENT";
}

/**
 * A raw Node ENOENT from a wrapper's scratch file carried no step and a path
 * that split Sentry into one issue per job, and telemetry filed it as a bug
 * (#4217). The scratch dir vanishing under a running job (a tmp reaper, or the
 * job's dir removed by another attempt) is the environment, so that case is
 * operational. A missing output while the dir is still there means the sidecar
 * reported success without writing its file, which is ours, so it stays a bug.
 * The code carries wrapper and step because operational events fingerprint on
 * it; the basename drops per-call UUIDs so the message stays low-cardinality.
 */
function scratchMissingError(
  err: unknown,
  wrapper: ScratchWrapper,
  step: ScratchStep,
  path: string,
): SafeError {
  const dirGone = !existsSync(dirname(path));
  const name = basename(path).replace(UUID, "<id>");
  return new SafeError(
    `AI scratch file missing (${step} ${name}, scratch dir ${dirGone ? "gone" : "present"})`,
    {
      kind: dirGone || step === "write-input" ? "operational" : "bug",
      code: `ENOENT:${wrapper}:${step}`,
      cause: err,
    },
  );
}

export async function writeScratchInput(
  wrapper: ScratchWrapper,
  path: string,
  data: Buffer,
): Promise<void> {
  try {
    await writeFile(path, data);
  } catch (err) {
    if (isEnoent(err)) throw scratchMissingError(err, wrapper, "write-input", path);
    throw err;
  }
}

export async function readScratchOutput(wrapper: ScratchWrapper, path: string): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch (err) {
    if (isEnoent(err)) throw scratchMissingError(err, wrapper, "read-output", path);
    throw err;
  }
}
