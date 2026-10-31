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

const CIDR_PREFIX_RE = /^(?:0|[1-9]\d*)$/;

function addCidrToBlockList(bl: BlockList, cidr: string): boolean {
  try {
    if (cidr.includes("/")) {
      const parts = cidr.split("/");
      if (parts.length !== 2) return false;
      const [addr, prefix] = parts;
      if (!CIDR_PREFIX_RE.test(prefix)) return false;
      const prefixNum = Number(prefix);
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
 * Parse an array of CIDR strings (or bare addresses) into a BlockList.
 * Returns null when the list is empty (meaning "allow all").
 */
export function buildBlockList(cidrs: string[]): BlockList | null {
  if (cidrs.length === 0) return null;
  const bl = new BlockList();
  for (const cidr of cidrs) {
    addCidrToBlockList(bl, cidr);
  }
  return bl;
}

/**
 * Validate a single CIDR string (or bare IP).
 * Returns true when the string can be parsed without error.
 */
export function isValidCidr(cidr: string): boolean {
  return addCidrToBlockList(new BlockList(), cidr);
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

function parseAllowlistJson(raw: string): string[] {
  const parsed: unknown = JSON.parse(raw);
  if (
    !Array.isArray(parsed) ||
    !parsed.every((entry): entry is string => typeof entry === "string" && isValidCidr(entry))
  ) {
    throw new SyntaxError("ipAllowlist must be a JSON array of valid CIDR strings");
  }
  return parsed;
}

export async function registerIpAllowlist(app: FastifyInstance): Promise<void> {
  // Only run if enterprise feature is enabled
  const isEnabled = await isEnterpriseFeatureEnabled("ip_allowlist", "boot");
  if (!isEnabled) return;

  // Load allowlist from settings table
  async function loadAllowlist(): Promise<string[]> {
    const { getSettingStrict } = await import("../lib/settings-helpers.js");
    const raw = await getSettingStrict("ipAllowlist");
    if (raw === undefined || raw === "") return [];
    return parseAllowlistJson(raw);
  }

  // Cache in-process
  const { sharedRedis } = await import("../jobs/connection.js");
  const redis = sharedRedis();

  let cachedBlockList: BlockList | null = null;
  let cachedCidrs: string[] = [];
  let hasLoadedAllowlist = false;

  async function refreshAllowlist(): Promise<void> {
    let cidrs: string[];
    try {
      cidrs = await loadAllowlist();
    } catch (err) {
      if (hasLoadedAllowlist) {
        app.log.error(
          { err, key: "ipAllowlist" },
          "Failed to refresh IP allowlist from settings; keeping cached allowlist",
        );
        return;
      }

      try {
        const cachedRaw = await redis.get?.(ALLOWLIST_KEY);
        if (cachedRaw) {
          const cached = parseAllowlistJson(cachedRaw);
          if (cached.length > 0) {
            cachedCidrs = cached;
            cachedBlockList = buildBlockList(cached);
            hasLoadedAllowlist = true;
            app.log.warn(
              { err, key: "ipAllowlist" },
              "Failed to load IP allowlist from settings; using Redis cached allowlist",
            );
            return;
          }
        }
      } catch (redisErr) {
        app.log.warn({ err: redisErr }, "Failed to read IP allowlist fallback from Redis");
      }

      cachedCidrs = [];
      cachedBlockList = new BlockList();
      app.log.error(
        { err, key: "ipAllowlist" },
        "Failed to load IP allowlist from settings and no usable Redis cache is available; failing closed",
      );
      return;
    }

    cachedCidrs = cidrs;
    cachedBlockList = buildBlockList(cidrs);
    hasLoadedAllowlist = true;
    // Mirror into Redis so other instances can bootstrap faster
    try {
      await redis.set(ALLOWLIST_KEY, JSON.stringify(cidrs));
    } catch (err) {
      app.log.warn({ err }, "Failed to cache IP allowlist in Redis");
    }
  }

  // Initial load
  await refreshAllowlist();

  // Subscribe to refresh events from other instances
  const sub = redis.duplicate();
  sub.on("error", (err) => {
    app.log.warn({ err }, "IP allowlist Redis subscriber error");
  });
  try {
    await sub.subscribe(ALLOWLIST_CHANNEL);
  } catch (err) {
    app.log.warn({ err }, "Failed to subscribe to IP allowlist refresh channel");
  }
  sub.on("message", async () => {
    refreshAllowlist().catch((err) => {
      app.log.error({ err }, "Unexpected error refreshing IP allowlist");
    });
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
    if (!cachedBlockList) return; // No allowlist = allow all
    if (isExemptPath(request.url)) return;

    const ip = request.ip;
    if (!isIpAllowed(ip, cachedBlockList)) {
      return reply.status(403).send({ error: "IP address not allowed", code: "IP_NOT_ALLOWED" });
    }
  });

  if (hasLoadedAllowlist) {
    app.log.info(`IP allowlist active (${cachedCidrs.length} entries)`);
  }
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
