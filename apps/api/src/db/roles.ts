import { SafeError } from "@snapotter/shared";

/** Narrowing on `active` is what grants access to the runtime credentials. */
export type RoleSplit =
  | { active: true; runtimeRole: string; runtimePassword: string; migrationUrl: string }
  | { active: false; reason: "not-configured" | "same-role"; migrationUrl: string };

// Bootstrap SQL MUST quote this role with format('%I'); the check here is
// defense in depth, not the only guard.
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_IDENTIFIER_LENGTH = 63;

function assertSafeRole(role: string): void {
  if (!SAFE_IDENTIFIER.test(role) || role.length > MAX_IDENTIFIER_LENGTH) {
    throw new SafeError(
      "DATABASE_URL role name must be a plain Postgres identifier (letters, digits, underscore) of at most 63 characters.",
      { kind: "operational", statusCode: 500 },
    );
  }
}

// postgres: is a non-special scheme, so WHATWG URL neither fills in a default
// port nor lowercases the host. Comparing either literally would reject URLs
// that name the same server over pure cosmetics.
const DEFAULT_PG_PORT = "5432";

// node-postgres copies query params in order, so a repeated one's last value wins.
function lastParam(u: URL, name: string): string | undefined {
  return u.searchParams.getAll(name).at(-1);
}

// node-postgres takes ?host= and ?port= over the URL authority and decodes a
// percent-encoded socket directory in the host, so compare the server it would
// actually reach. docker/wait-for-postgres.mjs resolves the socket the same way.
// Socket paths are case-sensitive; only DNS names get lowercased.
function effectiveTarget(u: URL): string {
  const host = lastParam(u, "host") || decodeURIComponent(u.hostname);
  const port = lastParam(u, "port") || u.port || DEFAULT_PG_PORT;
  const normalizedHost = host.startsWith("/") ? host.replace(/\/+$/, "") : host.toLowerCase();
  return JSON.stringify([normalizedHost, port, u.pathname]);
}

function sameTarget(a: URL, b: URL): boolean {
  return effectiveTarget(a) === effectiveTarget(b);
}

// node-postgres (pg-connection-string's parse) re-encodes the whole string
// before handing it to WHATWG URL when it holds a space or a % that isn't a
// valid escape. Parse the same way, or a password like "p%zzw" or "p%2aw x"
// gets provisioned differently from what the pool later logs in with.
function parseAsNodePostgres(url: string): URL {
  const normalized = / |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(url)
    ? encodeURI(url).replace(/%25(\d\d)/g, "%$1")
    : url;
  return new URL(normalized);
}

// WHATWG URL keeps userinfo percent-encoded, so a password like "p@ss" arrives
// as "p%40ss" and has to be decoded before it can be used to log in. An escape
// that isn't valid UTF-8 (say "%ff") would otherwise surface as a bare URIError.
function decodeUserinfo(value: string, envVar: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new SafeError(
      `${envVar} has a percent-encoded username or password that is not valid UTF-8.`,
      { kind: "operational", statusCode: 500 },
    );
  }
}

// node-postgres takes ?user= and ?password= over the userinfo. searchParams are
// already decoded, so only the userinfo needs decodeUserinfo.
function effectiveUser(u: URL, envVar: string): string {
  return lastParam(u, "user") || decodeUserinfo(u.username, envVar);
}

function effectivePassword(u: URL, envVar: string): string {
  return lastParam(u, "password") || decodeUserinfo(u.password, envVar);
}

export function resolveRoleSplit(runtimeUrl: string, migrationUrl: string): RoleSplit {
  // Return before parsing anything. node-postgres accepts connection strings
  // that WHATWG URL rejects outright (socket-path forms like
  // "postgres://user:pw@/var/run/postgresql:5432/db"), and single-role mode
  // never needs the parsed pieces, so it must not gain a new way to fail here.
  if (!migrationUrl.trim()) {
    return { active: false, reason: "not-configured", migrationUrl: runtimeUrl };
  }

  const runtime = parseAsNodePostgres(runtimeUrl);
  const runtimeRole = effectiveUser(runtime, "DATABASE_URL");
  const runtimePassword = effectivePassword(runtime, "DATABASE_URL");

  const migration = parseAsNodePostgres(migrationUrl);
  if (!sameTarget(runtime, migration)) {
    throw new SafeError(
      "DATABASE_URL and DATABASE_MIGRATION_URL must point at the same database (host, port, and database name). Migrating one database while serving another would silently diverge.",
      { kind: "operational", statusCode: 500 },
    );
  }

  if (effectiveUser(migration, "DATABASE_MIGRATION_URL") === runtimeRole) {
    return { active: false, reason: "same-role", migrationUrl };
  }

  assertSafeRole(runtimeRole);
  if (!runtimePassword) {
    throw new SafeError(
      "DATABASE_URL must include a password when DATABASE_MIGRATION_URL is set, since the runtime role is provisioned with it at boot.",
      { kind: "operational", statusCode: 500 },
    );
  }

  return { active: true, runtimeRole, runtimePassword, migrationUrl };
}
