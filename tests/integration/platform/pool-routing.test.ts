import { describe, expect, it } from "vitest";
import { resolveToolPool, shouldSkipSyncWindow } from "../../../apps/api/src/lib/pool.js";

describe("pool routing", () => {
  it("image tools stay on the image pool", () => {
    expect(resolveToolPool("resize")).toBe("image");
  });
  it("ai tools route to the ai pool regardless of modality", () => {
    expect(resolveToolPool("remove-background")).toBe("ai");
  });
  it("unknown tools default to system", () => {
    expect(resolveToolPool("not-a-tool")).toBe("system");
  });
  it.each(["brightness-contrast", "saturation", "color-channels", "color-effects"])(
    "routes adjust-colors legacy alias %s to the image pool (#2826)",
    (aliasId) => {
      expect(resolveToolPool(aliasId)).toBe("image");
    },
  );
  it("derives pool from explicit section when toolId is not in catalog (#2826)", () => {
    expect(resolveToolPool("non-catalog-image-alias", "image")).toBe("image");
    expect(resolveToolPool("non-catalog-video-alias", "video")).toBe("media");
    expect(resolveToolPool("non-catalog-audio-alias", "audio")).toBe("media");
    expect(resolveToolPool("non-catalog-pdf-alias", "pdf")).toBe("docs");
    expect(resolveToolPool("non-catalog-files-alias", "files")).toBe("docs");
  });
  it("prioritizes AI and catalog modality over explicit section fallback (#2826)", () => {
    expect(resolveToolPool("remove-background", "image")).toBe("ai");
    expect(resolveToolPool("resize", "video")).toBe("image");
  });
  it("long hint skips the sync window", () => {
    expect(shouldSkipSyncWindow("long")).toBe(true);
    expect(shouldSkipSyncWindow("fast")).toBe(false);
    expect(shouldSkipSyncWindow(undefined)).toBe(false);
  });
});
