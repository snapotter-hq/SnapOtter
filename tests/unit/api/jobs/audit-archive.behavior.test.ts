import { afterEach, describe, expect, it, vi } from "vitest";

const isFeatureEnabledMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());
const upsertSettingMock = vi.hoisted(() => vi.fn());
const mkdirMock = vi.hoisted(() => vi.fn());
const statMock = vi.hoisted(() => vi.fn());
const pipelineMock = vi.hoisted(() => vi.fn());
const createWriteStreamMock = vi.hoisted(() => vi.fn());

function queryChain<T>(result: T) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

function makeLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  };
}

async function loadAuditArchive() {
  vi.resetModules();
  isFeatureEnabledMock.mockReset();
  selectMock.mockReset();
  deleteMock.mockReset();
  upsertSettingMock.mockReset();
  mkdirMock.mockReset();
  statMock.mockReset();
  pipelineMock.mockReset();
  createWriteStreamMock.mockReset();

  // Sensible defaults for the write path: mkdir/pipeline resolve, stat resolves.
  mkdirMock.mockResolvedValue(undefined);
  pipelineMock.mockResolvedValue(undefined);
  statMock.mockResolvedValue({ size: 123 });
  createWriteStreamMock.mockReturnValue({});
  upsertSettingMock.mockResolvedValue(undefined);

  vi.doMock("node:fs/promises", () => ({
    mkdir: mkdirMock,
    stat: statMock,
  }));

  vi.doMock("node:fs", () => ({
    createWriteStream: createWriteStreamMock,
  }));

  vi.doMock("node:stream/promises", () => ({
    pipeline: pipelineMock,
  }));

  vi.doMock("drizzle-orm", () => ({
    eq: vi.fn(() => "eq"),
    lt: vi.fn(() => "lt"),
  }));

  vi.doMock("@snapotter/enterprise", () => ({
    isFeatureEnabled: isFeatureEnabledMock,
  }));

  vi.doMock("../../../../apps/api/src/config.js", () => ({
    env: { FILES_STORAGE_PATH: "/data/files" },
  }));

  vi.doMock("../../../../apps/api/src/db/index.js", () => ({
    db: {
      select: selectMock,
      delete: deleteMock,
    },
    schema: {
      settings: {
        key: "settings.key",
        value: "settings.value",
      },
      auditLog: {
        createdAt: "auditLog.createdAt",
      },
    },
  }));

  vi.doMock("../../../../apps/api/src/lib/settings-helpers.js", () => ({
    upsertSetting: upsertSettingMock,
  }));

  return import("../../../../apps/api/src/jobs/audit-archive.js");
}

