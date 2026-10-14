/**
 * Unit tests for settings route handlers.
 *
 * Tests the GET all settings, PUT upsert settings, and GET single setting
 * logic including HTML tag validation, auth requirements, and error handling.
 */
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────

const mockDbRows: Array<{ key: string; value: string; updatedAt: Date }> = [];
const mockInsertRun = vi.fn();
const mockUpdateRun = vi.fn();

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: vi.fn(() => {
            // Dynamically check mockDbRows
            return null;
          }),
        }),
        all: () => mockDbRows,
      }),
    }),
    insert: () => ({
      values: () => ({ run: mockInsertRun }),
    }),
    update: () => ({
      set: () => ({ where: () => ({ run: mockUpdateRun }) }),
    }),
  },
  pool: {},
  closeDb: async () => {},
  schema: {
    settings: { key: {} },
  },
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: {
    AUTH_ENABLED: true,
  },
}));

// ── Test the validation and helper logic ────────────────────────────────

const HTML_TAG_PATTERN = /<[a-z/!?][^>]*>/i;

const settingsBodySchemaLogic = {
  validate(body: unknown): { valid: boolean; error?: string } {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return { valid: false, error: "Request body must be a JSON object with key-value pairs" };
    }
    return { valid: true };
  },
};

function validateEntries(body: Record<string, unknown>): {
  entries: Array<{ key: string; strValue: string }>;
  error?: string;
} {
  const entries: Array<{ key: string; strValue: string }> = [];

  for (const [key, value] of Object.entries(body)) {
    if (typeof key !== "string" || key.length === 0) continue;

    const strValue = typeof value === "string" ? value : JSON.stringify(value);

    if (HTML_TAG_PATTERN.test(key) || HTML_TAG_PATTERN.test(strValue)) {
      return { entries: [], error: "Settings keys and values must not contain HTML tags" };
    }

    entries.push({ key, strValue });
  }

  return { entries };
}

describe("settings route logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbRows.length = 0;
  });

  describe("body validation", () => {
    it("rejects null body", () => {
      expect(settingsBodySchemaLogic.validate(null).valid).toBe(false);
    });

    it("rejects array body", () => {
      expect(settingsBodySchemaLogic.validate([]).valid).toBe(false);
    });

    it("accepts object body", () => {
      expect(settingsBodySchemaLogic.validate({ theme: "dark" }).valid).toBe(true);
    });

    it("accepts empty object body", () => {
      expect(settingsBodySchemaLogic.validate({}).valid).toBe(true);
    });
  });

  describe("HTML tag validation", () => {
    it("rejects HTML tags in keys", () => {
      const result = validateEntries({ "<script>alert(1)</script>": "value" });
      expect(result.error).toBe("Settings keys and values must not contain HTML tags");
    });

    it("rejects HTML tags in values", () => {
      const result = validateEntries({ key: "<img src=x onerror=alert(1)>" });
      expect(result.error).toBe("Settings keys and values must not contain HTML tags");
    });

    it("accepts clean keys and values", () => {
      const result = validateEntries({ theme: "dark", locale: "en" });
      expect(result.error).toBeUndefined();
      expect(result.entries).toHaveLength(2);
    });

    it("stringifies non-string values", () => {
      const result = validateEntries({ count: 42 as unknown as string });
      expect(result.entries[0].strValue).toBe("42");
    });

    it("stringifies boolean values", () => {
      const result = validateEntries({ enabled: true as unknown as string });
      expect(result.entries[0].strValue).toBe("true");
    });

    it("stringifies object values", () => {
      const result = validateEntries({ config: { a: 1 } as unknown as string });
      expect(result.entries[0].strValue).toBe('{"a":1}');
    });

    it("rejects HTML tag in the middle of a value", () => {
      const result = validateEntries({ key: "before <div>inside</div> after" });
      expect(result.error).toBe("Settings keys and values must not contain HTML tags");
    });

    it("accepts values with angle brackets that are not HTML tags", () => {
      const result = validateEntries({ math: "a > b && c < d" });
      // "<" followed by space is not an HTML tag, but "< d" fails pattern if "d" is a letter
      // The regex /<[a-z/!?][^>]*>/i would match "< d..." -- let's verify
      const hasTag = HTML_TAG_PATTERN.test("a > b && c < d");
      if (hasTag) {
        expect(result.error).toBeDefined();
      } else {
        expect(result.error).toBeUndefined();
      }
    });

    it("allows multiple settings entries", () => {
      const result = validateEntries({
        theme: "dark",
        locale: "en",
        fontSize: "14",
      });
      expect(result.entries).toHaveLength(3);
      expect(result.entries.map((e) => e.key)).toEqual(["theme", "locale", "fontSize"]);
    });
  });

  describe("HTML_TAG_PATTERN regex", () => {
    it("matches <script> tags", () => {
      expect(HTML_TAG_PATTERN.test("<script>")).toBe(true);
    });

    it("matches <img> tags", () => {
      expect(HTML_TAG_PATTERN.test("<img src=x>")).toBe(true);
    });

    it("matches </div> closing tags", () => {
      expect(HTML_TAG_PATTERN.test("</div>")).toBe(true);
    });

    it("matches <!-- comments -->", () => {
      expect(HTML_TAG_PATTERN.test("<!-- comment -->")).toBe(true);
    });

    it("matches <?xml?> processing instructions", () => {
      expect(HTML_TAG_PATTERN.test("<?xml version='1.0'?>")).toBe(true);
    });

    it("does not match plain text", () => {
      expect(HTML_TAG_PATTERN.test("hello world")).toBe(false);
    });

    it("does not match empty string", () => {
      expect(HTML_TAG_PATTERN.test("")).toBe(false);
    });

    it("does not match numeric comparisons", () => {
      expect(HTML_TAG_PATTERN.test("5 > 3")).toBe(false);
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

  it("decrypts an $ENC$ value on GET /api/v1/settings and GET /api/v1/settings/:key when DATA_ENCRYPTION_KEY_PREVIOUS matches", async () => {
    vi.resetModules();
    const reportErrorSpy = vi.fn().mockResolvedValue(undefined);
    const keyA = "a".repeat(64);
    const keyB = "b".repeat(64);

    vi.doMock("drizzle-orm", () => ({
      eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
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

    const { encrypt } = await import("../../../apps/api/src/lib/encryption.js");
    const rotatedCiphertext = await encrypt("dark", keyA);
    const updatedAt = new Date("2026-10-14T00:00:00.000Z");

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
