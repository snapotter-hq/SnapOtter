import { describe, expect, it } from "vitest";
import { checkRedisInfoCompatible } from "../../../apps/api/src/jobs/connection.js";

describe("checkRedisInfoCompatible", () => {
  it("accepts 6.2, 7.x, 8.x", () => {
    expect(checkRedisInfoCompatible("# Server\r\nredis_version:8.0.1\r\n")).toBeNull();
    expect(checkRedisInfoCompatible("redis_version:6.2.14")).toBeNull();
    expect(checkRedisInfoCompatible("redis_version:7.4.0")).toBeNull();
  });
  it("rejects < 6.2 with a SafeError carrying the version in code", () => {
    const err = checkRedisInfoCompatible("redis_version:6.0.16");
    expect(err?.message).toBe("Redis 6.2 or newer is required. Point REDIS_URL at Redis 8.");
    expect(err?.code).toBe("redis-6.0");
    const old = checkRedisInfoCompatible("redis_version:5.0.7");
    expect(old?.code).toBe("redis-5.0");
  });
  it("tolerates unparseable INFO (managed Redis)", () => {
    expect(checkRedisInfoCompatible("garbage")).toBeNull();
    expect(checkRedisInfoCompatible("")).toBeNull();
  });
});
