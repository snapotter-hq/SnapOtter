import { afterEach, describe, expect, it, vi } from "vitest";

const statfsMock = vi.hoisted(() => vi.fn());
const getSettingStringMock = vi.hoisted(() => vi.fn());
const deliverWebhookMock = vi.hoisted(() => vi.fn());
const decryptMock = vi.hoisted(() => vi.fn());
const isEncryptedMock = vi.hoisted(() => vi.fn());
const getActiveLicenseMock = vi.hoisted(() => vi.fn());
const isFeatureEnabledMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());

function queryChain<T>(result: T) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

async function loadAlertEvaluator() {
  vi.resetModules();
  statfsMock.mockReset();
  getSettingStringMock.mockReset();
  deliverWebhookMock.mockReset();
  decryptMock.mockReset();
  isEncryptedMock.mockReset();
  getActiveLicenseMock.mockReset();
  isFeatureEnabledMock.mockReset();
  isFeatureEnabledMock.mockReturnValue(true);
  selectMock.mockReset();

  vi.doMock("node:fs/promises", () => ({
    statfs: statfsMock,
  }));

  vi.doMock("drizzle-orm", () => ({
    and: vi.fn(() => "and"),
    eq: vi.fn(() => "eq"),
    gte: vi.fn(() => "gte"),
    sql: vi.fn(() => "sql"),
  }));

  vi.doMock("../../../../apps/api/src/config.js", () => ({
    env: {
      WORKSPACE_PATH: "/workspace",
      DATA_ENCRYPTION_KEY: "test-key",
    },
  }));

  vi.doMock("../../../../apps/api/src/db/index.js", () => ({
    db: {
      select: selectMock,
    },
    schema: {
      auditLog: {
        action: "action",
        createdAt: "createdAt",
      },
    },
  }));

  vi.doMock("../../../../apps/api/src/lib/settings-helpers.js", () => ({
    getSettingString: getSettingStringMock,
  }));

  vi.doMock("../../../../apps/api/src/lib/encryption.js", () => ({
    decrypt: decryptMock,
    isEncrypted: isEncryptedMock,
  }));

  vi.doMock("../../../../apps/api/src/lib/webhook-delivery.js", () => ({
    deliverWebhook: deliverWebhookMock,
  }));

  vi.doMock("@snapotter/enterprise", () => ({
    getActiveLicense: getActiveLicenseMock,
    isFeatureEnabled: isFeatureEnabledMock,
  }));

  return import("../../../../apps/api/src/jobs/alert-evaluator.js");
}

describe("alert evaluator behavior", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns before reading settings when the admin_alerts feature is unlicensed", async () => {
    const { evaluateAlerts } = await loadAlertEvaluator();
    isFeatureEnabledMock.mockReturnValue(false);

    await expect(evaluateAlerts()).resolves.toBeUndefined();

    expect(getSettingStringMock).not.toHaveBeenCalled();
    expect(statfsMock).not.toHaveBeenCalled();
    expect(deliverWebhookMock).not.toHaveBeenCalled();
  });

  it("returns early when webhook destination settings are invalid JSON", async () => {
    const { evaluateAlerts } = await loadAlertEvaluator();
    getSettingStringMock.mockResolvedValueOnce("{invalid");

    await evaluateAlerts();

    expect(statfsMock).not.toHaveBeenCalled();
    expect(deliverWebhookMock).not.toHaveBeenCalled();
  });

  it("returns early when no enabled alert destinations are configured", async () => {
    const { evaluateAlerts } = await loadAlertEvaluator();
    getSettingStringMock.mockResolvedValueOnce(
      JSON.stringify([
        { url: "https://example.test/siem", authHeader: "", enabled: true, type: "siem" },
        { url: "https://example.test/alerts", authHeader: "", enabled: false, type: "alerts" },
      ]),
    );

    await evaluateAlerts();

    expect(statfsMock).not.toHaveBeenCalled();
    expect(deliverWebhookMock).not.toHaveBeenCalled();
  });

  it("delivers triggered alerts to enabled alert webhooks with decrypted auth", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStringMock
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            url: "https://example.test/alerts",
            authHeader: "enc:token",
            enabled: true,
            type: "alerts",
          },
          {
            url: "https://example.test/ignored",
            authHeader: "",
            enabled: true,
            type: "siem",
          },
        ]),
      )
      .mockResolvedValueOnce(JSON.stringify({ timestamp: "2026-06-27T11:59:00.000Z" }));
    statfsMock.mockResolvedValue({ bfree: 100, bsize: 1024 });
    selectMock.mockReturnValue(queryChain([{ count: 21 }]));
    getActiveLicenseMock.mockReturnValue({ expiresAt: "2026-07-05T12:00:00.000Z" });
    isEncryptedMock.mockReturnValue(true);
    decryptMock.mockResolvedValue("Bearer decrypted");
    deliverWebhookMock.mockResolvedValue({ success: true });

    await evaluateAlerts();

    expect(deliverWebhookMock).toHaveBeenCalledTimes(1);
    expect(deliverWebhookMock).toHaveBeenCalledWith(
      "https://example.test/alerts",
      "Bearer decrypted",
      expect.arrayContaining([
        expect.objectContaining({ condition: "disk_space_low" }),
        expect.objectContaining({ condition: "auth_anomaly", failedLogins: 21 }),
        expect.objectContaining({ condition: "backup_stale" }),
        expect.objectContaining({ condition: "license_expiring", daysLeft: 6 }),
      ]),
      { maxRetries: 1 },
    );
  });
});
