import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RedisStub = {
  status: string;
  options: Record<string, unknown>;
  ping: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  duplicate: ReturnType<typeof vi.fn>;
  defineCommand: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  getMaxListeners: ReturnType<typeof vi.fn>;
  setMaxListeners: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  /** Fires the handler registered via once(), as ioredis would. */
  emitOnce: (event: string) => void;
  /** Fires every handler registered via on(). Throws if none exist, like an EventEmitter "error" would. */
  emitOn: (event: string, ...args: unknown[]) => void;
};

const { RedisMock, stubs } = vi.hoisted(() => {
  const created: RedisStub[] = [];
  const mock = vi.fn(function RedisMock(
    urlOrOpts?: string | Record<string, unknown>,
    maybeOpts?: Record<string, unknown>,
  ) {
    const handlers = new Map<string, () => void>();
    const onHandlers = new Map<string, ((...args: unknown[]) => void)[]>();
    const parsedOpts =
      typeof urlOrOpts === "string" ? { url: urlOrOpts, ...maybeOpts } : { ...urlOrOpts };
    let maxListeners = 10;
    const removeHandler = (event: string, handler: (...args: unknown[]) => void) => {
      const current = onHandlers.get(event);
      if (current) {
        onHandlers.set(
          event,
          current.filter((fn) => fn !== handler),
        );
      }
      if (handlers.get(event) === handler) {
        handlers.delete(event);
      }
      return stub;
    };
    const stub: RedisStub = {
      status: "ready",
      options: parsedOpts,
      ping: vi.fn().mockResolvedValue("PONG"),
      quit: vi.fn(async () => {
        stub.status = "end";
        handlers.get("end")?.();
        return "OK";
      }),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(() => {
        stub.status = "end";
        handlers.get("end")?.();
      }),
      duplicate: vi.fn((override?: Record<string, unknown>) => {
        return new (mock as unknown as new (opts: Record<string, unknown>) => RedisStub)({
          ...parsedOpts,
          ...override,
        });
      }),
      defineCommand: vi.fn(),
      info: vi.fn().mockResolvedValue("# Server\r\nredis_version:8.0.1\r\n"),
      getMaxListeners: vi.fn(() => maxListeners),
      setMaxListeners: vi.fn((n: number) => {
        maxListeners = n;
        return stub;
      }),
      once: vi.fn((event: string, handler: () => void) => {
        handlers.set(event, handler);
        return stub;
      }),
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        onHandlers.set(event, [...(onHandlers.get(event) ?? []), handler]);
        return stub;
      }),
      off: vi.fn(removeHandler),
      removeListener: vi.fn(removeHandler),
      emitOnce: (event: string) => handlers.get(event)?.(),
      emitOn: (event: string, ...args: unknown[]) => {
        const listeners = onHandlers.get(event);
        if (!listeners || listeners.length === 0) {
          // Mirror Node's EventEmitter contract for "error": no listener
          // means the process goes down. That is the bug under test.
          throw args[0] instanceof Error ? args[0] : new Error(`unhandled ${event}`);
        }
        for (const listener of listeners) listener(...args);
      },
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
const loggerMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }));

