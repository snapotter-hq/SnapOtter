// Probed at the edge rather than read from the Sentry uptime API: no standing
// credential on a public worker, and no 15-minute lag from Sentry's 5-minute
// interval times its 3-strike rule. See the design doc for the full trade.
const STATUS_PROBES = ["https://demo.snapotter.com/", "https://docs.snapotter.com/"];

// One immediate retry absorbs a transient blip. `redirect: "manual"` stops the
// follow, so a 3xx arrives as-is and still counts as up.
async function probe(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(2000),
      });
      if (res.status < 400) return true;
    } catch {
      // Timeout or network error. Retry once, then report the leg down.
    }
  }
  return false;
}

// snapotter.com needs no probe: this worker answering the request is the proof
// it is up. Only the two sibling properties are checked.
async function statusResponse() {
  const legs = await Promise.all(STATUS_PROBES.map(probe));
  const downCount = legs.filter((up) => !up).length;
  const status = downCount === 0 ? "operational" : downCount === legs.length ? "down" : "partial";

  // `_headers` only decorates env.ASSETS responses in advanced mode, so a
  // synthesized response has to carry its own.
  return new Response(JSON.stringify({ status }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
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
