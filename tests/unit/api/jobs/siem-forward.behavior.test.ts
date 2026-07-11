import { afterEach, describe, expect, it, vi } from "vitest";

const readSiemConfigMock = vi.hoisted(() => vi.fn());
const deliverWebhookMock = vi.hoisted(() => vi.fn());
const upsertSettingMock = vi.hoisted(() => vi.fn());
const decryptMock = vi.hoisted(() => vi.fn());
const isEncryptedMock = vi.hoisted(() => vi.fn());
const isFeatureEnabledMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());

function queryChain<T>(result: T, terminalWhere = false) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => (terminalWhere ? Promise.resolve(result) : chain)),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

async function loadSiemForward() {
  vi.resetModules();
  readSiemConfigMock.mockReset();
  deliverWebhookMock.mockReset();
  upsertSettingMock.mockReset();
  decryptMock.mockReset();
  isEncryptedMock.mockReset();
  isFeatureEnabledMock.mockReset();
  isFeatureEnabledMock.mockReturnValue(true);
  selectMock.mockReset();

  vi.doMock("drizzle-orm", () => ({
    asc: vi.fn(() => "asc"),
    eq: vi.fn(() => "eq"),
    gte: vi.fn(() => "gte"),
  }));

  vi.doMock("../../../../apps/api/src/config.js", () => ({
    env: { DATA_ENCRYPTION_KEY: "test-key" },
  }));

  vi.doMock("../../../../apps/api/src/db/index.js", () => ({
    db: {
      select: selectMock,
    },
    schema: {
      auditLog: {
        action: "action",
        actorId: "actorId",
        actorUsername: "actorUsername",
        targetType: "targetType",
        targetId: "targetId",
        ipAddress: "ipAddress",
        details: "details",
        createdAt: "createdAt",
      },
      settings: {
        key: "key",
        value: "value",
      },
    },
  }));

  vi.doMock("../../../../apps/api/src/lib/encryption.js", () => ({
    decrypt: decryptMock,
    isEncrypted: isEncryptedMock,
  }));

  vi.doMock("../../../../apps/api/src/lib/settings-helpers.js", () => ({
    upsertSetting: upsertSettingMock,
  }));

  vi.doMock("../../../../apps/api/src/lib/webhook-delivery.js", () => ({
    deliverWebhook: deliverWebhookMock,
  }));

  vi.doMock("../../../../apps/api/src/routes/enterprise/siem.js", () => ({
    readSiemConfig: readSiemConfigMock,
  }));

  vi.doMock("@snapotter/enterprise", () => ({
    isFeatureEnabled: isFeatureEnabledMock,
  }));

  return import("../../../../apps/api/src/jobs/siem-forward.js");
}

describe("SIEM forwarding behavior", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns without querying audit rows when SIEM is disabled", async () => {
    const { runSiemForward } = await loadSiemForward();
    readSiemConfigMock.mockResolvedValue({ enabled: false, webhookUrl: "https://siem.test" });

    await expect(runSiemForward()).resolves.toBeUndefined();

    expect(selectMock).not.toHaveBeenCalled();
    expect(deliverWebhookMock).not.toHaveBeenCalled();
  });

  it("opens the circuit breaker at five consecutive failures", async () => {
    const { runSiemForward } = await loadSiemForward();
    readSiemConfigMock.mockResolvedValue({ enabled: true, webhookUrl: "https://siem.test" });
    selectMock.mockReturnValueOnce(queryChain([{ value: "5" }], true));

    await expect(runSiemForward()).resolves.toBeUndefined();

    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(deliverWebhookMock).not.toHaveBeenCalled();
  });

  it("maps audit rows, decrypts auth, advances cursor, and resets failures after success", async () => {
    const { runSiemForward } = await loadSiemForward();
    const createdAt = new Date("2026-06-29T12:00:00.000Z");
    readSiemConfigMock.mockResolvedValue({
      enabled: true,
      webhookUrl: "https://siem.test/events",
      authHeader: "enc:auth",
    });
    selectMock
      .mockReturnValueOnce(queryChain([{ value: "2" }], true))
      .mockReturnValueOnce(queryChain([{ value: "2026-06-29T11:00:00.000Z" }], true))
      .mockReturnValueOnce(
        queryChain([
          {
            createdAt,
            action: "LOGIN_FAILED",
            actorId: "user-1",
            actorUsername: "ada",
            targetType: "session",
            targetId: "session-1",
            ipAddress: "203.0.113.10",
            details: { reason: "bad_password" },
          },
        ]),
      );
    isEncryptedMock.mockReturnValue(true);
    decryptMock.mockResolvedValue("Bearer clear");
    deliverWebhookMock.mockResolvedValue({ success: true });

    await expect(runSiemForward()).resolves.toEqual({ forwarded: 1 });

    expect(deliverWebhookMock).toHaveBeenCalledWith("https://siem.test/events", "Bearer clear", [
      {
        timestamp: "2026-06-29T12:00:00.000Z",
        event: "LOGIN_FAILED",
        actorId: "user-1",
        actorUsername: "ada",
        targetType: "session",
        targetId: "session-1",
        ip: "203.0.113.10",
        details: { reason: "bad_password" },
      },
    ]);
    expect(upsertSettingMock).toHaveBeenCalledWith(
      "siem_last_forwarded_at",
      "2026-06-29T12:00:00.000Z",
    );
    expect(upsertSettingMock).toHaveBeenCalledWith("siem_consecutive_failures", "0");
  });

  it("increments failure counter when delivery fails", async () => {
    const { runSiemForward } = await loadSiemForward();
    readSiemConfigMock.mockResolvedValue({
      enabled: true,
      webhookUrl: "https://siem.test/events",
      authHeader: "",
    });
    selectMock
      .mockReturnValueOnce(queryChain([{ value: "4" }], true))
      .mockReturnValueOnce(queryChain([], true))
      .mockReturnValueOnce(
        queryChain([
          {
            createdAt: new Date("2026-06-29T12:00:00.000Z"),
            action: "FILE_DELETED",
          },
        ]),
      );
    deliverWebhookMock.mockResolvedValue({ success: false, error: "downstream 500" });

    await expect(runSiemForward()).resolves.toBeUndefined();

    expect(upsertSettingMock).toHaveBeenCalledWith("siem_consecutive_failures", "5");
  });
});
