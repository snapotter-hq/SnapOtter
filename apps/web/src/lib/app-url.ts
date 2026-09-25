// The server injects the deployment path into index.html at runtime.
// Vite dev/preview and root deployments use the default <base href="/">.
export const BASE_PATH =
  typeof document === "undefined"
    ? ""
    : (document.querySelector("base")?.getAttribute("href") ?? "/").replace(/\/$/, "");

export function appUrl(path: string): string {
  return `${BASE_PATH}${path}`;
}
