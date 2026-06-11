/**
 * Redis connection factory for BullMQ queues and pub/sub.
 *
 * Uses ioredis with settings compatible with BullMQ's requirements
 * (maxRetriesPerRequest: null for blocking commands).
 */
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
