import type { FastifyReply, FastifyRequest } from "fastify";

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

/**
 * True when `err` is the abort `clientDisconnectSignal` raised and the client
 * really is gone. A route's decode `catch` calls this first and returns the
 * reply untouched: the 422 and the error log are for faults, and a hang-up is
 * neither. Logs at debug so the cancel stays traceable.
 */
export function dropIfClientGone(
  request: FastifyRequest,
  reply: FastifyReply,
  err: unknown,
  toolId: string,
): boolean {
  if ((err as { name?: string } | null)?.name !== "AbortError") return false;
  if (!reply.raw.destroyed || reply.raw.writableFinished) return false;
  request.log.debug({ toolId }, "Client disconnected while the input was being decoded");
  return true;
}
