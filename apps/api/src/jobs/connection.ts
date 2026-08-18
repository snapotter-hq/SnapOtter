/**
 * Redis connection factory for BullMQ queues and pub/sub.
 *
 * Uses ioredis with settings compatible with BullMQ's requirements
 * (maxRetriesPerRequest: null for blocking commands).
 */

import { SafeError } from "@snapotter/shared";
import type { ConnectionOptions } from "bullmq";
import Redis from "ioredis";
import { env } from "../config.js";

/**
 * How long a connection may hear nothing while it is waiting for a reply
 * before ioredis destroys the socket and reconnects.
 *
 * A Redis socket can die without either end noticing. If the server comes back
 * at a different address while a consumer is parked on a blocking read (BullMQ's
 * QueueEvents XREAD, or a pub/sub subscriber waiting for a push), that socket
 * has nothing left to send, so it never draws a reset, ioredis never sees a
 * disconnect, and no event is ever delivered again. Connections that keep
 * issuing commands heal themselves, because their next write draws the reset
 * from whatever holds the old address. Consumers are the ones that stay dead,
 * stranding both the sync-wait window and live SSE delivery until the process
 * is restarted (PERF-20260726-007).
 *
 * socketTimeout closes that hole: while a command is outstanding ioredis arms a
 * timer and destroys the socket if no byte arrives before it fires, which drops
 * the connection into the ordinary reconnect path (unfulfilled commands are
 * resent, subscriptions restored). It has to clear the longest legitimate
 * silence on any of these connections. BullMQ caps every blocking read at 10 s,
 * so 30 s leaves room for that plus a busy event loop.
 */
const SOCKET_TIMEOUT_MS = 30_000;

/**
 * How often a subscriber connection pings.
 *
 * Once SUBSCRIBE returns, a subscriber never writes again, so socketTimeout has
 * nothing to time: ioredis only arms it while a command is outstanding. PING is
 * the one probe RESP allows in subscriber mode, and it serves both recovery
 * paths. The write draws an immediate reset from whatever took the old address
 * over, and if nothing did, the unanswered PING is what socketTimeout kills the
 * socket for.
 */
const SUBSCRIBER_PING_INTERVAL_MS = 10_000;

/**
 * ioredis emits "error" on every failed connect attempt. An EventEmitter
 * "error" with no listener is escalated by Node to an uncaught exception,
 * so without this handler a Redis restart kills the whole API process
 * (Sentry NODE-30). Reconnecting is ioredis's job via its retryStrategy;
 * the listener only has to exist and say what happened.
 */
function swallowConnectionErrors(connection: Redis): Redis {
  connection.on("error", (err: Error) => {
    console.error("[redis] connection error:", err.message);
  });
  return connection;
}

/**
 * Create a new ioredis connection from REDIS_URL.
 * Each caller gets an independent connection (BullMQ requires separate
 * connections for Queue, Worker, and QueueEvents).
 */
export function createRedisConnection(): Redis {
  return swallowConnectionErrors(
    new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      socketTimeout: SOCKET_TIMEOUT_MS,
    }),
  );
}

/**
 * Create a Redis connection used only for pub/sub subscriptions.
 * Subscriber sockets cannot run regular commands once subscribed, so disable
 * ioredis ready checks that issue INFO during reconnects.
 */
export function createRedisSubscriberConnection(): Redis {
  const connection = swallowConnectionErrors(
    new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      socketTimeout: SOCKET_TIMEOUT_MS,
    }),
  );
  keepSubscriberSocketProbed(connection);
  return connection;
}

/**
 * Keep a command in flight on an otherwise silent subscriber socket.
 *
 * The interval is unref'd so it never holds the process open, and a rejected
 * ping needs no handling: it means ioredis is already tearing the connection
 * down, which is the outcome the ping was there to provoke. Nothing here can
 * wedge on a dead socket, because the detection is a timer rather than a reply.
 */
function keepSubscriberSocketProbed(connection: Redis): void {
  const timer = setInterval(() => {
    void connection.ping().catch(() => {});
  }, SUBSCRIBER_PING_INTERVAL_MS);
  timer.unref();
  connection.once("end", () => clearInterval(timer));
}

// ioredis 5.11 vs BullMQ's bundled 5.10 type mismatch
export function createBullMQConnection(): ConnectionOptions {
  return createRedisConnection() as unknown as ConnectionOptions;
}

let _shared: Redis | null = null;

/**
 * Module-level singleton connection for lightweight commands
 * (publish, setex, get). NOT suitable for BullMQ Queue/Worker
 * constructors which need their own connections.
 */
export function sharedRedis(): Redis {
  if (!_shared) {
    _shared = createRedisConnection();
  }
  return _shared;
}

/** Verify Redis is reachable. Resolves true or throws. */
export async function pingRedis(): Promise<boolean> {
  const result = await sharedRedis().ping();
  return result === "PONG";
}

/** Gracefully close the shared connection. */
export async function closeRedis(): Promise<void> {
  if (_shared) {
    await _shared.quit();
    _shared = null;
  }
}

/** Pure check: returns a SafeError for known-incompatible versions, else null. */
export function checkRedisInfoCompatible(info: string): SafeError | null {
  const m = info.match(/redis_version:(\d+)\.(\d+)/);
  if (!m) return null; // managed Redis may hide INFO details; do not block boot
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (major > 6 || (major === 6 && minor >= 2)) return null;
  return new SafeError("Redis 6.2 or newer is required. Point REDIS_URL at Redis 8.", {
    kind: "operational",
    code: `redis-${major}.${minor}`,
  });
}

/** Boot preflight: BullMQ v5 needs Redis >= 6.2. Fails fast with a clear message. */
export async function assertRedisCompatible(): Promise<void> {
  let info: string;
  try {
    info = await sharedRedis().info("server");
  } catch {
    console.warn("[redis] INFO not permitted; skipping version preflight");
    return;
  }
  const err = checkRedisInfoCompatible(info);
  if (err) throw err;
}
