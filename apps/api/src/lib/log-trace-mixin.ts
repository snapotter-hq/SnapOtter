import { trace } from "@opentelemetry/api";

export function traceMixin(): Record<string, unknown> {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const { traceId, spanId, traceFlags } = span.spanContext();
  return { traceId, spanId, traceFlags };
}
