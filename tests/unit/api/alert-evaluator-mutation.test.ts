import { afterEach, describe, expect, it, vi } from "vitest";

// Mutation-focused coverage for apps/api/src/jobs/alert-evaluator.ts. The
// sibling jobs/alert-evaluator.behavior.test.ts covers the branch structure;
// this file straddles every threshold boundary (disk < 1 GB, auth > 20,
// backup > 48 h, license < 30 d) so the </>=/> comparison mutants die, pins
// the exact arithmetic behind each computed field, and asserts the full alert
// payload shape (condition string + numeric fields) so a mutated literal or
// dropped property changes an assertion.
//
// This module lives at tests/unit/api, one directory above jobs/, so the
// relative mock paths are three "../" segments (not four).

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

const NOW = new Date("2026-06-29T12:00:00.000Z").getTime();

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

  vi.doMock("node:fs/promises", () => ({ statfs: statfsMock }));

  vi.doMock("drizzle-orm", () => ({
    and: vi.fn(() => "and"),
    eq: vi.fn(() => "eq"),
    gte: vi.fn(() => "gte"),
    sql: vi.fn(() => "sql"),
  }));

  vi.doMock("../../../apps/api/src/config.js", () => ({
    env: {
      WORKSPACE_PATH: "/workspace",
      DATA_ENCRYPTION_KEY: dataEncryptionKey,
    },
  }));

  vi.doMock("../../../apps/api/src/db/index.js", () => ({
    db: { select: selectMock },
    schema: {
      auditLog: { action: "action", createdAt: "createdAt" },
    },
  }));

  vi.doMock("../../../apps/api/src/lib/settings-helpers.js", () => ({
    getSettingString: getSettingStringMock,
  }));

  vi.doMock("../../../apps/api/src/lib/encryption.js", () => ({
    decrypt: decryptMock,
    isEncrypted: isEncryptedMock,
  }));

  vi.doMock("../../../apps/api/src/lib/webhook-delivery.js", () => ({
    deliverWebhook: deliverWebhookMock,
  }));

  vi.doMock("@snapotter/enterprise", () => ({
    getActiveLicense: getActiveLicenseMock,
    isFeatureEnabled: isFeatureEnabledMock,
  }));

  return import("../../../apps/api/src/jobs/alert-evaluator.js");
}

/** Standard one-enabled-alerts-destination settings, healthy backup value. */
function healthyDestinations() {
  return JSON.stringify([
    { url: "https://example.test/alerts", authHeader: "", enabled: true, type: "alerts" },
  ]);
}

/** Extract the single alerts array delivered to the (only) webhook call. */
function deliveredAlerts(): Record<string, unknown>[] {
  expect(deliverWebhookMock).toHaveBeenCalledTimes(1);
  return deliverWebhookMock.mock.calls[0][2] as Record<string, unknown>[];
}

