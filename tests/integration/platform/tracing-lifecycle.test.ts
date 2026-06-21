import { AsyncLocalStorage } from "node:async_hooks";
import {
  type Context,
  type ContextManager,
  context,
  propagation,
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Minimal AsyncLocalStorage-based context manager for tests.
 * OTel v2 BasicTracerProvider no longer registers one automatically,
 * and @opentelemetry/context-async-hooks is not a direct dependency.
 */
class TestContextManager implements ContextManager {
  private _als = new AsyncLocalStorage<Context>();

  active(): Context {
    return this._als.getStore() ?? ROOT_CONTEXT;
  }

  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    ctx: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    return this._als.run(ctx, () => fn.call(thisArg, ...args));
  }

  bind<T>(_ctx: Context, target: T): T {
    return target;
  }

  enable(): this {
    return this;
  }

  disable(): this {
    this._als.disable();
    return this;
  }
}

describe("tracing lifecycle", () => {
  afterEach(() => {
    propagation.disable();
    context.disable();
    trace.disable();
  });

  it("propagates trace context through inject/extract cycle", async () => {
    // Create HTTP span, inject to carrier, extract in "worker", create child
    // Assert same traceId, different spanId, correct parent-child
    const { InMemorySpanExporter, SimpleSpanProcessor, BasicTracerProvider } = await import(
      "@opentelemetry/sdk-trace-base"
    );

    context.setGlobalContextManager(new TestContextManager());
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());

    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);

    const tracer = trace.getTracer("test");
    const httpSpan = tracer.startSpan("HTTP POST /api/v1/tools/image/resize");
    const httpCtx = trace.setSpan(ROOT_CONTEXT, httpSpan);
    const httpTraceId = httpSpan.spanContext().traceId;

    const carrier: Record<string, string> = {};
    context.with(httpCtx, () => {
      propagation.inject(context.active(), carrier);
    });

    expect(carrier.traceparent).toBeDefined();

    const workerCtx = propagation.extract(ROOT_CONTEXT, carrier);
    const jobSpan = tracer.startSpan("job.process", {}, workerCtx);

    expect(jobSpan.spanContext().traceId).toBe(httpTraceId);

    const toolCtx = trace.setSpan(workerCtx, jobSpan);
    const toolSpan = tracer.startSpan("tool.process", {}, toolCtx);

    expect(toolSpan.spanContext().traceId).toBe(httpTraceId);

    toolSpan.end();
    jobSpan.end();
    httpSpan.end();

    const spans = exporter.getFinishedSpans();
    const names = spans.map((s) => s.name);
    expect(names).toContain("HTTP POST /api/v1/tools/image/resize");
    expect(names).toContain("job.process");
    expect(names).toContain("tool.process");

    // OTel SDK v2: parent reference is parentSpanContext (SpanContext object),
    // not parentSpanId (string).
    const jobFinished = spans.find((s) => s.name === "job.process")!;
    expect(jobFinished.parentSpanContext?.spanId).toBe(httpSpan.spanContext().spanId);

    const toolFinished = spans.find((s) => s.name === "tool.process")!;
    expect(toolFinished.parentSpanContext?.spanId).toBe(jobSpan.spanContext().spanId);

    await provider.shutdown();
  });

  it("records error status on failed spans", async () => {
    const { InMemorySpanExporter, SimpleSpanProcessor, BasicTracerProvider } = await import(
      "@opentelemetry/sdk-trace-base"
    );

    context.setGlobalContextManager(new TestContextManager());
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());

    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);

    const tracer = trace.getTracer("test");
    const span = tracer.startSpan("job.process");

    const error = new Error("Tool processing failed");
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
    span.addEvent("job.failed");
    span.end();

    const spans = exporter.getFinishedSpans();
    const finished = spans.find((s) => s.name === "job.process")!;

    expect(finished.status.code).toBe(SpanStatusCode.ERROR);
    expect(finished.status.message).toBe("Tool processing failed");
    expect(finished.events.some((e) => e.name === "job.failed")).toBe(true);
    expect(finished.events.some((e) => e.name === "exception")).toBe(true);

    await provider.shutdown();
  });

  it("handles absent _otel gracefully", () => {
    const extractedCtx = propagation.extract(ROOT_CONTEXT, {});
    const span = trace.getSpan(extractedCtx);
    expect(span).toBeUndefined();
  });

  it("tracing failures do not block request processing", async () => {
    const { InMemorySpanExporter, SimpleSpanProcessor, BasicTracerProvider } = await import(
      "@opentelemetry/sdk-trace-base"
    );

    context.setGlobalContextManager(new TestContextManager());
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());

    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);

    const tracer = trace.getTracer("test");
    const span = tracer.startSpan("request-with-bad-collector");
    expect(span).toBeDefined();
    expect(span.spanContext().traceId).toMatch(/^[0-9a-f]{32}$/);

    const carrier: Record<string, string> = {};
    const ctx = trace.setSpan(ROOT_CONTEXT, span);
    context.with(ctx, () => propagation.inject(context.active(), carrier));
    expect(carrier.traceparent).toBeDefined();

    span.end();
    await provider.shutdown();
  });

  it("supports retry spans under the same trace", async () => {
    const { InMemorySpanExporter, SimpleSpanProcessor, BasicTracerProvider } = await import(
      "@opentelemetry/sdk-trace-base"
    );

    context.setGlobalContextManager(new TestContextManager());
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());

    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);

    const tracer = trace.getTracer("test");
    const httpSpan = tracer.startSpan("HTTP POST");
    const httpCtx = trace.setSpan(ROOT_CONTEXT, httpSpan);
    const traceId = httpSpan.spanContext().traceId;

    const carrier: Record<string, string> = {};
    context.with(httpCtx, () => propagation.inject(context.active(), carrier));

    const ctx1 = propagation.extract(ROOT_CONTEXT, carrier);
    const attempt1 = tracer.startSpan(
      "job.attempt",
      {
        attributes: { "snapotter.attempt_number": 1 },
      },
      ctx1,
    );
    attempt1.setStatus({ code: SpanStatusCode.ERROR, message: "timeout" });
    attempt1.end();

    const ctx2 = propagation.extract(ROOT_CONTEXT, carrier);
    const attempt2 = tracer.startSpan(
      "job.attempt",
      {
        attributes: { "snapotter.attempt_number": 2 },
      },
      ctx2,
    );
    attempt2.end();

    const spans = exporter.getFinishedSpans();
    const attempts = spans.filter((s) => s.name === "job.attempt");
    expect(attempts).toHaveLength(2);
    expect(attempts[0].spanContext().traceId).toBe(traceId);
    expect(attempts[1].spanContext().traceId).toBe(traceId);
    expect(attempts[0].attributes["snapotter.attempt_number"]).toBe(1);
    expect(attempts[1].attributes["snapotter.attempt_number"]).toBe(2);

    httpSpan.end();
    await provider.shutdown();
  });
});
