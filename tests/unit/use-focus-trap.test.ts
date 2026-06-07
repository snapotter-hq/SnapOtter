import { describe, expect, it } from "vitest";

describe("useFocusTrap", () => {
  it("should be importable", async () => {
    const mod = await import("../../apps/web/src/hooks/use-focus-trap");
    expect(mod.useFocusTrap).toBeDefined();
  });
});
