/**
 * Audit log archival job.
 *
 * Archives old audit log entries to compressed NDJSON files using a crash-safe
 * 5-state machine. Runs monthly, gated behind the enterprise license
 * (tamper_resistant_audit feature).
 *
 * State machine:
 *   PENDING   -- record the date boundary
 *   EXPORTING -- write old rows to gzipped NDJSON
 *   EXPORTED  -- verify row count + checksum
 *   PURGING   -- delete archived rows from active table
 *   COMPLETE  -- clean up state key
 *
 * State is persisted in the settings table under "audit_archival_state" so that
 * a crash between export and purge does not lose data. The next run resumes
 * from the last completed state.
 */
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { eq, lt } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { isEnterpriseFeatureEnabled } from "../lib/enterprise-feature.js";
import { upsertSetting } from "../lib/settings-helpers.js";

type ArchivalState = "PENDING" | "EXPORTING" | "EXPORTED" | "PURGING" | "COMPLETE";

const STATE_KEY = "audit_archival_state";

interface ArchivalRun {
  state: ArchivalState;
  dateBoundary: string;
  outputPath: string;
  rowCount: number;
  checksum: string;
}

// -- Settings helpers ----------------------------------------------------------

async function readSettingValue(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, key));
  return row?.value ?? null;
}

async function deleteSetting(key: string): Promise<void> {
  await db.delete(schema.settings).where(eq(schema.settings.key, key));
}

// -- Archive directory --------------------------------------------------------

function getArchiveDir(): string {
  // Derive archive dir from FILES_STORAGE_PATH parent (./data/files -> ./data/audit-archives)
  const filesPath = env.FILES_STORAGE_PATH;
  const dataDir = join(filesPath, "..");
  return join(dataDir, "audit-archives");
}

// -- Core archival logic ------------------------------------------------------

export async function runAuditArchive(log?: FastifyBaseLogger): Promise<void> {
  // 1. Check enterprise feature gate
  const featureEnabled = await isEnterpriseFeatureEnabled("tamper_resistant_audit", "worker");
  if (!featureEnabled) {
    return;
  }

  // 2. Read archive months setting
  const monthsStr = await readSettingValue("auditArchiveMonths");
  const archiveMonths = monthsStr ? parseInt(monthsStr, 10) : 0;
  if (!archiveMonths || archiveMonths <= 0) {
    return;
  }

  // 3. Resume from persisted state or start fresh
  const existingState = await readSettingValue(STATE_KEY);
  let run: ArchivalRun;

  if (existingState) {
    try {
      run = JSON.parse(existingState) as ArchivalRun;
      log?.info({ state: run.state }, "Resuming audit archival from persisted state");
    } catch {
      // Corrupt state -- start fresh
      await deleteSetting(STATE_KEY);
      run = freshRun(archiveMonths);
    }
  } else {
    run = freshRun(archiveMonths);
  }

  // 4. State machine -- sequential ifs give fall-through semantics:
  //    a fresh run progresses through all states in one pass, and a
  //    resumed run picks up from wherever it left off.

  if (run.state === "PENDING") {
    await upsertSetting(STATE_KEY, JSON.stringify({ ...run, state: "EXPORTING" }));
    run.state = "EXPORTING";
  }

  if (run.state === "EXPORTING") {
    const archiveDir = getArchiveDir();
    await mkdir(archiveDir, { recursive: true });

    const timestamp = run.dateBoundary.replace(/[:.]/g, "-");
    const outputPath = join(archiveDir, `audit-archive-${timestamp}.ndjson.gz`);
    run.outputPath = outputPath;

    const boundary = new Date(run.dateBoundary);
    const rows = await db
      .select()
      .from(schema.auditLog)
      .where(lt(schema.auditLog.createdAt, boundary));

    if (rows.length === 0) {
      log?.info("No audit rows older than boundary, nothing to archive");
      await deleteSetting(STATE_KEY);
      return;
    }

    // Write compressed NDJSON and compute checksum
    const hash = createHash("sha256");
    const lines: string[] = [];
    for (const row of rows) {
      const line = JSON.stringify(row);
      lines.push(line);
      hash.update(line);
      hash.update("\n");
    }

    const readable = Readable.from(lines.map((l) => `${l}\n`));
    const gzip = createGzip();
    const output = createWriteStream(outputPath);
    await pipeline(readable, gzip, output);

    run.rowCount = rows.length;
    run.checksum = hash.digest("hex");
    run.state = "EXPORTED";
    await upsertSetting(STATE_KEY, JSON.stringify(run));
  }

  if (run.state === "EXPORTED") {
    // Verify the archive file exists and checksum is recorded
    try {
      await stat(run.outputPath);
    } catch {
      log?.error({ path: run.outputPath }, "Archive file missing after export, aborting");
      await deleteSetting(STATE_KEY);
      return;
    }

    if (!run.checksum || run.rowCount <= 0) {
      log?.error("Invalid archival state: missing checksum or rowCount");
      await deleteSetting(STATE_KEY);
      return;
    }

    log?.info(
      { rowCount: run.rowCount, checksum: run.checksum, path: run.outputPath },
      "Archive verified",
    );

    run.state = "PURGING";
    await upsertSetting(STATE_KEY, JSON.stringify(run));
  }

  if (run.state === "PURGING") {
    const boundary = new Date(run.dateBoundary);
    const result = await db.delete(schema.auditLog).where(lt(schema.auditLog.createdAt, boundary));

    log?.info(
      { purgedRows: (result as { rowCount?: number }).rowCount ?? run.rowCount },
      "Purged archived audit rows",
    );

    run.state = "COMPLETE";
    await upsertSetting(STATE_KEY, JSON.stringify(run));
  }

  if (run.state === "COMPLETE") {
    await deleteSetting(STATE_KEY);
    log?.info({ rowCount: run.rowCount, outputPath: run.outputPath }, "Audit archival complete");
  }
}

function freshRun(archiveMonths: number): ArchivalRun {
  const boundary = new Date();
  boundary.setMonth(boundary.getMonth() - archiveMonths);

  return {
    state: "PENDING",
    dateBoundary: boundary.toISOString(),
    outputPath: "",
    rowCount: 0,
    checksum: "",
  };
}
