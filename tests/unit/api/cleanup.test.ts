import { afterEach, describe, expect, it, vi } from "vitest";

const selectWhereMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: {
    FILE_MAX_AGE_HOURS: 72,
  },
}));

vi.mock("../../../apps/api/src/lib/logger.js", () => ({
  logger: {
    error: loggerErrorMock,
  },
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: selectWhereMock,
      }),
    })),
  },
  schema: {
    settings: {
      key: "settings.key",
    },
  },
}));

import { eq } from "drizzle-orm";
import { getMaxAgeMs, shouldRunStartupCleanup } from "../../../apps/api/src/lib/cleanup.js";

describe("getMaxAgeMs (#1525)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the stored tempFileMaxAgeHours setting in milliseconds", async () => {
    selectWhereMock.mockResolvedValueOnce([{ key: "tempFileMaxAgeHours", value: "168" }]);

    await expect(getMaxAgeMs()).resolves.toBe(168 * 60 * 60 * 1000);
    expect(eq).toHaveBeenCalledWith("settings.key", "tempFileMaxAgeHours");
  });

  it("supports fractional hours", async () => {
    selectWhereMock.mockResolvedValueOnce([{ key: "tempFileMaxAgeHours", value: "0.5" }]);

    await expect(getMaxAgeMs()).resolves.toBe(0.5 * 60 * 60 * 1000);
  });

  it("falls back to FILE_MAX_AGE_HOURS when no setting row is stored", async () => {
    selectWhereMock.mockResolvedValueOnce([]);

    await expect(getMaxAgeMs()).resolves.toBe(72 * 60 * 60 * 1000);
  });

  it.each(["notanumber", "0", "-5"])(
    "falls back to FILE_MAX_AGE_HOURS when the stored value is %j",
    async (value) => {
      selectWhereMock.mockResolvedValueOnce([{ key: "tempFileMaxAgeHours", value }]);

      await expect(getMaxAgeMs()).resolves.toBe(72 * 60 * 60 * 1000);
    },
  );

  it("propagates a database read error instead of falling back to FILE_MAX_AGE_HOURS", async () => {
    const dbError = new Error("connection terminated unexpectedly");
    selectWhereMock.mockRejectedValueOnce(dbError);

    await expect(getMaxAgeMs()).rejects.toThrow(dbError);
  });
});

describe("shouldRunStartupCleanup (#2719)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when startupCleanup is set to 'false'", async () => {
    selectWhereMock.mockResolvedValueOnce([{ key: "startupCleanup", value: "false" }]);

    await expect(shouldRunStartupCleanup()).resolves.toBe(false);
    expect(eq).toHaveBeenCalledWith("settings.key", "startupCleanup");
  });

  it("returns true when startupCleanup is not set", async () => {
    selectWhereMock.mockResolvedValueOnce([]);

    await expect(shouldRunStartupCleanup()).resolves.toBe(true);
  });

  it.each(["true", "yes", "1"])("returns true when startupCleanup is set to %j", async (value) => {
    selectWhereMock.mockResolvedValueOnce([{ key: "startupCleanup", value }]);

    await expect(shouldRunStartupCleanup()).resolves.toBe(true);
  });

  it("logs the error and returns false when reading startupCleanup fails", async () => {
    const dbError = new Error("connection terminated unexpectedly");
    selectWhereMock.mockRejectedValueOnce(dbError);

    await expect(shouldRunStartupCleanup()).resolves.toBe(false);
    expect(loggerErrorMock).toHaveBeenCalledWith(
      { err: dbError },
      "Startup cleanup: startupCleanup read failed; skipping startup sweep",
    );
  });
});
