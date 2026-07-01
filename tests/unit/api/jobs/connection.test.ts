import { beforeEach, describe, expect, it, vi } from "vitest";

const { RedisMock } = vi.hoisted(() => ({
  RedisMock: vi.fn(function RedisMock() {
    return {};
  }),
}));

vi.mock("ioredis", () => ({
  default: RedisMock,
}));

describe("Redis connection factory", () => {
  beforeEach(() => {
    RedisMock.mockClear();
  });

  it("keeps ready checks enabled for command connections", async () => {
    const { createRedisConnection } = await import("../../../../apps/api/src/jobs/connection.js");

    createRedisConnection();

    expect(RedisMock).toHaveBeenCalledWith(expect.any(String), {
      enableReadyCheck: true,
      maxRetriesPerRequest: null,
    });
  });

  it("disables ready checks for pub/sub-only subscriber connections", async () => {
    const { createRedisSubscriberConnection } = await import(
      "../../../../apps/api/src/jobs/connection.js"
    );

    createRedisSubscriberConnection();

    expect(RedisMock).toHaveBeenCalledWith(expect.any(String), {
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    });
  });
});
