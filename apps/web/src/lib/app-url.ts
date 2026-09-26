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

/**
 * serverUrl() applied to every string in a parsed API response, at any depth.
 * Run it where a tool response is parsed, so result fields the caller has not
 * named yet (maskUrl, zipUrl, per-page URLs) resolve too.
 */
export function resolveServerUrls<T>(value: T): T {
  if (!BASE_PATH) return value;
  if (typeof value === "string") return serverUrl(value) as T;
  if (Array.isArray(value)) return value.map(resolveServerUrls) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveServerUrls(entry)]),
    ) as T;
  }
  return value;
}
