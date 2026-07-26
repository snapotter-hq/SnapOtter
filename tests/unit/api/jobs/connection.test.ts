import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RedisStub = {
  ping: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  /** Fires the handler registered for an event, as ioredis would. */
  emitOnce: (event: string) => void;
};

const { RedisMock, stubs } = vi.hoisted(() => {
  const created: RedisStub[] = [];
  const mock = vi.fn(function RedisMock() {
    const handlers = new Map<string, () => void>();
    const stub: RedisStub = {
      ping: vi.fn().mockResolvedValue("PONG"),
      quit: vi.fn().mockResolvedValue("OK"),
      info: vi.fn().mockResolvedValue("# Server\r\nredis_version:8.0.1\r\n"),
      once: vi.fn((event: string, handler: () => void) => {
        handlers.set(event, handler);
        return stub;
      }),
      emitOnce: (event: string) => handlers.get(event)?.(),
    };
    created.push(stub);
    return stub;
  });
  return { RedisMock: mock, stubs: created };
});

/**
 * Every connection carries an inactivity timeout so a socket whose peer moved
 * away cannot sit there forever waiting for a reply that will never come
 * (PERF-20260726-007). It has to clear BullMQ's 10 s blocking reads.
 */
const SOCKET_TIMEOUT_MS = 30_000;

vi.mock("ioredis", () => ({
  default: RedisMock,
}));

// Fresh module graph per test so the module-level `_shared` singleton
// never leaks state across cases.
async function freshModule() {
  vi.resetModules();
  return import("../../../../apps/api/src/jobs/connection.js");
}

