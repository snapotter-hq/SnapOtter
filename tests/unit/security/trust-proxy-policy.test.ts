import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

/**
 * Contract tests for the TRUST_PROXY default.
 *
 * `request.ip` is the key for every IP-scoped control in the product: the
 * global `@fastify/rate-limit` bucket, the per-route login-attempt limiter that
 * provides brute-force protection, and the enterprise IP allowlist. Fastify
 * derives `request.ip` from `X-Forwarded-For` whenever `trustProxy` trusts the
 * peer, so the value of TRUST_PROXY decides whether those controls key on
 * something the client can set.
 *
 * Nothing in the suite asserted this before, so the default could drift between
 * the Dockerfile and the two Compose files without anything noticing. These
 * tests pin the invariants that hold regardless of which value is chosen, and
 * pin the value itself so that changing it is a deliberate, reviewed act.
 *
 * See finding SEC-20260726-002.
 */

const root = resolve(import.meta.dirname, "../../..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

interface ComposeFile {
  services: Record<string, { environment?: string[] }>;
}

function composeEnv(relativePath: string, service: string): Map<string, string> {
  const parsed = load(read(relativePath)) as ComposeFile;
  const entries = parsed.services[service]?.environment ?? [];
  const map = new Map<string, string>();
  for (const entry of entries) {
    const eq = entry.indexOf("=");
    if (eq > 0) map.set(entry.slice(0, eq), entry.slice(eq + 1));
  }
  return map;
}

/** The forms `parseTrustProxy` in apps/api/src/index.ts turns into something meaningful. */
function classifyTrustProxy(value: string): "boolean" | "hops" | "cidr-list" {
  if (value === "true" || value === "false") return "boolean";
  if (!Number.isNaN(Number(value))) return "hops";
  return "cidr-list";
}

const dockerfile = read("docker/Dockerfile");
const cpuDefault = composeEnv("docker/docker-compose.yml", "SnapOtter").get("TRUST_PROXY");
const gpuDefault = composeEnv("docker/docker-compose-gpu.yml", "SnapOtter").get("TRUST_PROXY");

describe("TRUST_PROXY default", () => {
  it("is declared exactly once in the Dockerfile", () => {
    const declarations = dockerfile.match(/^\s*TRUST_PROXY=\S+/gm) ?? [];
    expect(declarations).toHaveLength(1);
  });

  it("agrees across the Dockerfile and both shipped Compose files", () => {
    const baked = /^\s*TRUST_PROXY=(\S+?)\s*\\?$/m.exec(dockerfile)?.[1];
    expect(baked).toBeDefined();

    // Compose expresses it as ${TRUST_PROXY:-<default>}; the fallback is what a
    // user who sets nothing actually gets.
    expect(cpuDefault).toBe(`\${TRUST_PROXY:-${baked}}`);
    expect(gpuDefault).toBe(cpuDefault);
  });

  it("uses a form parseTrustProxy recognises", () => {
    const baked = /^\s*TRUST_PROXY=(\S+?)\s*\\?$/m.exec(dockerfile)?.[1];
    expect(baked).toBeDefined();
    expect(["boolean", "hops", "cidr-list"]).toContain(classifyTrustProxy(baked as string));
  });

  it("pins the shipped default so a change to it is deliberate", () => {
    // `true` trusts X-Forwarded-For from ANY peer, which makes request.ip
    // client-controlled on a directly exposed instance and lets a caller rotate
    // the header to get a fresh rate-limit bucket per request. That is measured
    // in SEC-20260726-002. This assertion is not an endorsement of `true`: it
    // exists so that whoever changes the default has to update this test and
    // state why.
    const baked = /^\s*TRUST_PROXY=(\S+?)\s*\\?$/m.exec(dockerfile)?.[1];
    expect(baked).toBe("true");
  });

  it("keeps the env-var default in lib/env.ts at the safe value", () => {
    // A source build with no Docker layer must not inherit the permissive
    // default; Zod's fallback is the last line of defence for `pnpm dev` and
    // for any deployment that does not go through the image.
    const env = read("apps/api/src/lib/env.ts");
    expect(env).toMatch(/TRUST_PROXY:\s*z\.string\(\)\.default\("false"\)/);
  });
});

describe("IP-keyed controls exist and are wired to request.ip", () => {
  it("keeps the login-attempt limiter on the login route", () => {
    const auth = read("apps/api/src/plugins/auth.ts");
    expect(auth).toMatch(/"\/api\/auth\/login",\s*\n\s*\{\s*config:\s*\{\s*rateLimit:/);
    expect(auth).toContain("getLoginAttemptLimit");
  });

  it("keeps the global limiter scoped to /api/ and off static routes", () => {
    const index = read("apps/api/src/index.ts");
    expect(index).toContain('allowList: (request) => !request.url.startsWith("/api/")');
  });

  it("keeps the enterprise IP allowlist reading request.ip", () => {
    // Recorded because the allowlist inherits whatever TRUST_PROXY decides;
    // it is not a separate trust decision.
    const allowlist = read("apps/api/src/plugins/ip-allowlist.ts");
    expect(allowlist).toContain("const ip = request.ip;");
  });
});
