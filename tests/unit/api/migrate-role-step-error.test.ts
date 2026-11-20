import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// runMigrations() turns a 42501 from the privileged boot sequence into an
// operator-facing error. A 42501 from the runtime role step means something
// different from one in the grants or the migrations (#4907): on Postgres 16
// and later CREATEROLE alone cannot alter a role the migration role did not
// create, so blaming CREATEROLE sent operators who already had it nowhere.

const ensureRuntimeRole = vi.fn();
const grantRuntimePrivileges = vi.fn();
const grantOnExistingObjects = vi.fn();
const migrate = vi.fn();

function permissionDenied(message: string): Error {
  return Object.assign(new Error(message), { code: "42501" });
}

beforeEach(() => {
  vi.resetModules();
  for (const fn of [ensureRuntimeRole, grantRuntimePrivileges, grantOnExistingObjects, migrate]) {
    fn.mockReset();
  }
  ensureRuntimeRole.mockResolvedValue(false);
  grantRuntimePrivileges.mockResolvedValue(undefined);
  grantOnExistingObjects.mockResolvedValue(undefined);
  migrate.mockResolvedValue(undefined);

  vi.doMock("../../../apps/api/src/config.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/api/src/config.js")>();
    return {
      ...actual,
      env: {
        ...actual.env,
        DATABASE_URL: "postgres://snapotter_app:runtime-pw@db:5432/snapotter",
        DATABASE_MIGRATION_URL: "postgres://snapotter:owner-pw@db:5432/snapotter",
      },
    };
  });
  vi.doMock("../../../apps/api/src/lib/logger.js", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  }));
  vi.doMock("../../../apps/api/src/db/index.js", () => ({ pool: {} }));
  vi.doMock("../../../apps/api/src/db/bootstrap-roles.js", () => ({
    ensureRuntimeRole,
    grantRuntimePrivileges,
    grantOnExistingObjects,
  }));
  vi.doMock("pg", () => {
    class Client {
      on() {}
      async connect() {}
      async end() {}
    }
    return { default: { Client } };
  });
  vi.doMock("drizzle-orm/node-postgres", () => ({
    drizzle: () => ({ execute: vi.fn().mockResolvedValue(undefined) }),
  }));
  vi.doMock("drizzle-orm/node-postgres/migrator", () => ({ migrate }));
});

afterEach(() => {
  for (const mod of [
    "pg",
    "drizzle-orm/node-postgres",
    "drizzle-orm/node-postgres/migrator",
    "../../../apps/api/src/config.js",
    "../../../apps/api/src/lib/logger.js",
    "../../../apps/api/src/db/index.js",
    "../../../apps/api/src/db/bootstrap-roles.js",
  ]) {
    vi.doUnmock(mod);
  }
});

async function bootFailure(): Promise<Error & { code?: string; cause?: unknown }> {
  const { runMigrations } = await import("../../../apps/api/src/db/migrate.js");
  return runMigrations().then(
    () => {
      throw new Error("runMigrations() resolved");
    },
    (err: Error & { code?: string; cause?: unknown }) => err,
  );
}

describe("runMigrations() privilege errors", () => {
  it("names ADMIN OPTION when the runtime role step is refused", async () => {
    const denied = permissionDenied("permission denied to alter role");
    ensureRuntimeRole.mockRejectedValue(denied);

    const failure = await bootFailure();

    expect(failure.code).toBe("migration-role-cannot-manage-runtime-role");
    expect(failure.message).toContain("CREATEROLE");
    expect(failure.message).toContain("ADMIN OPTION");
    expect(failure.message).toContain("WITH ADMIN OPTION, INHERIT FALSE, SET FALSE");
    // Constant message: nothing read from the connection strings ends up in it.
    expect(failure.message).not.toContain("snapotter_app");
    expect(failure.message).not.toContain("pw");
    expect(failure.cause).toBe(denied);
    expect(grantRuntimePrivileges).not.toHaveBeenCalled();
    expect(migrate).not.toHaveBeenCalled();
  });

  it.each([
    ["the grants", () => grantRuntimePrivileges],
    ["the migrations", () => migrate],
    ["the backfill sweep", () => grantOnExistingObjects],
  ])("keeps the ownership message when %s are refused", async (_label, step) => {
    step().mockRejectedValue(permissionDenied("permission denied for table users"));

    const failure = await bootFailure();

    expect(failure.code).toBe("migration-role-not-owner");
    expect(failure.message).toContain("own the SnapOtter tables");
    expect(failure.message).not.toContain("ADMIN OPTION");
  });

  it("passes other runtime role errors through untouched", async () => {
    const refused = Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
    ensureRuntimeRole.mockRejectedValue(refused);

    await expect(bootFailure()).resolves.toBe(refused);
  });
});
