import { createRequire } from "node:module";
import type { SpanExporter } from "@opentelemetry/sdk-trace-base";

let _active = false;
let _sdk: { shutdown(): Promise<void> } | null = null;

export function isTracingActive(): boolean {
  return _active;
}

export async function initTracing(options: { exporter?: SpanExporter } = {}): Promise<void> {
  if (_active) return;

  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { BatchSpanProcessor } = await import("@opentelemetry/sdk-trace-base");
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
  const { defaultResource, resourceFromAttributes } = await import("@opentelemetry/resources");
  const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import(
    "@opentelemetry/semantic-conventions"
  );
  const { HttpInstrumentation } = await import("@opentelemetry/instrumentation-http");
  const { FastifyInstrumentation } = await import("@opentelemetry/instrumentation-fastify");
  const { PgInstrumentation } = await import("@opentelemetry/instrumentation-pg");
  const { IORedisInstrumentation } = await import("@opentelemetry/instrumentation-ioredis");
  const { AwsInstrumentation } = await import("@opentelemetry/instrumentation-aws-sdk");

  const require = createRequire(import.meta.url);
  const { version } = require("../package.json");

  const exporter = options.exporter ?? new OTLPTraceExporter();

  const resource = defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "snapotter-api",
      [ATTR_SERVICE_VERSION]: version,
    }),
  );

  const sdk = new NodeSDK({
    resource,
    spanProcessors: [new BatchSpanProcessor(exporter)],
    instrumentations: [
      new HttpInstrumentation({
        ignoreOutgoingRequestHook: (req) => {
          const host = req.hostname || req.host || "";
          return host.includes("posthog") || host.includes("sentry");
        },
      }),
      new FastifyInstrumentation(),
      new PgInstrumentation(),
      new IORedisInstrumentation({
        requireParentSpan: true,
        dbStatementSerializer: (cmd, args) => {
          if (cmd === "evalsha" || cmd === "eval") return `${cmd} <lua>`;
          return `${cmd} ${(args ?? []).slice(0, 2).join(" ")}`;
        },
      }),
      new AwsInstrumentation(),
    ],
  });

  sdk.start();
  _sdk = sdk;
  _active = true;
}

export async function shutdownTracing(): Promise<void> {
  if (_sdk) {
    await _sdk.shutdown().catch(() => {});
    _sdk = null;
    _active = false;
  }
}

// -- Preload entry point --
// When loaded via --import, this top-level await runs before the app.

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
if (endpoint) {
  try {
    const enterprise = await import("@snapotter/enterprise");
    const licenseKey = process.env.LICENSE_KEY ?? "";
    if (licenseKey) {
      enterprise.initEnterprise(licenseKey);
    }
    if (enterprise.isFeatureEnabled("distributed_tracing")) {
      await initTracing();
      console.log("[tracing] OpenTelemetry initialized, exporting to", endpoint);
    }
  } catch {
    // Enterprise package not available or license invalid -- tracing stays off
  }
}
