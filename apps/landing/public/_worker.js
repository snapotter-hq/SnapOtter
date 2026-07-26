// snapotter.com needs no probe: this worker answering the request is the proof
// it is up. Only the two sibling properties are checked.
const STATUS_PROBES = ["https://demo.snapotter.com/", "https://docs.snapotter.com/"];

// Probed at the edge rather than read from the Sentry uptime API: no standing
// credential on a public worker, and no 15-minute lag from Sentry's 5-minute
// interval times its 3-strike rule.
//
// One immediate retry absorbs a transient blip. `redirect: "manual"` stops the
// follow, so a 3xx arrives as-is and still counts as up.
async function probe(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    // Built outside the try, so a throw here surfaces as the runtime bug it is
    // rather than being read as a down leg. Built inside the loop, so each
    // attempt carries its own deadline: hoisting it above the loop would leave
    // attempt 2 holding an already-fired signal, silently deleting the retry
    // for the exact transient-blip case the retry exists to absorb.
    const signal = AbortSignal.timeout(2000);
    let res;
    try {
      res = await fetch(url, { method: "HEAD", redirect: "manual", signal });
    } catch {
      // A throw is a timeout or a network error, which is a legitimate "down"
      // signal rather than a swallowed bug. Retry once, then report the leg
      // down. Only the fetch is guarded, so nothing below can be swallowed.
      continue;
    }
    if (res.status < 400) return true;
  }
  return false;
}

async function statusResponse() {
  const legs = await Promise.all(STATUS_PROBES.map((url) => probe(url)));
  const downCount = legs.filter((up) => !up).length;
  const status = downCount === 0 ? "operational" : downCount === legs.length ? "down" : "partial";

  // A false green is cheap to sit on for a minute; a false red is not, and it
  // would otherwise pin in the browser across every navigation until it aged
  // out. Recheck a bad verdict sooner.
  const maxAge = status === "operational" ? 60 : 15;

  // `_headers` only decorates env.ASSETS responses in advanced mode, so a
  // synthesized response has to carry its own.
  return new Response(JSON.stringify({ status }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}`,
      "X-Robots-Tag": "noindex",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === "www.snapotter.com") {
      url.hostname = "snapotter.com";
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === "/api/status") {
      return statusResponse();
    }

    const response = await env.ASSETS.fetch(request);

    if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/_next/data/")) {
      const headers = new Headers(response.headers);
      headers.set("X-Robots-Tag", "noindex, nofollow");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  },
};
