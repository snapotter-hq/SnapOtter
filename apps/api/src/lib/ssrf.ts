import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 240) return true;
  return false;
}

// IPv6 ranges that must never be reachable via outbound fetch, matched
// numerically by bit-prefix. Textual prefix matching is unreliable because the
// WHATWG URL parser canonicalizes IPv6 literals in ways string checks miss
// (e.g. ::ffff:127.0.0.1 -> ::ffff:7f00:1, ::127.0.0.1 -> ::7f00:1), and a
// CIDR like fe80::/10 spans fe80 through febf, not just literals "fe80:".
const BLOCKED_IPV6_CIDRS: ReturnType<typeof ipaddr.parseCIDR>[] = [
  "::1/128", // loopback
  "::/128", // unspecified
  "fe80::/10", // link-local
  "fc00::/7", // unique local (fc00::/8 and fd00::/8)
  "fec0::/10", // site-local (deprecated, still routed on some networks)
  "2001:db8::/32", // documentation
  "2001::/32", // Teredo tunneling
  "2002::/16", // 6to4 (can encapsulate private IPv4)
  "64:ff9b::/96", // NAT64 well-known prefix (maps to IPv4)
  "100::/64", // discard-only
  "ff00::/8", // multicast
].map((cidr) => ipaddr.parseCIDR(cidr));

