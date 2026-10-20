import { afterEach, describe, expect, it, vi } from "vitest";

// The code under test logs through the API's pino logger (#1500); mock it,
// since config.js is stubbed without LOG_DIR, and read the calls from it.
const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

function loggerCalls(level: "info" | "warn" | "error") {
  loggerMock[level].mockClear();
  return loggerMock[level];
}

const readSiemConfigMock = vi.hoisted(() => vi.fn());
const deliverWebhookMock = vi.hoisted(() => vi.fn());
const upsertSettingMock = vi.hoisted(() => vi.fn());
const decryptSettingMock = vi.hoisted(() => vi.fn());
const isFeatureEnabledMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const updatesRecorded = vi.hoisted(
  () => [] as Array<{ set: Record<string, unknown>; where: unknown }>,
);
const reportErrorMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

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
  decryptSettingMock.mockReset();
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

  vi.doMock("drizzle-orm", () => ({
    and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
    asc: vi.fn(() => "asc"),
    eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
    gte: vi.fn(() => "gte"),
  }));

  vi.doMock("../../../../apps/api/src/db/index.js", () => ({
    db: {
      select: selectMock,
      update: updateMock,
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

  // restoreAllMocks() keeps a vi.fn()'s calls, so start each load with none.
  for (const fn of Object.values(loggerMock)) fn.mockClear();
  vi.doMock("../../../../apps/api/src/lib/logger.js", () => ({ logger: loggerMock }));

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
    const warn = loggerCalls("warn");

    await expect(runSiemForward()).resolves.toBeUndefined();

    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(deliverWebhookMock).not.toHaveBeenCalled();
    // Goes through pino, so it reaches LOG_DIR and the support bundle (#1500).
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("SIEM forwarding circuit breaker open: 5 consecutive failures"),
    );
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
    decryptSettingMock.mockResolvedValue("Bearer clear");
    deliverWebhookMock.mockResolvedValue({ success: true });

    await expect(runSiemForward()).resolves.toEqual({ forwarded: 1 });

    expect(decryptSettingMock).toHaveBeenCalledWith("enc:auth");
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
    expect(updatesRecorded).toHaveLength(0);
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
    deliverWebhookMock.mockResolvedValue({
      success: false,
      statusCode: 503,
      error: "downstream 500",
      attempts: 4,
    });
    const error = loggerCalls("error");

    await expect(runSiemForward()).resolves.toBeUndefined();

    expect(upsertSettingMock).toHaveBeenCalledWith("siem_consecutive_failures", "5");
    expect(error).toHaveBeenCalledWith(
      { statusCode: 503, error: "downstream 500", attempts: 4 },
      "SIEM forwarding failed (attempt 5/5): downstream 500",
    );
  });

  it("warns on a corrupt siem_consecutive_failures value, resets it on success, and increments from 0 on failure (#3105)", async () => {
    const { runSiemForward } = await loadSiemForward();
    readSiemConfigMock.mockResolvedValue({
      enabled: true,
      webhookUrl: "https://siem.test/events",
      authHeader: "",
    });
    selectMock
      .mockReturnValueOnce(queryChain([{ value: "corrupt" }], true))
      .mockReturnValueOnce(queryChain([], true))
      .mockReturnValueOnce(
        queryChain([
          {
            createdAt: new Date("2026-06-29T12:00:00.000Z"),
            action: "LOGIN_FAILED",
          },
        ]),
      );
    deliverWebhookMock.mockResolvedValueOnce({ success: true, statusCode: 200, attempts: 1 });
    const warn = loggerCalls("warn");

    await expect(runSiemForward()).resolves.toEqual({ forwarded: 1 });

    expect(warn).toHaveBeenCalledWith(
      { key: "siem_consecutive_failures" },
      "siem-forward: stored siem_consecutive_failures is not a valid non-negative integer",
    );
    expect(upsertSettingMock).toHaveBeenCalledWith("siem_consecutive_failures", "0");

    upsertSettingMock.mockClear();
    warn.mockClear();
    selectMock
      .mockReturnValueOnce(queryChain([{ value: "corrupt" }], true))
      .mockReturnValueOnce(queryChain([], true))
      .mockReturnValueOnce(
        queryChain([
          {
            createdAt: new Date("2026-06-29T12:05:00.000Z"),
            action: "FILE_DELETED",
          },
        ]),
      );
    deliverWebhookMock.mockResolvedValueOnce({
      success: false,
      statusCode: 502,
      error: "HTTP 502",
      attempts: 4,
    });

    await expect(runSiemForward()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      { key: "siem_consecutive_failures" },
      "siem-forward: stored siem_consecutive_failures is not a valid non-negative integer",
    );
    expect(upsertSettingMock).toHaveBeenCalledWith("siem_consecutive_failures", "1");
  });

  it("warns and falls back to an unbounded cursor when siem_last_forwarded_at is invalid (#3105)", async () => {
    const { runSiemForward } = await loadSiemForward();
    readSiemConfigMock.mockResolvedValue({
      enabled: true,
      webhookUrl: "https://siem.test/events",
      authHeader: "",
    });
    const auditChain = queryChain([
      {
        createdAt: new Date("2026-06-29T12:00:00.000Z"),
        action: "LOGIN_FAILED",
      },
    ]);
    selectMock
      .mockReturnValueOnce(queryChain([{ value: "0" }], true))
      .mockReturnValueOnce(queryChain([{ value: "not-a-date" }], true))
      .mockReturnValueOnce(auditChain);
    deliverWebhookMock.mockResolvedValueOnce({ success: true, statusCode: 200, attempts: 1 });
    const warn = loggerCalls("warn");

    await expect(runSiemForward()).resolves.toEqual({ forwarded: 1 });

    expect(warn).toHaveBeenCalledWith(
      { key: "siem_last_forwarded_at" },
      "siem-forward: stored siem_last_forwarded_at is not a valid timestamp",
    );
    expect(auditChain.where).toHaveBeenCalledWith(undefined);
    expect(upsertSettingMock).toHaveBeenCalledWith(
      "siem_last_forwarded_at",
      "2026-06-29T12:00:00.000Z",
    );
  });

  it("re-encrypts a rotated siem_config authHeader with a compare-and-swap (#2843)", async () => {
    const { runSiemForward } = await loadSiemForward();
    const rawConfig = JSON.stringify({
      webhookUrl: "https://siem.test/events",
      authHeader: "$ENC$old",
      flushIntervalSeconds: 30,
      enabled: true,
    });
    readSiemConfigMock.mockResolvedValue(JSON.parse(rawConfig));
    selectMock
      .mockReturnValueOnce(queryChain([{ value: "0" }], true))
      .mockReturnValueOnce(queryChain([], true))
      .mockReturnValueOnce(
        queryChain([
          {
            createdAt: new Date("2026-06-29T12:00:00.000Z"),
            action: "LOGIN_FAILED",
          },
        ]),
      )
      .mockReturnValueOnce(queryChain([{ value: rawConfig }], true));
    decryptSettingMock.mockResolvedValue({
      value: "Bearer rotated-siem",
      reencrypted: "$ENC$new",
    });
    deliverWebhookMock.mockResolvedValue({ success: true });

    await expect(runSiemForward()).resolves.toEqual({ forwarded: 1 });

    expect(deliverWebhookMock).toHaveBeenCalledWith(
      "https://siem.test/events",
      "Bearer rotated-siem",
      expect.any(Array),
    );
    expect(updatesRecorded).toHaveLength(1);
    expect(JSON.parse(updatesRecorded[0].set.value as string)).toEqual({
      webhookUrl: "https://siem.test/events",
      authHeader: "$ENC$new",
      flushIntervalSeconds: 30,
      enabled: true,
    });
    expect(updatesRecorded[0].where).toEqual({
      op: "and",
      args: [
        { op: "eq", col: "key", val: "siem_config" },
        { op: "eq", col: "value", val: rawConfig },
      ],
    });
  });

  it("skips siem_config rotation writeback when a concurrent update changed authHeader (#2843)", async () => {
    const { runSiemForward } = await loadSiemForward();
    readSiemConfigMock.mockResolvedValue({
      webhookUrl: "https://siem.test/events",
      authHeader: "$ENC$old",
      flushIntervalSeconds: 30,
      enabled: true,
    });
    const concurrentConfig = JSON.stringify({
      webhookUrl: "https://siem.test/events",
      authHeader: "$ENC$concurrently-updated",
      flushIntervalSeconds: 60,
      enabled: true,
    });
    selectMock
      .mockReturnValueOnce(queryChain([{ value: "0" }], true))
      .mockReturnValueOnce(queryChain([], true))
      .mockReturnValueOnce(
        queryChain([
          {
            createdAt: new Date("2026-06-29T12:00:00.000Z"),
            action: "LOGIN_FAILED",
          },
        ]),
      )
      .mockReturnValueOnce(queryChain([{ value: concurrentConfig }], true));
    decryptSettingMock.mockResolvedValue({
      value: "Bearer rotated-siem",
      reencrypted: "$ENC$new",
    });
    deliverWebhookMock.mockResolvedValue({ success: true });

    await expect(runSiemForward()).resolves.toEqual({ forwarded: 1 });
    expect(updatesRecorded).toHaveLength(0);
  });

  it("logs a warning on malformed siem_config JSON during rotation writeback and lets db.update errors propagate (#2843)", async () => {
    const { runSiemForward } = await loadSiemForward();
    readSiemConfigMock.mockResolvedValue({
      webhookUrl: "https://siem.test/events",
      authHeader: "$ENC$old",
      flushIntervalSeconds: 30,
      enabled: true,
    });
    selectMock
      .mockReturnValueOnce(queryChain([{ value: "0" }], true))
      .mockReturnValueOnce(queryChain([], true))
      .mockReturnValueOnce(
        queryChain([
          {
            createdAt: new Date("2026-06-29T12:00:00.000Z"),
            action: "LOGIN_FAILED",
          },
        ]),
      )
      .mockReturnValueOnce(queryChain([{ value: "{corrupted" }], true));
    decryptSettingMock.mockResolvedValue({
      value: "Bearer rotated-siem",
      reencrypted: "$ENC$new",
    });
    deliverWebhookMock.mockResolvedValue({ success: true });
    const warn = loggerCalls("warn");

    await expect(runSiemForward()).resolves.toEqual({ forwarded: 1 });
    expect(updatesRecorded).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ key: "siem_config" }),
      expect.stringContaining("siem_config JSON"),
    );

    // A database error during the rotation writeback must propagate rather than being caught
    const rawConfig = JSON.stringify({
      webhookUrl: "https://siem.test/events",
      authHeader: "$ENC$old",
      flushIntervalSeconds: 30,
      enabled: true,
    });
    selectMock
      .mockReturnValueOnce(queryChain([{ value: "0" }], true))
      .mockReturnValueOnce(queryChain([], true))
      .mockReturnValueOnce(
        queryChain([
          {
            createdAt: new Date("2026-06-29T12:00:00.000Z"),
            action: "LOGIN_FAILED",
          },
        ]),
      )
      .mockReturnValueOnce(queryChain([{ value: rawConfig }], true));
    updateMock.mockImplementationOnce(() => ({
      set: () => ({
        where: () => Promise.reject(new Error("db writeback failed")),
      }),
    }));

    await expect(runSiemForward()).rejects.toThrow("db writeback failed");
  });
});
