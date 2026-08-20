/**
 * Enterprise IP allowlist plugin.
 *
 * Registers an onRequest hook that checks whether the request IP falls
 * within any allowed CIDR range.  Uses Node 22's built-in BlockList for
 * zero-dependency CIDR matching.  The allowlist is cached in-process and
 * synchronized across instances via Redis pub/sub.
 *
 * Only active when the enterprise `ip_allowlist` feature is licensed.
 */
import { BlockList } from "node:net";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { isEnterpriseFeatureEnabled } from "../lib/enterprise-feature.js";

// Paths exempt from IP filtering -- infrastructure probes, IdP callbacks
const EXEMPT_PATHS = [
  "/api/v1/health",
  "/api/v1/readyz",
  "/api/v1/metrics",
  "/api/v1/scim/", // SCIM from cloud IdPs
  "/api/auth/saml/callback", // SAML assertion POST
  "/api/auth/oidc/callback", // OIDC redirect
];

function isExemptPath(url: string): boolean {
  return EXEMPT_PATHS.some((p) => url.startsWith(p));
}

/**
 * Parse an array of CIDR strings (or bare addresses) into a BlockList.
 * Returns null when the list is empty (meaning "allow all").
 */
export function buildBlockList(cidrs: string[]): BlockList | null {
  if (cidrs.length === 0) return null;
  const bl = new BlockList();
  for (const cidr of cidrs) {
    try {
      if (cidr.includes("/")) {
        const [addr, prefix] = cidr.split("/");
        bl.addSubnet(addr, Number(prefix), addr.includes(":") ? "ipv6" : "ipv4");
      } else {
        bl.addAddress(cidr, cidr.includes(":") ? "ipv6" : "ipv4");
      }
    } catch {
      // Invalid CIDR -- skip silently
    }
  }
  return bl;
}

/**
 * Validate a single CIDR string (or bare IP).
 * Returns true when the string can be parsed without error.
 */
export function isValidCidr(cidr: string): boolean {
  try {
    const bl = new BlockList();
    if (cidr.includes("/")) {
      const [addr, prefix] = cidr.split("/");
      const prefixNum = Number(prefix);
      if (Number.isNaN(prefixNum) || prefixNum < 0) return false;
      const family = addr.includes(":") ? "ipv6" : "ipv4";
      if (family === "ipv4" && prefixNum > 32) return false;
      if (family === "ipv6" && prefixNum > 128) return false;
      bl.addSubnet(addr, prefixNum, family);
    } else {
      bl.addAddress(cidr, cidr.includes(":") ? "ipv6" : "ipv4");
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether an IP is covered by a BlockList (used as an allowlist).
 * Handles IPv4-mapped IPv6 addresses (::ffff:x.x.x.x) by extracting the
 * inner IPv4 address and checking both forms.
 */
export function isIpAllowed(ip: string, bl: BlockList): boolean {
  const family = ip.includes(":") ? "ipv6" : "ipv4";
  if (bl.check(ip, family)) return true;

  // IPv4-mapped IPv6 -- also check the bare IPv4 portion
  if (ip.startsWith("::ffff:")) {
    const v4 = ip.slice(7);
    if (bl.check(v4, "ipv4")) return true;
  }

  return false;
}

// Re-export for tests
export { EXEMPT_PATHS, isExemptPath };

const ALLOWLIST_KEY = "ip:allowlist";
const ALLOWLIST_CHANNEL = "ip:allowlist:refresh";

export async function registerIpAllowlist(app: FastifyInstance): Promise<void> {
  // Only run if enterprise feature is enabled
  const isEnabled = await isEnterpriseFeatureEnabled("ip_allowlist", "boot");
  if (!isEnabled) return;

  // Load allowlist from settings table
  async function loadAllowlist(): Promise<string[]> {
    const { getSettingString } = await import("../lib/settings-helpers.js");
    const raw = await getSettingString("ipAllowlist", "");
    if (!raw) return [];
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }

  // Cache in-process
  const { sharedRedis } = await import("../jobs/connection.js");
  const redis = sharedRedis();

  let cachedBlockList: BlockList | null = null;
  let cachedCidrs: string[] = [];

  async function refreshAllowlist(): Promise<void> {
    const cidrs = await loadAllowlist();
    cachedCidrs = cidrs;
    cachedBlockList = buildBlockList(cidrs);
    // Mirror into Redis so other instances can bootstrap faster
    await redis.set(ALLOWLIST_KEY, JSON.stringify(cidrs));
  }

  // Initial load
  await refreshAllowlist();

  // Subscribe to refresh events from other instances
  const sub = redis.duplicate();
  await sub.subscribe(ALLOWLIST_CHANNEL);
  sub.on("message", async () => {
    refreshAllowlist().catch(() => {});
  });

  // Clean up subscriber on shutdown
  app.addHook("onClose", async () => {
    try {
      await sub.unsubscribe();
      await sub.quit();
    } catch {
      // Best-effort cleanup
    }
  });

  // Hook -- runs before auth, before routes
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!cachedBlockList || cachedCidrs.length === 0) return; // No allowlist = allow all
    if (isExemptPath(request.url)) return;

    const ip = request.ip;
    if (!isIpAllowed(ip, cachedBlockList)) {
      return reply.status(403).send({ error: "IP address not allowed" });
    }
  });

  app.log.info(`IP allowlist active (${cachedCidrs.length} entries)`);
}

/**
 * Notify all instances to reload the IP allowlist from the DB.
 * Called by the admin API after updating the setting.
 */
export async function publishAllowlistRefresh(): Promise<void> {
  const { sharedRedis } = await import("../jobs/connection.js");
  const redis = sharedRedis();
  await redis.publish(ALLOWLIST_CHANNEL, "refresh");
}
