/**
 * Strip credentials so a connection string is safe to log.
 *
 * Parses rather than pattern-matches because the userinfo delimiter is the LAST
 * "@" in the authority, not the first: "postgres://user:p@ss@db/x" is a valid
 * string whose password is "p@ss", and a first-"@" regex would echo back "ss".
 *
 * Does not yet cover libpq keyword/value strings ("host=db password=secret"),
 * which carry no "://" at all and so pass through untouched.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Either half alone is worth redacting: a password-only URL is legal.
    if (!parsed.username && !parsed.password) return url;
    parsed.username = "***";
    parsed.password = "";
    return parsed.toString();
  } catch {
    // Unparseable by WHATWG URL but possibly still valid for node-postgres.
    // Bound the match to the authority so an "@" in the path cannot extend it.
    return url.replace(/:\/\/[^/?#]*@/, "://***@");
  }
}