async function freshModule() {
  vi.resetModules();
  loggerMock.error.mockClear();
  loggerMock.warn.mockClear();
  vi.doMock("../../../../apps/api/src/lib/logger.js", () => ({ logger: loggerMock }));
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

  it("createBullMQConnection returns plain ConnectionOptions", async () => {
    const { isRedisInstance } = await import("bullmq");
    const { env } = await import("../../../../apps/api/src/config.js");
    const { createBullMQConnection } = await freshModule();

    const conn = createBullMQConnection();

    // Plain options rather than a pre-constructed ioredis instance so BullMQ
    // sets shared: false on RedisConnection and avoids duplicating an unused
    // socket inside QueueEvents (#3284).
    expect(RedisMock).not.toHaveBeenCalled();
    expect(isRedisInstance(conn)).toBe(false);
    expect(conn).toEqual({
      url: env.REDIS_URL,
      enableReadyCheck: true,
      maxRetriesPerRequest: null,
      socketTimeout: SOCKET_TIMEOUT_MS,
    });
  });

  it("closes every underlying ioredis socket when BullMQ Queue, QueueEvents, Worker, and FlowProducer close", async () => {
    const { Queue, Worker, QueueEvents, FlowProducer, RedisConnection } = await import("bullmq");
    const { env } = await import("../../../../apps/api/src/config.js");
    const { createBullMQConnection } = await freshModule();
    const rcClass = RedisConnection as unknown as {
      clientFactory?: (opts: Record<string, unknown>) => unknown;
    };
    const prevFactory = rcClass.clientFactory;
    rcClass.clientFactory = (opts) =>
      new (RedisMock as unknown as new (o: Record<string, unknown>) => RedisStub)(opts);

    try {
      const qErrors: Error[] = [];
      const q = new Queue("test-q", { connection: createBullMQConnection() });
      q.on("error", (err: Error) => qErrors.push(err));
      await q.waitUntilReady();
      expect(stubs).toHaveLength(1);
      expect(stubs[0].options).toMatchObject({
        url: env.REDIS_URL,
        enableReadyCheck: true,
        maxRetriesPerRequest: null,
        socketTimeout: SOCKET_TIMEOUT_MS,
      });
      stubs[0].emitOn("error", new Error("queue blip"));
      expect(qErrors).toHaveLength(1);
      await q.close();
      expect(stubs[0].quit).toHaveBeenCalledTimes(1);
      expect(stubs[0].status).toBe("end");

      const qeErrors: Error[] = [];
      const qe = new QueueEvents("test-qe", {
        connection: createBullMQConnection(),
        autorun: false,
      });
      qe.on("error", (err: Error) => qeErrors.push(err));
      await qe.waitUntilReady();
      expect(stubs).toHaveLength(2);
      stubs[1].emitOn("error", new Error("qe blip"));
      expect(qeErrors).toHaveLength(1);
      await qe.close();
      expect(stubs[1].disconnect).toHaveBeenCalledTimes(1);
      expect(stubs[1].quit).toHaveBeenCalledTimes(1);
      expect(stubs[1].status).toBe("end");

      const workerErrors: Error[] = [];
      const worker = new Worker("test-w", async () => {}, {
        connection: createBullMQConnection(),
        autorun: false,
      });
      worker.on("error", (err: Error) => workerErrors.push(err));
      await worker.waitUntilReady();
      expect(stubs).toHaveLength(4);
      stubs[2].emitOn("error", new Error("worker conn blip"));
      stubs[3].emitOn("error", new Error("worker blocking blip"));
      expect(workerErrors).toHaveLength(2);
      await worker.close();
      expect(stubs[2].quit).toHaveBeenCalledTimes(1);
      expect(stubs[3].quit).toHaveBeenCalledTimes(1);
      expect(stubs[2].status).toBe("end");
      expect(stubs[3].status).toBe("end");

      const fpErrors: Error[] = [];
      const fp = new FlowProducer({ connection: createBullMQConnection() });
      fp.on("error", (err: Error) => fpErrors.push(err));
      await fp.waitUntilReady();
      expect(stubs).toHaveLength(5);
      stubs[4].emitOn("error", new Error("fp blip"));
      expect(fpErrors).toHaveLength(1);
      await fp.close();
      expect(stubs[4].quit).toHaveBeenCalledTimes(1);
      expect(stubs[4].status).toBe("end");
    } finally {
      rcClass.clientFactory = prevFactory;
    }
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

  it("attaches an error listener to command connections so a Redis blip cannot crash the process", async () => {
    const { createRedisConnection } = await freshModule();

    const conn = createRedisConnection() as unknown as RedisStub;

    // ioredis emits "error" on every failed connect attempt. With no listener,
    // Node escalates it to an uncaught exception and kills the API (Sentry
    // NODE-30: fatal ECONNREFUSED from installs whose Redis restarted).
    expect(conn.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("attaches an error listener to subscriber connections", async () => {
    const { createRedisSubscriberConnection } = await freshModule();

    const conn = createRedisSubscriberConnection() as unknown as RedisStub;

    expect(conn.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("logs and swallows connection errors, leaving reconnection to ioredis", async () => {
    const { createRedisConnection } = await freshModule();

    const conn = createRedisConnection() as unknown as RedisStub;

    expect(() =>
      conn.emitOn("error", new Error("connect ECONNREFUSED 127.0.0.1:6379")),
    ).not.toThrow();
    expect(loggerMock.error).toHaveBeenCalledWith(
      { err: expect.objectContaining({ message: expect.stringContaining("ECONNREFUSED") }) },
      "[redis] connection error",
    );
  });

  it("sharedRedis memoizes a single connection across calls", async () => {
    const { sharedRedis } = await freshModule();

    const first = sharedRedis();
    const second = sharedRedis();

    expect(first).toBe(second);
    expect(RedisMock).toHaveBeenCalledTimes(1);
  });

  it("ends an ioredis client and flushes its queues when disconnect(false) or quit() is called while reconnecting (#3604)", async () => {
    const net = await import("node:net");
    const actualIoredis = await vi.importActual<{ default: typeof import("ioredis").default }>(
      "ioredis",
    );
    const RealRedis = actualIoredis.default;
    const mod = await freshModule();
    // Guard and idempotency checks on patchIoredisDisconnect
    expect(() => mod.patchIoredisDisconnect(undefined)).not.toThrow();
    expect(() => mod.patchIoredisDisconnect({})).not.toThrow();
    mod.patchIoredisDisconnect(
      RealRedis.prototype as unknown as Parameters<typeof mod.patchIoredisDisconnect>[0],
    );
    const patchedFn = RealRedis.prototype.disconnect;
    mod.patchIoredisDisconnect(
      RealRedis.prototype as unknown as Parameters<typeof mod.patchIoredisDisconnect>[0],
    );
    expect(RealRedis.prototype.disconnect).toBe(patchedFn);

    const sockets = new Set<import("node:net").Socket>();
    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("data", (d) => {
        const str = d.toString();
        for (const match of str.matchAll(/\*\d+\r\n\$\d+\r\n([a-zA-Z]+)/g)) {
          const cmd = match[1].toUpperCase();
          if (cmd === "INFO") {
            socket.write("$19\r\nredis_version:7.2.0\r\n");
          } else if (cmd === "BZPOPMIN") {
            // hold blocking command open
          } else if (cmd === "EVALSHA" || cmd === "EVAL") {
            socket.write("*4\r\n$-1\r\n$-1\r\n:0\r\n:0\r\n");
          } else {
            socket.write("+OK\r\n");
          }
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as import("node:net").AddressInfo).port;
    const createdClients: Array<{ status: string; disconnect: (reconnect?: boolean) => void }> = [];
    const createdWorkers: Array<{ close: (force?: boolean) => Promise<void> }> = [];

    try {
      const client = new RealRedis({
        host: "127.0.0.1",
        port,
        maxRetriesPerRequest: null,
        retryStrategy: () => 5_000,
      });
      createdClients.push(client);
      client.on("error", () => {});
      await new Promise<void>((resolve) => client.once("ready", resolve));

      const pendingBz = client.bzpopmin("marker", 5);
      await new Promise((resolve) => setTimeout(resolve, 30));

      // Mirror BullMQ's waitForJob watchdog: disconnect(true) puts the client
      // into "reconnecting" with a pending retry timer and unfulfilled command.
      client.disconnect(true);
      await new Promise<void>((resolve) => client.once("reconnecting", resolve));
      expect(client.status).toBe("reconnecting");

      // disconnect(true) while already reconnecting must NOT end the client.
      client.disconnect(true);
      expect(client.status).toBe("reconnecting");

      // Simulate a reconnect attempt that called resetCommandQueue() so the
      // unfulfilled command lives only in prevCommandQueue.
      (client as unknown as { resetCommandQueue: () => void }).resetCommandQueue();

      const connectorDisconnectSpy = vi.spyOn(
        (client as unknown as { connector: { disconnect: () => void } }).connector,
        "disconnect",
      );
      let endFired = false;
      client.once("end", () => {
        endFired = true;
      });

      // Manual disconnect(false) (what BullMQ's blockingConnection.disconnect(true) calls)
      // must transition straight to "end", emit "end", and reject the pending command.
      client.disconnect(false);
      await expect(pendingBz).rejects.toThrow("Connection is closed.");
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(client.status).toBe("end");
      expect(endFired).toBe(true);
      expect(connectorDisconnectSpy).not.toHaveBeenCalled();

      // Also verify quit() while reconnecting ends the client cleanly.
      const quitClient = new RealRedis({
        host: "127.0.0.1",
        port,
        maxRetriesPerRequest: null,
        retryStrategy: () => 5_000,
      });
      createdClients.push(quitClient);
      quitClient.on("error", () => {});
      await new Promise<void>((resolve) => quitClient.once("ready", resolve));
      quitClient.disconnect(true);
      await new Promise<void>((resolve) => quitClient.once("reconnecting", resolve));
      expect(quitClient.status).toBe("reconnecting");

      let quitEndFired = false;
      quitClient.once("end", () => {
        quitEndFired = true;
      });
      await expect(quitClient.quit()).resolves.toBe("OK");
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(quitClient.status).toBe("end");
      expect(quitEndFired).toBe(true);

      // Also verify BullMQ Worker.close() resolves when blockingConnection is reconnecting.
      const { Worker } = await import("bullmq");
      const worker = new Worker("reconnecting-close-test", async () => {}, {
        connection: {
          host: "127.0.0.1",
          port,
          maxRetriesPerRequest: null,
          retryStrategy: () => 5_000,
        },
        skipStalledCheck: true,
        skipLockRenewal: true,
        skipVersionCheck: true,
      });
      createdWorkers.push(worker);
      worker.on("error", () => {});
      await worker.waitUntilReady();
      const bclient = await worker.blockingConnection.client;
      await new Promise((resolve) => setTimeout(resolve, 30));
      bclient.disconnect(true);
      await new Promise<void>((resolve) => bclient.once("reconnecting", resolve));
      expect(bclient.status).toBe("reconnecting");

      await expect(worker.close()).resolves.toBeUndefined();
      expect(bclient.status).toBe("end");
    } finally {
      await Promise.allSettled(createdWorkers.map((w) => w.close(true)));
      for (const c of createdClients) {
        if (c.status !== "end") c.disconnect(false);
      }
      for (const s of sockets) s.destroy();
      server.close();
    }
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
    const mod = await freshModule();
    const stub = mod.sharedRedis();
    stub.info = vi
      .fn()
      .mockRejectedValue(
        new Error("NOPERM this user has no permissions to run INFO"),
      ) as unknown as RedisStub["info"];

    await expect(mod.assertRedisCompatible()).resolves.toBeUndefined();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "[redis] INFO not permitted; skipping version preflight",
    );
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
