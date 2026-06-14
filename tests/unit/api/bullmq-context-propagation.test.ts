import { AsyncLocalStorage } from "node:async_hooks";
import {
  type Context,
  type ContextManager,
  context,
  propagation,
  ROOT_CONTEXT,
  trace,
} from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Minimal AsyncLocalStorage-based context manager for tests.
 * OTel v2 BasicTracerProvider no longer registers one automatically.
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

describe("BullMQ trace context injection", () => {
  afterEach(() => {
    propagation.disable();
    context.disable();
    trace.disable();
  });

  it("injects _otel with traceparent when a span is active", async () => {
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
    const span = tracer.startSpan("http-request");
    const ctx = trace.setSpan(ROOT_CONTEXT, span);

    const carrier: Record<string, string> = {};
    context.with(ctx, () => {
      propagation.inject(context.active(), carrier);
    });

    expect(carrier.traceparent).toBeDefined();
    expect(carrier.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);

    // Verify traceparent contains the correct traceId and spanId
    const parts = carrier.traceparent!.split("-");
    expect(parts[1]).toBe(span.spanContext().traceId);
    expect(parts[2]).toBe(span.spanContext().spanId);

    span.end();
    await provider.shutdown();
  });

  it("injects nothing when no SDK is registered", () => {
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);
    expect(carrier.traceparent).toBeUndefined();
  });
});

describe("BullMQ trace context extraction", () => {
  afterEach(() => {
    propagation.disable();
    context.disable();
    trace.disable();
  });

  it("extracts parent context from _otel carrier", async () => {
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

    // Create a parent span and inject its context
    const tracer = trace.getTracer("test");
    const parentSpan = tracer.startSpan("parent-request");
    const parentCtx = trace.setSpan(ROOT_CONTEXT, parentSpan);

    const carrier: Record<string, string> = {};
    context.with(parentCtx, () => {
      propagation.inject(context.active(), carrier);
    });

    // Extract context from the carrier (simulating worker side)
    const extractedCtx = propagation.extract(ROOT_CONTEXT, carrier);
    const childSpan = tracer.startSpan("worker-process", undefined, extractedCtx);

    // Child should share traceId but have a different spanId
    expect(childSpan.spanContext().traceId).toBe(parentSpan.spanContext().traceId);
    expect(childSpan.spanContext().spanId).not.toBe(parentSpan.spanContext().spanId);

    parentSpan.end();
    childSpan.end();
    await provider.shutdown();
  });

  it("creates root span when _otel is absent", () => {
    const extractedCtx = propagation.extract(ROOT_CONTEXT, {});
    const span = trace.getSpan(extractedCtx);
    expect(span).toBeUndefined();
  });
});
