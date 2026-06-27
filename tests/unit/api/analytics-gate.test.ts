import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetGateForTests,
  __setReaderForTests,
  analyticsEnabled,
  bakedEnabled,
  refreshAnalyticsGate,
} from "../../../apps/api/src/lib/analytics-gate.js";

const origEnv = process.env.NODE_ENV;
const origOverride = process.env.ANALYTICS_BAKED_OVERRIDE;

beforeEach(() => {
  __resetGateForTests();
  process.env.NODE_ENV = "test";
  process.env.ANALYTICS_BAKED_OVERRIDE = "on"; // force bake on for these unit tests
});

afterEach(() => {
  process.env.NODE_ENV = origEnv;
  if (origOverride === undefined) delete process.env.ANALYTICS_BAKED_OVERRIDE;
  else process.env.ANALYTICS_BAKED_OVERRIDE = origOverride;
  __setReaderForTests(null);
});

describe("bakedEnabled override (non-production only)", () => {
  it("honors ANALYTICS_BAKED_OVERRIDE=on outside production", () => {
    process.env.ANALYTICS_BAKED_OVERRIDE = "on";
    expect(bakedEnabled()).toBe(true);
  });
  it("honors ANALYTICS_BAKED_OVERRIDE=off outside production", () => {
    process.env.ANALYTICS_BAKED_OVERRIDE = "off";
    expect(bakedEnabled()).toBe(false);
  });
  it("ignores the override in production (falls back to committed bake=false)", () => {
    process.env.NODE_ENV = "production";
    process.env.ANALYTICS_BAKED_OVERRIDE = "on";
    expect(bakedEnabled()).toBe(false);
  });
});

describe("effective enabled = baked AND toggle", () => {
  it("absent toggle defaults to ON", async () => {
    __setReaderForTests(async () => undefined);
    await refreshAnalyticsGate();
    expect(analyticsEnabled()).toBe(true);
  });
  it("toggle=false disables even when baked is on", async () => {
    __setReaderForTests(async () => false);
    await refreshAnalyticsGate();
    expect(analyticsEnabled()).toBe(false);
  });
  it("baked off forces disabled regardless of toggle", async () => {
    process.env.ANALYTICS_BAKED_OVERRIDE = "off";
    __setReaderForTests(async () => true);
    await refreshAnalyticsGate();
    expect(analyticsEnabled()).toBe(false);
  });
});

describe("fail closed", () => {
  it("stays disabled across a transient read error once disabled was seen", async () => {
    __setReaderForTests(async () => false);
    await refreshAnalyticsGate();
    expect(analyticsEnabled()).toBe(false);
    __setReaderForTests(async () => {
      throw new Error("db down");
    });
    await refreshAnalyticsGate();
    expect(analyticsEnabled()).toBe(false);
  });
});
