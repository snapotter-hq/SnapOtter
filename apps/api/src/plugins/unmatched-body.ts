import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";

/**
 * A request for a path with no route has nothing to parse, but Fastify still runs
 * the content-type parser for it. Anyone can send one unauthenticated, and non-API
 * paths skip the rate limiter, so without this a client could make the server buffer
 * up to bodyLimit (100 MB by default, 1 GiB when uploads are unlimited) before the 404
 * (#2123).
 *
 * The unmatched request's body is swapped for an empty stream. The original is never
 * read: Node discards what's left of it once the response finishes. The swapped stream
 * reports the declared length as received, which is what Fastify's own length check
 * compares against, so the request still reaches the not-found handler normally
 * (including the save-password redirect from #2088). A declared length over the limit
 * is still refused before the hook's replacement is read.
 */
export function skipUnmatchedRequestBodies(app: FastifyInstance) {
  app.addHook("preParsing", async (request) => {
    if (!request.is404) return;
    const empty = Readable.from([]) as Readable & { receivedEncodedLength?: number };
    empty.receivedEncodedLength = Number(request.headers["content-length"]) || 0;
    return empty;
  });
}
