/**
 * Unit tests for settings route handlers.
 *
 * Tests the GET all settings, PUT upsert settings, and GET single setting
 * logic including HTML tag validation, auth requirements, and error handling.
 */
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

describe("settings route logic", () => {
  async function loadSettingsModule() {
    vi.resetModules();
    const upsertedEntries: Array<{ key: string; value: string }> = [];

    vi.doMock("drizzle-orm", () => ({
      and: (...args: unknown[]) => ({ op: "and", args }),
      eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
        op: "sql",
        strings: [...strings],
        values,
      }),
    }));
    vi.doMock("../../../apps/api/src/config.js", () => ({
      env: {
        DATA_ENCRYPTION_KEY: "",
        DATA_ENCRYPTION_KEY_PREVIOUS: "",
        OIDC_ENABLED: false,
        SAML_ENABLED: false,
      },
    }));

    const txHandle = {
      insert: () => ({
        values: (vals: { key: string; value: string }) => ({
          onConflictDoUpdate: () => {
            upsertedEntries.push({ key: vals.key, value: vals.value });
            return Promise.resolve();
          },
        }),
      }),
      delete: () => ({
        where: () => Promise.resolve(),
      }),
    };

    vi.doMock("../../../apps/api/src/db/index.js", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([]),
          }),
        }),
        transaction: async (cb: (tx: typeof txHandle) => Promise<unknown>) => cb(txHandle),
      },
      schema: { settings: { key: "settings.key", value: "settings.value" } },
    }));
    vi.doMock("../../../apps/api/src/permissions.js", () => ({
      requirePermission: () => async () => ({ id: "admin-1", username: "admin", role: "admin" }),
      getEffectivePermissions: async () => ["settings:read", "settings:write", "security:manage"],
      isFullEffectiveAdmin: async () => true,
    }));
    vi.doMock("../../../apps/api/src/lib/audit.js", () => ({
      auditFromRequest: () => async () => {},
    }));

    const mod = await import("../../../apps/api/src/routes/settings.js");
    return { ...mod, upsertedEntries };
  }

  describe("settingsBodySchema validation", () => {
    it("rejects null and array bodies", async () => {
      const { settingsBodySchema } = await loadSettingsModule();
      expect(settingsBodySchema.safeParse(null).success).toBe(false);
      expect(settingsBodySchema.safeParse([]).success).toBe(false);
    });

    it("rejects empty-string keys via z.string().min(1)", async () => {
      const { settingsBodySchema } = await loadSettingsModule();
      expect(settingsBodySchema.safeParse({ "": "dark" }).success).toBe(false);
    });

    it("accepts non-empty key-value objects and empty objects", async () => {
      const { settingsBodySchema } = await loadSettingsModule();
      expect(settingsBodySchema.safeParse({ defaultTheme: "dark" }).success).toBe(true);
      expect(settingsBodySchema.safeParse({}).success).toBe(true);
    });
  });

  describe("PUT /api/v1/settings validation and HTML tag rejection", () => {
    it("rejects array bodies with 400 VALIDATION_ERROR", async () => {
      const { settingsRoutes } = await loadSettingsModule();
      const app = Fastify();
      await settingsRoutes(app);
      await app.ready();
      try {
        const res = await app.inject({
          method: "PUT",
          url: "/api/v1/settings",
          payload: ["not", "an", "object"],
        });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({
          error: "Request body must be a JSON object with key-value pairs",
          code: "VALIDATION_ERROR",
        });
      } finally {
        await app.close();
        vi.restoreAllMocks();
      }
    });

    it("rejects HTML tags in keys and values with 400 VALIDATION_ERROR", async () => {
      const { settingsRoutes } = await loadSettingsModule();
      const app = Fastify();
      await settingsRoutes(app);
      await app.ready();
      try {
        const keyTagRes = await app.inject({
          method: "PUT",
          url: "/api/v1/settings",
          payload: { "<script>alert(1)</script>": "dark" },
        });
        expect(keyTagRes.statusCode).toBe(400);
        expect(keyTagRes.json()).toEqual({
          error: "Settings keys and values must not contain HTML tags",
          code: "VALIDATION_ERROR",
        });

        const valTagRes = await app.inject({
          method: "PUT",
          url: "/api/v1/settings",
          payload: { defaultTheme: "<img src=x onerror=alert(1)>" },
        });
        expect(valTagRes.statusCode).toBe(400);
        expect(valTagRes.json()).toEqual({
          error: "Settings keys and values must not contain HTML tags",
          code: "VALIDATION_ERROR",
        });

        const midTagRes = await app.inject({
          method: "PUT",
          url: "/api/v1/settings",
          payload: { oidc_issuer_url: "before <div>inside</div> after" },
        });
        expect(midTagRes.statusCode).toBe(400);
        expect(midTagRes.json()).toEqual({
          error: "Settings keys and values must not contain HTML tags",
          code: "VALIDATION_ERROR",
        });

        const objTagRes = await app.inject({
          method: "PUT",
          url: "/api/v1/settings",
          payload: { disabledTools: ["<script>alert(1)</script>"] },
        });
        expect(objTagRes.statusCode).toBe(400);
        expect(objTagRes.json()).toEqual({
          error: "Settings keys and values must not contain HTML tags",
          code: "VALIDATION_ERROR",
        });
      } finally {
        await app.close();
        vi.restoreAllMocks();
      }
    });

    it("accepts valid policy keys, coerces boolean/number values via prepareSetting, and rejects unknown or readonly keys", async () => {
      const { settingsRoutes, upsertedEntries } = await loadSettingsModule();
      const app = Fastify();
      await settingsRoutes(app);
      await app.ready();
      try {
        const okRes = await app.inject({
          method: "PUT",
          url: "/api/v1/settings",
          payload: {
            defaultTheme: "dark",
            defaultLocale: "en",
            passwordMinLength: 14,
            passwordRequireUppercase: true,
          },
        });
        expect(okRes.statusCode).toBe(200);
        expect(okRes.json()).toEqual({ ok: true, updatedCount: 4 });
        expect(upsertedEntries).toEqual([
          { key: "defaultLocale", value: "en" },
          { key: "defaultTheme", value: "dark" },
          { key: "passwordMinLength", value: "14" },
          { key: "passwordRequireUppercase", value: "true" },
        ]);

        upsertedEntries.length = 0;

        const unknownRes = await app.inject({
          method: "PUT",
          url: "/api/v1/settings",
          payload: { defaultTheme: "light", theme: "dark" },
        });
        expect(unknownRes.statusCode).toBe(400);
        expect(unknownRes.json()).toMatchObject({
          code: "UNKNOWN_SETTING",
          setting: "theme",
        });

        const readonlyRes = await app.inject({
          method: "PUT",
          url: "/api/v1/settings",
          payload: { defaultTheme: "light", instance_id: "custom-instance" },
        });
        expect(readonlyRes.statusCode).toBe(400);
        expect(readonlyRes.json()).toEqual({
          error: 'Setting "instance_id" cannot be modified via the API',
          code: "READONLY_SETTING",
        });

        const duplicateAliasRes = await app.inject({
          method: "PUT",
          url: "/api/v1/settings",
          payload: {
            passwordRequireDigit: "true",
            passwordRequireNumber: "false",
          },
        });
        expect(duplicateAliasRes.statusCode).toBe(400);
        expect(duplicateAliasRes.json()).toEqual({
          error:
            'Setting "passwordRequireNumber" duplicates "passwordRequireDigit" in the same request',
          code: "VALIDATION_ERROR",
        });
        expect(upsertedEntries).toEqual([]);
      } finally {
        await app.close();
        vi.restoreAllMocks();
      }
    });
  });

  describe("HTML_TAG_PATTERN regex", () => {
    it("matches <script>, <img>, closing tags, HTML comments, and <?xml?> processing instructions", async () => {
      const { HTML_TAG_PATTERN } = await loadSettingsModule();
      expect(HTML_TAG_PATTERN.test("<script>")).toBe(true);
      expect(HTML_TAG_PATTERN.test("<img src=x>")).toBe(true);
      expect(HTML_TAG_PATTERN.test("</div>")).toBe(true);
      expect(HTML_TAG_PATTERN.test("<!-- comment -->")).toBe(true);
      expect(HTML_TAG_PATTERN.test("<?xml version='1.0'?>")).toBe(true);
    });

    it("does not match plain text, empty strings, or angle brackets with spaces", async () => {
      const { HTML_TAG_PATTERN } = await loadSettingsModule();
      expect(HTML_TAG_PATTERN.test("hello world")).toBe(false);
      expect(HTML_TAG_PATTERN.test("")).toBe(false);
      expect(HTML_TAG_PATTERN.test("5 > 3")).toBe(false);
      expect(HTML_TAG_PATTERN.test("a > b && c < d")).toBe(false);
    });
  });
});

