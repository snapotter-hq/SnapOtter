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
