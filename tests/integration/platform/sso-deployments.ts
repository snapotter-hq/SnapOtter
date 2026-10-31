import { vi } from "vitest";
import { loadEnv } from "../../../apps/api/src/lib/env.js";

/**
 * SSO deployments the OIDC and SAML suites run their URL checks under: the
 * root and a subpath, each with EXTERNAL_URL typed with and without a
 * trailing slash (#1599), plus uppercase and trailing-backslash spellings that
 * boot canonicalizes (#1876). Every callback, entity ID, and logout URL
 * appends a path to EXTERNAL_URL, so any consumer that skips the canonical
 * value fails the lowercase origin assertions in those suites.
 */
export const SSO_DEPLOYMENTS: [basePath: string, externalUrl: string][] = [
  ["", "http://localhost:9999"],
  ["", "http://localhost:9999/"],
  ["", "HTTP://Localhost:9999"],
  ["", "http://localhost:9999\\"],
  ["/snapotter", "http://localhost:9999/snapotter"],
  ["/snapotter", "http://localhost:9999/snapotter/"],
  ["/snapotter", "HTTP://Localhost:9999/snapotter/"],
  ["/snapotter", "http://localhost:9999/snapotter\\"],
];

/** EXTERNAL_URL as the server sees it after boot parses the operator's value. */
export function parseExternalUrl(value: string): string {
  vi.stubEnv("EXTERNAL_URL", value);
  try {
    return loadEnv().EXTERNAL_URL;
  } finally {
    vi.unstubAllEnvs();
  }
}