describe("settingsRoutes decryption failure handling (#2534)", () => {
  it("omits undecryptable $ENC$ rows from GET /api/v1/settings, logs, and reports an operational SafeError", async () => {
    vi.resetModules();
    const reportErrorSpy = vi.fn().mockResolvedValue(undefined);
    const errorLogSpy = vi.fn();

    vi.doMock("drizzle-orm", () => ({
      eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
    }));
    vi.doMock("../../../apps/api/src/config.js", () => ({
      env: {
        DATA_ENCRYPTION_KEY: "b".repeat(64),
        DATA_ENCRYPTION_KEY_PREVIOUS: "",
        OIDC_ENABLED: false,
        SAML_ENABLED: false,
      },
    }));
    vi.doMock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
      const actual: Record<string, unknown> = await importOriginal();
      return { ...actual, reportError: reportErrorSpy };
    });

    const { encrypt } = await import("../../../apps/api/src/lib/encryption.js");
    const { classifyError } = await import("../../../apps/api/src/lib/error-report.js");
    const wrongKeyCiphertext = await encrypt("dark", "a".repeat(64));

    vi.doMock("../../../apps/api/src/db/index.js", () => ({
      db: {
        select: () => ({
          from: () =>
            Promise.resolve([
              { key: "defaultTheme", value: wrongKeyCiphertext, updatedAt: new Date() },
              { key: "defaultLocale", value: "en", updatedAt: new Date() },
            ]),
        }),
      },
      schema: { settings: { key: "settings.key" } },
    }));
    vi.doMock("../../../apps/api/src/permissions.js", () => ({
      requirePermission: () => async () => ({ id: "admin-1", username: "admin", role: "admin" }),
      getEffectivePermissions: async () => ["settings:read", "settings:write"],
      isFullEffectiveAdmin: async () => true,
    }));
    vi.doMock("../../../apps/api/src/lib/audit.js", () => ({
      auditFromRequest: () => async () => {},
    }));

    const { settingsRoutes } = await import("../../../apps/api/src/routes/settings.js");
    const app = Fastify();
    await settingsRoutes(app);
    await app.ready();
    vi.spyOn(app.log, "error").mockImplementation(errorLogSpy);

    try {
      const res = await app.inject({ method: "GET", url: "/api/v1/settings" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ settings: { defaultLocale: "en" } });
      expect(res.body).not.toContain("$ENC$");
      expect(errorLogSpy).toHaveBeenCalledWith(
        { key: "defaultTheme" },
        expect.stringContaining("DATA_ENCRYPTION_KEY"),
      );
      expect(reportErrorSpy).toHaveBeenCalledTimes(1);
      const [err, ctx] = reportErrorSpy.mock.calls[0];
      expect(classifyError(err, "http")).toBe("operational");
      expect(err).toMatchObject({ code: "SETTING_DECRYPTION_FAILED", statusCode: 500 });
      expect(ctx).toMatchObject({
        source: "http",
        route: "/api/v1/settings",
        method: "GET",
        statusCode: 500,
        subsystem: "settings",
      });
    } finally {
      await app.close();
      vi.restoreAllMocks();
    }
  });

  it("returns 500 DECRYPTION_FAILED on GET /api/v1/settings/:key when decryptSetting returns null", async () => {
    vi.resetModules();
    const reportErrorSpy = vi.fn().mockResolvedValue(undefined);
    const errorLogSpy = vi.fn();

    vi.doMock("drizzle-orm", () => ({
      eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
    }));
    vi.doMock("../../../apps/api/src/config.js", () => ({
      env: {
        DATA_ENCRYPTION_KEY: "",
        DATA_ENCRYPTION_KEY_PREVIOUS: "",
        OIDC_ENABLED: false,
        SAML_ENABLED: false,
      },
    }));
    vi.doMock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
      const actual: Record<string, unknown> = await importOriginal();
      return { ...actual, reportError: reportErrorSpy };
    });

    const { encrypt } = await import("../../../apps/api/src/lib/encryption.js");
    const { classifyError } = await import("../../../apps/api/src/lib/error-report.js");
    const ciphertext = await encrypt("dark", "a".repeat(64));

    vi.doMock("../../../apps/api/src/db/index.js", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () =>
              Promise.resolve([{ key: "defaultTheme", value: ciphertext, updatedAt: new Date() }]),
          }),
        }),
      },
      schema: { settings: { key: "settings.key" } },
    }));
    vi.doMock("../../../apps/api/src/permissions.js", () => ({
      requirePermission: () => async () => ({ id: "admin-1", username: "admin", role: "admin" }),
      getEffectivePermissions: async () => ["settings:read", "settings:write"],
      isFullEffectiveAdmin: async () => true,
    }));
    vi.doMock("../../../apps/api/src/lib/audit.js", () => ({
      auditFromRequest: () => async () => {},
    }));

    const { settingsRoutes } = await import("../../../apps/api/src/routes/settings.js");
    const app = Fastify();
    await settingsRoutes(app);
    await app.ready();
    vi.spyOn(app.log, "error").mockImplementation(errorLogSpy);

    try {
      const res = await app.inject({ method: "GET", url: "/api/v1/settings/defaultTheme" });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({
        error: "Failed to decrypt setting",
        code: "DECRYPTION_FAILED",
      });
      expect(res.body).not.toContain("$ENC$");
      expect(errorLogSpy).toHaveBeenCalledWith(
        { key: "defaultTheme" },
        expect.stringContaining("DATA_ENCRYPTION_KEY"),
      );
      expect(reportErrorSpy).toHaveBeenCalledTimes(1);
      const [err, ctx] = reportErrorSpy.mock.calls[0];
      expect(classifyError(err, "http")).toBe("operational");
      expect(err).toMatchObject({ code: "SETTING_DECRYPTION_FAILED", statusCode: 500 });
      expect(ctx).toMatchObject({
        source: "http",
        route: "/api/v1/settings/:key",
        method: "GET",
        statusCode: 500,
        subsystem: "settings",
      });
    } finally {
      await app.close();
      vi.restoreAllMocks();
    }
  });

  it("decrypts an $ENC$ value on GET /api/v1/settings and GET /api/v1/settings/:key when DATA_ENCRYPTION_KEY_PREVIOUS matches and re-encrypts under DATA_ENCRYPTION_KEY (#2843)", async () => {
    vi.resetModules();
    const reportErrorSpy = vi.fn().mockResolvedValue(undefined);
    const keyA = "a".repeat(64);
    const keyB = "b".repeat(64);

    vi.doMock("drizzle-orm", () => ({
      and: (...args: unknown[]) => ({ op: "and", args }),
      eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
        op: "sql",
        strings: [...strings],
        values,
      }),
    }));
    vi.doMock("../../../apps/api/src/config.js", () => ({
      env: {
        DATA_ENCRYPTION_KEY: keyB,
        DATA_ENCRYPTION_KEY_PREVIOUS: keyA,
        OIDC_ENABLED: false,
        SAML_ENABLED: false,
      },
    }));
    vi.doMock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
      const actual: Record<string, unknown> = await importOriginal();
      return { ...actual, reportError: reportErrorSpy };
    });

    const { decrypt, encrypt } = await import("../../../apps/api/src/lib/encryption.js");
    const rotatedCiphertext = await encrypt("dark", keyA);
    const updatedAt = new Date("2026-10-14T00:00:00.000Z");
    const updates: Array<{ set: Record<string, unknown>; where: unknown }> = [];

    vi.doMock("../../../apps/api/src/db/index.js", () => ({
      db: {
        select: () => ({
          from: () => {
            const rows = [{ key: "defaultTheme", value: rotatedCiphertext, updatedAt }];
            return Object.assign(Promise.resolve(rows), {
              where: () => Promise.resolve(rows),
            });
          },
        }),
        update: () => ({
          set: (setArg: Record<string, unknown>) => ({
            where: (whereArg: unknown) => {
              updates.push({ set: setArg, where: whereArg });
              return Promise.resolve();
            },
          }),
        }),
      },
      schema: { settings: { key: "settings.key", value: "settings.value" } },
    }));
    vi.doMock("../../../apps/api/src/permissions.js", () => ({
      requirePermission: () => async () => ({ id: "admin-1", username: "admin", role: "admin" }),
      getEffectivePermissions: async () => ["settings:read", "settings:write"],
      isFullEffectiveAdmin: async () => true,
    }));
    vi.doMock("../../../apps/api/src/lib/audit.js", () => ({
      auditFromRequest: () => async () => {},
    }));

    const { settingsRoutes } = await import("../../../apps/api/src/routes/settings.js");
    const app = Fastify();
    await settingsRoutes(app);
    await app.ready();
    const errorLogSpy = vi.spyOn(app.log, "error");

    try {
      const listRes = await app.inject({ method: "GET", url: "/api/v1/settings" });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json()).toEqual({ settings: { defaultTheme: "dark" } });

      const keyRes = await app.inject({ method: "GET", url: "/api/v1/settings/defaultTheme" });
      expect(keyRes.statusCode).toBe(200);
      expect(keyRes.json()).toEqual({
        key: "defaultTheme",
        value: "dark",
        updatedAt: updatedAt.toISOString(),
      });
      expect(updates).toHaveLength(2);
      for (const u of updates) {
        expect(await decrypt(u.set.value as string, keyB)).toBe("dark");
        expect(await decrypt(u.set.value as string, keyA)).toBeNull();
        expect(u.where).toEqual({
          op: "and",
          args: [
            { op: "eq", col: "settings.key", val: "defaultTheme" },
            { op: "eq", col: "settings.value", val: rotatedCiphertext },
          ],
        });
      }
      expect(reportErrorSpy).not.toHaveBeenCalled();
      expect(errorLogSpy).not.toHaveBeenCalled();
    } finally {
      await app.close();
      vi.restoreAllMocks();
    }
  });

  it("short-circuits redacted policies to ******** without attempting decryption", async () => {
    vi.resetModules();
    const reportErrorSpy = vi.fn().mockResolvedValue(undefined);
    const errorLogSpy = vi.fn();

    vi.doMock("drizzle-orm", () => ({
      eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
    }));
    vi.doMock("../../../apps/api/src/config.js", () => ({
      env: {
        DATA_ENCRYPTION_KEY: "",
        DATA_ENCRYPTION_KEY_PREVIOUS: "",
        OIDC_ENABLED: false,
        SAML_ENABLED: false,
      },
    }));
    vi.doMock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
      const actual: Record<string, unknown> = await importOriginal();
      return { ...actual, reportError: reportErrorSpy };
    });

    const { encrypt } = await import("../../../apps/api/src/lib/encryption.js");
    const ciphertext = await encrypt("secret", "a".repeat(64));
    const updatedAt = new Date("2026-10-14T00:00:00.000Z");

    vi.doMock("../../../apps/api/src/db/index.js", () => ({
      db: {
        select: () => ({
          from: () => {
            const rows = [{ key: "oidc_client_secret", value: ciphertext, updatedAt }];
            return Object.assign(Promise.resolve(rows), {
              where: () => Promise.resolve(rows),
            });
          },
        }),
      },
      schema: { settings: { key: "settings.key" } },
    }));
    vi.doMock("../../../apps/api/src/permissions.js", () => ({
      requirePermission: () => async () => ({ id: "admin-1", username: "admin", role: "admin" }),
      getEffectivePermissions: async () => ["settings:read", "settings:write"],
      isFullEffectiveAdmin: async () => true,
    }));
    vi.doMock("../../../apps/api/src/lib/audit.js", () => ({
      auditFromRequest: () => async () => {},
    }));

    const { settingsRoutes } = await import("../../../apps/api/src/routes/settings.js");
    const app = Fastify();
    await settingsRoutes(app);
    await app.ready();
    vi.spyOn(app.log, "error").mockImplementation(errorLogSpy);

    try {
      const listRes = await app.inject({ method: "GET", url: "/api/v1/settings" });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json()).toEqual({ settings: { oidc_client_secret: "********" } });

      const keyRes = await app.inject({
        method: "GET",
        url: "/api/v1/settings/oidc_client_secret",
      });
      expect(keyRes.statusCode).toBe(200);
      expect(keyRes.json()).toEqual({
        key: "oidc_client_secret",
        value: "********",
        updatedAt: updatedAt.toISOString(),
      });
      expect(reportErrorSpy).not.toHaveBeenCalled();
      expect(errorLogSpy).not.toHaveBeenCalled();
    } finally {
      await app.close();
      vi.restoreAllMocks();
    }
  });
});

