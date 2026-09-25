/** Strip only a complete path prefix, before routing and security hooks run.
 * Unprefixed requests remain available for health checks and stripping proxies.
 */
export function stripBasePath(url: string, basePath: string): string {
  if (!basePath) return url;
  if (url === basePath || url.startsWith(`${basePath}?`)) return `/${url.slice(basePath.length)}`;
  return url.startsWith(`${basePath}/`) ? url.slice(basePath.length) : url;
}
