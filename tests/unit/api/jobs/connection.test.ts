import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RedisStub = {
  ping: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
};

const { RedisMock, stubs } = vi.hoisted(() => {
  const created: RedisStub[] = [];
  const mock = vi.fn(function RedisMock() {
    const stub: RedisStub = {
      ping: vi.fn().mockResolvedValue("PONG"),
      quit: vi.fn().mockResolvedValue("OK"),
      info: vi.fn().mockResolvedValue("# Server\r\nredis_version:8.0.1\r\n"),
    };
    created.push(stub);
    return stub;
  });
  return { RedisMock: mock, stubs: created };
});

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
    });
  });

  it("disables ready checks for pub/sub-only subscriber connections", async () => {
    const { createRedisSubscriberConnection } = await freshModule();

    createRedisSubscriberConnection();

    expect(RedisMock).toHaveBeenCalledWith(expect.any(String), {
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    });
  });

  it("createBullMQConnection builds a command connection and returns the ioredis instance", async () => {
    const { createBullMQConnection } = await freshModule();

    const conn = createBullMQConnection();

    // It constructs exactly one command-style connection (ready checks on)...
    expect(RedisMock).toHaveBeenCalledTimes(1);
    expect(RedisMock).toHaveBeenCalledWith(expect.any(String), {
      enableReadyCheck: true,
      maxRetriesPerRequest: null,
    });
    // ...and hands the raw instance straight through (cast only).
    expect(conn).toBe(stubs[0]);
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
