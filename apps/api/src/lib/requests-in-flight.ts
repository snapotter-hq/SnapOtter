import type { FastifyInstance, FastifyRequest } from "fastify";

// Write requests the server is still handling: an upload streaming in, a tool
// run inside its sync wait, a settings change. An upload has no queue job until
// its body has arrived, so queue counts alone read "idle" in the middle of one.
// Reads are left out: a health poll would count itself, and progress streams
// stay open for as long as a page watches a job.
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const COUNTED = Symbol("countedInFlight");

let inFlight = 0;

type Counted = FastifyRequest & { [COUNTED]?: boolean };

function release(request: Counted): void {
  // A client that aborts gets onRequestAbort, and its handler may still send a
  // reply that fires onResponse; the flag makes sure only one of them counts.
  if (!request[COUNTED]) return;
  request[COUNTED] = false;
  inFlight -= 1;
}

export function trackRequestsInFlight(app: FastifyInstance): void {
  app.addHook("onRequest", async (request: Counted) => {
    if (READ_METHODS.has(request.method)) return;
    request[COUNTED] = true;
    inFlight += 1;
  });
  app.addHook("onResponse", async (request: Counted) => release(request));
  app.addHook("onRequestAbort", async (request: Counted) => release(request));
}

export function requestsInFlight(): number {
  return inFlight;
}
