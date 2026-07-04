import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTimeout } from "@/lib/with-timeout";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("resolves with the promise value when it settles before the deadline", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1000)).resolves.toBe("ok");
  });

  it("rejects when the promise is still pending past the deadline", async () => {
    const neverSettles = new Promise<string>(() => {});
    const settled = withTimeout(neverSettles, 1000).then(
      () => "resolved",
      (err: Error) => `rejected:${err.message}`,
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(await settled).toMatch(/rejected:.*timed out/i);
  });
});