describe("settingsRoutes PUT /api/v1/settings transactional upsert (#2502)", () => {
  it("writes entries in sorted key order via tx.insert(...).onConflictDoUpdate(...) inside db.transaction and deletes passwordRequireNumber via tx.delete", async () => {
    vi.resetModules();
    const operations: Array<Record<string, unknown>> = [];
    const auditCalls: Array<{ event: string; details: Record<string, unknown> }> = [];
    let transactionCount = 0;

    vi.doMock("drizzle-orm", () => ({
      and: (...args: unknown[]) => ({ op: "and", args }),
      eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
        op: "sql",
        strings: [...strings],
        values,
      }),
    }));
    vi.doMock("../../../apps/api/src/config.js", () => ({
      env: {
        DATA_ENCRYPTION_KEY: "",
        DATA_ENCRYPTION_KEY_PREVIOUS: "",
        OIDC_ENABLED: false,
        SAML_ENABLED: false,
      },
    }));

    const txHandle = {
      insert: (table: unknown) => ({
        values: (vals: Record<string, unknown>) => ({
          onConflictDoUpdate: (conflict: Record<string, unknown>) => {
            operations.push({ op: "upsert", table, vals, conflict });
            return Promise.resolve();
          },
        }),
      }),
      delete: (table: unknown) => ({
        where: (whereArg: unknown) => {
          operations.push({ op: "delete", table, where: whereArg });
          return Promise.resolve();
        },
      }),
    };

    vi.doMock("../../../apps/api/src/db/index.js", () => ({
      db: {
        transaction: async (cb: (tx: typeof txHandle) => Promise<unknown>) => {
          transactionCount += 1;
          return cb(txHandle);
        },
      },
      schema: { settings: { key: "settings.key", value: "settings.value" } },
    }));
    vi.doMock("../../../apps/api/src/permissions.js", () => ({
      requirePermission: () => async () => ({ id: "admin-1", username: "admin", role: "admin" }),
      getEffectivePermissions: async () => ["settings:read", "settings:write", "security:manage"],
      isFullEffectiveAdmin: async () => true,
    }));
    vi.doMock("../../../apps/api/src/lib/audit.js", () => ({
      auditFromRequest: () => async (event: string, details: Record<string, unknown>) => {
        auditCalls.push({ event, details });
      },
    }));

    const { settingsRoutes } = await import("../../../apps/api/src/routes/settings.js");
    const app = Fastify();
    await settingsRoutes(app);
    await app.ready();

    try {
      const res = await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        payload: {
          passwordRequireNumber: "false",
          defaultTheme: "dark",
          defaultLocale: "de",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true, updatedCount: 3 });
      expect(transactionCount).toBe(1);
      expect(operations).toEqual([
        {
          op: "upsert",
          table: { key: "settings.key", value: "settings.value" },
          vals: { key: "defaultLocale", value: "de", updatedAt: expect.any(Date) },
          conflict: {
            target: "settings.key",
            set: { value: "de", updatedAt: expect.any(Date) },
          },
        },
        {
          op: "upsert",
          table: { key: "settings.key", value: "settings.value" },
          vals: { key: "defaultTheme", value: "dark", updatedAt: expect.any(Date) },
          conflict: {
            target: "settings.key",
            set: { value: "dark", updatedAt: expect.any(Date) },
          },
        },
        {
          op: "upsert",
          table: { key: "settings.key", value: "settings.value" },
          vals: { key: "passwordRequireDigit", value: "false", updatedAt: expect.any(Date) },
          conflict: {
            target: "settings.key",
            set: { value: "false", updatedAt: expect.any(Date) },
          },
        },
        {
          op: "delete",
          table: { key: "settings.key", value: "settings.value" },
          where: { op: "eq", col: "settings.key", val: "passwordRequireNumber" },
        },
      ]);
      expect(auditCalls).toEqual([
        {
          event: "SETTINGS_UPDATED",
          details: {
            adminId: "admin-1",
            username: "admin",
            keys: ["passwordRequireDigit", "defaultTheme", "defaultLocale"],
          },
        },
      ]);
    } finally {
      await app.close();
      vi.restoreAllMocks();
    }
  });

  it("does not open a transaction or write an audit entry when entries is empty", async () => {
    vi.resetModules();
    const transactionSpy = vi.fn();
    const auditSpy = vi.fn();

    vi.doMock("drizzle-orm", () => ({
      and: (...args: unknown[]) => ({ op: "and", args }),
      eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
        op: "sql",
        strings: [...strings],
        values,
      }),
    }));
    vi.doMock("../../../apps/api/src/config.js", () => ({
      env: {
        DATA_ENCRYPTION_KEY: "",
        DATA_ENCRYPTION_KEY_PREVIOUS: "",
        OIDC_ENABLED: false,
        SAML_ENABLED: false,
      },
    }));
    vi.doMock("../../../apps/api/src/db/index.js", () => ({
      db: {
        transaction: transactionSpy,
      },
      schema: { settings: { key: "settings.key", value: "settings.value" } },
    }));
    vi.doMock("../../../apps/api/src/permissions.js", () => ({
      requirePermission: () => async () => ({ id: "admin-1", username: "admin", role: "admin" }),
      getEffectivePermissions: async () => ["settings:read", "settings:write"],
      isFullEffectiveAdmin: async () => true,
    }));
    vi.doMock("../../../apps/api/src/lib/audit.js", () => ({
      auditFromRequest: () => auditSpy,
    }));

    const { settingsRoutes } = await import("../../../apps/api/src/routes/settings.js");
    const app = Fastify();
    await settingsRoutes(app);
    await app.ready();

    try {
      const emptyRes = await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        payload: {},
      });
      expect(emptyRes.statusCode).toBe(200);
      expect(emptyRes.json()).toEqual({ ok: true, updatedCount: 0 });

      const maskedRes = await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        payload: { oidc_client_secret: "********" },
      });
      expect(maskedRes.statusCode).toBe(200);
      expect(maskedRes.json()).toEqual({ ok: true, updatedCount: 0 });

      expect(transactionSpy).not.toHaveBeenCalled();
      expect(auditSpy).not.toHaveBeenCalled();
    } finally {
      await app.close();
      vi.restoreAllMocks();
    }
  });

  it("encrypts sensitive values before opening db.transaction and skips audit log and analytics gate invalidation when the transaction rejects", async () => {
    vi.resetModules();
    const events: string[] = [];
    const auditSpy = vi.fn();
    const refreshAnalyticsGateSpy = vi.fn().mockResolvedValue(undefined);
    const publishAnalyticsGateInvalidationSpy = vi.fn().mockResolvedValue(undefined);
    const keyHex = "a".repeat(64);

    vi.doMock("drizzle-orm", () => ({
      and: (...args: unknown[]) => ({ op: "and", args }),
      eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
        op: "sql",
        strings: [...strings],
        values,
      }),
    }));
    vi.doMock("../../../apps/api/src/config.js", () => ({
      env: {
        DATA_ENCRYPTION_KEY: keyHex,
        DATA_ENCRYPTION_KEY_PREVIOUS: "",
        OIDC_ENABLED: false,
        SAML_ENABLED: false,
      },
    }));
    vi.doMock("../../../apps/api/src/lib/encryption.js", async (importOriginal) => {
      const actual: Record<string, unknown> = await importOriginal();
      const realEncrypt = actual.encrypt as (p: string, k: string) => Promise<string>;
      return {
        ...actual,
        encrypt: async (plaintext: string, masterKey: string) => {
          events.push(`encrypt:${plaintext}`);
          return realEncrypt(plaintext, masterKey);
        },
      };
    });
    vi.doMock("../../../apps/api/src/lib/analytics-gate.js", () => ({
      refreshAnalyticsGate: refreshAnalyticsGateSpy,
      publishAnalyticsGateInvalidation: publishAnalyticsGateInvalidationSpy,
    }));

    let shouldFailSecondInsert = true;
    let insertCallsInTx = 0;
    const txHandle = {
      insert: () => ({
        values: (vals: { key: string; value: string }) => ({
          onConflictDoUpdate: () => {
            insertCallsInTx += 1;
            events.push(`tx.upsert:${vals.key}`);
            if (shouldFailSecondInsert && insertCallsInTx === 2) {
              return Promise.reject(new Error("simulated db failure on second key"));
            }
            return Promise.resolve();
          },
        }),
      }),
      delete: () => ({
        where: () => Promise.resolve(),
      }),
    };

    vi.doMock("../../../apps/api/src/db/index.js", () => ({
      db: {
        transaction: async (cb: (tx: typeof txHandle) => Promise<unknown>) => {
          events.push("tx.begin");
          insertCallsInTx = 0;
          return cb(txHandle);
        },
      },
      schema: { settings: { key: "settings.key", value: "settings.value" } },
    }));
    vi.doMock("../../../apps/api/src/permissions.js", () => ({
      requirePermission: () => async () => ({ id: "admin-1", username: "admin", role: "admin" }),
      getEffectivePermissions: async () => ["settings:read", "settings:write"],
      isFullEffectiveAdmin: async () => true,
    }));
    vi.doMock("../../../apps/api/src/lib/audit.js", () => ({
      auditFromRequest: () => auditSpy,
    }));

    const { settingsRoutes } = await import("../../../apps/api/src/routes/settings.js");
    const app = Fastify();
    await settingsRoutes(app);
    await app.ready();

    try {
      const failedRes = await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        payload: {
          oidc_client_secret: "new-secret",
          analyticsEnabled: "false",
        },
      });
      expect(failedRes.statusCode).toBe(500);
      expect(auditSpy).not.toHaveBeenCalled();
      expect(refreshAnalyticsGateSpy).not.toHaveBeenCalled();
      expect(publishAnalyticsGateInvalidationSpy).not.toHaveBeenCalled();
      expect(events).toEqual([
        "encrypt:new-secret",
        "tx.begin",
        "tx.upsert:analyticsEnabled",
        "tx.upsert:oidc_client_secret",
      ]);

      events.length = 0;
      shouldFailSecondInsert = false;
      const okRes = await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        payload: {
          oidc_client_secret: "new-secret",
          analyticsEnabled: "false",
        },
      });
      expect(okRes.statusCode).toBe(200);
      expect(auditSpy).toHaveBeenCalledTimes(1);
      expect(refreshAnalyticsGateSpy).toHaveBeenCalledTimes(1);
      expect(publishAnalyticsGateInvalidationSpy).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
      vi.doUnmock("../../../apps/api/src/lib/encryption.js");
      vi.restoreAllMocks();
    }
  });

  it("re-encrypts a preserved ******** redacted secret on PUT /api/v1/settings when stored under DATA_ENCRYPTION_KEY_PREVIOUS without incrementing updatedCount (#2852)", async () => {
    vi.resetModules();
    vi.doUnmock("../../../apps/api/src/lib/encryption.js");
    const keyA = "a".repeat(64);
    const keyB = "b".repeat(64);
    const keyC = "c".repeat(64);

    vi.doMock("drizzle-orm", () => ({
      and: (...args: unknown[]) => ({ op: "and", args }),
      eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
        op: "sql",
        strings: [...strings],
        values,
      }),
    }));
    vi.doMock("../../../apps/api/src/config.js", () => ({
      env: {
        DATA_ENCRYPTION_KEY: keyB,
        DATA_ENCRYPTION_KEY_PREVIOUS: keyA,
        OIDC_ENABLED: false,
        SAML_ENABLED: false,
      },
    }));

    const { decrypt, encrypt } = await import("../../../apps/api/src/lib/encryption.js");
    const cipherKeyA = await encrypt("oidc-secret-value", keyA);
    const cipherKeyB = await encrypt("oidc-secret-value", keyB);
    const cipherKeyC = await encrypt("oidc-secret-value", keyC);
    let storedValue: string | null = cipherKeyA;
    const updates: Array<{ set: Record<string, unknown>; where: unknown }> = [];
    const transactionSpy = vi.fn();
    const auditSpy = vi.fn();

    vi.doMock("../../../apps/api/src/db/index.js", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () =>
              Promise.resolve(
                storedValue === null ? [] : [{ key: "oidc_client_secret", value: storedValue }],
              ),
          }),
        }),
        update: () => ({
          set: (setArg: Record<string, unknown>) => ({
            where: (whereArg: unknown) => {
              updates.push({ set: setArg, where: whereArg });
              return Promise.resolve();
            },
          }),
        }),
        transaction: transactionSpy,
      },
      schema: { settings: { key: "settings.key", value: "settings.value" } },
    }));
    vi.doMock("../../../apps/api/src/permissions.js", () => ({
      requirePermission: () => async () => ({ id: "admin-1", username: "admin", role: "admin" }),
      getEffectivePermissions: async () => ["settings:read", "settings:write", "security:manage"],
      isFullEffectiveAdmin: async () => true,
    }));
    vi.doMock("../../../apps/api/src/lib/audit.js", () => ({
      auditFromRequest: () => auditSpy,
    }));

    const { settingsRoutes } = await import("../../../apps/api/src/routes/settings.js");
    const app = Fastify();
    await settingsRoutes(app);
    await app.ready();
    const warnLogSpy = vi.spyOn(app.log, "warn");

    try {
      const rotateRes = await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        payload: { oidc_client_secret: "********" },
      });
      expect(rotateRes.statusCode).toBe(200);
      expect(rotateRes.json()).toEqual({ ok: true, updatedCount: 0 });
      expect(transactionSpy).not.toHaveBeenCalled();
      expect(auditSpy).not.toHaveBeenCalled();
      expect(updates).toHaveLength(1);
      expect(await decrypt(updates[0].set.value as string, keyB)).toBe("oidc-secret-value");
      expect(await decrypt(updates[0].set.value as string, keyA)).toBeNull();
      expect(updates[0].where).toEqual({
        op: "and",
        args: [
          { op: "eq", col: "settings.key", val: "oidc_client_secret" },
          { op: "eq", col: "settings.value", val: cipherKeyA },
        ],
      });
      expect(warnLogSpy).not.toHaveBeenCalled();

      // When already encrypted under keyB, no update is issued
      updates.length = 0;
      storedValue = cipherKeyB;
      const keepRes = await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        payload: { oidc_client_secret: "********" },
      });
      expect(keepRes.statusCode).toBe(200);
      expect(keepRes.json()).toEqual({ ok: true, updatedCount: 0 });
      expect(updates).toHaveLength(0);
      expect(warnLogSpy).not.toHaveBeenCalled();

      // When stored under an unrecognized keyC, logs a warning and skips update
      updates.length = 0;
      storedValue = cipherKeyC;
      const unknownKeyRes = await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        payload: { oidc_client_secret: "********" },
      });
      expect(unknownKeyRes.statusCode).toBe(200);
      expect(unknownKeyRes.json()).toEqual({ ok: true, updatedCount: 0 });
      expect(updates).toHaveLength(0);
      expect(warnLogSpy).toHaveBeenCalledWith(
        { key: "oidc_client_secret" },
        expect.stringContaining("DATA_ENCRYPTION_KEY"),
      );

      // When the redacted setting row does not exist yet, skips update cleanly
      updates.length = 0;
      warnLogSpy.mockClear();
      storedValue = null;
      const missingRowRes = await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        payload: { oidc_client_secret: "********" },
      });
      expect(missingRowRes.statusCode).toBe(200);
      expect(missingRowRes.json()).toEqual({ ok: true, updatedCount: 0 });
      expect(updates).toHaveLength(0);
      expect(warnLogSpy).not.toHaveBeenCalled();

      // When runtime constraint validation rejects the batch, masked secret rotation does not run
      updates.length = 0;
      storedValue = cipherKeyA;
      const rejectedRes = await app.inject({
        method: "PUT",
        url: "/api/v1/settings",
        payload: { oidc_client_secret: "********", ssoEnforcement: "true" },
      });
      expect(rejectedRes.statusCode).toBe(400);
      expect(updates).toHaveLength(0);
    } finally {
      await app.close();
      vi.restoreAllMocks();
    }
  });
});

