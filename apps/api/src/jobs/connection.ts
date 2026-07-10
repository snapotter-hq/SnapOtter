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
 * Create a new ioredis connection from REDIS_URL.
 * Each caller gets an independent connection (BullMQ requires separate
 * connections for Queue, Worker, and QueueEvents).
 */
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

/**
 * Create a Redis connection used only for pub/sub subscriptions.
 * Subscriber sockets cannot run regular commands once subscribed, so disable
 * ioredis ready checks that issue INFO during reconnects.
 */
export function createRedisSubscriberConnection(): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
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
