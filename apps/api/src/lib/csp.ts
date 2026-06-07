const POSTHOG_ORIGINS = ["https://us.i.posthog.com", "https://us-assets.i.posthog.com"];
const SENTRY_ORIGINS = ["https://*.ingest.us.sentry.io"];
const SCALAR_FONT_ORIGIN = "https://fonts.scalar.com";

/**
 * Build a Content-Security-Policy header value.
 *
 * Notes on 'unsafe-inline':
 * - style-src: Required because the React SPA uses inline styles extensively
 *   (100+ occurrences across 45+ components). Removing it would break the UI.
 * - script-src (docs only): The @scalar/fastify-api-reference plugin injects
 *   inline scripts for its interactive API reference UI. A nonce-based approach
 *   would require forking the Scalar plugin, which is not practical.
 */
export function buildCsp(isDocs: boolean): string {
  const connectSrc = ["'self'", "data:", ...POSTHOG_ORIGINS, ...SENTRY_ORIGINS].join(" ");
  const fontSrc = isDocs ? `'self' data: ${SCALAR_FONT_ORIGIN}` : "'self' data:";
  const scriptSrc = isDocs
    ? "'self' 'unsafe-inline' https://us-assets.i.posthog.com"
    : "'self' https://us-assets.i.posthog.com";

  if (isDocs) {
    return `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src ${connectSrc}; font-src ${fontSrc}; object-src 'none'; base-uri 'self'; form-action 'self'`;
  }

  return `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://tile.openstreetmap.org; connect-src ${connectSrc}; font-src ${fontSrc}; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;
}

export function getSecurityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "0",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": buildCsp(false),
  };
}
