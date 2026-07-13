import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetGateForTests,
  __setReaderForTests,
  analyticsEnabled,
  bakedEnabled,
  refreshAnalyticsGate,
  telemetryEnvKilled,
} from "../../../apps/api/src/lib/analytics-gate.js";

const origEnv = process.env.NODE_ENV;
const origOverride = process.env.ANALYTICS_BAKED_OVERRIDE;
const origTelemetry = process.env.SNAPOTTER_TELEMETRY;
const origAnalyticsEnabled = process.env.ANALYTICS_ENABLED;

beforeEach(() => {
  __resetGateForTests();
  process.env.NODE_ENV = "test";
  process.env.ANALYTICS_BAKED_OVERRIDE = "on"; // force bake on for these unit tests
  delete process.env.SNAPOTTER_TELEMETRY; // ambient kill switch would poison the suite
  delete process.env.ANALYTICS_ENABLED; // same: an ambient opt-out alias would poison the suite
});

afterEach(() => {
  process.env.NODE_ENV = origEnv;
  if (origOverride === undefined) delete process.env.ANALYTICS_BAKED_OVERRIDE;
  else process.env.ANALYTICS_BAKED_OVERRIDE = origOverride;
  if (origTelemetry === undefined) delete process.env.SNAPOTTER_TELEMETRY;
  else process.env.SNAPOTTER_TELEMETRY = origTelemetry;
  if (origAnalyticsEnabled === undefined) delete process.env.ANALYTICS_ENABLED;
  else process.env.ANALYTICS_ENABLED = origAnalyticsEnabled;
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

describe("SNAPOTTER_TELEMETRY runtime kill switch", () => {
  it("outranks ANALYTICS_BAKED_OVERRIDE=on outside production", () => {
    process.env.ANALYTICS_BAKED_OVERRIDE = "on";
    process.env.SNAPOTTER_TELEMETRY = "0";
    expect(bakedEnabled()).toBe(false);
  });
  it("telemetryEnvKilled matches 0, false, off and nothing else", () => {
    for (const v of ["0", "false", "off"]) {
      process.env.SNAPOTTER_TELEMETRY = v;
      expect(telemetryEnvKilled()).toBe(true);
    }
    delete process.env.SNAPOTTER_TELEMETRY;
    expect(telemetryEnvKilled()).toBe(false);
    process.env.SNAPOTTER_TELEMETRY = "1";
    expect(telemetryEnvKilled()).toBe(false);
  });
  it("is honored in production builds", () => {
    process.env.NODE_ENV = "production";
    process.env.SNAPOTTER_TELEMETRY = "0";
    expect(bakedEnabled()).toBe(false);
    expect(telemetryEnvKilled()).toBe(true);
  });
});

// ANALYTICS_ENABLED is the env var historically documented on the Docker Hub
// README as the analytics opt-out. It was never wired in 2.x, so a user who set
// ANALYTICS_ENABLED=false was still tracked. Honor it as an alias of the kill
// switch so the documented opt-out genuinely stops egress.
describe("ANALYTICS_ENABLED opt-out alias", () => {
  it("ANALYTICS_ENABLED=false kills telemetry like SNAPOTTER_TELEMETRY=0", () => {
    process.env.ANALYTICS_ENABLED = "false";
    expect(telemetryEnvKilled()).toBe(true);
    expect(bakedEnabled()).toBe(false);
  });
  it("matches 0, false, off and nothing else", () => {
    for (const v of ["0", "false", "off"]) {
      process.env.ANALYTICS_ENABLED = v;
      expect(telemetryEnvKilled()).toBe(true);
    }
    process.env.ANALYTICS_ENABLED = "true";
    expect(telemetryEnvKilled()).toBe(false);
    process.env.ANALYTICS_ENABLED = "1";
    expect(telemetryEnvKilled()).toBe(false);
    delete process.env.ANALYTICS_ENABLED;
    expect(telemetryEnvKilled()).toBe(false);
  });
  it("is honored in production builds", () => {
    process.env.NODE_ENV = "production";
    process.env.ANALYTICS_ENABLED = "false";
    expect(telemetryEnvKilled()).toBe(true);
    expect(bakedEnabled()).toBe(false);
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