describe("audit archive job behavior", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns before reading archive settings when the enterprise feature is disabled", async () => {
    const { runAuditArchive } = await loadAuditArchive();
    isFeatureEnabledMock.mockReturnValue(false);

    await runAuditArchive();

    expect(selectMock).not.toHaveBeenCalled();
    expect(upsertSettingMock).not.toHaveBeenCalled();
  });

  it("treats a thrown enterprise check as unlicensed and returns early", async () => {
    const { runAuditArchive } = await loadAuditArchive();
    isFeatureEnabledMock.mockImplementation(() => {
      throw new Error("license subsystem exploded");
    });

    await runAuditArchive();

    // The catch keeps featureEnabled false, so no settings are ever read.
    expect(selectMock).not.toHaveBeenCalled();
    expect(upsertSettingMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("returns when the auditArchiveMonths setting is absent (null value)", async () => {
    const { runAuditArchive } = await loadAuditArchive();
    isFeatureEnabledMock.mockReturnValue(true);
    // readSettingValue returns null when there is no row.
    selectMock.mockReturnValueOnce(queryChain([]));

    await runAuditArchive();

    // Only the archiveMonths read happened; state was never touched.
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(upsertSettingMock).not.toHaveBeenCalled();
    expect(mkdirMock).not.toHaveBeenCalled();
  });

  it("returns when archive months is missing or disabled", async () => {
    const { runAuditArchive } = await loadAuditArchive();
    isFeatureEnabledMock.mockReturnValue(true);
    selectMock.mockReturnValueOnce(queryChain([{ value: "0" }]));

    await runAuditArchive();

    expect(mkdirMock).not.toHaveBeenCalled();
    expect(upsertSettingMock).not.toHaveBeenCalled();
  });

  it("returns when archive months parses to a negative number", async () => {
    const { runAuditArchive } = await loadAuditArchive();
    isFeatureEnabledMock.mockReturnValue(true);
    selectMock.mockReturnValueOnce(queryChain([{ value: "-3" }]));

    await runAuditArchive();

    expect(mkdirMock).not.toHaveBeenCalled();
    expect(upsertSettingMock).not.toHaveBeenCalled();
  });

  it("clears archival state when there are no rows older than the boundary", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const { runAuditArchive } = await loadAuditArchive();
    deleteMock.mockReturnValue({ where: deleteWhere });
    isFeatureEnabledMock.mockReturnValue(true);
    selectMock
      .mockReturnValueOnce(queryChain([{ value: "1" }]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]));

    const log = makeLogger();
    await runAuditArchive(log as never);

    expect(upsertSettingMock).toHaveBeenCalledWith(
      "audit_archival_state",
      expect.stringContaining('"state":"EXPORTING"'),
    );
    expect(mkdirMock).toHaveBeenCalledWith("/data/audit-archives", { recursive: true });
    expect(deleteWhere).toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith("No audit rows older than boundary, nothing to archive");
  });

  it("runs a full fresh archive: export, verify, purge, and complete", async () => {
    const deleteWhere = vi.fn().mockResolvedValue({ rowCount: 2 });
    const { runAuditArchive } = await loadAuditArchive();
    deleteMock.mockReturnValue({ where: deleteWhere });
    isFeatureEnabledMock.mockReturnValue(true);
    selectMock
      // auditArchiveMonths
      .mockReturnValueOnce(queryChain([{ value: "6" }]))
      // STATE_KEY (fresh, no existing state)
      .mockReturnValueOnce(queryChain([]))
      // audit rows older than boundary
      .mockReturnValueOnce(queryChain([{ id: "a1" }, { id: "a2" }]));

    const log = makeLogger();
    await runAuditArchive(log as never);

    // Wrote the archive through the gzip pipeline.
    expect(mkdirMock).toHaveBeenCalledWith("/data/audit-archives", { recursive: true });
    expect(createWriteStreamMock).toHaveBeenCalledTimes(1);
    expect(pipelineMock).toHaveBeenCalledTimes(1);

    // Progressed through EXPORTED, PURGING, COMPLETE state persistence.
    const upsertStates = upsertSettingMock.mock.calls.map((c) => c[1] as string);
    expect(upsertStates.some((s) => s.includes('"state":"EXPORTING"'))).toBe(true);
    expect(upsertStates.some((s) => s.includes('"state":"EXPORTED"'))).toBe(true);
    expect(upsertStates.some((s) => s.includes('"state":"PURGING"'))).toBe(true);
    expect(upsertStates.some((s) => s.includes('"state":"COMPLETE"'))).toBe(true);

    // Purge used the reported rowCount from the delete result.
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ purgedRows: 2 }),
      "Purged archived audit rows",
    );

    // Verify + complete log lines fired.
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: 2 }),
      "Archive verified",
    );
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: 2 }),
      "Audit archival complete",
    );

    // Final COMPLETE step deletes the state key.
    expect(deleteMock).toHaveBeenCalled();
  });

  it("falls back to the recorded rowCount when the purge result omits rowCount", async () => {
    const deleteWhere = vi.fn().mockResolvedValue({}); // no rowCount field
    const { runAuditArchive } = await loadAuditArchive();
    deleteMock.mockReturnValue({ where: deleteWhere });
    isFeatureEnabledMock.mockReturnValue(true);
    selectMock
      .mockReturnValueOnce(queryChain([{ value: "6" }]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([{ id: "a1" }, { id: "a2" }, { id: "a3" }]));

    const log = makeLogger();
    await runAuditArchive(log as never);

    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ purgedRows: 3 }),
      "Purged archived audit rows",
    );
  });

  it("resumes from a persisted EXPORTED state and completes purge", async () => {
    const deleteWhere = vi.fn().mockResolvedValue({ rowCount: 5 });
    const { runAuditArchive } = await loadAuditArchive();
    deleteMock.mockReturnValue({ where: deleteWhere });
    isFeatureEnabledMock.mockReturnValue(true);

    const persisted = JSON.stringify({
      state: "EXPORTED",
      dateBoundary: "2026-01-01T00:00:00.000Z",
      outputPath: "/data/audit-archives/audit-archive-2026-01-01T00-00-00-000Z.ndjson.gz",
      rowCount: 5,
      checksum: "abc123",
    });

    selectMock
      .mockReturnValueOnce(queryChain([{ value: "6" }]))
      .mockReturnValueOnce(queryChain([{ value: persisted }]));

    const log = makeLogger();
    await runAuditArchive(log as never);

    // Resumed rather than re-exporting.
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ state: "EXPORTED" }),
      "Resuming audit archival from persisted state",
    );
    // Did NOT re-run the export path (no mkdir / pipeline / new file).
    expect(mkdirMock).not.toHaveBeenCalled();
    expect(pipelineMock).not.toHaveBeenCalled();
    // Verified the existing archive file.
    expect(statMock).toHaveBeenCalledWith(
      "/data/audit-archives/audit-archive-2026-01-01T00-00-00-000Z.ndjson.gz",
    );
    // Purged and completed.
    expect(deleteWhere).toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ purgedRows: 5 }),
      "Purged archived audit rows",
    );
  });

  it("aborts when the archive file is missing at the EXPORTED verify step", async () => {
    const { runAuditArchive } = await loadAuditArchive();
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    deleteMock.mockReturnValue({ where: deleteWhere });
    statMock.mockRejectedValue(new Error("ENOENT"));
    isFeatureEnabledMock.mockReturnValue(true);

    const persisted = JSON.stringify({
      state: "EXPORTED",
      dateBoundary: "2026-01-01T00:00:00.000Z",
      outputPath: "/data/audit-archives/missing.ndjson.gz",
      rowCount: 5,
      checksum: "abc123",
    });

    selectMock
      .mockReturnValueOnce(queryChain([{ value: "6" }]))
      .mockReturnValueOnce(queryChain([{ value: persisted }]));

    const log = makeLogger();
    await runAuditArchive(log as never);

    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/data/audit-archives/missing.ndjson.gz" }),
      "Archive file missing after export, aborting",
    );
    // State key was cleared via db.delete (deleteSetting on the settings table).
    expect(deleteMock).toHaveBeenCalledWith(expect.objectContaining({ key: "settings.key" }));
    // Aborted before purging: never deleted from the audit log table.
    expect(deleteMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ createdAt: "auditLog.createdAt" }),
    );
    // Never advanced to PURGING.
    const upsertStates = upsertSettingMock.mock.calls.map((c) => c[1] as string);
    expect(upsertStates.some((s) => s.includes('"state":"PURGING"'))).toBe(false);
  });

  it("aborts when a resumed EXPORTED state has no checksum", async () => {
    const { runAuditArchive } = await loadAuditArchive();
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    deleteMock.mockReturnValue({ where: deleteWhere });
    isFeatureEnabledMock.mockReturnValue(true);

    const persisted = JSON.stringify({
      state: "EXPORTED",
      dateBoundary: "2026-01-01T00:00:00.000Z",
      outputPath: "/data/audit-archives/present.ndjson.gz",
      rowCount: 5,
      checksum: "", // invalid: missing checksum
    });

    selectMock
      .mockReturnValueOnce(queryChain([{ value: "6" }]))
      .mockReturnValueOnce(queryChain([{ value: persisted }]));

    const log = makeLogger();
    await runAuditArchive(log as never);

    expect(statMock).toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith("Invalid archival state: missing checksum or rowCount");
    // Aborted before purge: state key deleted, audit table untouched.
    expect(deleteMock).toHaveBeenCalledWith(expect.objectContaining({ key: "settings.key" }));
    expect(deleteMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ createdAt: "auditLog.createdAt" }),
    );
  });

  it("aborts when a resumed EXPORTED state has a non-positive rowCount", async () => {
    const { runAuditArchive } = await loadAuditArchive();
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    deleteMock.mockReturnValue({ where: deleteWhere });
    isFeatureEnabledMock.mockReturnValue(true);

    const persisted = JSON.stringify({
      state: "EXPORTED",
      dateBoundary: "2026-01-01T00:00:00.000Z",
      outputPath: "/data/audit-archives/present.ndjson.gz",
      rowCount: 0, // invalid
      checksum: "abc123",
    });

    selectMock
      .mockReturnValueOnce(queryChain([{ value: "6" }]))
      .mockReturnValueOnce(queryChain([{ value: persisted }]));

    const log = makeLogger();
    await runAuditArchive(log as never);

    expect(log.error).toHaveBeenCalledWith("Invalid archival state: missing checksum or rowCount");
    // Aborted before purge: audit table untouched.
    expect(deleteMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ createdAt: "auditLog.createdAt" }),
    );
  });

  it("resumes from a persisted PENDING state and progresses forward", async () => {
    const deleteWhere = vi.fn().mockResolvedValue({ rowCount: 1 });
    const { runAuditArchive } = await loadAuditArchive();
    deleteMock.mockReturnValue({ where: deleteWhere });
    isFeatureEnabledMock.mockReturnValue(true);

    const persisted = JSON.stringify({
      state: "PENDING",
      dateBoundary: "2026-01-01T00:00:00.000Z",
      outputPath: "",
      rowCount: 0,
      checksum: "",
    });

    selectMock
      .mockReturnValueOnce(queryChain([{ value: "6" }]))
      .mockReturnValueOnce(queryChain([{ value: persisted }]))
      // rows to export
      .mockReturnValueOnce(queryChain([{ id: "a1" }]));

    const log = makeLogger();
    await runAuditArchive(log as never);

    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ state: "PENDING" }),
      "Resuming audit archival from persisted state",
    );
    // PENDING flips to EXPORTING and the full pipeline runs.
    expect(pipelineMock).toHaveBeenCalledTimes(1);
    expect(deleteWhere).toHaveBeenCalled();
  });

  it("starts fresh when the persisted state JSON is corrupt", async () => {
    const deleteWhere = vi.fn().mockResolvedValue({ rowCount: 1 });
    const { runAuditArchive } = await loadAuditArchive();
    deleteMock.mockReturnValue({ where: deleteWhere });
    isFeatureEnabledMock.mockReturnValue(true);

    selectMock
      .mockReturnValueOnce(queryChain([{ value: "6" }]))
      // corrupt state -> JSON.parse throws -> deleteSetting + freshRun
      .mockReturnValueOnce(queryChain([{ value: "{not valid json" }]))
      .mockReturnValueOnce(queryChain([{ id: "a1" }]));

    const log = makeLogger();
    await runAuditArchive(log as never);

    // Corrupt state key was deleted before starting fresh.
    expect(deleteMock).toHaveBeenCalled();
    // A fresh run starts at PENDING then flips to EXPORTING.
    const upsertStates = upsertSettingMock.mock.calls.map((c) => c[1] as string);
    expect(upsertStates.some((s) => s.includes('"state":"EXPORTING"'))).toBe(true);
    // Never logged a resume because parse failed.
    expect(log.info).not.toHaveBeenCalledWith(
      expect.anything(),
      "Resuming audit archival from persisted state",
    );
  });

  it("resumes directly from a persisted PURGING state and completes", async () => {
    const deleteWhere = vi.fn().mockResolvedValue({ rowCount: 4 });
    const { runAuditArchive } = await loadAuditArchive();
    deleteMock.mockReturnValue({ where: deleteWhere });
    isFeatureEnabledMock.mockReturnValue(true);

    const persisted = JSON.stringify({
      state: "PURGING",
      dateBoundary: "2026-01-01T00:00:00.000Z",
      outputPath: "/data/audit-archives/present.ndjson.gz",
      rowCount: 4,
      checksum: "abc123",
    });

    selectMock
      .mockReturnValueOnce(queryChain([{ value: "6" }]))
      .mockReturnValueOnce(queryChain([{ value: persisted }]));

    const log = makeLogger();
    await runAuditArchive(log as never);

    // Went straight to purge, skipping export + verify.
    expect(pipelineMock).not.toHaveBeenCalled();
    expect(statMock).not.toHaveBeenCalled();
    expect(deleteWhere).toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ purgedRows: 4 }),
      "Purged archived audit rows",
    );
    // COMPLETE clears the state key.
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: 4 }),
      "Audit archival complete",
    );
  });

  it("works without a logger argument on the full happy path", async () => {
    const deleteWhere = vi.fn().mockResolvedValue({ rowCount: 1 });
    const { runAuditArchive } = await loadAuditArchive();
    deleteMock.mockReturnValue({ where: deleteWhere });
    isFeatureEnabledMock.mockReturnValue(true);
    selectMock
      .mockReturnValueOnce(queryChain([{ value: "6" }]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([{ id: "a1" }]));

    // No log passed: every log?.xxx call must no-op without throwing.
    await expect(runAuditArchive()).resolves.toBeUndefined();
    expect(pipelineMock).toHaveBeenCalledTimes(1);
    expect(deleteWhere).toHaveBeenCalled();
  });
});