describe("registerConfigRoutes POST /api/v1/enterprise/config/import settings upsert (#3014)", () => {
  it("writes settings in sorted key order via tx.insert(...).onConflictDoUpdate(...) inside db.transaction, deletes passwordRequireNumber unconditionally, and preserves dry-run order", async () => {
    vi.resetModules();
    const operations: Array<Record<string, unknown>> = [];
    const auditCalls: Array<{ event: string; details: Record<string, unknown> }> = [];
    let transactionCount = 0;

    vi.doMock("drizzle-orm", () => ({
      and: (...args: unknown[]) => ({ op: "and", args }),
      eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
        op: "sql",
        strings: [...strings],
        values,
      }),
    }));
    vi.doMock("../../../apps/api/src/config.js", () => ({
      env: {
        DATA_ENCRYPTION_KEY: "",
        DATA_ENCRYPTION_KEY_PREVIOUS: "",
        OIDC_ENABLED: false,
        SAML_ENABLED: false,
      },
    }));
    vi.doMock("../../../apps/api/src/lib/enterprise-feature.js", () => ({
      isEnterpriseFeatureEnabled: async () => true,
    }));

    const txHandle = {
      insert: (table: unknown) => ({
        values: (vals: Record<string, unknown>) => ({
          onConflictDoUpdate: (conflict: Record<string, unknown>) => {
            operations.push({ op: "upsert", table, vals, conflict });
            return Promise.resolve();
          },
        }),
      }),
      delete: (table: unknown) => ({
        where: (whereArg: unknown) => {
          operations.push({ op: "delete", table, where: whereArg });
          return Promise.resolve();
        },
      }),
    };

    vi.doMock("../../../apps/api/src/db/index.js", () => ({
      db: {
        select: () => ({
          from: () => Promise.resolve([{ key: "defaultTheme", value: "system" }]),
        }),
        transaction: async (cb: (tx: typeof txHandle) => Promise<unknown>) => {
          transactionCount += 1;
          return cb(txHandle);
        },
      },
      schema: {
        settings: { key: "settings.key", value: "settings.value" },
        roles: { id: "roles.id", name: "roles.name", isBuiltin: "roles.isBuiltin" },
        teams: { id: "teams.id", name: "teams.name" },
      },
    }));
    vi.doMock("../../../apps/api/src/permissions.js", () => ({
      requireFullAdmin: async () => ({ id: "admin-1", username: "admin", role: "admin" }),
    }));
    vi.doMock("../../../apps/api/src/lib/audit.js", () => ({
      auditFromRequest: () => async (event: string, details: Record<string, unknown>) => {
        auditCalls.push({ event, details });
      },
    }));

    const { registerConfigRoutes } = await import(
      "../../../apps/api/src/routes/enterprise/config.js"
    );
    const app = Fastify();
    await registerConfigRoutes(app);
    await app.ready();

    try {
      const dryRunRes = await app.inject({
        method: "POST",
        url: "/api/v1/enterprise/config/import",
        payload: {
          dryRun: true,
          config: {
            configSchemaVersion: 1,
            settings: {
              passwordRequireNumber: "false",
              defaultTheme: "dark",
              defaultLocale: "de",
            },
          },
        },
      });

      expect(dryRunRes.statusCode).toBe(200);
      expect(dryRunRes.json()).toEqual({
        dryRun: true,
        changes: { settings: 3, roles: 0, teams: 0 },
        details: {
          settings: [
            { key: "passwordRequireDigit", action: "create" },
            { key: "defaultTheme", action: "update" },
            { key: "defaultLocale", action: "create" },
          ],
          roles: [],
          teams: [],
        },
      });
      expect(transactionCount).toBe(0);

      const applyRes = await app.inject({
        method: "POST",
        url: "/api/v1/enterprise/config/import",
        payload: {
          dryRun: false,
          config: {
            configSchemaVersion: 1,
            settings: {
              passwordRequireNumber: "false",
              defaultTheme: "dark",
              defaultLocale: "de",
            },
          },
        },
      });

      expect(applyRes.statusCode).toBe(200);
      expect(applyRes.json()).toEqual({
        applied: true,
        changes: { settings: 3, roles: 0, teams: 0 },
      });
      expect(transactionCount).toBe(1);
      expect(operations).toEqual([
        {
          op: "upsert",
          table: { key: "settings.key", value: "settings.value" },
          vals: { key: "defaultLocale", value: "de", updatedAt: expect.any(Date) },
          conflict: {
            target: "settings.key",
            set: { value: "de", updatedAt: expect.any(Date) },
          },
        },
        {
          op: "upsert",
          table: { key: "settings.key", value: "settings.value" },
          vals: { key: "defaultTheme", value: "dark", updatedAt: expect.any(Date) },
          conflict: {
            target: "settings.key",
            set: { value: "dark", updatedAt: expect.any(Date) },
          },
        },
        {
          op: "upsert",
          table: { key: "settings.key", value: "settings.value" },
          vals: { key: "passwordRequireDigit", value: "false", updatedAt: expect.any(Date) },
          conflict: {
            target: "settings.key",
            set: { value: "false", updatedAt: expect.any(Date) },
          },
        },
        {
          op: "delete",
          table: { key: "settings.key", value: "settings.value" },
          where: { op: "eq", col: "settings.key", val: "passwordRequireNumber" },
        },
      ]);
      expect(auditCalls).toEqual([
        {
          event: "CONFIG_IMPORTED",
          details: {
            adminId: "admin-1",
            username: "admin",
            dryRun: false,
            changes: { settings: 3, roles: 0, teams: 0 },
          },
        },
      ]);
    } finally {
      await app.close();
      vi.restoreAllMocks();
    }
  });

  it("propagates a mid-transaction settings upsert failure and skips CONFIG_IMPORTED audit log and analytics gate invalidation (#3014, #3021)", async () => {
    vi.resetModules();
    const upsertedKeys: string[] = [];
    const auditSpy = vi.fn();
    const refreshAnalyticsGateSpy = vi.fn().mockResolvedValue(undefined);
    const publishAnalyticsGateInvalidationSpy = vi.fn().mockResolvedValue(undefined);

    vi.doMock("drizzle-orm", () => ({
      and: (...args: unknown[]) => ({ op: "and", args }),
      eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
        op: "sql",
        strings: [...strings],
        values,
      }),
    }));
    vi.doMock("../../../apps/api/src/config.js", () => ({
      env: {
        DATA_ENCRYPTION_KEY: "",
        DATA_ENCRYPTION_KEY_PREVIOUS: "",
        OIDC_ENABLED: false,
        SAML_ENABLED: false,
      },
    }));
    vi.doMock("../../../apps/api/src/lib/enterprise-feature.js", () => ({
      isEnterpriseFeatureEnabled: async () => true,
    }));
    vi.doMock("../../../apps/api/src/lib/analytics-gate.js", () => ({
      refreshAnalyticsGate: refreshAnalyticsGateSpy,
      publishAnalyticsGateInvalidation: publishAnalyticsGateInvalidationSpy,
    }));

    const txHandle = {
      insert: () => ({
        values: (vals: { key: string }) => ({
          onConflictDoUpdate: () => {
            upsertedKeys.push(vals.key);
            if (upsertedKeys.length === 2) {
              return Promise.reject(new Error("simulated db failure on second setting upsert"));
            }
            return Promise.resolve();
          },
        }),
      }),
      delete: () => ({
        where: () => Promise.resolve(),
      }),
    };

    vi.doMock("../../../apps/api/src/db/index.js", () => ({
      db: {
        select: () => ({
          from: () => Promise.resolve([]),
        }),
        transaction: async (cb: (tx: typeof txHandle) => Promise<unknown>) => cb(txHandle),
      },
      schema: {
        settings: { key: "settings.key", value: "settings.value" },
        roles: { id: "roles.id", name: "roles.name", isBuiltin: "roles.isBuiltin" },
        teams: { id: "teams.id", name: "teams.name" },
      },
    }));
    vi.doMock("../../../apps/api/src/permissions.js", () => ({
      requireFullAdmin: async () => ({ id: "admin-1", username: "admin", role: "admin" }),
    }));
    vi.doMock("../../../apps/api/src/lib/audit.js", () => ({
      auditFromRequest: () => auditSpy,
    }));

    const { registerConfigRoutes } = await import(
      "../../../apps/api/src/routes/enterprise/config.js"
    );
    const app = Fastify();
    await registerConfigRoutes(app);
    await app.ready();

    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/enterprise/config/import",
        payload: {
          dryRun: false,
          config: {
            configSchemaVersion: 1,
            settings: {
              defaultTheme: "dark",
              analyticsEnabled: "false",
            },
          },
        },
      });

      expect(res.statusCode).toBe(500);
      expect(upsertedKeys).toEqual(["analyticsEnabled", "defaultTheme"]);
      expect(auditSpy).not.toHaveBeenCalled();
      expect(refreshAnalyticsGateSpy).not.toHaveBeenCalled();
      expect(publishAnalyticsGateInvalidationSpy).not.toHaveBeenCalled();
    } finally {
      await app.close();
      vi.restoreAllMocks();
    }
  });

  it("refreshes and publishes analytics gate invalidation when importing analyticsEnabled, skips on dryRun or non-analytics imports, and logs a warning if invalidation fails (#3021)", async () => {
    vi.resetModules();
    const refreshAnalyticsGateSpy = vi.fn().mockResolvedValue(undefined);
    const publishAnalyticsGateInvalidationSpy = vi.fn().mockResolvedValue(undefined);

    vi.doMock("drizzle-orm", () => ({
      and: (...args: unknown[]) => ({ op: "and", args }),
      eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
        op: "sql",
        strings: [...strings],
        values,
      }),
    }));
    vi.doMock("../../../apps/api/src/config.js", () => ({
      env: {
        DATA_ENCRYPTION_KEY: "",
        DATA_ENCRYPTION_KEY_PREVIOUS: "",
        OIDC_ENABLED: false,
        SAML_ENABLED: false,
      },
    }));
    vi.doMock("../../../apps/api/src/lib/enterprise-feature.js", () => ({
      isEnterpriseFeatureEnabled: async () => true,
    }));
    vi.doMock("../../../apps/api/src/lib/analytics-gate.js", () => ({
      refreshAnalyticsGate: refreshAnalyticsGateSpy,
      publishAnalyticsGateInvalidation: publishAnalyticsGateInvalidationSpy,
    }));

    const txHandle = {
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => Promise.resolve(),
        }),
      }),
      delete: () => ({
        where: () => Promise.resolve(),
      }),
    };

    vi.doMock("../../../apps/api/src/db/index.js", () => ({
      db: {
        select: () => ({
          from: () => Promise.resolve([]),
        }),
        transaction: async (cb: (tx: typeof txHandle) => Promise<unknown>) => cb(txHandle),
      },
      schema: {
        settings: { key: "settings.key", value: "settings.value" },
        roles: { id: "roles.id", name: "roles.name", isBuiltin: "roles.isBuiltin" },
        teams: { id: "teams.id", name: "teams.name" },
      },
    }));
    vi.doMock("../../../apps/api/src/permissions.js", () => ({
      requireFullAdmin: async () => ({ id: "admin-1", username: "admin", role: "admin" }),
    }));
    vi.doMock("../../../apps/api/src/lib/audit.js", () => ({
      auditFromRequest: () => async () => {},
    }));

    const { registerConfigRoutes } = await import(
      "../../../apps/api/src/routes/enterprise/config.js"
    );
    const app = Fastify();
    await registerConfigRoutes(app);
    await app.ready();
    const warnLogSpy = vi.spyOn(app.log, "warn");

    try {
      const dryRunRes = await app.inject({
        method: "POST",
        url: "/api/v1/enterprise/config/import",
        payload: {
          dryRun: true,
          config: {
            configSchemaVersion: 1,
            settings: { analyticsEnabled: "false" },
          },
        },
      });
      expect(dryRunRes.statusCode).toBe(200);
      expect(refreshAnalyticsGateSpy).not.toHaveBeenCalled();
      expect(publishAnalyticsGateInvalidationSpy).not.toHaveBeenCalled();

      const otherSettingRes = await app.inject({
        method: "POST",
        url: "/api/v1/enterprise/config/import",
        payload: {
          dryRun: false,
          config: {
            configSchemaVersion: 1,
            settings: { defaultTheme: "dark" },
          },
        },
      });
      expect(otherSettingRes.statusCode).toBe(200);
      expect(refreshAnalyticsGateSpy).not.toHaveBeenCalled();
      expect(publishAnalyticsGateInvalidationSpy).not.toHaveBeenCalled();

      const applyRes = await app.inject({
        method: "POST",
        url: "/api/v1/enterprise/config/import",
        payload: {
          dryRun: false,
          config: {
            configSchemaVersion: 1,
            settings: { analyticsEnabled: "false" },
          },
        },
      });
      expect(applyRes.statusCode).toBe(200);
      expect(refreshAnalyticsGateSpy).toHaveBeenCalledTimes(1);
      expect(publishAnalyticsGateInvalidationSpy).toHaveBeenCalledTimes(1);
      expect(refreshAnalyticsGateSpy.mock.invocationCallOrder[0]).toBeLessThan(
        publishAnalyticsGateInvalidationSpy.mock.invocationCallOrder[0],
      );
      expect(warnLogSpy).not.toHaveBeenCalled();

      publishAnalyticsGateInvalidationSpy.mockRejectedValueOnce(new Error("redis pubsub down"));
      const redisFailRes = await app.inject({
        method: "POST",
        url: "/api/v1/enterprise/config/import",
        payload: {
          dryRun: false,
          config: {
            configSchemaVersion: 1,
            settings: { analyticsEnabled: "true" },
          },
        },
      });
      expect(redisFailRes.statusCode).toBe(200);
      expect(redisFailRes.json()).toEqual({
        applied: true,
        changes: { settings: 1, roles: 0, teams: 0 },
      });
      expect(refreshAnalyticsGateSpy).toHaveBeenCalledTimes(2);
      expect(publishAnalyticsGateInvalidationSpy).toHaveBeenCalledTimes(2);
      expect(warnLogSpy).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        "analytics gate invalidation failed (import still applied)",
      );
    } finally {
      await app.close();
      vi.restoreAllMocks();
    }
  });
});

