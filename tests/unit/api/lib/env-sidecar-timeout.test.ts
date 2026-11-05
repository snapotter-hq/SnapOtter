import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnv, publishSidecarEnv } from "../../../../apps/api/src/lib/env.js";

describe("publishSidecarEnv (#4313)", () => {
  it("hands the sidecar the parsed PROCESSING_TIMEOUT_S default when the variable is unset", () => {
    const target: NodeJS.ProcessEnv = {};
    publishSidecarEnv(loadEnv({}), target);
    // The bridge reads process.env and used to fall back to 600 s here, while the
    // API parser (and the docs) default to 0 = unlimited.
    expect(target.PROCESSING_TIMEOUT_S).toBe("0");
  });

  it("treats an empty value as unset", () => {
    const target: NodeJS.ProcessEnv = { PROCESSING_TIMEOUT_S: " " };
    publishSidecarEnv(loadEnv({}), target);
    expect(target.PROCESSING_TIMEOUT_S).toBe("0");
  });

  it("leaves an explicit value alone", () => {
    const raw = { PROCESSING_TIMEOUT_S: "900" };
    const target: NodeJS.ProcessEnv = { ...raw };
    publishSidecarEnv(loadEnv(raw), target);
    expect(target.PROCESSING_TIMEOUT_S).toBe("900");
  });

  describe("config boot", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it("sets process.env.PROCESSING_TIMEOUT_S for the bridge when importing config", async () => {
      vi.stubEnv("PROCESSING_TIMEOUT_S", "");
      vi.resetModules();
      await import("../../../../apps/api/src/config.js");
      expect(process.env.PROCESSING_TIMEOUT_S).toBe("0");
    });
  });
});
