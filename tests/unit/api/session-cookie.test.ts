import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { schema } from "../../../apps/api/src/db/index.js";

const settingsState = vi.hoisted(() => ({
  raw: undefined as string | undefined,
  error: null as Error | null,
}));

const loggerWarn = vi.hoisted(() => vi.fn());

vi.mock("../../../apps/api/src/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/config.js")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      BASE_PATH: "",
      EXTERNAL_URL: "http://localhost:13490",
      SESSION_DURATION_HOURS: 24,
    },
  };
});

vi.mock("../../../apps/api/src/lib/logger.js", () => ({
  logger: {
    warn: loggerWarn,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../../apps/api/src/lib/settings-helpers.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/settings-helpers.js")>();
  return {
    ...actual,
    getSettingStrict: async (key: string) => {
      expect(key).toBe("maxSessionsPerUser");
      if (settingsState.error) throw settingsState.error;
      return settingsState.raw;
    },
  };
});

import {
  evictExcessUserSessions,
  readMaxSessionsPerUser,
  setSessionCookie,
} from "../../../apps/api/src/lib/session-cookie.js";

describe("session-cookie helpers", () => {
  describe("setSessionCookie", () => {
    it("is a no-op when reply has no setCookie method", () => {
      expect(() => setSessionCookie({} as never, {} as never, "tok-1")).not.toThrow();
    });

    it("sets snapotter-session cookie with strict sameSite and httpOnly", () => {
      const setCookie = vi.fn();
      const req = { protocol: "https", headers: {} } as never;
      setSessionCookie(req, { setCookie } as never, "tok-2");
      expect(setCookie).toHaveBeenCalledWith("snapotter-session", "tok-2", {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        secure: true,
        maxAge: 24 * 3600,
      });
    });
  });

  describe("readMaxSessionsPerUser", () => {
    it("returns 0 when maxSessionsPerUser is unset or invalid", async () => {
      settingsState.error = null;
      settingsState.raw = undefined;
      expect(await readMaxSessionsPerUser()).toBe(0);

      settingsState.raw = "-5";
      expect(await readMaxSessionsPerUser()).toBe(0);
    });

    it("returns the parsed integer when maxSessionsPerUser is valid", async () => {
      settingsState.error = null;
      settingsState.raw = "3";
      expect(await readMaxSessionsPerUser()).toBe(3);
    });

    it("propagates a database fault from getSettingStrict", async () => {
      settingsState.error = new Error("settings read failed");
      await expect(readMaxSessionsPerUser()).rejects.toThrow("settings read failed");
      settingsState.error = null;
    });
  });

  describe("evictExcessUserSessions", () => {
    it("skips querying sessions when maxSessions is 0 or negative", async () => {
      const select = vi.fn();
      const del = vi.fn();
      const tx = { select, delete: del } as never;

      await evictExcessUserSessions(tx, "user-1", 0);
      await evictExcessUserSessions(tx, "user-1", -1);

      expect(select).not.toHaveBeenCalled();
      expect(del).not.toHaveBeenCalled();
    });

    it("does not delete any rows when active sessions do not exceed maxSessions", async () => {
      const orderBy = vi.fn().mockResolvedValue([
        { id: "s1", createdAt: new Date(1000) },
        { id: "s2", createdAt: new Date(2000) },
      ]);
      const where = vi.fn(() => ({ orderBy }));
      const from = vi.fn(() => ({ where }));
      const select = vi.fn(() => ({ from }));
      const del = vi.fn();
      const tx = { select, delete: del } as never;

      await evictExcessUserSessions(tx, "user-1", 2);

      expect(select).toHaveBeenCalledTimes(1);
      expect(del).not.toHaveBeenCalled();
    });

    it("deletes the oldest excess rows in createdAt order when count exceeds maxSessions", async () => {
      const orderBy = vi.fn().mockResolvedValue([
        { id: "s1", createdAt: new Date(1000) },
        { id: "s2", createdAt: new Date(2000) },
        { id: "s3", createdAt: new Date(3000) },
      ]);
      const selectWhere = vi.fn((_cond: SQL) => ({ orderBy }));
      const from = vi.fn(() => ({ where: selectWhere }));
      const select = vi.fn(() => ({ from }));
      const deleteWhere = vi.fn(async (_cond: SQL) => undefined);
      const del = vi.fn(() => ({ where: deleteWhere }));
      const tx = { select, delete: del } as never;

      await evictExcessUserSessions(tx, "user-1", 1);

      const dialect = new PgDialect();
      expect(dialect.sqlToQuery(selectWhere.mock.calls[0][0]).params).toEqual(["user-1"]);
      expect(del).toHaveBeenCalledTimes(2);
      expect(del).toHaveBeenNthCalledWith(1, schema.sessions);
      expect(del).toHaveBeenNthCalledWith(2, schema.sessions);
      const deletedIds = deleteWhere.mock.calls.map(
        (call) => dialect.sqlToQuery(call[0]).params[0],
      );
      expect(deletedIds).toEqual(["s1", "s2"]);
    });
  });
});
