import { afterEach, describe, expect, it, vi } from "vitest";

const statfsMock = vi.hoisted(() => vi.fn());
const getSettingStringMock = vi.hoisted(() => vi.fn());
const deliverWebhookMock = vi.hoisted(() => vi.fn());
const decryptSettingMock = vi.hoisted(() => vi.fn());
const getActiveLicenseMock = vi.hoisted(() => vi.fn());
const isFeatureEnabledMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
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
  getSettingStringMock.mockReset();
  deliverWebhookMock.mockReset();
  decryptSettingMock.mockReset();
  getActiveLicenseMock.mockReset();
  isFeatureEnabledMock.mockReset();
  isFeatureEnabledMock.mockReturnValue(true);
  selectMock.mockReset();
  reportErrorMock.mockClear();
  for (const fn of Object.values(loggerMock)) fn.mockClear();

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
    decryptSetting: decryptSettingMock,
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
    expect(loggerMock.error).not.toHaveBeenCalled();
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

  it("logs, reports an operational error, and skips delivery when decryptSetting returns null", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-29T12:00:00.000Z").getTime());
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { evaluateAlerts } = await loadAlertEvaluator();

    getSettingStringMock
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

    getSettingStringMock
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

    getSettingStringMock
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

    getSettingStringMock
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
