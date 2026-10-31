import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #1315. tests/global-setup.ts teardown is the only thing that clears a run's
 * last per-file databases and roles on a TEST_DATABASE_URL server. The
 * integration hygiene test calls dropRunLeftovers directly; this pins that
 * teardown really calls it, with this run's names.
 */

const { dropRunLeftovers } = vi.hoisted(() => ({ dropRunLeftovers: vi.fn() }));
vi.mock("../setup/fork-db.js", () => ({ dropRunLeftovers }));
vi.mock("@testcontainers/postgresql", () => ({ PostgreSqlContainer: vi.fn() }));
vi.mock("@testcontainers/redis", () => ({ RedisContainer: vi.fn() }));

const saved = { base: process.env.TEST_PG_BASE_URL, run: process.env.TEST_RUN_ID };

describe("global teardown clears the run's leftovers (#1315)", () => {
  beforeEach(() => {
    process.env.TEST_PG_BASE_URL = "postgres://admin@db.example:5432/postgres";
    process.env.TEST_RUN_ID = "abcd1234";
    dropRunLeftovers.mockReset();
  });

  afterEach(() => {
    process.env.TEST_PG_BASE_URL = saved.base;
    process.env.TEST_RUN_ID = saved.run;
    vi.restoreAllMocks();
  });

  it("drops this run's databases and roles on a server it didn't start", async () => {
    dropRunLeftovers.mockResolvedValue({ databases: [], roles: [], failed: [] });
    const { teardown } = await import("../global-setup.js");
    await teardown();
    expect(dropRunLeftovers).toHaveBeenCalledWith(
      "postgres://admin@db.example:5432/postgres",
      "snapotter_app_test",
      "abcd1234",
    );
  });

  it("names what it couldn't drop", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    dropRunLeftovers.mockResolvedValue({
      databases: [],
      roles: [],
      failed: ["snapotter_test_abcd1234_7_0f0f0f0f"],
    });
    const { teardown } = await import("../global-setup.js");
    await teardown();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("snapotter_test_abcd1234_7_0f0f0f0f"),
    );
  });

  it("finishes teardown when the cleanup itself throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    dropRunLeftovers.mockRejectedValue(new Error("connection refused"));
    const { teardown } = await import("../global-setup.js");
    await expect(teardown()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
