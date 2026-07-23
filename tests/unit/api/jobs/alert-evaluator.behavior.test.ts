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

async function loadAlertEvaluator(options: { dataEncryptionKey?: string } = {}) {
  const { dataEncryptionKey = "test-key" } = options;
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
      DATA_ENCRYPTION_KEY: dataEncryptionKey,
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

  it("treats a thrown isFeatureEnabled as unlicensed and returns early", async () => {
    const { evaluateAlerts } = await loadAlertEvaluator();
    isFeatureEnabledMock.mockImplementation(() => {
      throw new Error("license subsystem exploded");
    });

    await expect(evaluateAlerts()).resolves.toBeUndefined();

    expect(getSettingStringMock).not.toHaveBeenCalled();
    expect(statfsMock).not.toHaveBeenCalled();
    expect(deliverWebhookMock).not.toHaveBeenCalled();
  });

  it("does not deliver when every condition is healthy", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStringMock
      // webhook_destinations: one enabled alerts destination
      .mockResolvedValueOnce(
        JSON.stringify([
          { url: "https://example.test/alerts", authHeader: "", enabled: true, type: "alerts" },
        ]),
      )
      // backup_last_completed: fresh backup, 1 hour ago
      .mockResolvedValueOnce(JSON.stringify({ timestamp: "2026-06-29T11:00:00.000Z" }));
    // plenty of free disk (10 GB), so freeGb >= 1
    statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
    // below the auth-anomaly threshold
    selectMock.mockReturnValue(queryChain([{ count: 5 }]));
    // license valid for well over 30 days
    getActiveLicenseMock.mockReturnValue({ expiresAt: "2027-01-01T00:00:00.000Z" });

    await evaluateAlerts();

    // All checks ran, but nothing tripped, so no webhook delivery.
    expect(statfsMock).toHaveBeenCalledTimes(1);
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(getActiveLicenseMock).toHaveBeenCalledTimes(1);
    expect(deliverWebhookMock).not.toHaveBeenCalled();
  });

  it("emits backup_never_run when no backup has ever completed", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStringMock
      .mockResolvedValueOnce(
        JSON.stringify([
          { url: "https://example.test/alerts", authHeader: "", enabled: true, type: "alerts" },
        ]),
      )
      // backup_last_completed empty -> never run
      .mockResolvedValueOnce("");
    statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
    selectMock.mockReturnValue(queryChain([{ count: 0 }]));
    getActiveLicenseMock.mockReturnValue(null);
    deliverWebhookMock.mockResolvedValue({ success: true });

    await evaluateAlerts();

    expect(deliverWebhookMock).toHaveBeenCalledTimes(1);
    const [, , alertsArg] = deliverWebhookMock.mock.calls[0];
    expect(alertsArg).toEqual([{ condition: "backup_never_run" }]);
  });

  it("swallows a malformed backup timestamp payload and skips the backup alert", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStringMock
      .mockResolvedValueOnce(
        JSON.stringify([
          { url: "https://example.test/alerts", authHeader: "", enabled: true, type: "alerts" },
        ]),
      )
      // backup_last_completed is present but not valid JSON -> JSON.parse throws, caught
      .mockResolvedValueOnce("{not-json");
    statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
    selectMock.mockReturnValue(queryChain([{ count: 0 }]));
    getActiveLicenseMock.mockReturnValue(null);

    await evaluateAlerts();

    // Only trip was a parse error which is swallowed; nothing else fired, so no delivery.
    expect(deliverWebhookMock).not.toHaveBeenCalled();
  });

  it("skips checks that throw and still delivers the surviving alert", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStringMock
      .mockResolvedValueOnce(
        JSON.stringify([
          { url: "https://example.test/alerts", authHeader: "", enabled: true, type: "alerts" },
        ]),
      )
      // backup_last_completed empty -> backup_never_run is the surviving alert
      .mockResolvedValueOnce("");
    // statfs rejects -> disk check swallowed
    statfsMock.mockRejectedValue(new Error("statfs unsupported"));
    // empty result set -> recentFailures[0].count throws -> auth check swallowed
    selectMock.mockReturnValue(queryChain([]));
    // license lookup throws -> license check swallowed
    getActiveLicenseMock.mockImplementation(() => {
      throw new Error("enterprise unavailable");
    });
    deliverWebhookMock.mockResolvedValue({ success: true });

    await evaluateAlerts();

    expect(deliverWebhookMock).toHaveBeenCalledTimes(1);
    const [, , alertsArg] = deliverWebhookMock.mock.calls[0];
    expect(alertsArg).toEqual([{ condition: "backup_never_run" }]);
  });

  it("does not alert on license when there is no active license or no expiry", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStringMock
      .mockResolvedValueOnce(
        JSON.stringify([
          { url: "https://example.test/alerts", authHeader: "", enabled: true, type: "alerts" },
        ]),
      )
      .mockResolvedValueOnce(JSON.stringify({ timestamp: "2026-06-29T11:00:00.000Z" }));
    statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
    selectMock.mockReturnValue(queryChain([{ count: 0 }]));
    // license present but without an expiresAt field
    getActiveLicenseMock.mockReturnValue({});

    await evaluateAlerts();

    expect(getActiveLicenseMock).toHaveBeenCalledTimes(1);
    expect(deliverWebhookMock).not.toHaveBeenCalled();
  });

  it("delivers a raw auth header when it is not encrypted", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStringMock
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            url: "https://example.test/alerts",
            authHeader: "Bearer plaintext",
            enabled: true,
            type: "alerts",
          },
        ]),
      )
      .mockResolvedValueOnce("");
    statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
    selectMock.mockReturnValue(queryChain([{ count: 0 }]));
    getActiveLicenseMock.mockReturnValue(null);
    isEncryptedMock.mockReturnValue(false);
    deliverWebhookMock.mockResolvedValue({ success: true });

    await evaluateAlerts();

    expect(decryptMock).not.toHaveBeenCalled();
    expect(deliverWebhookMock).toHaveBeenCalledWith(
      "https://example.test/alerts",
      "Bearer plaintext",
      [{ condition: "backup_never_run" }],
      { maxRetries: 1 },
    );
  });

  it("falls back to an empty auth header when decryption returns null", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStringMock
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            url: "https://example.test/alerts",
            authHeader: "$ENC$blob",
            enabled: true,
            type: "alerts",
          },
        ]),
      )
      .mockResolvedValueOnce("");
    statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
    selectMock.mockReturnValue(queryChain([{ count: 0 }]));
    getActiveLicenseMock.mockReturnValue(null);
    isEncryptedMock.mockReturnValue(true);
    // decrypt resolves to null -> `decrypted ?? ""` yields ""
    decryptMock.mockResolvedValue(null);
    deliverWebhookMock.mockResolvedValue({ success: true });

    await evaluateAlerts();

    expect(decryptMock).toHaveBeenCalledTimes(1);
    expect(deliverWebhookMock).toHaveBeenCalledWith(
      "https://example.test/alerts",
      "",
      [{ condition: "backup_never_run" }],
      { maxRetries: 1 },
    );
  });

  it("keeps the raw auth header when decryption throws", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStringMock
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            url: "https://example.test/alerts",
            authHeader: "$ENC$blob",
            enabled: true,
            type: "alerts",
          },
        ]),
      )
      .mockResolvedValueOnce("");
    statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
    selectMock.mockReturnValue(queryChain([{ count: 0 }]));
    getActiveLicenseMock.mockReturnValue(null);
    isEncryptedMock.mockReturnValue(true);
    decryptMock.mockRejectedValue(new Error("bad ciphertext"));
    deliverWebhookMock.mockResolvedValue({ success: true });

    await evaluateAlerts();

    expect(deliverWebhookMock).toHaveBeenCalledWith(
      "https://example.test/alerts",
      "$ENC$blob",
      [{ condition: "backup_never_run" }],
      { maxRetries: 1 },
    );
  });

  it("does not decrypt an encrypted header when DATA_ENCRYPTION_KEY is unset", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator({ dataEncryptionKey: "" });

    getSettingStringMock
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            url: "https://example.test/alerts",
            authHeader: "$ENC$blob",
            enabled: true,
            type: "alerts",
          },
        ]),
      )
      .mockResolvedValueOnce("");
    statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
    selectMock.mockReturnValue(queryChain([{ count: 0 }]));
    getActiveLicenseMock.mockReturnValue(null);
    isEncryptedMock.mockReturnValue(true);
    deliverWebhookMock.mockResolvedValue({ success: true });

    await evaluateAlerts();

    // isEncrypted is true but the key guard is false, so decrypt is never reached.
    expect(decryptMock).not.toHaveBeenCalled();
    expect(deliverWebhookMock).toHaveBeenCalledWith(
      "https://example.test/alerts",
      "$ENC$blob",
      [{ condition: "backup_never_run" }],
      { maxRetries: 1 },
    );
  });

  it("delivers to every enabled alerts destination", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStringMock
      .mockResolvedValueOnce(
        JSON.stringify([
          { url: "https://example.test/a", authHeader: "", enabled: true, type: "alerts" },
          { url: "https://example.test/b", authHeader: "", enabled: true, type: "alerts" },
          { url: "https://example.test/off", authHeader: "", enabled: false, type: "alerts" },
        ]),
      )
      .mockResolvedValueOnce("");
    statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
    selectMock.mockReturnValue(queryChain([{ count: 0 }]));
    getActiveLicenseMock.mockReturnValue(null);
    deliverWebhookMock.mockResolvedValue({ success: true });

    await evaluateAlerts();

    expect(deliverWebhookMock).toHaveBeenCalledTimes(2);
    const urls = deliverWebhookMock.mock.calls.map((call) => call[0]);
    expect(urls).toEqual(["https://example.test/a", "https://example.test/b"]);
  });
});
