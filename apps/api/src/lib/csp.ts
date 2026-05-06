const POSTHOG_ORIGINS = ["https://us.i.posthog.com", "https://us-assets.i.posthog.com"];
const SENTRY_ORIGINS = ["https://*.ingest.us.sentry.io"];
const SCALAR_FONT_ORIGIN = "https://fonts.scalar.com";

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
