import { EventEmitter } from "node:events";
import { describe, expect, test } from "vitest";
import { runPlaywrightApiLifecycle } from "../playwright-api-lifecycle.mjs";
import {
  resolvePlaywrightBackingState,
  teardownPlaywrightBackingState,
} from "../playwright-backing-state.mjs";

const POSTGRES_BASE_URL = "postgres://snapotter:snapotter@127.0.0.1:5432/snapotter";
const REDIS_URL = "redis://127.0.0.1:6379/0";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("condition was not reached");
}

function harness(runId: string) {
  const state = resolvePlaywrightBackingState({
    postgresBaseUrl: POSTGRES_BASE_URL,
    redisUrl: REDIS_URL,
    runId,
    scope: "main",
  });
  const sibling = resolvePlaywrightBackingState({
    postgresBaseUrl: POSTGRES_BASE_URL,
    redisUrl: REDIS_URL,
    runId: `${runId}_sibling`,
    scope: "main",
  });
  const databases = new Set(["snapotter"]);
  const redisKeys = new Set(["unrelated:key"]);
  const events: string[] = [];
  const childExit = deferred<{ code: number | null; signal: NodeJS.Signals | null }>();
  const signals = new EventEmitter();

  return {
    childExit,
    databases,
    events,
    redisKeys,
    sibling,
    signals,
    state,
    options: {
      async createDatabase() {
        databases.add(state.databaseName);
        databases.add(sibling.databaseName);
        redisKeys.add(`${state.bullmqPrefix}:terminal:owned-job`);
        redisKeys.add(`bull:${state.bullmqPrefix}-media:owned-job`);
        redisKeys.add(`${sibling.bullmqPrefix}:terminal:sibling-job`);
        redisKeys.add(`foreign:${state.bullmqPrefix}:embedded-substring`);
        events.push("created");
      },
      signalSource: signals,
      startApi() {
        events.push("started");
        return {
          completion: childExit.promise.then((result) => {
            events.push("child-exit");
            return result;
          }),
          stop(signal: NodeJS.Signals) {
            events.push(`stop:${signal}`);
            childExit.resolve({ code: null, signal });
          },
        };
      },
      async teardown() {
        await teardownPlaywrightBackingState(state, {
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
        events.push("teardown");
      },
    },
  };
}

function expectOnlyForeignStateRemains(context: ReturnType<typeof harness>) {
  expect(context.databases).toEqual(new Set(["snapotter", context.sibling.databaseName]));
  expect(context.redisKeys).toEqual(
    new Set([
      "unrelated:key",
      `${context.sibling.bullmqPrefix}:terminal:sibling-job`,
      `foreign:${context.state.bullmqPrefix}:embedded-substring`,
    ]),
  );
}

describe("Playwright API backing-state lifecycle", () => {
  test("tears down exact run-owned state after a successful API exit", async () => {
    const context = harness("lifecycle_success");
    const running = runPlaywrightApiLifecycle(context.options);

    await waitFor(() => context.events.includes("started"));
    expect(context.databases).toContain(context.state.databaseName);
    context.childExit.resolve({ code: 0, signal: null });

    await expect(running).resolves.toBe(0);
    expect(context.events).toEqual(["created", "started", "child-exit", "teardown"]);
    expectOnlyForeignStateRemains(context);
  });

  test("tears down exact run-owned state after a failing API exit", async () => {
    const context = harness("lifecycle_failure");
    const running = runPlaywrightApiLifecycle(context.options);

    await waitFor(() => context.events.includes("started"));
    context.childExit.resolve({ code: 7, signal: null });

    await expect(running).resolves.toBe(7);
    expect(context.events.at(-1)).toBe("teardown");
    expectOnlyForeignStateRemains(context);
  });

  test("stops the API before exact teardown when Playwright interrupts the wrapper", async () => {
    const context = harness("lifecycle_interrupted");
    const running = runPlaywrightApiLifecycle(context.options);

    await waitFor(() => context.events.includes("started"));
    context.signals.emit("SIGTERM");

    await expect(running).resolves.toBe(143);
    expect(context.events).toEqual([
      "created",
      "started",
      "stop:SIGTERM",
      "child-exit",
      "teardown",
    ]);
    expectOnlyForeignStateRemains(context);
  });

  test("attempts exact teardown when API startup throws", async () => {
    const context = harness("lifecycle_startup_failure");
    const startupError = new Error("spawn failed");

    await expect(
      runPlaywrightApiLifecycle({
        ...context.options,
        startApi() {
          context.events.push("start-failed");
          throw startupError;
        },
      }),
    ).rejects.toBe(startupError);

    expect(context.events).toEqual(["created", "start-failed", "teardown"]);
    expectOnlyForeignStateRemains(context);
  });
});