describe("registerConfigRoutes POST /api/v1/enterprise/config/import roles and teams upsert (#3022)", () => {
  it("writes roles in sorted name order via tx.insert(...).onConflictDoUpdate(...) and teams in sorted lowercase-name order via tx.execute(...) inside db.transaction, without calling tx.select or tx.update, while preserving dry-run order", async () => {
    vi.resetModules();
    const operations: Array<Record<string, unknown>> = [];
    const auditCalls: Array<{ event: string; details: Record<string, unknown> }> = [];
    let transactionCount = 0;

    vi.doMock("drizzle-orm", () => ({
      and: (...args: unknown[]) => ({ op: "and", args }),
      eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
        op: "sql",
        strings: [...strings],
        values,
      }),
    }));
    vi.doMock("../../../apps/api/src/config.js", () => ({
      env: {
        DATA_ENCRYPTION_KEY: "",
        DATA_ENCRYPTION_KEY_PREVIOUS: "",
        OIDC_ENABLED: false,
        SAML_ENABLED: false,
      },
    }));
    vi.doMock("../../../apps/api/src/lib/enterprise-feature.js", () => ({
      isEnterpriseFeatureEnabled: async () => true,
    }));

    const rolesTable = { id: "roles.id", name: "roles.name", isBuiltin: "roles.isBuiltin" };
    const teamsTable = { id: "teams.id", name: "teams.name" };

    const txHandle = {
      insert: (table: unknown) => ({
        values: (vals: Record<string, unknown>) => ({
          onConflictDoUpdate: (conflict: Record<string, unknown>) => {
            operations.push({ op: "upsert", table, vals, conflict });
            return Promise.resolve();
          },
        }),
      }),
      execute: (query: unknown) => {
        operations.push({ op: "execute", query });
        return Promise.resolve();
      },
    };

    vi.doMock("../../../apps/api/src/db/index.js", () => ({
      db: {
        select: () => ({
          from: (table: unknown) => {
            if (table === rolesTable) {
              return {
                where: () =>
                  Promise.resolve([
                    {
                      id: "role-existing",
                      name: "z-auditor",
                      description: "old",
                      permissions: ["audit:read"],
                      toolPermissions: null,
                      isBuiltin: false,
                    },
                  ]),
              };
            }
            if (table === teamsTable) {
              return Promise.resolve([
                {
                  id: "team-existing",
                  name: "ZETA OPS",
                  storageQuota: 100,
                  retentionHours: 24,
                },
              ]);
            }
            return Promise.resolve([]);
          },
        }),
        transaction: async (cb: (tx: typeof txHandle) => Promise<unknown>) => {
          transactionCount += 1;
          return cb(txHandle);
        },
      },
      schema: {
        settings: { key: "settings.key", value: "settings.value" },
        roles: rolesTable,
        teams: teamsTable,
      },
    }));
    vi.doMock("../../../apps/api/src/permissions.js", () => ({
      requireFullAdmin: async () => ({ id: "admin-1", username: "admin", role: "admin" }),
    }));
    vi.doMock("../../../apps/api/src/lib/audit.js", () => ({
      auditFromRequest: () => async (event: string, details: Record<string, unknown>) => {
        auditCalls.push({ event, details });
      },
    }));

    const { registerConfigRoutes } = await import(
      "../../../apps/api/src/routes/enterprise/config.js"
    );
    const app = Fastify();
    await registerConfigRoutes(app);
    await app.ready();

    try {
      const payload = {
        configSchemaVersion: 1,
        roles: [
          {
            name: "z-auditor",
            description: "Updated auditor",
            permissions: ["audit:read", "settings:read"],
            toolPermissions: { mode: "category", allowed: ["image"] },
          },
          {
            name: "a-viewer",
            permissions: ["files:own"],
          },
        ],
        teams: [
          { name: "Zeta Ops", storageQuota: 500, retentionHours: 72 },
          { name: "alpha team", storageQuota: 250 },
        ],
      };

      const dryRunRes = await app.inject({
        method: "POST",
        url: "/api/v1/enterprise/config/import",
        payload: {
          dryRun: true,
          config: payload,
        },
      });

      expect(dryRunRes.statusCode).toBe(200);
      expect(dryRunRes.json()).toEqual({
        dryRun: true,
        changes: { settings: 0, roles: 2, teams: 2 },
        details: {
          settings: [],
          roles: [
            { name: "z-auditor", action: "update" },
            { name: "a-viewer", action: "create" },
          ],
          teams: [
            { name: "Zeta Ops", action: "update" },
            { name: "alpha team", action: "create" },
          ],
        },
      });
      expect(transactionCount).toBe(0);

      const applyRes = await app.inject({
        method: "POST",
        url: "/api/v1/enterprise/config/import",
        payload: {
          dryRun: false,
          config: payload,
        },
      });

      expect(applyRes.statusCode).toBe(200);
      expect(applyRes.json()).toEqual({
        applied: true,
        changes: { settings: 0, roles: 2, teams: 2 },
      });
      expect(transactionCount).toBe(1);
      expect(operations).toEqual([
        {
          op: "upsert",
          table: rolesTable,
          vals: {
            id: expect.any(String),
            name: "a-viewer",
            description: "",
            permissions: ["files:own"],
            toolPermissions: null,
            isBuiltin: false,
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date),
          },
          conflict: {
            target: "roles.name",
            set: {
              description: "",
              permissions: ["files:own"],
              toolPermissions: null,
              updatedAt: expect.any(Date),
            },
          },
        },
        {
          op: "upsert",
          table: rolesTable,
          vals: {
            id: expect.any(String),
            name: "z-auditor",
            description: "Updated auditor",
            permissions: ["audit:read", "settings:read"],
            toolPermissions: { mode: "category", allowed: ["image"] },
            isBuiltin: false,
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date),
          },
          conflict: {
            target: "roles.name",
            set: {
              description: "Updated auditor",
              permissions: ["audit:read", "settings:read"],
              toolPermissions: { mode: "category", allowed: ["image"] },
              updatedAt: expect.any(Date),
            },
          },
        },
        {
          op: "execute",
          query: {
            op: "sql",
            strings: expect.arrayContaining([
              expect.stringContaining("ON CONFLICT (lower("),
              expect.stringContaining("DO UPDATE SET"),
            ]),
            values: [
              teamsTable,
              expect.any(String),
              "alpha team",
              250,
              null,
              expect.any(Date),
              "teams.name",
            ],
          },
        },
        {
          op: "execute",
          query: {
            op: "sql",
            strings: expect.arrayContaining([
              expect.stringContaining("ON CONFLICT (lower("),
              expect.stringContaining("DO UPDATE SET"),
            ]),
            values: [
              teamsTable,
              expect.any(String),
              "Zeta Ops",
              500,
              72,
              expect.any(Date),
              "teams.name",
            ],
          },
        },
      ]);
      expect(auditCalls).toEqual([
        {
          event: "CONFIG_IMPORTED",
          details: {
            adminId: "admin-1",
            username: "admin",
            dryRun: false,
            changes: { settings: 0, roles: 2, teams: 2 },
          },
        },
      ]);

      operations.length = 0;
      const emptyRes = await app.inject({
        method: "POST",
        url: "/api/v1/enterprise/config/import",
        payload: {
          dryRun: false,
          config: {
            configSchemaVersion: 1,
            roles: [],
            teams: [],
          },
        },
      });
      expect(emptyRes.statusCode).toBe(200);
      expect(operations).toEqual([]);
    } finally {
      await app.close();
      vi.restoreAllMocks();
    }
  });

  it("propagates a mid-transaction role or team upsert failure and skips CONFIG_IMPORTED audit log (#3022)", async () => {
    vi.resetModules();
    const upsertedRoles: string[] = [];
    const upsertedTeams: string[] = [];
    const auditSpy = vi.fn();

    vi.doMock("drizzle-orm", () => ({
      and: (...args: unknown[]) => ({ op: "and", args }),
      eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
        op: "sql",
        strings: [...strings],
        values,
      }),
    }));
    vi.doMock("../../../apps/api/src/config.js", () => ({
      env: {
        DATA_ENCRYPTION_KEY: "",
        DATA_ENCRYPTION_KEY_PREVIOUS: "",
        OIDC_ENABLED: false,
        SAML_ENABLED: false,
      },
    }));
    vi.doMock("../../../apps/api/src/lib/enterprise-feature.js", () => ({
      isEnterpriseFeatureEnabled: async () => true,
    }));

    const rolesTable = { id: "roles.id", name: "roles.name", isBuiltin: "roles.isBuiltin" };
    const teamsTable = { id: "teams.id", name: "teams.name" };

    const txHandle = {
      insert: () => ({
        values: (vals: { name: string }) => ({
          onConflictDoUpdate: () => {
            upsertedRoles.push(vals.name);
            return Promise.resolve();
          },
        }),
      }),
      execute: (query: { values: unknown[] }) => {
        const teamName = query.values.find((v): v is string => v === "Alpha" || v === "Zeta");
        if (teamName) upsertedTeams.push(teamName);
        if (upsertedTeams.length === 2) {
          return Promise.reject(new Error("simulated db failure on second team upsert"));
        }
        return Promise.resolve();
      },
    };

    vi.doMock("../../../apps/api/src/db/index.js", () => ({
      db: {
        select: () => ({
          from: (table: unknown) => {
            if (table === rolesTable) {
              return { where: () => Promise.resolve([]) };
            }
            return Promise.resolve([]);
          },
        }),
        transaction: async (cb: (tx: typeof txHandle) => Promise<unknown>) => cb(txHandle),
      },
      schema: {
        settings: { key: "settings.key", value: "settings.value" },
        roles: rolesTable,
        teams: teamsTable,
      },
    }));
    vi.doMock("../../../apps/api/src/permissions.js", () => ({
      requireFullAdmin: async () => ({ id: "admin-1", username: "admin", role: "admin" }),
    }));
    vi.doMock("../../../apps/api/src/lib/audit.js", () => ({
      auditFromRequest: () => auditSpy,
    }));

    const { registerConfigRoutes } = await import(
      "../../../apps/api/src/routes/enterprise/config.js"
    );
    const app = Fastify();
    await registerConfigRoutes(app);
    await app.ready();

    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/enterprise/config/import",
        payload: {
          dryRun: false,
          config: {
            configSchemaVersion: 1,
            roles: [
              { name: "z-role", permissions: ["files:own"] },
              { name: "a-role", permissions: ["audit:read"] },
            ],
            teams: [
              { name: "Zeta", storageQuota: 100 },
              { name: "Alpha", storageQuota: 200 },
            ],
          },
        },
      });

      expect(res.statusCode).toBe(500);
      expect(upsertedRoles).toEqual(["a-role", "z-role"]);
      expect(upsertedTeams).toEqual(["Alpha", "Zeta"]);
      expect(auditSpy).not.toHaveBeenCalled();
    } finally {
      await app.close();
      vi.restoreAllMocks();
    }
  });
});
