import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

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

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.replace(/^\[|]$/g, "").toLowerCase();
  if (normalized === "::1") return true;
  if (normalized === "::") return true;
  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("2001:db8:")) return true;
  // 6to4 addresses can encapsulate private IPv4 addresses
  if (normalized.startsWith("2002:")) return true;
  // NAT64 prefix maps to IPv4 -- block to prevent SSRF via IPv4-mapped addresses
  if (normalized.startsWith("64:ff9b:")) return true;
  if (normalized.includes("::ffff:")) {
    const v4 = normalized.split("::ffff:")[1];
    if (v4) {
      if (v4.includes(".")) {
        if (isPrivateIPv4(v4)) return true;
      } else {
        const m = v4.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
        if (m) {
          const hi = parseInt(m[1], 16);
          const lo = parseInt(m[2], 16);
          const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
          if (isPrivateIPv4(dotted)) return true;
        }
      }
    }
  }
  return false;
}

/**
 * Resolve a hostname and validate all returned IPs are public.
 * Returns the first valid resolved IP so callers can pin it for the actual
 * connection, preventing DNS rebinding (TOCTOU) attacks.
 */
async function resolveAndCheck(hostname: string): Promise<string> {
  const bare = hostname.replace(/^\[|]$/g, "");
  if (isIP(bare)) {
    if (isPrivateIPv4(bare) || isPrivateIPv6(bare)) {
      throw new Error("URL resolves to a private or reserved IP address");
    }
    return bare;
  }

  const result = await lookup(hostname, { all: true });
  const addresses = Array.isArray(result) ? result : [result];
  for (const entry of addresses) {
    const addr = entry.address;
    if (isPrivateIPv4(addr) || isPrivateIPv6(addr)) {
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
