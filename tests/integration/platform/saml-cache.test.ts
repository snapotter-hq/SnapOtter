import { describe, expect, it } from "vitest";

const { makeRedisSamlCacheProvider } = await import("../../../apps/api/src/lib/saml-cache.js");
const { sharedRedis } = await import("../../../apps/api/src/jobs/connection.js");

// Verifies the InResponseTo replay-prevention primitive behind SAML hardening:
// a request ID can be stored once, is rejected on a duplicate save (the replay
// signal node-saml keys off), and disappears after it is consumed.
describe("SAML Redis cache provider (InResponseTo replay protection)", () => {
  it("stores a request id once, rejects a duplicate save, and consumes on remove", async () => {
    const provider = makeRedisSamlCacheProvider();
    const key = `test-${Math.random().toString(36).slice(2)}`;

    const first = await provider.saveAsync(key, key);
    expect(first).not.toBeNull();
    expect(first?.value).toBe(key);

    // A replayed response reuses the same InResponseTo id: the save must fail.
    const duplicate = await provider.saveAsync(key, key);
    expect(duplicate).toBeNull();

    expect(await provider.getAsync(key)).toBe(key);

    // Consuming (as node-saml does on a valid first use) removes it, so a later
    // replay finds nothing and is rejected.
    expect(await provider.removeAsync(key)).toBe(key);
    expect(await provider.getAsync(key)).toBeNull();
    expect(await provider.removeAsync(key)).toBeNull();
  });

  it("returns null from removeAsync when given a null key", async () => {
    const provider = makeRedisSamlCacheProvider();
    expect(await provider.removeAsync(null)).toBeNull();
  });

  it("honors the TTL so stale request ids self-expire", async () => {
    const provider = makeRedisSamlCacheProvider(1); // 1 second
    const key = `test-ttl-${Math.random().toString(36).slice(2)}`;
    await provider.saveAsync(key, key);
    // Confirm the TTL was actually set on the namespaced key (not persisted).
    const ttl = await sharedRedis().ttl(`saml:req:${key}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(1);
    await provider.removeAsync(key);
  });
});
