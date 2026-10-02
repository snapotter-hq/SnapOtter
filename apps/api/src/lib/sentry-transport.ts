/**
 * The analytics gate at Sentry's transport, the one point every envelope
 * crosses on its way out (#1919). beforeSend and beforeSendTransaction only see
 * error events and transactions. Sessions (processSessionIntegration ends the
 * process session on exit), cron check-ins (withMonitor), and the SDK's own
 * internal error events (`hint.data.__sentry__`, which skip both hooks) go
 * straight to the transport, so without this they leave an opted-out instance.
 *
 * Built from the transport factory instrument.ts passes in, so this file never
 * imports @sentry/node at runtime (the type import is erased) and a test can
 * wrap a recording transport in the same gate.
 *
 * The one copy that leaves before the transport, Spotlight's, has its own gate
 * below (#1966).
 */
import type * as SentryNode from "@sentry/node";

type SentryOptions = NonNullable<Parameters<(typeof SentryNode)["init"]>[0]>;
type TransportFactory = NonNullable<SentryOptions["transport"]>;

export function buildGatedTransport(
  isActive: () => boolean,
  makeTransport: TransportFactory,
): TransportFactory {
  return (options) => {
    const inner = makeTransport(options);
    return {
      // Checked per envelope, at send time, so an opt-out takes effect on the
      // next send. A dropped envelope resolves like a sent one: the SDK has
      // nothing to retry, and there is nobody to report the drop to.
      send: (envelope) => (isActive() ? inner.send(envelope) : Promise.resolve({})),
      flush: (timeout) => inner.flush(timeout),
    };
  };
}

type SpotlightFactory = (typeof SentryNode)["spotlightIntegration"];
type SentryIntegration = ReturnType<SpotlightFactory>;
type SentryClient = Parameters<NonNullable<SentryIntegration["setup"]>>[0];
type HookRegistrar = (hook: string, callback: (...args: unknown[]) => void) => () => void;

/**
 * Spotlight behind the same gate (#1966). With SENTRY_SPOTLIGHT set, the SDK's
 * Spotlight integration POSTs a copy of every envelope to the sidecar from the
 * client's beforeEnvelope hook, which fires before the transport, so the gate
 * above never sees that copy. This takes the integration's name, which stops
 * the SDK adding its own ungated one, and sets the real one up against a
 * client whose hook callbacks only run while analytics is on.
 *
 * The SDK has already resolved SENTRY_SPOTLIGHT into the client's `spotlight`
 * option by setup time, so the env var means exactly what it did before.
 */
export function buildGatedSpotlight(
  isActive: () => boolean,
  makeSpotlight: SpotlightFactory,
): SentryIntegration {
  return {
    name: "Spotlight",
    setup(client) {
      const { spotlight } = client.getOptions() as { spotlight?: boolean | string };
      if (!spotlight) return;
      const inner = makeSpotlight({
        sidecarUrl: typeof spotlight === "string" ? spotlight : undefined,
      });
      // Only `setup` is forwarded: in @sentry/node 10.66 it is the only hook
      // the SDK's Spotlight defines. If an upgrade moves its work elsewhere,
      // Spotlight goes quiet (closed, not open) and the first test in
      // sentry-spotlight-gate.test.ts goes red.
      inner.setup?.(gateClientHooks(client, isActive));
    },
  };
}

function gateClientHooks(client: SentryClient, isActive: () => boolean): SentryClient {
  const on = client.on.bind(client) as unknown as HookRegistrar;
  const gatedOn: HookRegistrar = (hook, callback) =>
    on(hook, (...args) => {
      if (isActive()) callback(...args);
    });
  return new Proxy(client, {
    get(target, prop) {
      if (prop === "on") return gatedOn;
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
