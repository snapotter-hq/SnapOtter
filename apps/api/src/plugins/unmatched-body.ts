import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";

/**
 * A request for a path with no route has nothing to parse, but Fastify still runs
 * the content-type parser for it. Anyone can send one unauthenticated, and non-API
 * paths skip the rate limiter, so without this a client could make the server buffer
 * up to bodyLimit (100 MB by default, 1 GiB when uploads are unlimited) before the 404
 * (#2123).
 *
 * The unmatched request's body is swapped for an empty stream, so the parser sees
 * nothing. The original is never buffered: Node keeps reading what the client still
 * sends and throws it away, so the cost is bandwidth, not memory, and the socket is
 * still bound by requestTimeout. The swapped stream reports the declared length as
 * received, which is what Fastify's own length check compares against, so the request
 * reaches the not-found handler normally (including the save-password redirect from
 * #2088). A declared length over the limit is still refused with a 413 first.
 *
 * Two kinds of request count as unmatched: a path with no route, and an OPTIONS
 * request that only matches @fastify/cors's catch-all. Production runs cors with
 * `origin: false`, where that catch-all just hands the request on to the 404 after
 * the body has been read.
 */
export function skipUnmatchedRequestBodies(app: FastifyInstance) {
  app.addHook("preParsing", async (request) => {
    const corsCatchAll = request.method === "OPTIONS" && request.routeOptions.url === "*";
    if (!request.is404 && !corsCatchAll) return;
    const empty = Readable.from([]) as Readable & { receivedEncodedLength?: number };
    empty.receivedEncodedLength = Number(request.headers["content-length"]) || 0;
    return empty;
  });
}
