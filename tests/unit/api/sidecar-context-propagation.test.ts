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

describe("sidecar trace context injection", () => {
  afterEach(() => {
    propagation.disable();
    context.disable();
    trace.disable();
  });

  it("produces _otel field when span is active", async () => {
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
    const span = tracer.startSpan("sidecar-call");
    const ctx = trace.setSpan(ROOT_CONTEXT, span);

    const message: Record<string, unknown> = context.with(ctx, () => {
      const carrier: Record<string, string> = {};
      propagation.inject(context.active(), carrier);

      const msg: Record<string, unknown> = {
        id: "test-123",
        script: "remove_bg",
        args: ["input.png"],
      };
      if (carrier.traceparent) {
        msg._otel = {
          traceparent: carrier.traceparent,
          tracestate: carrier.tracestate,
        };
      }
      return msg;
    });

    // _otel should be present with a valid traceparent
    expect(message._otel).toBeDefined();
    const otel = message._otel as { traceparent: string; tracestate?: string };
    expect(otel.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);

    // traceparent should contain the correct traceId and spanId
    const parts = otel.traceparent.split("-");
    expect(parts[1]).toBe(span.spanContext().traceId);
    expect(parts[2]).toBe(span.spanContext().spanId);

    // args array is untouched
    expect(message.args).toEqual(["input.png"]);

    span.end();
    await provider.shutdown();
  });

  it("omits _otel when no SDK is registered", () => {
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);

    const message: Record<string, unknown> = {
      id: "test",
      script: "remove_bg",
      args: ["input.png"],
    };
    if (carrier.traceparent) {
      message._otel = { traceparent: carrier.traceparent };
    }
    expect(message._otel).toBeUndefined();
  });
});
