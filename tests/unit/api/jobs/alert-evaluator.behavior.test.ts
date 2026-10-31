import { afterEach, describe, expect, it, vi } from "vitest";

const statfsMock = vi.hoisted(() => vi.fn());
const getSettingStrictMock = vi.hoisted(() => vi.fn());
const deliverWebhookMock = vi.hoisted(() => vi.fn());
const decryptSettingMock = vi.hoisted(() => vi.fn());
const getActiveLicenseMock = vi.hoisted(() => vi.fn());
const isFeatureEnabledMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const updatesRecorded = vi.hoisted(
  () => [] as Array<{ set: Record<string, unknown>; where: unknown }>,
);
const reportErrorMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

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
  getSettingStrictMock.mockReset();
  deliverWebhookMock.mockReset();
  decryptSettingMock.mockReset();
  getActiveLicenseMock.mockReset();
  isFeatureEnabledMock.mockReset();
  isFeatureEnabledMock.mockReturnValue(true);
  selectMock.mockReset();
  updateMock.mockReset();
  updatesRecorded.length = 0;
  updateMock.mockImplementation(() => ({
    set: (setArg: Record<string, unknown>) => ({
      where: (whereArg: unknown) => {
        updatesRecorded.push({ set: setArg, where: whereArg });
        return Promise.resolve();
      },
    }),
  }));
  reportErrorMock.mockClear();
  for (const fn of Object.values(loggerMock)) fn.mockClear();

  vi.doMock("node:fs/promises", () => ({
    statfs: statfsMock,
  }));

  vi.doMock("drizzle-orm", () => ({
    and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
    eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
    gte: vi.fn(() => "gte"),
    sql: vi.fn(() => "sql"),
  }));

  vi.doMock("../../../../apps/api/src/config.js", () => ({
    env: {
      WORKSPACE_PATH: "/workspace",
    },
  }));

  vi.doMock("../../../../apps/api/src/db/index.js", () => ({
    db: {
      select: selectMock,
      update: updateMock,
    },
    schema: {
      auditLog: {
        action: "action",
        createdAt: "createdAt",
      },
      settings: {
        key: "settings.key",
        value: "settings.value",
      },
    },
  }));

  vi.doMock("../../../../apps/api/src/lib/settings-helpers.js", () => ({
    getSettingStrict: getSettingStrictMock,
  }));

  vi.doMock("../../../../apps/api/src/lib/encryption.js", () => ({
    decryptSetting: decryptSettingMock,
    decryptSettingWithRotation: async (val: string) => {
      const res = await decryptSettingMock(val);
      if (res === null || res === undefined) return null;
      return typeof res === "string" ? { value: res } : res;
    },
  }));

  vi.doMock("../../../../apps/api/src/lib/error-report.js", () => ({
    reportError: reportErrorMock,
  }));

  vi.doMock("../../../../apps/api/src/lib/logger.js", () => ({
    logger: loggerMock,
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

    expect(getSettingStrictMock).not.toHaveBeenCalled();
    expect(statfsMock).not.toHaveBeenCalled();
    expect(deliverWebhookMock).not.toHaveBeenCalled();
  });

  it("returns early and logs a warning when reading webhook_destinations hits a DB error (#3052)", async () => {
    const { evaluateAlerts } = await loadAlertEvaluator();
    const dbError = new Error("connection terminated unexpectedly");
    getSettingStrictMock.mockRejectedValueOnce(dbError);

    await expect(evaluateAlerts()).resolves.toBeUndefined();

    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      { err: dbError, key: "webhook_destinations" },
      "alert-evaluator: failed to read webhook_destinations setting",
    );
    expect(statfsMock).not.toHaveBeenCalled();
    expect(deliverWebhookMock).not.toHaveBeenCalled();
  });

  it("returns early when webhook_destinations setting is absent (undefined) (#3052)", async () => {
    const { evaluateAlerts } = await loadAlertEvaluator();
    getSettingStrictMock.mockResolvedValueOnce(undefined);

    await expect(evaluateAlerts()).resolves.toBeUndefined();

    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(statfsMock).not.toHaveBeenCalled();
    expect(deliverWebhookMock).not.toHaveBeenCalled();
  });

  it("returns early and logs a warning when webhook destination settings are invalid JSON (#2554)", async () => {
    const { evaluateAlerts } = await loadAlertEvaluator();
    getSettingStrictMock.mockResolvedValueOnce("{invalid");

    await evaluateAlerts();

    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      { err: expect.any(SyntaxError), key: "webhook_destinations" },
      "alert-evaluator: failed to parse stored webhook_destinations JSON",
    );
    expect(statfsMock).not.toHaveBeenCalled();
    expect(deliverWebhookMock).not.toHaveBeenCalled();
  });

  it("returns early and logs a warning when webhook_destinations JSON is not an array or contains non-object elements (#2554, #3040)", async () => {
    const { evaluateAlerts } = await loadAlertEvaluator();
    for (const nonObjectArray of [
      "{}",
      "null",
      "42",
      '"string"',
      "[null]",
      "[42]",
      '["string"]',
      "[true]",
      "[[]]",
      JSON.stringify([
        { url: "https://example.test/alerts", authHeader: "", enabled: true, type: "alerts" },
        null,
      ]),
    ]) {
      loggerMock.warn.mockClear();
      getSettingStrictMock.mockResolvedValueOnce(nonObjectArray);

      await expect(evaluateAlerts()).resolves.toBeUndefined();

      expect(loggerMock.warn).toHaveBeenCalledTimes(1);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        { key: "webhook_destinations" },
        "alert-evaluator: stored webhook_destinations is not a JSON array",
      );
      expect(statfsMock).not.toHaveBeenCalled();
      expect(deliverWebhookMock).not.toHaveBeenCalled();
    }
  });

  it("returns early when no enabled alert destinations are configured", async () => {
    const { evaluateAlerts } = await loadAlertEvaluator();
    getSettingStrictMock.mockResolvedValueOnce(
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

    getSettingStrictMock
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
    decryptSettingMock.mockResolvedValue("Bearer decrypted");
    deliverWebhookMock.mockResolvedValue({ success: true });

    await evaluateAlerts();

    expect(decryptSettingMock).toHaveBeenCalledWith("enc:token");
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
    expect(updatesRecorded).toHaveLength(0);
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it("treats a thrown isFeatureEnabled as unlicensed and returns early", async () => {
    const { evaluateAlerts } = await loadAlertEvaluator();
    isFeatureEnabledMock.mockImplementation(() => {
      throw new Error("license subsystem exploded");
    });

    await expect(evaluateAlerts()).resolves.toBeUndefined();

    expect(getSettingStrictMock).not.toHaveBeenCalled();
    expect(statfsMock).not.toHaveBeenCalled();
    expect(deliverWebhookMock).not.toHaveBeenCalled();
  });

  it("does not deliver when every condition is healthy", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStrictMock
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
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(deliverWebhookMock).not.toHaveBeenCalled();
  });

  it("emits backup_never_run when no backup has ever completed", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();

    for (const absentBackup of [undefined, ""]) {
      loggerMock.warn.mockClear();
      deliverWebhookMock.mockClear();
      getSettingStrictMock
        .mockResolvedValueOnce(
          JSON.stringify([
            { url: "https://example.test/alerts", authHeader: "", enabled: true, type: "alerts" },
          ]),
        )
        // backup_last_completed absent or empty -> never run
        .mockResolvedValueOnce(absentBackup);
      statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
      selectMock.mockReturnValue(queryChain([{ count: 0 }]));
      getActiveLicenseMock.mockReturnValue(null);
      deliverWebhookMock.mockResolvedValue({ success: true });

      await evaluateAlerts();

      expect(loggerMock.warn).not.toHaveBeenCalled();
      expect(deliverWebhookMock).toHaveBeenCalledTimes(1);
      const [, , alertsArg] = deliverWebhookMock.mock.calls[0];
      expect(alertsArg).toEqual([{ condition: "backup_never_run" }]);
    }
  });

  it("logs a warning and skips backup_never_run when reading backup_last_completed hits a DB error (#3052)", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();
    const dbError = new Error("connection terminated unexpectedly");

    getSettingStrictMock
      .mockResolvedValueOnce(
        JSON.stringify([
          { url: "https://example.test/alerts", authHeader: "", enabled: true, type: "alerts" },
        ]),
      )
      .mockRejectedValueOnce(dbError);
    statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
    selectMock.mockReturnValue(queryChain([{ count: 0 }]));
    getActiveLicenseMock.mockReturnValue(null);
    deliverWebhookMock.mockResolvedValue({ success: true });

    await expect(evaluateAlerts()).resolves.toBeUndefined();

    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      { err: dbError, key: "backup_last_completed" },
      "alert-evaluator: failed to read backup_last_completed setting",
    );
    expect(deliverWebhookMock).not.toHaveBeenCalled();
  });

  it("still evaluates subsequent conditions and delivers surviving alerts when reading backup_last_completed hits a DB error (#3052)", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();
    const dbError = new Error("connection terminated unexpectedly");

    getSettingStrictMock
      .mockResolvedValueOnce(
        JSON.stringify([
          { url: "https://example.test/alerts", authHeader: "", enabled: true, type: "alerts" },
        ]),
      )
      .mockRejectedValueOnce(dbError);
    statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
    selectMock.mockReturnValue(queryChain([{ count: 0 }]));
    getActiveLicenseMock.mockReturnValue({ expiresAt: "2026-07-05T12:00:00.000Z" });
    deliverWebhookMock.mockResolvedValue({ success: true });

    await expect(evaluateAlerts()).resolves.toBeUndefined();

    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      { err: dbError, key: "backup_last_completed" },
      "alert-evaluator: failed to read backup_last_completed setting",
    );
    expect(deliverWebhookMock).toHaveBeenCalledTimes(1);
    const [, , alertsArg] = deliverWebhookMock.mock.calls[0];
    expect(alertsArg).toEqual([{ condition: "license_expiring", daysLeft: 6 }]);
  });

  it("logs a warning and emits backup_never_run when backup_last_completed is malformed JSON (#3039)", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStrictMock
      .mockResolvedValueOnce(
        JSON.stringify([
          { url: "https://example.test/alerts", authHeader: "", enabled: true, type: "alerts" },
        ]),
      )
      .mockResolvedValueOnce("{not-json");
    statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
    selectMock.mockReturnValue(queryChain([{ count: 0 }]));
    getActiveLicenseMock.mockReturnValue(null);
    deliverWebhookMock.mockResolvedValue({ success: true });

    await evaluateAlerts();

    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      { err: expect.any(SyntaxError), key: "backup_last_completed" },
      "alert-evaluator: failed to parse stored backup_last_completed JSON",
    );
    expect(deliverWebhookMock).toHaveBeenCalledTimes(1);
    const [, , alertsArg] = deliverWebhookMock.mock.calls[0];
    expect(alertsArg).toEqual([{ condition: "backup_never_run" }]);
  });

  it("logs a warning and emits backup_never_run when backup_last_completed is non-object JSON or has an invalid timestamp (#3039)", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();

    for (const invalidPayload of [
      "null",
      "42",
      "[]",
      '"str"',
      "{}",
      '{"timestamp":null}',
      '{"timestamp":123}',
      '{"timestamp":""}',
      '{"timestamp":"not-a-date"}',
    ]) {
      loggerMock.warn.mockClear();
      deliverWebhookMock.mockClear();
      getSettingStrictMock
        .mockResolvedValueOnce(
          JSON.stringify([
            { url: "https://example.test/alerts", authHeader: "", enabled: true, type: "alerts" },
          ]),
        )
        .mockResolvedValueOnce(invalidPayload);
      statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
      selectMock.mockReturnValue(queryChain([{ count: 0 }]));
      getActiveLicenseMock.mockReturnValue(null);
      deliverWebhookMock.mockResolvedValue({ success: true });

      await evaluateAlerts();

      expect(loggerMock.warn).toHaveBeenCalledTimes(1);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        { key: "backup_last_completed" },
        "alert-evaluator: stored backup_last_completed is not a valid backup record",
      );
      expect(deliverWebhookMock).toHaveBeenCalledTimes(1);
      const [, , alertsArg] = deliverWebhookMock.mock.calls[0];
      expect(alertsArg).toEqual([{ condition: "backup_never_run" }]);
    }
  });

  it("skips checks that throw and still delivers the surviving alert", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStrictMock
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

    getSettingStrictMock
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

    getSettingStrictMock
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
    decryptSettingMock.mockResolvedValue("Bearer plaintext");
    deliverWebhookMock.mockResolvedValue({ success: true });

    await evaluateAlerts();

    expect(decryptSettingMock).toHaveBeenCalledWith("Bearer plaintext");
    expect(deliverWebhookMock).toHaveBeenCalledWith(
      "https://example.test/alerts",
      "Bearer plaintext",
      [{ condition: "backup_never_run" }],
      { maxRetries: 1 },
    );
  });

  it("treats a non-string stored authHeader as empty and still delivers to all enabled destinations (#3064)", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStrictMock
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            name: "Corrupt Auth Hook",
            url: "https://example.test/alerts-1",
            authHeader: 123,
            enabled: true,
            type: "alerts",
          },
          {
            name: "Valid Auth Hook",
            url: "https://example.test/alerts-2",
            authHeader: "enc:token",
            enabled: true,
            type: "alerts",
          },
        ]),
      )
      .mockResolvedValueOnce("");
    statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
    selectMock.mockReturnValue(queryChain([{ count: 0 }]));
    getActiveLicenseMock.mockReturnValue(null);
    decryptSettingMock.mockImplementation((value: string) => {
      if (typeof value !== "string") throw new TypeError("value.startsWith is not a function");
      return Promise.resolve("Bearer decrypted");
    });
    deliverWebhookMock.mockResolvedValue({ success: true });

    await expect(evaluateAlerts()).resolves.toBeUndefined();

    expect(decryptSettingMock).toHaveBeenCalledTimes(1);
    expect(decryptSettingMock).toHaveBeenCalledWith("enc:token");
    expect(deliverWebhookMock).toHaveBeenCalledTimes(2);
    expect(deliverWebhookMock).toHaveBeenNthCalledWith(
      1,
      "https://example.test/alerts-1",
      "",
      [{ condition: "backup_never_run" }],
      { maxRetries: 1 },
    );
    expect(deliverWebhookMock).toHaveBeenNthCalledWith(
      2,
      "https://example.test/alerts-2",
      "Bearer decrypted",
      [{ condition: "backup_never_run" }],
      { maxRetries: 1 },
    );
  });

  it("logs, reports an operational error, and skips delivery when decryptSetting returns null", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStrictMock
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            name: "Ops Alerts",
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
    decryptSettingMock.mockResolvedValue(null);
    deliverWebhookMock.mockResolvedValue({ success: true });

    await evaluateAlerts();

    expect(decryptSettingMock).toHaveBeenCalledWith("$ENC$blob");
    expect(deliverWebhookMock).not.toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalledWith(
      { name: "Ops Alerts" },
      expect.stringContaining("DATA_ENCRYPTION_KEY"),
    );
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock.mock.calls[0][0]).toMatchObject({
      code: "ALERT_DECRYPTION_FAILED",
      kind: "operational",
    });
    expect(reportErrorMock.mock.calls[0][1]).toMatchObject({
      source: "worker",
      pool: "system",
      subsystem: "alert-evaluator",
    });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("logs delivery failure without raw URL and does not log completion when deliverWebhook returns success: false for every destination", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStrictMock
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            name: "Ops Alerts",
            url: "https://hooks.slack.com/services/T000/B000/SECRET",
            authHeader: "",
            enabled: true,
            type: "alerts",
          },
        ]),
      )
      .mockResolvedValueOnce("");
    statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
    selectMock.mockReturnValue(queryChain([{ count: 0 }]));
    getActiveLicenseMock.mockReturnValue(null);
    deliverWebhookMock.mockResolvedValue({ success: false, statusCode: 500, error: "HTTP 500" });

    await evaluateAlerts();

    expect(deliverWebhookMock).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledWith(
      { name: "Ops Alerts", statusCode: 500, error: "HTTP 500" },
      "alert-evaluator: webhook delivery failed",
    );
    expect(JSON.stringify(loggerMock.error.mock.calls)).not.toContain("SECRET");
    expect(reportErrorMock).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("logs failure for a failing destination while still delivering and logging completion for healthy destinations", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStrictMock
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            name: "Down Hook",
            url: "https://example.test/down",
            authHeader: "",
            enabled: true,
            type: "alerts",
          },
          {
            name: "Up Hook",
            url: "https://example.test/up",
            authHeader: "",
            enabled: true,
            type: "alerts",
          },
        ]),
      )
      .mockResolvedValueOnce("");
    statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
    selectMock.mockReturnValue(queryChain([{ count: 0 }]));
    getActiveLicenseMock.mockReturnValue(null);
    deliverWebhookMock
      .mockResolvedValueOnce({ success: false, statusCode: undefined, error: "fetch failed" })
      .mockResolvedValueOnce({ success: true, statusCode: 200 });

    await evaluateAlerts();

    expect(deliverWebhookMock).toHaveBeenCalledTimes(2);
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledWith(
      { name: "Down Hook", statusCode: undefined, error: "fetch failed" },
      "alert-evaluator: webhook delivery failed",
    );
    expect(logSpy).toHaveBeenCalledWith("Alert evaluation complete: 1 alert(s) delivered");
  });

  it("skips a destination whose authHeader fails to decrypt while still delivering to other destinations", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStrictMock
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            name: "Broken Hook",
            url: "https://example.test/broken",
            authHeader: "$ENC$broken",
            enabled: true,
            type: "alerts",
          },
          {
            name: "Healthy Hook",
            url: "https://example.test/healthy",
            authHeader: "Bearer plain",
            enabled: true,
            type: "alerts",
          },
        ]),
      )
      .mockResolvedValueOnce("");
    statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
    selectMock.mockReturnValue(queryChain([{ count: 0 }]));
    getActiveLicenseMock.mockReturnValue(null);
    decryptSettingMock.mockImplementation(async (val: string) =>
      val.startsWith("$ENC$") ? null : val,
    );
    deliverWebhookMock.mockResolvedValue({ success: true });

    await evaluateAlerts();

    expect(deliverWebhookMock).toHaveBeenCalledTimes(1);
    expect(deliverWebhookMock).toHaveBeenCalledWith(
      "https://example.test/healthy",
      "Bearer plain",
      [{ condition: "backup_never_run" }],
      { maxRetries: 1 },
    );
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith("Alert evaluation complete: 1 alert(s) delivered");
  });

  it("delivers to every enabled alerts destination", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStrictMock
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

  it("re-encrypts rotated webhook authHeaders with a compare-and-swap on webhook_destinations (#2843)", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();
    const rawDestinations = JSON.stringify([
      {
        name: "Ops Alerts",
        url: "https://example.test/alerts",
        authHeader: "$ENC$old",
        enabled: true,
        type: "alerts",
      },
      {
        name: "SIEM Dest",
        url: "https://example.test/siem",
        authHeader: "$ENC$untouched",
        enabled: true,
        type: "siem",
      },
    ]);

    getSettingStrictMock.mockResolvedValueOnce(rawDestinations).mockResolvedValueOnce("");
    statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
    selectMock.mockReturnValue(queryChain([{ count: 0 }]));
    getActiveLicenseMock.mockReturnValue(null);
    decryptSettingMock.mockResolvedValue({
      value: "Bearer rotated-token",
      reencrypted: "$ENC$new",
    });
    deliverWebhookMock.mockResolvedValue({ success: true });

    await evaluateAlerts();

    expect(deliverWebhookMock).toHaveBeenCalledWith(
      "https://example.test/alerts",
      "Bearer rotated-token",
      [{ condition: "backup_never_run" }],
      { maxRetries: 1 },
    );
    expect(updatesRecorded).toHaveLength(1);
    expect(JSON.parse(updatesRecorded[0].set.value as string)).toEqual([
      {
        name: "Ops Alerts",
        url: "https://example.test/alerts",
        authHeader: "$ENC$new",
        enabled: true,
        type: "alerts",
      },
      {
        name: "SIEM Dest",
        url: "https://example.test/siem",
        authHeader: "$ENC$untouched",
        enabled: true,
        type: "siem",
      },
    ]);
    expect(updatesRecorded[0].where).toEqual({
      op: "and",
      args: [
        { op: "eq", col: "settings.key", val: "webhook_destinations" },
        { op: "eq", col: "settings.value", val: rawDestinations },
      ],
    });
  });

  it("chains compare-and-swap baselines when multiple alert destinations rotate in one run (#2843)", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();
    const rawDestinations = JSON.stringify([
      {
        name: "Hook 1",
        url: "https://example.test/alerts-1",
        authHeader: "$ENC$old-1",
        enabled: true,
        type: "alerts",
      },
      {
        name: "Hook Current",
        url: "https://example.test/alerts-current",
        authHeader: "$ENC$current",
        enabled: true,
        type: "alerts",
      },
      {
        name: "Hook 2",
        url: "https://example.test/alerts-2",
        authHeader: "$ENC$old-2",
        enabled: true,
        type: "alerts",
      },
    ]);

    getSettingStrictMock.mockResolvedValueOnce(rawDestinations).mockResolvedValueOnce("");
    statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
    selectMock.mockReturnValue(queryChain([{ count: 0 }]));
    getActiveLicenseMock.mockReturnValue(null);
    decryptSettingMock
      .mockResolvedValueOnce({ value: "Bearer one", reencrypted: "$ENC$new-1" })
      .mockResolvedValueOnce("Bearer current")
      .mockResolvedValueOnce({ value: "Bearer two", reencrypted: "$ENC$new-2" });
    deliverWebhookMock.mockResolvedValue({ success: true });

    await evaluateAlerts();

    expect(updatesRecorded).toHaveLength(2);
    const firstJson = updatesRecorded[0].set.value as string;
    expect(updatesRecorded[0].where).toEqual({
      op: "and",
      args: [
        { op: "eq", col: "settings.key", val: "webhook_destinations" },
        { op: "eq", col: "settings.value", val: rawDestinations },
      ],
    });
    expect(updatesRecorded[1].where).toEqual({
      op: "and",
      args: [
        { op: "eq", col: "settings.key", val: "webhook_destinations" },
        { op: "eq", col: "settings.value", val: firstJson },
      ],
    });
    expect(JSON.parse(updatesRecorded[1].set.value as string)).toEqual([
      {
        name: "Hook 1",
        url: "https://example.test/alerts-1",
        authHeader: "$ENC$new-1",
        enabled: true,
        type: "alerts",
      },
      {
        name: "Hook Current",
        url: "https://example.test/alerts-current",
        authHeader: "$ENC$current",
        enabled: true,
        type: "alerts",
      },
      {
        name: "Hook 2",
        url: "https://example.test/alerts-2",
        authHeader: "$ENC$new-2",
        enabled: true,
        type: "alerts",
      },
    ]);
  });

  it("logs a warning, keeps the CAS baseline unchanged, and still delivers to all destinations when key-rotation writeback fails (#3398)", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const { evaluateAlerts } = await loadAlertEvaluator();
    const rawDestinations = JSON.stringify([
      {
        name: "Hook 1",
        url: "https://example.test/alerts-1",
        authHeader: "$ENC$old-1",
        enabled: true,
        type: "alerts",
      },
      {
        name: "Hook 2",
        url: "https://example.test/alerts-2",
        authHeader: "$ENC$old-2",
        enabled: true,
        type: "alerts",
      },
    ]);
    const dbError = new Error("db writeback failed");

    getSettingStrictMock.mockResolvedValueOnce(rawDestinations).mockResolvedValueOnce("");
    statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
    selectMock.mockReturnValue(queryChain([{ count: 0 }]));
    getActiveLicenseMock.mockReturnValue(null);
    decryptSettingMock
      .mockResolvedValueOnce({ value: "Bearer one", reencrypted: "$ENC$new-1" })
      .mockResolvedValueOnce({ value: "Bearer two", reencrypted: "$ENC$new-2" });
    updateMock.mockImplementationOnce(() => ({
      set: () => ({
        where: () => Promise.reject(dbError),
      }),
    }));
    deliverWebhookMock.mockResolvedValue({ success: true });

    await expect(evaluateAlerts()).resolves.toBeUndefined();

    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      { err: dbError, name: "Hook 1", key: "webhook_destinations" },
      "alert-evaluator: failed to persist re-encrypted webhook authHeader",
    );
    expect(deliverWebhookMock).toHaveBeenCalledTimes(2);
    expect(deliverWebhookMock).toHaveBeenNthCalledWith(
      1,
      "https://example.test/alerts-1",
      "Bearer one",
      [{ condition: "backup_never_run" }],
      { maxRetries: 1 },
    );
    expect(deliverWebhookMock).toHaveBeenNthCalledWith(
      2,
      "https://example.test/alerts-2",
      "Bearer two",
      [{ condition: "backup_never_run" }],
      { maxRetries: 1 },
    );
    expect(updatesRecorded).toHaveLength(1);
    expect(JSON.parse(updatesRecorded[0].set.value as string)).toEqual([
      {
        name: "Hook 1",
        url: "https://example.test/alerts-1",
        authHeader: "$ENC$new-1",
        enabled: true,
        type: "alerts",
      },
      {
        name: "Hook 2",
        url: "https://example.test/alerts-2",
        authHeader: "$ENC$new-2",
        enabled: true,
        type: "alerts",
      },
    ]);
    expect(updatesRecorded[0].where).toEqual({
      op: "and",
      args: [
        { op: "eq", col: "settings.key", val: "webhook_destinations" },
        { op: "eq", col: "settings.value", val: rawDestinations },
      ],
    });
  });
});
