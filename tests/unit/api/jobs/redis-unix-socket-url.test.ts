import { posix } from "node:path";
import Redis from "ioredis";
import { describe, expect, it } from "vitest";

// REDIS_URL goes straight to ioredis (connection.ts, and BullMQ via its `url`
// option), so socket support rests entirely on ioredis's URL parser. Pin the
// forms #783 documents so an ioredis upgrade that drops them fails here rather
// than on a self-hoster's socket-only box.
function parsed(url: string) {
  const client = new Redis(url, { lazyConnect: true });
  const { path, db } = client.options;
  client.disconnect();
  return { path: path ? posix.normalize(path) : path, db };
}

describe("unix socket REDIS_URL (#783)", () => {
  it("reads a unix:// URL as a socket path with its db", () => {
    expect(parsed("unix:///run/redis/redis.sock?db=5")).toEqual({
      path: "/run/redis/redis.sock",
      db: 5,
    });
  });

  it("reads a bare socket path with its db", () => {
    expect(parsed("/run/redis/redis.sock?db=5")).toEqual({
      path: "/run/redis/redis.sock",
      db: 5,
    });
  });

  it("takes the password from the query, as the configuration docs say", () => {
    const client = new Redis("unix:///run/redis/redis.sock?db=5&password=s3cret", {
      lazyConnect: true,
    });
    expect(client.options.password).toBe("s3cret");
    client.disconnect();
  });
});
