import type { FastifyReply } from "fastify";

/**
 * Aborts when the client's connection closes before the reply finishes, so a
 * route can hand it to work (an SVG render child) that should stop once nobody
 * is waiting. Listens on the reply rather than the request: `aborted` on the
 * request only fires while the body is still arriving, and these routes read
 * the whole upload before they start rendering. The listener lives on the
 * per-request response object, so it needs no cleanup.
 */
export function clientDisconnectSignal(reply: FastifyReply): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (reply.raw.destroyed) abort();
  reply.raw.once("close", () => {
    if (!reply.raw.writableFinished) abort();
  });
  return controller.signal;
}
