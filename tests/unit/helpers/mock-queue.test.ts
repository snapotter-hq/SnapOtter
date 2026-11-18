import { afterEach, describe, expect, it, vi } from "vitest";
import { drainDoMockQueue } from "../../helpers/mock-queue.js";

const TARGET = "../../helpers/mock-queue-probe.js";

afterEach(() => {
  vi.doUnmock(TARGET);
  vi.resetModules();
});

describe("drainDoMockQueue (#4750)", () => {
  it("makes the later of two doMock calls for one path win, every time", async () => {
    for (let i = 0; i < 200; i++) {
      vi.resetModules();
      vi.doMock(TARGET, () => ({ value: "default" }));
      await drainDoMockQueue();
      vi.doMock(TARGET, () => ({ value: "override" }));
      const mod = (await import(TARGET)) as { value: string };
      expect(mod.value).toBe("override");
    }
  });
});