describe("Redis connection factory", () => {
  beforeEach(() => {
    RedisMock.mockClear();
    stubs.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps ready checks enabled for command connections", async () => {
    const { createRedisConnection } = await freshModule();

    createRedisConnection();

    expect(RedisMock).toHaveBeenCalledWith(expect.any(String), {
      enableReadyCheck: true,
      maxRetriesPerRequest: null,
      socketTimeout: SOCKET_TIMEOUT_MS,
    });
  });

  it("disables ready checks for pub/sub-only subscriber connections", async () => {
    const { createRedisSubscriberConnection } = await freshModule();

    createRedisSubscriberConnection();

    expect(RedisMock).toHaveBeenCalledWith(expect.any(String), {
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      socketTimeout: SOCKET_TIMEOUT_MS,
    });
  });

  it("gives every connection an inactivity timeout clear of BullMQ's blocking reads", async () => {
    const { createRedisConnection, createRedisSubscriberConnection } = await freshModule();

    createRedisConnection();
    createRedisSubscriberConnection();

    // A socket the server stopped answering has to be destroyed by something,
    // or a consumer parked on a blocking read waits on it forever.
    for (const call of RedisMock.mock.calls) {
      const options = call[1] as { socketTimeout?: number };
      expect(options.socketTimeout).toBe(SOCKET_TIMEOUT_MS);
      // BullMQ caps every blocking read at 10 s, so anything at or under that
      // would kill healthy idle consumers.
      expect(options.socketTimeout).toBeGreaterThan(10_000);
    }
  });

  it("createBullMQConnection builds a command connection and returns the ioredis instance", async () => {
    const { createBullMQConnection } = await freshModule();

    const conn = createBullMQConnection();

    // It constructs exactly one command-style connection (ready checks on)...
    expect(RedisMock).toHaveBeenCalledTimes(1);
    expect(RedisMock).toHaveBeenCalledWith(expect.any(String), {
      enableReadyCheck: true,
      maxRetriesPerRequest: null,
      socketTimeout: SOCKET_TIMEOUT_MS,
    });
    // ...and hands the raw instance straight through (cast only).
    expect(conn).toBe(stubs[0]);
  });

  it("keeps a subscriber socket probed so a dead one can be noticed", async () => {
    vi.useFakeTimers();
    try {
      const { createRedisSubscriberConnection } = await freshModule();

      const subscriber = createRedisSubscriberConnection();
      expect(subscriber.ping).not.toHaveBeenCalled();

      // Nothing writes on a subscriber after SUBSCRIBE, so without this ping
      // there is no outstanding command for the inactivity timeout to time.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(subscriber.ping).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(subscriber.ping).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops probing once the subscriber connection has ended", async () => {
    vi.useFakeTimers();
    try {
      const { createRedisSubscriberConnection } = await freshModule();

      const subscriber = createRedisSubscriberConnection();
      subscriber.emitOnce("end");
      await vi.advanceTimersByTimeAsync(60_000);

      expect(subscriber.ping).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("swallows a rejected probe, because a rejection is the reconnect starting", async () => {
    vi.useFakeTimers();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const { createRedisSubscriberConnection } = await freshModule();

      const subscriber = createRedisSubscriberConnection();
      subscriber.ping.mockRejectedValue(new Error("Connection is closed."));
      await vi.advanceTimersByTimeAsync(10_000);

      expect(subscriber.ping).toHaveBeenCalledTimes(1);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
      vi.useRealTimers();
    }
  });

  it("sharedRedis memoizes a single connection across calls", async () => {
    const { sharedRedis } = await freshModule();

    const first = sharedRedis();
    const second = sharedRedis();

    expect(first).toBe(second);
    expect(RedisMock).toHaveBeenCalledTimes(1);
  });
});

describe("pingRedis", () => {
  beforeEach(() => {
    RedisMock.mockClear();
    stubs.length = 0;
  });

  it("returns true when the server answers PONG", async () => {
    const { pingRedis } = await freshModule();

    await expect(pingRedis()).resolves.toBe(true);
    expect(stubs[0].ping).toHaveBeenCalledTimes(1);
  });

  it("returns false when the reply is not PONG", async () => {
    const mod = await freshModule();
    // The first sharedRedis() call inside pingRedis constructs the stub;
    // force its ping to answer something other than PONG.
    const spyPing = vi.fn().mockResolvedValue("LOADING");
    // Replace the ping the next-constructed stub will use by patching the
    // stub right after construction: prime it via a throwaway sharedRedis().
    const stub = mod.sharedRedis();
    stub.ping = spyPing as unknown as RedisStub["ping"];

    await expect(mod.pingRedis()).resolves.toBe(false);
    expect(spyPing).toHaveBeenCalledTimes(1);
  });
});

describe("closeRedis", () => {
  beforeEach(() => {
    RedisMock.mockClear();
    stubs.length = 0;
  });

  it("quits the live shared connection and clears the singleton", async () => {
    const { sharedRedis, closeRedis } = await freshModule();

    const before = sharedRedis();
    await closeRedis();

    expect(before.quit).toHaveBeenCalledTimes(1);

    // Singleton was cleared: the next sharedRedis() constructs a NEW instance.
    const after = sharedRedis();
    expect(after).not.toBe(before);
    expect(RedisMock).toHaveBeenCalledTimes(2);
  });

  it("is a no-op when no shared connection was ever created", async () => {
    const { closeRedis } = await freshModule();

    await expect(closeRedis()).resolves.toBeUndefined();
    // Nothing was constructed, so no quit could have run.
    expect(RedisMock).not.toHaveBeenCalled();
  });
});

describe("assertRedisCompatible", () => {
  beforeEach(() => {
    RedisMock.mockClear();
    stubs.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves silently when INFO reports a supported version", async () => {
    const mod = await freshModule();
    const stub = mod.sharedRedis();
    stub.info = vi
      .fn()
      .mockResolvedValue("redis_version:8.0.1\r\n") as unknown as RedisStub["info"];

    await expect(mod.assertRedisCompatible()).resolves.toBeUndefined();
    expect(stub.info).toHaveBeenCalledWith("server");
  });

  it("throws a SafeError when INFO reports a too-old version", async () => {
    const mod = await freshModule();
    const stub = mod.sharedRedis();
    stub.info = vi.fn().mockResolvedValue("redis_version:6.0.16") as unknown as RedisStub["info"];

    await expect(mod.assertRedisCompatible()).rejects.toMatchObject({
      name: "SafeError",
      code: "redis-6.0",
      message: "Redis 6.2 or newer is required. Point REDIS_URL at Redis 8.",
    });
  });

  it("does not block boot when INFO is not permitted (warns and returns)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mod = await freshModule();
    const stub = mod.sharedRedis();
    stub.info = vi
      .fn()
      .mockRejectedValue(
        new Error("NOPERM this user has no permissions to run INFO"),
      ) as unknown as RedisStub["info"];

    await expect(mod.assertRedisCompatible()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("[redis] INFO not permitted; skipping version preflight");
  });

  it("does not throw when INFO is unparseable (managed Redis hides details)", async () => {
    const mod = await freshModule();
    const stub = mod.sharedRedis();
    stub.info = vi
      .fn()
      .mockResolvedValue("garbage-without-version") as unknown as RedisStub["info"];

    await expect(mod.assertRedisCompatible()).resolves.toBeUndefined();
  });
});
