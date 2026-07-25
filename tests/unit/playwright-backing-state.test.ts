import { describe, expect, test } from "vitest";
import {
  ownsPlaywrightRedisKey,
  resolvePlaywrightBackingState,
  teardownPlaywrightBackingState,
} from "../playwright-backing-state.mjs";

const POSTGRES_BASE_URL = "postgres://snapotter:snapotter@127.0.0.1:5432/snapotter";
const REDIS_URL = "redis://127.0.0.1:6379/0";

function backingState(runId = "owner_run_001", scope = "main") {
  return resolvePlaywrightBackingState({
    postgresBaseUrl: POSTGRES_BASE_URL,
    redisUrl: REDIS_URL,
    runId,
    scope,
  });
}

describe("Playwright backing-state ownership", () => {
  test("derives stable isolated database and BullMQ identities from the validated run and scope", () => {
    const main = backingState("stable_run_001", "main");
    const same = backingState("stable_run_001", "main");
    const analytics = backingState("stable_run_001", "analytics-local");

    expect(main).toEqual(same);
    expect(main.databaseName).toMatch(/^snapotter_e2e_main_[a-f0-9]{24}$/);
    expect(main.bullmqPrefix).toBe(main.databaseName);
    expect(new URL(main.databaseUrl).pathname).toBe(`/${main.databaseName}`);
    expect(analytics.databaseName).not.toBe(main.databaseName);
  });

  test.each([
    { runId: "../shared", scope: "main" },
    { runId: "safe_run", scope: "../main" },
    { runId: "safe_run", scope: "Main" },
  ])("rejects unsafe ownership input before deriving targets: $runId / $scope", (input) => {
    expect(() =>
      resolvePlaywrightBackingState({
        postgresBaseUrl: POSTGRES_BASE_URL,
        redisUrl: REDIS_URL,
        ...input,
      }),
    ).toThrow(/Playwright (run id|backing-state scope)/);
  });

  test("recognizes only exact run-owned Redis namespaces", () => {
    const state = backingState();
    const prefix = state.bullmqPrefix;

    const owned = [
      `${prefix}:analytics-gate`,
      `${prefix}:terminal:job-1`,
      `${prefix}:batch:job-1:progress`,
      `bull:${prefix}-image:meta`,
      `bull:${prefix}-media:wait`,
      `bull:${prefix}-ai:events`,
      `bull:${prefix}-docs:completed`,
      `bull:${prefix}-system:failed`,
    ];
    const foreign = [
      prefix,
      `${prefix}_sibling:terminal:job-1`,
      `foreign:${prefix}:terminal:job-1`,
      `bull:${prefix}_sibling-image:meta`,
      `bull:foreign-${prefix}-image:meta`,
      `bull:${prefix}-unknown:meta`,
      "snapotter:terminal:job-1",
    ];

    for (const key of owned) expect(ownsPlaywrightRedisKey(state, key), key).toBe(true);
    for (const key of foreign) expect(ownsPlaywrightRedisKey(state, key), key).toBe(false);
  });

  test("deletes only the exact database and Redis keys owned by this run", async () => {
    const state = backingState();
    const sibling = backingState("owner_run_001_extra");
    const databases = new Set([state.databaseName, sibling.databaseName, "snapotter"]);
    const redisKeys = new Set([
      `${state.bullmqPrefix}:terminal:owned-job`,
      `bull:${state.bullmqPrefix}-ai:owned-job`,
      `${sibling.bullmqPrefix}:terminal:sibling-job`,
      `bull:${sibling.bullmqPrefix}-ai:sibling-job`,
      `foreign:${state.bullmqPrefix}:terminal:embedded-substring`,
      "unrelated:key",
    ]);

    const result = await teardownPlaywrightBackingState(state, {
      async deleteRedisKeys(_ownedState, ownsKey) {
        let deleted = 0;
        for (const key of [...redisKeys]) {
          if (!ownsKey(key)) continue;
          redisKeys.delete(key);
          deleted += 1;
        }
        return deleted;
      },
      async dropDatabase(ownedState) {
        databases.delete(ownedState.databaseName);
      },
    });

    expect(result).toEqual({ deletedRedisKeys: 2 });
    expect(databases).toEqual(new Set([sibling.databaseName, "snapotter"]));
    expect(redisKeys).toEqual(
      new Set([
        `${sibling.bullmqPrefix}:terminal:sibling-job`,
        `bull:${sibling.bullmqPrefix}-ai:sibling-job`,
        `foreign:${state.bullmqPrefix}:terminal:embedded-substring`,
        "unrelated:key",
      ]),
    );
  });

  test.each(["databaseName", "bullmqPrefix"] as const)(
    "refuses a tampered %s before either backend can be mutated",
    async (field) => {
      const state = backingState();
      const databases = new Set([state.databaseName, "production"]);
      const redisKeys = new Set([`${state.bullmqPrefix}:terminal:owned-job`, "production:key"]);
      const tampered = { ...state, [field]: "production" };

      await expect(
        teardownPlaywrightBackingState(tampered, {
          async deleteRedisKeys(_ownedState, ownsKey) {
            for (const key of [...redisKeys]) {
              if (ownsKey(key)) redisKeys.delete(key);
            }
            return 0;
          },
          async dropDatabase(ownedState) {
            databases.delete(ownedState.databaseName);
          },
        }),
      ).rejects.toThrow(/does not match the validated run identity/);

      expect(databases).toEqual(new Set([state.databaseName, "production"]));
      expect(redisKeys).toEqual(
        new Set([`${state.bullmqPrefix}:terminal:owned-job`, "production:key"]),
      );
    },
  );

  test("still attempts Redis cleanup when exact database deletion fails", async () => {
    const state = backingState();
    const redisKeys = new Set([`${state.bullmqPrefix}:terminal:owned-job`, "unrelated:key"]);

    await expect(
      teardownPlaywrightBackingState(state, {
        async deleteRedisKeys(_ownedState, ownsKey) {
          for (const key of [...redisKeys]) {
            if (ownsKey(key)) redisKeys.delete(key);
          }
          return 1;
        },
        async dropDatabase() {
          throw new Error("postgres unavailable");
        },
      }),
    ).rejects.toThrow(/postgres unavailable/);

    expect(redisKeys).toEqual(new Set(["unrelated:key"]));
  });
});
