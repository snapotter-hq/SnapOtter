import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ── DB mock for findUniqueUsername tests ──────────────────────────

const dbMock = vi.hoisted(() => {
  let idx = 0;
  let results: unknown[][] = [];
  const queryResult = () => {
    const promise = Promise.resolve(results[idx++] ?? []);
    return Object.assign(promise, {
      limit: () => promise,
    });
  };
  return {
    reset(r: unknown[][]) {
      idx = 0;
      results = r;
    },
    nextResult() {
      return results[idx++] ?? [];
    },
    queryResult,
  };
});

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => dbMock.queryResult(),
      }),
    }),
    insert: () => ({
      values: () => {
        const result = Promise.resolve({ rowCount: 1 });
        return Object.assign(result, { onConflictDoNothing: () => result });
      },
    }),
  },
  schema: {
    users: {
      username: "username",
      externalId: "external_id",
      authProvider: "auth_provider",
      email: "email",
    },
  },
}));

// ── Pure function tests (no DB required) ─────────────────────────

describe("external auth resolver", () => {
  it("module exports resolveExternalUser", async () => {
    const mod = await import("../../../apps/api/src/lib/external-auth-resolver.js");
    expect(typeof mod.resolveExternalUser).toBe("function");
  });

  it("module exports sanitizeUsername", async () => {
    const mod = await import("../../../apps/api/src/lib/external-auth-resolver.js");
    expect(typeof mod.sanitizeUsername).toBe("function");
  });

  it("module exports findUniqueUsername", async () => {
    const mod = await import("../../../apps/api/src/lib/external-auth-resolver.js");
    expect(typeof mod.findUniqueUsername).toBe("function");
  });
});

describe("sanitizeUsername", () => {
  let sanitizeUsername: (raw: string) => string;

  beforeAll(async () => {
    const mod = await import("../../../apps/api/src/lib/external-auth-resolver.js");
    sanitizeUsername = mod.sanitizeUsername;
  });

  it("lowercases input", () => {
    expect(sanitizeUsername("JohnDoe")).toBe("johndoe");
  });

  it("replaces non-alphanumeric characters with underscores", () => {
    expect(sanitizeUsername("john doe!")).toBe("john_doe");
  });

  it("collapses multiple underscores", () => {
    expect(sanitizeUsername("john___doe")).toBe("john_doe");
  });

  it("strips leading and trailing separators", () => {
    expect(sanitizeUsername("_john_")).toBe("john");
    expect(sanitizeUsername(".john.")).toBe("john");
    expect(sanitizeUsername("-john-")).toBe("john");
  });

  it("truncates to 46 characters", () => {
    const long = "a".repeat(60);
    expect(sanitizeUsername(long).length).toBe(46);
  });

  it("pads short usernames to 3 characters", () => {
    expect(sanitizeUsername("ab").length).toBe(3);
    expect(sanitizeUsername("ab")).toBe("ab_");
  });

  it("preserves dots and hyphens", () => {
    expect(sanitizeUsername("john.doe")).toBe("john.doe");
    expect(sanitizeUsername("john-doe")).toBe("john-doe");
  });

  it("handles email addresses as input", () => {
    expect(sanitizeUsername("user@example.com")).toBe("user_example.com");
  });

  it("handles empty-after-strip edge case", () => {
    // All characters stripped, then padded
    const result = sanitizeUsername("___");
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("handles pure whitespace input", () => {
    const result = sanitizeUsername("   ");
    expect(result).toBe("___");
  });

  it("handles numeric-only input", () => {
    expect(sanitizeUsername("12345")).toBe("12345");
  });

  it("handles single character input by padding to 3", () => {
    const result = sanitizeUsername("a");
    expect(result).toBe("a__");
    expect(result.length).toBe(3);
  });

  it("does not truncate input that is exactly 46 characters", () => {
    const input = "a".repeat(46);
    const result = sanitizeUsername(input);
    expect(result).toBe(input);
    expect(result.length).toBe(46);
  });

  it("truncates input that is exactly 47 characters to 46", () => {
    const input = "a".repeat(47);
    const result = sanitizeUsername(input);
    expect(result.length).toBe(46);
  });

  it("preserves consecutive dots and hyphens", () => {
    expect(sanitizeUsername("john..--..doe")).toBe("john..--..doe");
  });

  it("replaces unicode characters with underscores", () => {
    expect(sanitizeUsername("café")).toBe("caf");
    expect(sanitizeUsername("jöhn")).toBe("j_hn");
  });

  it("strips leading @ from input", () => {
    expect(sanitizeUsername("@user")).toBe("user");
  });

  it("passes through admin as a valid username", () => {
    expect(sanitizeUsername("admin")).toBe("admin");
  });

  it("allows input that starts with numbers", () => {
    expect(sanitizeUsername("123abc")).toBe("123abc");
    expect(sanitizeUsername("42user")).toBe("42user");
  });
});

describe("findUniqueUsername", () => {
  let findUniqueUsername: (base: string) => Promise<string>;

  beforeAll(async () => {
    const mod = await import("../../../apps/api/src/lib/external-auth-resolver.js");
    findUniqueUsername = mod.findUniqueUsername;
  });

  beforeEach(() => {
    dbMock.reset([]);
  });

  it("returns the base username when it is not taken", async () => {
    dbMock.reset([[]]);
    const result = await findUniqueUsername("newuser");
    expect(result).toBe("newuser");
  });

  it("appends _2 when the base username is taken", async () => {
    dbMock.reset([[{ username: "taken" }], []]);
    const result = await findUniqueUsername("taken");
    expect(result).toBe("taken_2");
  });

  it("appends _3 when both base and _2 are taken", async () => {
    dbMock.reset([[{ username: "taken" }], [{ username: "taken_2" }], []]);
    const result = await findUniqueUsername("taken");
    expect(result).toBe("taken_3");
  });

  it("resolves collisions through the loop until a free slot is found", async () => {
    dbMock.reset([
      [{ username: "user" }],
      [{ username: "user_2" }],
      [{ username: "user_3" }],
      [{ username: "user_4" }],
      [],
    ]);
    const result = await findUniqueUsername("user");
    expect(result).toBe("user_5");
  });
});

describe("resolveExternalUser", () => {
  beforeEach(() => {
    dbMock.reset([]);
  });

  it("denies SSO auto-create when the configured default role is disabled", async () => {
    const mod = await import("../../../apps/api/src/lib/external-auth-resolver.js");
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };
    const result = await mod.resolveExternalUser({
      provider: "oidc",
      externalId: "subject-1",
      username: "subject",
      autoCreate: true,
      autoLink: false,
      defaultRole: "disabled",
      logger: logger as never,
      ip: "127.0.0.1",
      requestId: "req-1",
    });

    expect(result).toEqual({
      user: null,
      action: "denied",
      deniedReason: "user_disabled",
    });
    expect(logger.warn).toHaveBeenCalledWith("oidc auto-create blocked: default role is disabled");
  });
});
