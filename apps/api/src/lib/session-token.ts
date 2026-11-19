import { createHash, randomUUID } from "node:crypto";

export function createSessionToken(): string {
  return randomUUID();
}

/**
 * The value stored as `sessions.id` for a session token. Clients hold the raw
 * token; the table and the Redis idle key only ever see this digest, so a read
 * of either is not a working login (#4579). An unsalted fast hash is enough:
 * the token is a v4 UUID with 122 random bits, and a salt would make the
 * lookup by value impossible. Migration 0013 rehashes existing rows the same
 * way (Postgres `sha256` over the UTF-8 bytes, lowercase hex).
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
