import type { CacheItem, CacheProvider } from "@node-saml/node-saml";
import { sharedRedis } from "../jobs/connection.js";

const KEY_PREFIX = "saml:req:";

/**
 * Matches node-saml's default requestIdExpirationPeriodMs (8h). The Redis TTL
 * must be at least as long, or a slow-but-legitimate SP-initiated login would
 * find its request id already gone and fail InResponseTo validation.
 */
export const SAML_REQUEST_TTL_SECONDS = 8 * 60 * 60;

/**
 * Redis-backed CacheProvider for node-saml InResponseTo validation.
 *
 * `saveAsync` uses SET NX, so a request id is stored exactly once. node-saml
 * removes the id when it consumes a valid SAML Response, so a replayed Response
 * whose InResponseTo was already consumed finds nothing and is rejected. Backed
 * by the shared Redis so the id written during the login redirect is visible to
 * the callback even though each handler builds a fresh SAML instance.
 */
export function makeRedisSamlCacheProvider(
  ttlSeconds: number = SAML_REQUEST_TTL_SECONDS,
): CacheProvider {
  return {
    async saveAsync(key: string, value: string): Promise<CacheItem | null> {
      const ok = await sharedRedis().set(`${KEY_PREFIX}${key}`, value, "EX", ttlSeconds, "NX");
      return ok === "OK" ? { value, createdAt: Date.now() } : null;
    },
    async getAsync(key: string): Promise<string | null> {
      return sharedRedis().get(`${KEY_PREFIX}${key}`);
    },
    async removeAsync(key: string | null): Promise<string | null> {
      if (key === null) return null;
      const removed = await sharedRedis().del(`${KEY_PREFIX}${key}`);
      return removed > 0 ? key : null;
    },
  };
}