function isPrivateIPv6(ip: string): boolean {
  const bare = ip.replace(/^\[|]$/g, "");
  let addr: ReturnType<typeof ipaddr.parse>;
  try {
    addr = ipaddr.parse(bare);
  } catch {
    // Not a parseable numeric address -- fail closed (treat as unsafe). Callers
    // only reach this with validated IP literals or resolved addresses, so this
    // is purely defensive.
    return true;
  }
  // ipaddr also parses bare IPv4; defer those to the dedicated classifier.
  if (addr.kind() === "ipv4") return isPrivateIPv4(addr.toString());

  // IPv4-mapped (::ffff:0:0/96) and the deprecated IPv4-compatible (::/96) form
  // both embed an IPv4 address in the final four bytes. Reuse the full IPv4
  // classifier so the embedded address is held to the same private/reserved
  // ranges (loopback, RFC1918, link-local metadata, CG-NAT, etc.).
  const bytes = addr.toByteArray(); // 16 bytes, network order
  const first80Zero = bytes.slice(0, 10).every((b) => b === 0);
  const isMapped = first80Zero && bytes[10] === 0xff && bytes[11] === 0xff;
  const isCompatible = first80Zero && bytes[10] === 0 && bytes[11] === 0;
  if (isMapped || isCompatible) {
    if (isPrivateIPv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`)) return true;
  }

  return BLOCKED_IPV6_CIDRS.some((cidr) => addr.match(cidr));
}

export function isPrivateIp(ip: string): boolean {
  return isPrivateIPv4(ip) || isPrivateIPv6(ip);
}

/**
 * Resolve a hostname and validate all returned IPs are public.
 * Returns the first valid resolved IP so callers can pin it for the actual
 * connection, preventing DNS rebinding (TOCTOU) attacks.
 */
async function resolveAndCheck(hostname: string): Promise<string> {
  const bare = hostname.replace(/^\[|]$/g, "");
  if (isIP(bare)) {
    if (isPrivateIp(bare)) {
      throw new Error("URL resolves to a private or reserved IP address");
    }
    return bare;
  }

  const result = await lookup(hostname, { all: true });
  const addresses = Array.isArray(result) ? result : [result];
  for (const entry of addresses) {
    if (isPrivateIp(entry.address)) {
      throw new Error("URL resolves to a private or reserved IP address");
    }
  }
  return addresses[0].address;
}

/**
 * Validate that a URL points to a public address and return the pinned IP.
 * The resolved IP should be used for the actual connection to prevent DNS
 * rebinding between validation and fetch.
 */
export async function validateFetchUrl(url: string): Promise<{ resolvedIp: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }

  const resolvedIp = await resolveAndCheck(parsed.hostname);
  return { resolvedIp };
}

export const MAX_REDIRECTS = 5;
export const FETCH_TIMEOUT_MS = 30_000;
export const MAX_URL_FETCH_SIZE = 50 * 1024 * 1024;
export const MAX_URLS_PER_REQUEST = 50;
export const URL_FETCH_CONCURRENCY = 4;

/**
 * Create an HTTP(S) agent that pins DNS resolution to a specific IP address.
 * This prevents DNS rebinding attacks where a hostname resolves to a different
 * (private) IP between our SSRF validation and the actual connection.
 */
function createPinnedAgent(resolvedIp: string, protocol: string): http.Agent | https.Agent {
  const family = resolvedIp.includes(":") ? 6 : 4;
  // Node's lookup contract: when called with { all: true } the callback must
  // return the address(es) as an array. Node 22 invokes the agent's custom
  // lookup this way, so a single-arg callback passes `undefined` as the
  // address and every fetch fails with "Invalid IP address: undefined".
  // Honor both forms while still pinning to the SSRF-validated public IP.
  const pinnedLookup: (
    hostname: string,
    options: { all?: boolean },
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | Array<{ address: string; family: number }>,
      family?: number,
    ) => void,
  ) => void = (_hostname, options, callback) => {
    if (options?.all) {
      callback(null, [{ address: resolvedIp, family }]);
    } else {
      callback(null, resolvedIp, family);
    }
  };

  if (protocol === "https:") {
    return new https.Agent({ lookup: pinnedLookup as never, maxSockets: 1 });
  }
  return new http.Agent({ lookup: pinnedLookup as never, maxSockets: 1 });
}

export async function safeFetch(url: string, signal?: AbortSignal): Promise<Response> {
  let currentUrl = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const { resolvedIp } = await validateFetchUrl(currentUrl);
    const parsed = new URL(currentUrl);
    const agent = createPinnedAgent(resolvedIp, parsed.protocol);

    // Use the Node.js fetch dispatcher option for IP pinning.
    // Replace hostname with the resolved IP for HTTP; for HTTPS, use
    // the pinned agent to maintain SNI with the original hostname.
    let fetchUrl = currentUrl;
    if (parsed.protocol === "http:") {
      // For HTTP, replace hostname directly -- no TLS/SNI concerns
      const pinnedUrl = new URL(currentUrl);
      pinnedUrl.hostname = resolvedIp.includes(":") ? `[${resolvedIp}]` : resolvedIp;
      fetchUrl = pinnedUrl.href;
    }

    const fetchOptions: RequestInit & { agent?: http.Agent | https.Agent } = {
      signal,
      redirect: "manual",
      headers: {
        "User-Agent": "SnapOtter/2.0 (file-fetch)",
        Host: parsed.host,
      },
    };

    // Node.js undici-based fetch does not support the `agent` option directly.
    // For HTTP we use the IP-replaced URL. For HTTPS we use the pinned agent
    // via the Node.js http/https request internals by importing from node:https.
    let res: Response;
    if (parsed.protocol === "https:") {
      // For HTTPS, use node:https with the pinned agent and original hostname for SNI
      res = await new Promise<Response>((resolve, reject) => {
        const req = https.request(
          currentUrl,
          {
            agent,
            signal: signal ?? undefined,
            headers: {
              "User-Agent": "SnapOtter/2.0 (file-fetch)",
            },
            method: "GET",
          },
          (incomingMessage) => {
            const chunks: Buffer[] = [];
            incomingMessage.on("data", (chunk: Buffer) => chunks.push(chunk));
            incomingMessage.on("end", () => {
              const body = Buffer.concat(chunks);
              const headers = new Headers();
              for (const [key, value] of Object.entries(incomingMessage.headers)) {
                if (value) {
                  const vals = Array.isArray(value) ? value : [value];
                  for (const v of vals) headers.append(key, v);
                }
              }
              resolve(
                new Response(body, {
                  status: incomingMessage.statusCode ?? 500,
                  statusText: incomingMessage.statusMessage ?? "",
                  headers,
                }),
              );
            });
            incomingMessage.on("error", reject);
          },
        );
        req.on("error", reject);
        req.end();
      });
    } else {
      res = await fetch(fetchUrl, fetchOptions);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("Redirect without Location header");
      await res.body?.cancel();
      currentUrl = new URL(location, currentUrl).href;
      agent.destroy();
      continue;
    }

    return res;
  }
  throw new Error("Too many redirects");
}
