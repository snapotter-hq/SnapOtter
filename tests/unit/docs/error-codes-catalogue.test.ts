import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const API_SRC = join(ROOT, "apps", "api", "src");
const ERROR_HANDLER = join(API_SRC, "plugins", "error-handler.ts");
const CATALOGUE = join(ROOT, "apps", "docs", "api", "errors.md");

// Codes that exist in the source but never reach a client as the `code` field:
// they ride on errors that are only logged or reported, are internal Node or
// Fastify codes, or are replaced before the response is built. Keep this list
// short and give every entry a reason; a code a client can see belongs in the
// catalogue instead.
const NOT_CLIENT_VISIBLE: Record<string, string> = {
  ALERT_DECRYPTION_FAILED: "reported to the operator only",
  SIEM_DECRYPTION_FAILED: "reported to the operator only",
  MFA_DECRYPTION_FAILED: "reported only; the response says DECRYPTION_FAILED",
  WEBHOOK_DECRYPTION_FAILED: "reported only; the response says DECRYPTION_FAILED",
  SETTING_DECRYPTION_FAILED: "reported only; the response says DECRYPTION_FAILED",
  STAGED_DISCARD_FAILED: "reported only, the client gets the original refusal",
  USERNAME_RACE_EXHAUSTED: "SSO sign-in fault, reported only",
  OIDC_DISCOVERY_FAILED: "logged; the login route redirects with a reason",
  OIDC_DISCOVERY_TIMEOUT: "logged; the login route redirects with a reason",
  OIDC_ISSUER_SCHEME_MISMATCH: "logged; the login route redirects with a reason",
  OIDC_END_SESSION_INVALID: "caught and reported during logout",
  OIDC_END_SESSION_SCHEME: "caught and reported during logout",
  ERR_OUT_OF_RANGE: "Node-style code on an internal range error",
  ETIMEDOUT: "Node-style code on an internal timeout error",
  FST_REQ_FILE_TOO_LARGE: "Fastify code, answered as PAYLOAD_TOO_LARGE",
  INVALID_STORED_NAME: "internal storage guard, no status, reported only",
  TARGET_SIZE_EXCEEDED: "internal compress check, no status, reported only",
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

function codeLiteralsInSource(): Set<string> {
  const found = new Set<string>();
  for (const file of sourceFiles(API_SRC)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/\bcode: *"([A-Z][A-Z0-9_]*)"/g)) found.add(match[1]);
  }
  return found;
}

function statusDerivedCodes(): Set<string> {
  const text = readFileSync(ERROR_HANDLER, "utf8");
  const block = text.match(/STATUS_ERROR_CODES[^=]*=\s*\{([^}]*)\}/)?.[1] ?? "";
  const codes = new Set<string>(["INTERNAL_ERROR", "BAD_REQUEST"]);
  for (const match of block.matchAll(/\d{3}: *"([A-Z][A-Z0-9_]*)"/g)) codes.add(match[1]);
  return codes;
}

function catalogueCodes(): Set<string> {
  const text = readFileSync(CATALOGUE, "utf8");
  const codes = new Set<string>();
  // A code row starts with the code, or with a status number then the code.
  for (const match of text.matchAll(/^\|\s*(?:\d{3}\s*\|\s*)?`([A-Z][A-Z0-9_]*)`\s*\|/gm)) {
    codes.add(match[1]);
  }
  return codes;
}

describe("API error code catalogue", () => {
  const raised = codeLiteralsInSource();
  const statusDerived = statusDerivedCodes();
  const documented = catalogueCodes();

  test("finds the codes in the source and the page", () => {
    expect(raised.size).toBeGreaterThan(50);
    expect(statusDerived.has("NOT_FOUND")).toBe(true);
    expect(documented.size).toBeGreaterThan(50);
  });

  test("every client-visible code raised in apps/api/src is on the page", () => {
    const missing = [...raised]
      .filter((code) => !(code in NOT_CLIENT_VISIBLE) && !documented.has(code))
      .sort();
    expect(missing, `add these to apps/docs/api/errors.md: ${missing.join(", ")}`).toEqual([]);
  });

  test("the page lists no code the API never raises", () => {
    const stale = [...documented]
      .filter((code) => !raised.has(code) && !statusDerived.has(code))
      .sort();
    expect(stale, `remove these from apps/docs/api/errors.md: ${stale.join(", ")}`).toEqual([]);
  });

  test("the page does not list a code that is not client visible", () => {
    const leaked = [...documented].filter((code) => code in NOT_CLIENT_VISIBLE).sort();
    expect(leaked).toEqual([]);
  });

  test("every exemption still names a code the source raises", () => {
    const gone = Object.keys(NOT_CLIENT_VISIBLE).filter((code) => !raised.has(code));
    expect(gone, `drop these from NOT_CLIENT_VISIBLE: ${gone.join(", ")}`).toEqual([]);
  });
});
