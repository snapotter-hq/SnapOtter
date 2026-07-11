import { afterEach, describe, expect, it, vi } from "vitest";
import { safeRandomUUID } from "@/lib/uuid";

const V4_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("safeRandomUUID", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns v4-shaped uuids", () => {
    const id = safeRandomUUID();
    expect(id).toMatch(V4_SHAPE);
    expect(safeRandomUUID()).not.toBe(id);
  });

  it("works when crypto.randomUUID is unavailable (insecure context)", () => {
    // Simulate a plain-http origin, where the browser exposes getRandomValues
    // but not randomUUID. `delete crypto.randomUUID` would be a silent no-op
    // here (the method lives on Crypto.prototype, not as an own property), so
    // stub the global with a clone that genuinely lacks it.
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    vi.stubGlobal("crypto", { getRandomValues });
    expect(crypto.randomUUID).toBeUndefined();

    const id = safeRandomUUID();
    expect(id).toMatch(V4_SHAPE);
    expect(safeRandomUUID()).not.toBe(id);
  });
});
