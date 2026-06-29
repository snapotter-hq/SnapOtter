import { afterEach, describe, expect, it, vi } from "vitest";

const isFeatureEnabledMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());
const upsertSettingMock = vi.hoisted(() => vi.fn());
const mkdirMock = vi.hoisted(() => vi.fn());

function queryChain<T>(result: T) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

async function loadAuditArchive() {
  vi.resetModules();
  isFeatureEnabledMock.mockReset();
  selectMock.mockReset();
  deleteMock.mockReset();
  upsertSettingMock.mockReset();
  mkdirMock.mockReset();

  vi.doMock("node:fs/promises", () => ({
    mkdir: mkdirMock,
    stat: vi.fn(),
  }));

  vi.doMock("node:fs", () => ({
    createWriteStream: vi.fn(),
  }));

  vi.doMock("node:stream/promises", () => ({
    pipeline: vi.fn(),
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

  it("returns when archive months is missing or disabled", async () => {
    const { runAuditArchive } = await loadAuditArchive();
    isFeatureEnabledMock.mockReturnValue(true);
    selectMock.mockReturnValueOnce(queryChain([{ value: "0" }]));

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

    await runAuditArchive();

    expect(upsertSettingMock).toHaveBeenCalledWith(
      "audit_archival_state",
      expect.stringContaining('"state":"EXPORTING"'),
    );
    expect(mkdirMock).toHaveBeenCalledWith("/data/audit-archives", { recursive: true });
    expect(deleteWhere).toHaveBeenCalled();
  });
});
