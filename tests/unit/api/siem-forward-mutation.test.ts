import { afterEach, describe, expect, it, vi } from "vitest";

// Mutation-focused coverage for apps/api/src/jobs/siem-forward.ts. The sibling
// jobs/siem-forward.behavior.test.ts covers the main paths; this file pins the
// values a mutant would flip: the circuit-breaker >= 5 boundary, the parseInt
// radix, the enabled/webhookUrl gate (both operands), the empty-rows guard,
// the cursor gte-vs-unbounded branch, the batch limit, the full per-event
// payload shape, the last-row cursor selection, the failureCount > 0 reset
// guard, and the failureCount + 1 increment arithmetic.
//
// This module lives at tests/unit/api, one directory above jobs/, so the
// relative mock paths use three "../" segments.

const readSiemConfigMock = vi.hoisted(() => vi.fn());
const deliverWebhookMock = vi.hoisted(() => vi.fn());
const upsertSettingMock = vi.hoisted(() => vi.fn());
const decryptMock = vi.hoisted(() => vi.fn());
const isEncryptedMock = vi.hoisted(() => vi.fn());
const isFeatureEnabledMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const gteMock = vi.hoisted(() => vi.fn(() => "gte-condition"));
const ascMock = vi.hoisted(() => vi.fn(() => "asc-order"));

/**
 * Build a chained query stub. Settings reads terminate at .where(); the
 * audit-log read terminates at .limit(). The audit chain records the where()
 * argument so tests can assert the cursor condition that was applied.
 */
function queryChain<T>(result: T, terminalWhere = false) {
  const calls: { whereArg?: unknown; limitArg?: unknown } = {};
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn((arg: unknown) => {
      calls.whereArg = arg;
      return terminalWhere ? Promise.resolve(result) : chain;
    }),
    orderBy: vi.fn(() => chain),
    limit: vi.fn((arg: unknown) => {
      calls.limitArg = arg;
      return Promise.resolve(result);
    }),
    calls,
  };
  return chain;
}

async function loadSiemForward(options: { dataEncryptionKey?: string } = {}) {
  const { dataEncryptionKey = "test-key" } = options;
  vi.resetModules();
  readSiemConfigMock.mockReset();
  deliverWebhookMock.mockReset();
  upsertSettingMock.mockReset();
  decryptMock.mockReset();
  isEncryptedMock.mockReset();
  isFeatureEnabledMock.mockReset();
  isFeatureEnabledMock.mockReturnValue(true);
  selectMock.mockReset();
  gteMock.mockClear();
  ascMock.mockClear();

  vi.doMock("drizzle-orm", () => ({
    asc: ascMock,
    eq: vi.fn(() => "eq"),
    gte: gteMock,
  }));

  vi.doMock("../../../apps/api/src/config.js", () => ({
    env: { DATA_ENCRYPTION_KEY: dataEncryptionKey },
  }));

  vi.doMock("../../../apps/api/src/db/index.js", () => ({
    db: { select: selectMock },
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
      settings: { key: "key", value: "value" },
    },
  }));

  vi.doMock("../../../apps/api/src/lib/encryption.js", () => ({
    decrypt: decryptMock,
    isEncrypted: isEncryptedMock,
  }));

  vi.doMock("../../../apps/api/src/lib/settings-helpers.js", () => ({
    upsertSetting: upsertSettingMock,
  }));

  vi.doMock("../../../apps/api/src/lib/webhook-delivery.js", () => ({
    deliverWebhook: deliverWebhookMock,
  }));

  vi.doMock("../../../apps/api/src/routes/enterprise/siem.js", () => ({
    readSiemConfig: readSiemConfigMock,
  }));

  vi.doMock("@snapotter/enterprise", () => ({ isFeatureEnabled: isFeatureEnabledMock }));

  return import("../../../apps/api/src/jobs/siem-forward.js");
}

/** One audit row with every field populated. */
function auditRow(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date("2026-06-29T12:00:00.000Z"),
    action: "LOGIN_FAILED",
    actorId: "user-1",
    actorUsername: "ada",
    targetType: "session",
    targetId: "session-1",
    ipAddress: "203.0.113.10",
    details: { reason: "bad_password" },
    ...overrides,
  };
}

