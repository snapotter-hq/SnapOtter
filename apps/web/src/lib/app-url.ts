// The server injects the deployment path into index.html at runtime.
// Vite dev/preview and root deployments use the default <base href="/">.
export const BASE_PATH =
  typeof document === "undefined"
    ? ""
    : (document.querySelector("base")?.getAttribute("href") ?? "/").replace(/\/$/, "");

export function appUrl(path: string): string {
  return `${BASE_PATH}${path}`;
}

/**
 * Suffix to rename under the prefix when the browser URL lacks it (#1275), or
 * null when no redirect is needed. The server keeps unprefixed requests
 * routable (see stripBasePath), so opening the app without the prefix still
 * returns the shell with working assets — but a router basename that doesn't
 * match, leaving a silent 404 or blank page. Only the browser can fix this: a
 * server redirect could loop behind proxies that strip the prefix.
 *
 * The prefix match is case-insensitive because stripBasePath is
 * case-sensitive: /SnapOtter with BASE_PATH=/snapotter arrives here too, and
 * redirecting it verbatim would nest it under the real prefix. The remainder
 * keeps the user's casing; only the prefix is normalized.
 */
export function unprefixPathname(pathname: string): string | null {
  if (!BASE_PATH) return null;
  if (pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`)) return null;
  const lowerBase = BASE_PATH.toLowerCase();
  const lower = pathname.toLowerCase();
  if (lower === lowerBase) return "/";
  if (lower.startsWith(`${lowerBase}/`)) return pathname.slice(BASE_PATH.length);
  return pathname;
}