describe("alert-evaluator.ts mutation coverage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("destination filter", () => {
    it("delivers when a destination is both enabled and type alerts", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const { evaluateAlerts } = await loadAlertEvaluator();
      getSettingStringMock.mockResolvedValueOnce(healthyDestinations()).mockResolvedValueOnce("");
      statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
      selectMock.mockReturnValue(queryChain([{ count: 0 }]));
      getActiveLicenseMock.mockReturnValue(null);
      deliverWebhookMock.mockResolvedValue({ success: true });

      await evaluateAlerts();

      expect(deliverWebhookMock).toHaveBeenCalledTimes(1);
    });

    it("skips a destination that is enabled but not type alerts", async () => {
      const { evaluateAlerts } = await loadAlertEvaluator();
      getSettingStringMock.mockResolvedValueOnce(
        JSON.stringify([
          { url: "https://example.test/siem", authHeader: "", enabled: true, type: "siem" },
        ]),
      );

      await evaluateAlerts();

      // No alerts destination survives the filter: the run returns before statfs.
      expect(statfsMock).not.toHaveBeenCalled();
      expect(deliverWebhookMock).not.toHaveBeenCalled();
    });

    it("skips a destination that is type alerts but disabled", async () => {
      const { evaluateAlerts } = await loadAlertEvaluator();
      getSettingStringMock.mockResolvedValueOnce(
        JSON.stringify([
          { url: "https://example.test/alerts", authHeader: "", enabled: false, type: "alerts" },
        ]),
      );

      await evaluateAlerts();

      expect(statfsMock).not.toHaveBeenCalled();
      expect(deliverWebhookMock).not.toHaveBeenCalled();
    });

    it("defaults the webhook_destinations lookup to an empty array", async () => {
      const { evaluateAlerts } = await loadAlertEvaluator();
      // Return the default the source passes to getSettingString unchanged.
      getSettingStringMock.mockResolvedValueOnce("[]");

      await evaluateAlerts();

      expect(getSettingStringMock).toHaveBeenNthCalledWith(1, "webhook_destinations", "[]");
      expect(deliverWebhookMock).not.toHaveBeenCalled();
    });
  });

  describe("disk space threshold (< 1 GB)", () => {
    async function runWithFreeGb(freeGb: number) {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const { evaluateAlerts } = await loadAlertEvaluator();
      getSettingStringMock
        .mockResolvedValueOnce(healthyDestinations())
        // fresh backup so only the disk condition can trip
        .mockResolvedValueOnce(JSON.stringify({ timestamp: "2026-06-29T11:00:00.000Z" }));
      // Encode the desired free GiB into bfree with bsize = 1 GiB per block.
      statfsMock.mockResolvedValue({ bfree: freeGb, bsize: 1024 ** 3 });
      selectMock.mockReturnValue(queryChain([{ count: 0 }]));
      getActiveLicenseMock.mockReturnValue(null);
      deliverWebhookMock.mockResolvedValue({ success: true });
      await evaluateAlerts();
    }

    it("alerts with the exact freeGb and threshold when just under 1 GB", async () => {
      await runWithFreeGb(0.5);
      const alerts = deliveredAlerts();
      expect(alerts).toContainEqual({ condition: "disk_space_low", freeGb: 0.5, threshold: 1 });
    });

    it("does not alert when free space is exactly 1 GB (boundary is strict <)", async () => {
      await runWithFreeGb(1);
      expect(deliverWebhookMock).not.toHaveBeenCalled();
    });

    it("computes freeGb as bfree * bsize divided by 1024^3", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const { evaluateAlerts } = await loadAlertEvaluator();
      getSettingStringMock
        .mockResolvedValueOnce(healthyDestinations())
        .mockResolvedValueOnce(JSON.stringify({ timestamp: "2026-06-29T11:00:00.000Z" }));
      // 805306368 bytes = 0.75 GiB. Verifies the multiply and the /1024**3.
      statfsMock.mockResolvedValue({ bfree: 786_432, bsize: 1024 });
      selectMock.mockReturnValue(queryChain([{ count: 0 }]));
      getActiveLicenseMock.mockReturnValue(null);
      deliverWebhookMock.mockResolvedValue({ success: true });

      await evaluateAlerts();

      const alerts = deliveredAlerts();
      expect(alerts).toContainEqual({ condition: "disk_space_low", freeGb: 0.75, threshold: 1 });
    });
  });

  describe("auth anomaly threshold (> 20 in 5 minutes)", () => {
    async function runWithFailures(count: number) {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const { evaluateAlerts } = await loadAlertEvaluator();
      getSettingStringMock
        .mockResolvedValueOnce(healthyDestinations())
        .mockResolvedValueOnce(JSON.stringify({ timestamp: "2026-06-29T11:00:00.000Z" }));
      statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
      selectMock.mockReturnValue(queryChain([{ count }]));
      getActiveLicenseMock.mockReturnValue(null);
      deliverWebhookMock.mockResolvedValue({ success: true });
      await evaluateAlerts();
    }

    it("does not alert at exactly 20 failures (boundary is strict >)", async () => {
      await runWithFailures(20);
      expect(deliverWebhookMock).not.toHaveBeenCalled();
    });

    it("alerts at 21 failures with the exact payload", async () => {
      await runWithFailures(21);
      const alerts = deliveredAlerts();
      expect(alerts).toContainEqual({
        condition: "auth_anomaly",
        failedLogins: 21,
        windowMinutes: 5,
      });
    });

    it("uses a 5-minute window (5 * 60 * 1000 ms before now) for the query bound", async () => {
      const gteMock = vi.fn(() => "gte");
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      vi.resetModules();
      statfsMock.mockReset();
      getSettingStringMock.mockReset();
      deliverWebhookMock.mockReset();
      getActiveLicenseMock.mockReset();
      selectMock.mockReset();
      isFeatureEnabledMock.mockReset();
      isFeatureEnabledMock.mockReturnValue(true);

      vi.doMock("node:fs/promises", () => ({ statfs: statfsMock }));
      vi.doMock("drizzle-orm", () => ({
        and: vi.fn(() => "and"),
        eq: vi.fn(() => "eq"),
        gte: gteMock,
        sql: vi.fn(() => "sql"),
      }));
      vi.doMock("../../../apps/api/src/config.js", () => ({
        env: { WORKSPACE_PATH: "/workspace", DATA_ENCRYPTION_KEY: "k" },
      }));
      vi.doMock("../../../apps/api/src/db/index.js", () => ({
        db: { select: selectMock },
        schema: { auditLog: { action: "action", createdAt: "createdAt" } },
      }));
      vi.doMock("../../../apps/api/src/lib/settings-helpers.js", () => ({
        getSettingString: getSettingStringMock,
      }));
      vi.doMock("../../../apps/api/src/lib/encryption.js", () => ({
        decrypt: decryptMock,
        isEncrypted: isEncryptedMock,
      }));
      vi.doMock("../../../apps/api/src/lib/webhook-delivery.js", () => ({
        deliverWebhook: deliverWebhookMock,
      }));
      vi.doMock("@snapotter/enterprise", () => ({
        getActiveLicense: getActiveLicenseMock,
        isFeatureEnabled: isFeatureEnabledMock,
      }));

      const { evaluateAlerts } = await import("../../../apps/api/src/jobs/alert-evaluator.js");
      getSettingStringMock
        .mockResolvedValueOnce(healthyDestinations())
        .mockResolvedValueOnce(JSON.stringify({ timestamp: "2026-06-29T11:00:00.000Z" }));
      statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
      selectMock.mockReturnValue(queryChain([{ count: 0 }]));
      getActiveLicenseMock.mockReturnValue(null);

      await evaluateAlerts();

      // gte(createdAt, new Date(now - 5*60*1000)); assert the exact Date passed.
      expect(gteMock).toHaveBeenCalledWith("createdAt", new Date(NOW - 5 * 60 * 1000));
    });
  });

  describe("backup staleness threshold (> 48 hours)", () => {
    async function runWithBackupAgeHours(ageHours: number) {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const { evaluateAlerts } = await loadAlertEvaluator();
      const backupTs = new Date(NOW - ageHours * 3_600_000).toISOString();
      getSettingStringMock
        .mockResolvedValueOnce(healthyDestinations())
        .mockResolvedValueOnce(JSON.stringify({ timestamp: backupTs }));
      statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
      selectMock.mockReturnValue(queryChain([{ count: 0 }]));
      getActiveLicenseMock.mockReturnValue(null);
      deliverWebhookMock.mockResolvedValue({ success: true });
      await evaluateAlerts();
    }

    it("does not alert at exactly 48 hours (boundary is strict >)", async () => {
      await runWithBackupAgeHours(48);
      expect(deliverWebhookMock).not.toHaveBeenCalled();
    });

    it("alerts backup_stale just past 48 hours with the exact ageHours and threshold", async () => {
      await runWithBackupAgeHours(50);
      const alerts = deliveredAlerts();
      expect(alerts).toContainEqual({ condition: "backup_stale", ageHours: 50, threshold: 48 });
    });

    it("emits backup_never_run (no numeric fields) when no backup value exists", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const { evaluateAlerts } = await loadAlertEvaluator();
      getSettingStringMock.mockResolvedValueOnce(healthyDestinations()).mockResolvedValueOnce("");
      statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
      selectMock.mockReturnValue(queryChain([{ count: 0 }]));
      getActiveLicenseMock.mockReturnValue(null);
      deliverWebhookMock.mockResolvedValue({ success: true });

      await evaluateAlerts();

      const alerts = deliveredAlerts();
      expect(alerts).toEqual([{ condition: "backup_never_run" }]);
    });

    it("reads backup_last_completed with an empty-string default", async () => {
      const { evaluateAlerts } = await loadAlertEvaluator();
      getSettingStringMock.mockResolvedValueOnce(healthyDestinations()).mockResolvedValueOnce("");
      statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
      selectMock.mockReturnValue(queryChain([{ count: 0 }]));
      getActiveLicenseMock.mockReturnValue(null);
      deliverWebhookMock.mockResolvedValue({ success: true });

      await evaluateAlerts();

      expect(getSettingStringMock).toHaveBeenNthCalledWith(2, "backup_last_completed", "");
    });
  });

  describe("license expiry threshold (< 30 days)", () => {
    async function runWithDaysLeft(daysLeft: number) {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const { evaluateAlerts } = await loadAlertEvaluator();
      const expiresAt = new Date(NOW + daysLeft * 86_400_000).toISOString();
      getSettingStringMock
        .mockResolvedValueOnce(healthyDestinations())
        .mockResolvedValueOnce(JSON.stringify({ timestamp: "2026-06-29T11:00:00.000Z" }));
      statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
      selectMock.mockReturnValue(queryChain([{ count: 0 }]));
      getActiveLicenseMock.mockReturnValue({ expiresAt });
      deliverWebhookMock.mockResolvedValue({ success: true });
      await evaluateAlerts();
    }

    it("does not alert at exactly 30 days remaining (boundary is strict <)", async () => {
      await runWithDaysLeft(30);
      expect(deliverWebhookMock).not.toHaveBeenCalled();
    });

    it("alerts license_expiring below 30 days with a floored daysLeft", async () => {
      // 6.9 days -> Math.floor -> 6.
      await runWithDaysLeft(6.9);
      const alerts = deliveredAlerts();
      expect(alerts).toContainEqual({ condition: "license_expiring", daysLeft: 6 });
    });

    it("floors daysLeft rather than rounding", async () => {
      // 29.99 days -> floor 29, not 30.
      await runWithDaysLeft(29.99);
      const alerts = deliveredAlerts();
      expect(alerts).toContainEqual({ condition: "license_expiring", daysLeft: 29 });
    });

    it("does not alert when the license has no expiresAt", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const { evaluateAlerts } = await loadAlertEvaluator();
      getSettingStringMock
        .mockResolvedValueOnce(healthyDestinations())
        .mockResolvedValueOnce(JSON.stringify({ timestamp: "2026-06-29T11:00:00.000Z" }));
      statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
      selectMock.mockReturnValue(queryChain([{ count: 0 }]));
      getActiveLicenseMock.mockReturnValue({});
      deliverWebhookMock.mockResolvedValue({ success: true });

      await evaluateAlerts();

      expect(deliverWebhookMock).not.toHaveBeenCalled();
    });

    it("does not alert when there is no active license", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const { evaluateAlerts } = await loadAlertEvaluator();
      getSettingStringMock
        .mockResolvedValueOnce(healthyDestinations())
        .mockResolvedValueOnce(JSON.stringify({ timestamp: "2026-06-29T11:00:00.000Z" }));
      statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
      selectMock.mockReturnValue(queryChain([{ count: 0 }]));
      getActiveLicenseMock.mockReturnValue(null);
      deliverWebhookMock.mockResolvedValue({ success: true });

      await evaluateAlerts();

      expect(deliverWebhookMock).not.toHaveBeenCalled();
    });
  });

  describe("all conditions firing together", () => {
    it("delivers all four alert conditions with their exact computed values", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const { evaluateAlerts } = await loadAlertEvaluator();
      getSettingStringMock
        .mockResolvedValueOnce(healthyDestinations())
        // backup 72 hours stale
        .mockResolvedValueOnce(
          JSON.stringify({ timestamp: new Date(NOW - 72 * 3_600_000).toISOString() }),
        );
      // 0.25 GiB free
      statfsMock.mockResolvedValue({ bfree: 0.25, bsize: 1024 ** 3 });
      selectMock.mockReturnValue(queryChain([{ count: 42 }]));
      // license expires in 10 days
      getActiveLicenseMock.mockReturnValue({
        expiresAt: new Date(NOW + 10 * 86_400_000).toISOString(),
      });
      deliverWebhookMock.mockResolvedValue({ success: true });

      await evaluateAlerts();

      const alerts = deliveredAlerts();
      expect(alerts).toEqual([
        { condition: "disk_space_low", freeGb: 0.25, threshold: 1 },
        { condition: "auth_anomaly", failedLogins: 42, windowMinutes: 5 },
        { condition: "backup_stale", ageHours: 72, threshold: 48 },
        { condition: "license_expiring", daysLeft: 10 },
      ]);
    });

    it("does not deliver anything when every condition is healthy", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const { evaluateAlerts } = await loadAlertEvaluator();
      getSettingStringMock
        .mockResolvedValueOnce(healthyDestinations())
        .mockResolvedValueOnce(JSON.stringify({ timestamp: "2026-06-29T11:30:00.000Z" }));
      statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
      selectMock.mockReturnValue(queryChain([{ count: 3 }]));
      getActiveLicenseMock.mockReturnValue({ expiresAt: "2027-06-29T12:00:00.000Z" });

      await evaluateAlerts();

      // All checks ran, none tripped.
      expect(statfsMock).toHaveBeenCalledTimes(1);
      expect(selectMock).toHaveBeenCalledTimes(1);
      expect(getActiveLicenseMock).toHaveBeenCalledTimes(1);
      expect(deliverWebhookMock).not.toHaveBeenCalled();
    });
  });

  describe("delivery fan-out and auth handling", () => {
    it("delivers to every enabled alerts destination and skips disabled ones", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const { evaluateAlerts } = await loadAlertEvaluator();
      getSettingStringMock
        .mockResolvedValueOnce(
          JSON.stringify([
            { url: "https://example.test/a", authHeader: "", enabled: true, type: "alerts" },
            { url: "https://example.test/b", authHeader: "", enabled: true, type: "alerts" },
            { url: "https://example.test/off", authHeader: "", enabled: false, type: "alerts" },
            { url: "https://example.test/siem", authHeader: "", enabled: true, type: "siem" },
          ]),
        )
        .mockResolvedValueOnce("");
      statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
      selectMock.mockReturnValue(queryChain([{ count: 0 }]));
      getActiveLicenseMock.mockReturnValue(null);
      deliverWebhookMock.mockResolvedValue({ success: true });

      await evaluateAlerts();

      expect(deliverWebhookMock).toHaveBeenCalledTimes(2);
      expect(deliverWebhookMock.mock.calls.map((c) => c[0])).toEqual([
        "https://example.test/a",
        "https://example.test/b",
      ]);
    });

    it("passes maxRetries: 1 to every webhook delivery", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const { evaluateAlerts } = await loadAlertEvaluator();
      getSettingStringMock.mockResolvedValueOnce(healthyDestinations()).mockResolvedValueOnce("");
      statfsMock.mockResolvedValue({ bfree: 10 * 1024 * 1024, bsize: 1024 });
      selectMock.mockReturnValue(queryChain([{ count: 0 }]));
      getActiveLicenseMock.mockReturnValue(null);
      deliverWebhookMock.mockResolvedValue({ success: true });

      await evaluateAlerts();

      expect(deliverWebhookMock).toHaveBeenCalledWith(
        "https://example.test/alerts",
        "",
        [{ condition: "backup_never_run" }],
        { maxRetries: 1 },
      );
    });

    it("decrypts an encrypted auth header before delivery", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
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
      decryptMock.mockResolvedValue("Bearer clear");
      deliverWebhookMock.mockResolvedValue({ success: true });

      await evaluateAlerts();

      expect(deliverWebhookMock.mock.calls[0][1]).toBe("Bearer clear");
    });

    it("sends the raw header when it is not encrypted", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const { evaluateAlerts } = await loadAlertEvaluator();
      getSettingStringMock
        .mockResolvedValueOnce(
          JSON.stringify([
            {
              url: "https://example.test/alerts",
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
      isEncryptedMock.mockReturnValue(false);
      deliverWebhookMock.mockResolvedValue({ success: true });

      await evaluateAlerts();

      expect(decryptMock).not.toHaveBeenCalled();
      expect(deliverWebhookMock.mock.calls[0][1]).toBe("Bearer plain");
    });

    it("falls back to an empty auth header when decrypt resolves null", async () => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
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
      decryptMock.mockResolvedValue(null);
      deliverWebhookMock.mockResolvedValue({ success: true });

      await evaluateAlerts();

      expect(deliverWebhookMock.mock.calls[0][1]).toBe("");
    });
  });

  describe("license gate and JSON guards", () => {
    it("returns before reading settings when admin_alerts is unlicensed", async () => {
      const { evaluateAlerts } = await loadAlertEvaluator();
      isFeatureEnabledMock.mockReturnValue(false);

      await evaluateAlerts();

      expect(getSettingStringMock).not.toHaveBeenCalled();
      expect(deliverWebhookMock).not.toHaveBeenCalled();
    });

    it("checks the admin_alerts feature specifically", async () => {
      const { evaluateAlerts } = await loadAlertEvaluator();
      isFeatureEnabledMock.mockReturnValue(false);

      await evaluateAlerts();

      expect(isFeatureEnabledMock).toHaveBeenCalledWith("admin_alerts");
    });

    it("returns early on invalid webhook_destinations JSON", async () => {
      const { evaluateAlerts } = await loadAlertEvaluator();
      getSettingStringMock.mockResolvedValueOnce("{not json");

      await evaluateAlerts();

      expect(statfsMock).not.toHaveBeenCalled();
      expect(deliverWebhookMock).not.toHaveBeenCalled();
    });
  });
});
