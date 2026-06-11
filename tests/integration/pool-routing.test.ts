import { describe, expect, it } from "vitest";
import { resolveToolPool, shouldSkipSyncWindow } from "../../apps/api/src/lib/pool.js";

describe("pool routing", () => {
  it("image tools stay on the image pool", () => {
    expect(resolveToolPool("resize")).toBe("image");
  });
  it("ai tools route to the ai pool regardless of modality", () => {
    expect(resolveToolPool("remove-background")).toBe("ai");
  });
  it("unknown tools default to image", () => {
    expect(resolveToolPool("not-a-tool")).toBe("image");
  });
  it("long hint skips the sync window", () => {
    expect(shouldSkipSyncWindow("long")).toBe(true);
    expect(shouldSkipSyncWindow("fast")).toBe(false);
    expect(shouldSkipSyncWindow(undefined)).toBe(false);
  });
});
