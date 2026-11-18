import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDECAR_IDLE_TIMEOUT_S,
  resolveSidecarIdleTimeoutMs,
} from "../../../packages/ai/src/sidecar-idle.js";

describe("resolveSidecarIdleTimeoutMs", () => {
  it("defaults to the session cache's idle window", () => {
    expect(DEFAULT_SIDECAR_IDLE_TIMEOUT_S).toBe(600);
    expect(resolveSidecarIdleTimeoutMs({})).toBe(600_000);
    expect(resolveSidecarIdleTimeoutMs({ AI_SIDECAR_IDLE_TIMEOUT: "" })).toBe(600_000);
    expect(resolveSidecarIdleTimeoutMs({ AI_SIDECAR_IDLE_TIMEOUT: "  " })).toBe(600_000);
  });

  it("reads seconds", () => {
    expect(resolveSidecarIdleTimeoutMs({ AI_SIDECAR_IDLE_TIMEOUT: "90" })).toBe(90_000);
    expect(resolveSidecarIdleTimeoutMs({ AI_SIDECAR_IDLE_TIMEOUT: "1.5" })).toBe(1_500);
  });

  it("treats 0 as never exit", () => {
    expect(resolveSidecarIdleTimeoutMs({ AI_SIDECAR_IDLE_TIMEOUT: "0" })).toBe(0);
  });

  it("falls back to the default for junk and negative values", () => {
    expect(resolveSidecarIdleTimeoutMs({ AI_SIDECAR_IDLE_TIMEOUT: "soon" })).toBe(600_000);
    expect(resolveSidecarIdleTimeoutMs({ AI_SIDECAR_IDLE_TIMEOUT: "-5" })).toBe(600_000);
    expect(resolveSidecarIdleTimeoutMs({ AI_SIDECAR_IDLE_TIMEOUT: "Infinity" })).toBe(600_000);
  });
});
