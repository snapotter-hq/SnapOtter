import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("tracing bootstrap", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(async () => {
    const { shutdownTracing } = await import("../../../apps/api/src/tracing.js");
    await shutdownTracing();
    vi.resetModules();
  });

  it("is inactive when OTEL_EXPORTER_OTLP_ENDPOINT is unset", async () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
    const { isTracingActive } = await import("../../../apps/api/src/tracing.js");
    expect(isTracingActive()).toBe(false);
  });

  it("is inactive when enterprise package is unavailable", async () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318");
    vi.doMock("@snapotter/enterprise", () => {
      throw new Error("Cannot find module '@snapotter/enterprise'");
    });
    const { isTracingActive } = await import("../../../apps/api/src/tracing.js");
    expect(isTracingActive()).toBe(false);
  });

  it("initializes with valid config and enterprise license", async () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
    vi.doMock("@snapotter/enterprise", () => ({
      isFeatureEnabled: (f: string) => f === "distributed_tracing",
      initEnterprise: () => true,
      getActiveLicense: () => ({
        plan: "enterprise",
        features: ["distributed_tracing"],
      }),
    }));

    const { InMemorySpanExporter } = await import("@opentelemetry/sdk-trace-base");
    const exporter = new InMemorySpanExporter();
    const { initTracing, isTracingActive } = await import("../../../apps/api/src/tracing.js");
    await initTracing({ exporter });
    expect(isTracingActive()).toBe(true);
  });
});
