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
 * Resolve a URL the API returned (downloadUrl, previewUrl, ...) for use in the
 * browser. The API sends root-relative "/api/..." paths whatever the
 * deployment path is, so they stay valid when it changes; only those get the
 * prefix. blob:, data:, absolute, and already-prefixed URLs pass through, so
 * applying it twice is harmless.
 */
export function serverUrl<T extends string | null | undefined>(url: T): T {
  if (typeof url === "string" && url.startsWith("/api/")) return appUrl(url) as T;
  return url;
}

// The API names every result link *Url (downloadUrl, previewUrl, maskUrl,
// zipUrl, printDownloadUrl, pages[].downloadUrl). Other strings are user
// content, such as decoded barcode or OCR text, and must not be rewritten.
const URL_KEY = /url$/i;

/**
 * serverUrl() applied to every *Url field in a parsed API response, at any
 * depth. Run it where a tool response is parsed, so result fields the caller
 * has not named yet (maskUrl, zipUrl, per-page URLs) resolve too.
 */
export function resolveServerUrls<T>(value: T): T {
  if (!BASE_PATH) return value;
  return resolveFields(value) as T;
}

function resolveFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(resolveFields);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        typeof entry === "string" && URL_KEY.test(key) ? serverUrl(entry) : resolveFields(entry),
      ]),
    );
  }
  return value;
}

/**
 * The path to move under the prefix when the browser URL lacks it (#1275), or
 * null when no redirect is needed. The server keeps unprefixed requests
 * routable (see stripBasePath), so opening the app without the prefix still
 * returns the shell with working assets, but the router basename doesn't
 * match and the page is a silent 404 or blank. Only the browser can fix this:
 * a server redirect could loop behind proxies that strip the prefix.
 *
 * The prefix match is case-insensitive because stripBasePath is
 * case-sensitive: /SnapOtter with BASE_PATH=/snapotter arrives here too, and
 * redirecting it verbatim would nest it under the real prefix. The remainder
 * keeps the user's casing; only the prefix is normalized.
 */
export function unprefixPathname(pathname: string): string | null {
  // Only a root-relative <base> (the server always writes one) can be compared
  // with a pathname; anything else would redirect forever.
  if (!BASE_PATH.startsWith("/")) return null;
  if (pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`)) return null;
  const lowerBase = BASE_PATH.toLowerCase();
  const lower = pathname.toLowerCase();
  if (lower === lowerBase) return "/";
  if (lower.startsWith(`${lowerBase}/`)) return pathname.slice(BASE_PATH.length);
  return pathname;
}

const REDIRECT_STAMP_KEY = "snapotter-prefix-redirect";
const REDIRECT_LOOP_WINDOW_MS = 10_000;

/**
 * Send a browser that opened the app without its prefix to the prefixed URL,
 * keeping the query and hash. Returns true when it navigated away, so the
 * caller must not mount the app. A proxy that redirects the prefix back off
 * would bounce the page forever, so a second attempt within a few seconds is
 * refused and logged instead (same guard shape as chunk-reload.ts). Landing on
 * a prefixed URL clears the guard: a real loop never gets there, and a user
 * opening another unprefixed link right after a good redirect still gets one.
 */
export function redirectIfUnprefixed(
  location: Pick<Location, "pathname" | "search" | "hash" | "replace">,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = safeSessionStorage(),
  now = Date.now(),
): boolean {
  const unprefixed = unprefixPathname(location.pathname);
  if (unprefixed === null) {
    storage?.removeItem(REDIRECT_STAMP_KEY);
    return false;
  }
  const last = Number(storage?.getItem(REDIRECT_STAMP_KEY) ?? 0);
  if (now - last < REDIRECT_LOOP_WINDOW_MS) {
    console.error(
      `Not redirecting ${location.pathname} to ${BASE_PATH} again: the last redirect came straight back. Check that the proxy forwards ${BASE_PATH}/ unchanged.`,
    );
    return false;
  }
  storage?.setItem(REDIRECT_STAMP_KEY, String(now));
  location.replace(appUrl(`${unprefixed}${location.search}${location.hash}`));
  return true;
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}
