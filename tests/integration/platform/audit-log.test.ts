import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { auditLog } from "../../../apps/api/src/lib/audit.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

describe("audit log", () => {
  it("records login events in database", async () => {
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "Adminpass1" },
    });

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/audit-log",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.entries).toBeDefined();
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.entries.some((e: any) => e.action === "LOGIN_SUCCESS")).toBe(true);
  });

  it("requires audit:read permission", async () => {
    await testApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: "auditnoread",
        password: "AuditTest1",
        role: "user",
      },
    });
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "auditnoread"));

    const loginRes = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "auditnoread", password: "AuditTest1" },
    });
    const userToken = JSON.parse(loginRes.body).token;

    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/audit-log",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("supports pagination", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/audit-log?limit=2&page=1",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.entries.length).toBeLessThanOrEqual(2);
    expect(body.total).toBeDefined();
    expect(body.page).toBe(1);
    expect(body.limit).toBe(2);
  });

  it("supports action filter", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/audit-log?action=LOGIN_SUCCESS",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(res.body);
    for (const entry of body.entries) {
      expect(entry.action).toBe("LOGIN_SUCCESS");
    }
  });

  it("computes HMAC integrity on corrupt non-'false' tamperResistantAudit rows and skips it on 'false' (#3233)", async () => {
    const prevKey = env.DATA_ENCRYPTION_KEY;
    const warnSpy = vi.spyOn(testApp.app.log, "warn");
    try {
      env.DATA_ENCRYPTION_KEY = "a".repeat(64);
      await db
        .insert(schema.settings)
        .values({ key: "tamperResistantAudit", value: "TRUE" })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value: "TRUE", updatedAt: new Date() },
        });

      await auditLog(testApp.app.log, "USER_LOGIN_CORRUPT_TAMPER_3233", {
        username: "admin",
      });

      const [corruptRow] = await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, "USER_LOGIN_CORRUPT_TAMPER_3233"));
      expect(corruptRow?.integrity).toMatch(/^[0-9a-f]{64}$/);
      expect(warnSpy).toHaveBeenCalledWith(
        { key: "tamperResistantAudit", value: "TRUE" },
        "invalid boolean setting, treating tamperResistantAudit as enabled",
      );

      warnSpy.mockClear();
      await db
        .update(schema.settings)
        .set({ value: "false", updatedAt: new Date() })
        .where(eq(schema.settings.key, "tamperResistantAudit"));

      await auditLog(testApp.app.log, "USER_LOGIN_FALSE_TAMPER_3233", {
        username: "admin",
      });

      const [falseRow] = await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, "USER_LOGIN_FALSE_TAMPER_3233"));
      expect(falseRow?.integrity).toBeNull();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      env.DATA_ENCRYPTION_KEY = prevKey;
      await db
        .delete(schema.settings)
        .where(eq(schema.settings.key, "tamperResistantAudit"))
        .catch(() => {});
      await db
        .delete(schema.auditLog)
        .where(eq(schema.auditLog.action, "USER_LOGIN_CORRUPT_TAMPER_3233"))
        .catch(() => {});
      await db
        .delete(schema.auditLog)
        .where(eq(schema.auditLog.action, "USER_LOGIN_FALSE_TAMPER_3233"))
        .catch(() => {});
    }
  });
});