describe("siem-forward.ts mutation coverage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("license gate", () => {
    it("returns undefined and reads no config when unlicensed", async () => {
      const { runSiemForward } = await loadSiemForward();
      isFeatureEnabledMock.mockReturnValue(false);

      await expect(runSiemForward()).resolves.toBeUndefined();
      expect(readSiemConfigMock).not.toHaveBeenCalled();
    });

    it("checks the siem_forwarding feature specifically", async () => {
      const { runSiemForward } = await loadSiemForward();
      isFeatureEnabledMock.mockReturnValue(false);

      await runSiemForward();

      expect(isFeatureEnabledMock).toHaveBeenCalledWith("siem_forwarding");
    });
  });

  describe("config gate (enabled && webhookUrl)", () => {
    it("returns without reading state when config is disabled", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({
        enabled: false,
        webhookUrl: "https://siem.test",
      });

      await expect(runSiemForward()).resolves.toBeUndefined();
      expect(selectMock).not.toHaveBeenCalled();
    });

    it("returns without reading state when webhookUrl is empty even if enabled", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({ enabled: true, webhookUrl: "" });

      await expect(runSiemForward()).resolves.toBeUndefined();
      expect(selectMock).not.toHaveBeenCalled();
    });

    it("returns without reading state when config is null", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue(null);

      await expect(runSiemForward()).resolves.toBeUndefined();
      expect(selectMock).not.toHaveBeenCalled();
    });

    it("proceeds past the gate only when enabled and a webhookUrl are both present", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({
        enabled: true,
        webhookUrl: "https://siem.test",
      });
      // failure count read, then cursor read, then an empty audit page.
      selectMock
        .mockReturnValueOnce(queryChain([{ value: "0" }], true))
        .mockReturnValueOnce(queryChain([], true))
        .mockReturnValueOnce(queryChain([]));

      await runSiemForward();

      // First state read happened, proving we passed the config gate.
      expect(selectMock).toHaveBeenCalled();
    });
  });

  describe("circuit breaker (failureCount >= 5)", () => {
    async function runWithFailureCount(value: string, rows: ReturnType<typeof auditRow>[] = []) {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({
        enabled: true,
        webhookUrl: "https://siem.test",
        authHeader: "",
      });
      selectMock
        .mockReturnValueOnce(queryChain([{ value }], true))
        .mockReturnValueOnce(queryChain([], true))
        .mockReturnValueOnce(queryChain(rows));
      deliverWebhookMock.mockResolvedValue({ success: true });
      return runSiemForward();
    }

    it("stays open (skips delivery) at exactly 5 failures", async () => {
      await runWithFailureCount("5", [auditRow()]);
      expect(deliverWebhookMock).not.toHaveBeenCalled();
    });

    it("stays closed (attempts delivery) at 4 failures, straddling the >= boundary", async () => {
      const result = await runWithFailureCount("4", [auditRow()]);
      expect(deliverWebhookMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ forwarded: 1 });
    });

    it("treats a missing failure count as 0 and proceeds", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({
        enabled: true,
        webhookUrl: "https://siem.test",
        authHeader: "",
      });
      // First settings read returns no row -> failureCount defaults to 0.
      selectMock
        .mockReturnValueOnce(queryChain([], true))
        .mockReturnValueOnce(queryChain([], true))
        .mockReturnValueOnce(queryChain([auditRow()]));
      deliverWebhookMock.mockResolvedValue({ success: true });

      await runSiemForward();

      expect(deliverWebhookMock).toHaveBeenCalledTimes(1);
    });

    it("parses the failure count in base 10", async () => {
      // "10" must read as ten (>= 5 -> open), not as any other radix.
      await runWithFailureCount("10", [auditRow()]);
      expect(deliverWebhookMock).not.toHaveBeenCalled();
    });
  });

  describe("cursor read and audit query", () => {
    it("applies a gte(createdAt) condition when a cursor exists", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({
        enabled: true,
        webhookUrl: "https://siem.test",
        authHeader: "",
      });
      const auditChain = queryChain([auditRow()]);
      selectMock
        .mockReturnValueOnce(queryChain([{ value: "0" }], true))
        .mockReturnValueOnce(queryChain([{ value: "2026-06-29T11:00:00.000Z" }], true))
        .mockReturnValueOnce(auditChain);
      deliverWebhookMock.mockResolvedValue({ success: true });

      await runSiemForward();

      // gte(createdAt, new Date(cursor)) built the condition, which was passed
      // to where(). A mutant dropping the cursor branch passes undefined.
      expect(gteMock).toHaveBeenCalledWith("createdAt", new Date("2026-06-29T11:00:00.000Z"));
      expect(auditChain.calls.whereArg).toBe("gte-condition");
    });

    it("passes an undefined condition (unbounded) when there is no cursor", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({
        enabled: true,
        webhookUrl: "https://siem.test",
        authHeader: "",
      });
      const auditChain = queryChain([auditRow()]);
      selectMock
        .mockReturnValueOnce(queryChain([{ value: "0" }], true))
        // no cursor row -> cursorDate null -> conditions undefined
        .mockReturnValueOnce(queryChain([], true))
        .mockReturnValueOnce(auditChain);
      deliverWebhookMock.mockResolvedValue({ success: true });

      await runSiemForward();

      expect(gteMock).not.toHaveBeenCalled();
      expect(auditChain.calls.whereArg).toBeUndefined();
    });

    it("orders ascending by createdAt and limits to 500 rows", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({
        enabled: true,
        webhookUrl: "https://siem.test",
        authHeader: "",
      });
      const auditChain = queryChain([auditRow()]);
      selectMock
        .mockReturnValueOnce(queryChain([{ value: "0" }], true))
        .mockReturnValueOnce(queryChain([], true))
        .mockReturnValueOnce(auditChain);
      deliverWebhookMock.mockResolvedValue({ success: true });

      await runSiemForward();

      expect(ascMock).toHaveBeenCalledWith("createdAt");
      expect(auditChain.orderBy).toHaveBeenCalledWith("asc-order");
      expect(auditChain.calls.limitArg).toBe(500);
    });

    it("returns undefined without delivering when no rows match", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({
        enabled: true,
        webhookUrl: "https://siem.test",
        authHeader: "",
      });
      selectMock
        .mockReturnValueOnce(queryChain([{ value: "0" }], true))
        .mockReturnValueOnce(queryChain([], true))
        .mockReturnValueOnce(queryChain([]));

      await expect(runSiemForward()).resolves.toBeUndefined();
      expect(deliverWebhookMock).not.toHaveBeenCalled();
    });
  });

  describe("event payload mapping", () => {
    it("maps each audit row to the exact SIEM event shape", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({
        enabled: true,
        webhookUrl: "https://siem.test/events",
        authHeader: "",
      });
      const rowA = auditRow();
      const rowB = auditRow({
        createdAt: new Date("2026-06-29T12:05:00.000Z"),
        action: "FILE_DELETED",
        actorId: "user-2",
        actorUsername: "grace",
        targetType: "file",
        targetId: "file-9",
        ipAddress: "198.51.100.7",
        details: { name: "secret.pdf" },
      });
      selectMock
        .mockReturnValueOnce(queryChain([{ value: "0" }], true))
        .mockReturnValueOnce(queryChain([], true))
        .mockReturnValueOnce(queryChain([rowA, rowB]));
      deliverWebhookMock.mockResolvedValue({ success: true });

      await runSiemForward();

      expect(deliverWebhookMock).toHaveBeenCalledWith("https://siem.test/events", "", [
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
        {
          timestamp: "2026-06-29T12:05:00.000Z",
          event: "FILE_DELETED",
          actorId: "user-2",
          actorUsername: "grace",
          targetType: "file",
          targetId: "file-9",
          ip: "198.51.100.7",
          details: { name: "secret.pdf" },
        },
      ]);
    });

    it("serializes the timestamp from createdAt via toISOString", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({
        enabled: true,
        webhookUrl: "https://siem.test",
        authHeader: "",
      });
      const row = auditRow({ createdAt: new Date("2026-01-02T03:04:05.678Z") });
      selectMock
        .mockReturnValueOnce(queryChain([{ value: "0" }], true))
        .mockReturnValueOnce(queryChain([], true))
        .mockReturnValueOnce(queryChain([row]));
      deliverWebhookMock.mockResolvedValue({ success: true });

      await runSiemForward();

      const events = deliverWebhookMock.mock.calls[0][2] as { timestamp: string }[];
      expect(events[0].timestamp).toBe("2026-01-02T03:04:05.678Z");
    });
  });

  describe("auth header decryption", () => {
    it("decrypts an encrypted header before delivery", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({
        enabled: true,
        webhookUrl: "https://siem.test",
        authHeader: "$ENC$blob",
      });
      selectMock
        .mockReturnValueOnce(queryChain([{ value: "0" }], true))
        .mockReturnValueOnce(queryChain([], true))
        .mockReturnValueOnce(queryChain([auditRow()]));
      isEncryptedMock.mockReturnValue(true);
      decryptMock.mockResolvedValue("Bearer clear");
      deliverWebhookMock.mockResolvedValue({ success: true });

      await runSiemForward();

      expect(deliverWebhookMock.mock.calls[0][1]).toBe("Bearer clear");
    });

    it("sends the raw header when isEncrypted is false", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({
        enabled: true,
        webhookUrl: "https://siem.test",
        authHeader: "Bearer raw",
      });
      selectMock
        .mockReturnValueOnce(queryChain([{ value: "0" }], true))
        .mockReturnValueOnce(queryChain([], true))
        .mockReturnValueOnce(queryChain([auditRow()]));
      isEncryptedMock.mockReturnValue(false);
      deliverWebhookMock.mockResolvedValue({ success: true });

      await runSiemForward();

      expect(decryptMock).not.toHaveBeenCalled();
      expect(deliverWebhookMock.mock.calls[0][1]).toBe("Bearer raw");
    });

    it("does not decrypt when DATA_ENCRYPTION_KEY is unset", async () => {
      const { runSiemForward } = await loadSiemForward({ dataEncryptionKey: "" });
      readSiemConfigMock.mockResolvedValue({
        enabled: true,
        webhookUrl: "https://siem.test",
        authHeader: "$ENC$blob",
      });
      selectMock
        .mockReturnValueOnce(queryChain([{ value: "0" }], true))
        .mockReturnValueOnce(queryChain([], true))
        .mockReturnValueOnce(queryChain([auditRow()]));
      isEncryptedMock.mockReturnValue(true);
      deliverWebhookMock.mockResolvedValue({ success: true });

      await runSiemForward();

      expect(decryptMock).not.toHaveBeenCalled();
      expect(deliverWebhookMock.mock.calls[0][1]).toBe("$ENC$blob");
    });

    it("falls back to an empty header when decrypt resolves null", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({
        enabled: true,
        webhookUrl: "https://siem.test",
        authHeader: "$ENC$blob",
      });
      selectMock
        .mockReturnValueOnce(queryChain([{ value: "0" }], true))
        .mockReturnValueOnce(queryChain([], true))
        .mockReturnValueOnce(queryChain([auditRow()]));
      isEncryptedMock.mockReturnValue(true);
      decryptMock.mockResolvedValue(null);
      deliverWebhookMock.mockResolvedValue({ success: true });

      await runSiemForward();

      expect(deliverWebhookMock.mock.calls[0][1]).toBe("");
    });

    it("does not attempt decryption when the header is empty", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({
        enabled: true,
        webhookUrl: "https://siem.test",
        authHeader: "",
      });
      selectMock
        .mockReturnValueOnce(queryChain([{ value: "0" }], true))
        .mockReturnValueOnce(queryChain([], true))
        .mockReturnValueOnce(queryChain([auditRow()]));
      deliverWebhookMock.mockResolvedValue({ success: true });

      await runSiemForward();

      expect(isEncryptedMock).not.toHaveBeenCalled();
      expect(decryptMock).not.toHaveBeenCalled();
    });
  });

  describe("success state updates", () => {
    it("advances the cursor to the LAST row timestamp and resets failures", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({
        enabled: true,
        webhookUrl: "https://siem.test",
        authHeader: "",
      });
      const rows = [
        auditRow({ createdAt: new Date("2026-06-29T12:00:00.000Z") }),
        auditRow({ createdAt: new Date("2026-06-29T12:01:00.000Z") }),
        auditRow({ createdAt: new Date("2026-06-29T12:02:30.000Z") }),
      ];
      selectMock
        .mockReturnValueOnce(queryChain([{ value: "3" }], true))
        .mockReturnValueOnce(queryChain([], true))
        .mockReturnValueOnce(queryChain(rows));
      deliverWebhookMock.mockResolvedValue({ success: true });

      const result = await runSiemForward();

      expect(result).toEqual({ forwarded: 3 });
      // Cursor is the LAST (third) row, not the first.
      expect(upsertSettingMock).toHaveBeenCalledWith(
        "siem_last_forwarded_at",
        "2026-06-29T12:02:30.000Z",
      );
      // failureCount was 3 (> 0) so it is reset to "0".
      expect(upsertSettingMock).toHaveBeenCalledWith("siem_consecutive_failures", "0");
    });

    it("does not reset the failure counter when it was already 0", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({
        enabled: true,
        webhookUrl: "https://siem.test",
        authHeader: "",
      });
      selectMock
        .mockReturnValueOnce(queryChain([{ value: "0" }], true))
        .mockReturnValueOnce(queryChain([], true))
        .mockReturnValueOnce(queryChain([auditRow()]));
      deliverWebhookMock.mockResolvedValue({ success: true });

      await runSiemForward();

      // Cursor still advances, but no reset write for a zero counter.
      expect(upsertSettingMock).toHaveBeenCalledTimes(1);
      expect(upsertSettingMock).toHaveBeenCalledWith(
        "siem_last_forwarded_at",
        "2026-06-29T12:00:00.000Z",
      );
      expect(upsertSettingMock).not.toHaveBeenCalledWith("siem_consecutive_failures", "0");
    });

    it("returns the exact forwarded count", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({
        enabled: true,
        webhookUrl: "https://siem.test",
        authHeader: "",
      });
      const rows = [auditRow(), auditRow(), auditRow(), auditRow()];
      selectMock
        .mockReturnValueOnce(queryChain([{ value: "0" }], true))
        .mockReturnValueOnce(queryChain([], true))
        .mockReturnValueOnce(queryChain(rows));
      deliverWebhookMock.mockResolvedValue({ success: true });

      await expect(runSiemForward()).resolves.toEqual({ forwarded: 4 });
    });
  });

  describe("failure state updates", () => {
    it("increments the failure counter by exactly one and returns undefined", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({
        enabled: true,
        webhookUrl: "https://siem.test",
        authHeader: "",
      });
      selectMock
        .mockReturnValueOnce(queryChain([{ value: "4" }], true))
        .mockReturnValueOnce(queryChain([], true))
        .mockReturnValueOnce(queryChain([auditRow()]));
      deliverWebhookMock.mockResolvedValue({ success: false, error: "downstream 500" });

      await expect(runSiemForward()).resolves.toBeUndefined();

      // 4 + 1 = 5; a mutated + would produce a different value.
      expect(upsertSettingMock).toHaveBeenCalledWith("siem_consecutive_failures", "5");
      // A failure must not advance the cursor.
      expect(upsertSettingMock).not.toHaveBeenCalledWith(
        "siem_last_forwarded_at",
        expect.anything(),
      );
    });

    it("increments from zero to one on the first failure", async () => {
      const { runSiemForward } = await loadSiemForward();
      readSiemConfigMock.mockResolvedValue({
        enabled: true,
        webhookUrl: "https://siem.test",
        authHeader: "",
      });
      selectMock
        .mockReturnValueOnce(queryChain([{ value: "0" }], true))
        .mockReturnValueOnce(queryChain([], true))
        .mockReturnValueOnce(queryChain([auditRow()]));
      deliverWebhookMock.mockResolvedValue({ success: false, error: "boom" });

      await runSiemForward();

      expect(upsertSettingMock).toHaveBeenCalledWith("siem_consecutive_failures", "1");
    });
  });
});
