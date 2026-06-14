import { AsyncLocalStorage } from "node:async_hooks";
import {
  type Context,
  type ContextManager,
  context,
  ROOT_CONTEXT,
  trace,
} from "@opentelemetry/api";
import { afterEach, describe, expect, it } from "vitest";
import { traceMixin } from "../../../apps/api/src/lib/log-trace-mixin.js";

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

describe("traceMixin", () => {
  afterEach(() => {
    context.disable();
    trace.disable();
  });

  it("returns empty object when no span is active", () => {
    const result = traceMixin();
    expect(result).toEqual({});
  });

  it("returns traceId, spanId, traceFlags when span is active", async () => {
    const { InMemorySpanExporter, SimpleSpanProcessor, BasicTracerProvider } = await import(
      "@opentelemetry/sdk-trace-base"
    );

    // Register a real context manager so context.with() propagates
    context.setGlobalContextManager(new TestContextManager());

    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);

    const tracer = trace.getTracer("test");
    const span = tracer.startSpan("test-span");
    const ctx = trace.setSpan(ROOT_CONTEXT, span);

    const result = context.with(ctx, () => traceMixin());

    expect(result.traceId).toBe(span.spanContext().traceId);
    expect(result.spanId).toBe(span.spanContext().spanId);
    expect(result.traceFlags).toBe(span.spanContext().traceFlags);

    span.end();
    await provider.shutdown();
  });
});
