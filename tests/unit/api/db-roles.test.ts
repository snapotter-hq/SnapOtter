import { describe, expect, it } from "vitest";
import { resolveRoleSplit } from "../../../apps/api/src/db/roles.js";

const RUNTIME = "postgres://snapotter_app:apppw@db:5432/snapotter";
const MIGRATION = "postgres://snapotter:ownerpw@db:5432/snapotter";

describe("resolveRoleSplit", () => {
  it("is inactive when no migration url is set", () => {
    const split = resolveRoleSplit(RUNTIME, "");
    expect(split.active).toBe(false);
    expect(split).toMatchObject({ reason: "not-configured", migrationUrl: RUNTIME });
  });

  it("is inactive when the migration url is only whitespace", () => {
    const split = resolveRoleSplit(RUNTIME, "   ");
    expect(split.active).toBe(false);
    expect(split).toMatchObject({ reason: "not-configured", migrationUrl: RUNTIME });
  });

  // Single-role mode is the fallback for managed Postgres, so it must not learn
  // to throw on strings node-postgres itself accepts. This one is valid for pg
  // (user "user", password "pw") but WHATWG URL rejects it outright.
  it("does not parse the runtime url when no migration url is set", () => {
    const socketStyle = "postgres://user:pw@/var/run/postgresql:5432/snapotter";
    const split = resolveRoleSplit(socketStyle, "");
    expect(split.active).toBe(false);
    expect(split).toMatchObject({ reason: "not-configured", migrationUrl: socketStyle });
  });

  it("is active when a distinct migration role is set", () => {
    const split = resolveRoleSplit(RUNTIME, MIGRATION);
    expect(split.active).toBe(true);
    expect(split).toMatchObject({
      runtimeRole: "snapotter_app",
      runtimePassword: "apppw",
      migrationUrl: MIGRATION,
    });
  });

  it("is inactive when both urls name the same role", () => {
    const split = resolveRoleSplit(RUNTIME, RUNTIME);
    expect(split.active).toBe(false);
    expect(split).toMatchObject({ reason: "same-role" });
  });

  // The migration role arrives percent-encoded too, so the same-role comparison
  // has to decode both sides or it reads "snap%20otter" as a different role.
  it("decodes the migration role before comparing it to the runtime role", () => {
    const encodedRuntime = "postgres://snap%20otter:pw@db:5432/snapotter";
    const encodedMigration = "postgres://snap%20otter:otherpw@db:5432/snapotter";
    const split = resolveRoleSplit(encodedRuntime, encodedMigration);
    expect(split.active).toBe(false);
    expect(split).toMatchObject({ reason: "same-role" });
  });

  it("rejects urls pointing at different databases", () => {
    const other = "postgres://snapotter:ownerpw@db:5432/other";
    expect(() => resolveRoleSplit(RUNTIME, other)).toThrow(/same database/i);
  });

  it("rejects urls pointing at different hosts", () => {
    const other = "postgres://snapotter:ownerpw@elsewhere:5432/snapotter";
    expect(() => resolveRoleSplit(RUNTIME, other)).toThrow(/same database/i);
  });

  // Both name port 5432, one explicitly. A literal port comparison would reject
  // this pair as "different database" and block boot over a cosmetic difference.
  it("treats an omitted port as the postgres default", () => {
    const implicitPort = "postgres://snapotter_app:apppw@db/snapotter";
    const split = resolveRoleSplit(implicitPort, MIGRATION);
    expect(split.active).toBe(true);
    expect(split).toMatchObject({ runtimeRole: "snapotter_app" });
  });

  it("still rejects a genuinely different explicit port", () => {
    const otherPort = "postgres://snapotter:ownerpw@db:6543/snapotter";
    expect(() => resolveRoleSplit(RUNTIME, otherPort)).toThrow(/same database/i);
  });

  // postgres: is a non-special scheme, so WHATWG URL preserves host case rather
  // than lowercasing it the way it would for http:.
  it("compares hostnames case-insensitively", () => {
    const upperHost = "postgres://snapotter_app:apppw@DB:5432/snapotter";
    const split = resolveRoleSplit(upperHost, MIGRATION);
    expect(split.active).toBe(true);
  });

  // node-postgres takes ?host= and ?port= over the URL authority, so two socket
  // URLs with the same placeholder host can still reach different clusters.
  it("rejects socket urls whose ?host= names different socket directories", () => {
    const runtime = "postgres://app:p@localhost/snapotter?host=/run/pg-a";
    const migration = "postgres://owner:q@localhost/snapotter?host=/run/pg-b";
    expect(() => resolveRoleSplit(runtime, migration)).toThrow(/same database/i);
  });

  it("rejects urls whose ?port= differs", () => {
    const runtime = "postgres://app:p@localhost/snapotter?host=/run/pg&port=5432";
    const migration = "postgres://owner:q@localhost/snapotter?host=/run/pg&port=5433";
    expect(() => resolveRoleSplit(runtime, migration)).toThrow(/same database/i);
  });

  it("rejects a ?host= override that moves one url to another server", () => {
    const migration = "postgres://snapotter:ownerpw@db:5432/snapotter?host=elsewhere";
    expect(() => resolveRoleSplit(RUNTIME, migration)).toThrow(/same database/i);
  });

  it("compares the last ?host= when one is repeated, as node-postgres does", () => {
    const runtime = "postgres://app:p@localhost/snapotter?host=/run/pg-a&host=/run/pg-b";
    const migration = "postgres://owner:q@localhost/snapotter?host=/run/pg-a";
    expect(() => resolveRoleSplit(runtime, migration)).toThrow(/same database/i);
  });

  it("accepts the same socket directory written as ?host= and as an encoded host", () => {
    const runtime = "postgres://app:p@localhost/snapotter?host=/run/postgresql";
    const migration = "postgres://owner:q@%2Frun%2Fpostgresql/snapotter";
    const split = resolveRoleSplit(runtime, migration);
    expect(split).toMatchObject({ active: true, runtimeRole: "app" });
  });

  it("ignores a trailing slash on a socket directory", () => {
    const runtime = "postgres://app:p@localhost/snapotter?host=/run/postgresql/";
    const migration = "postgres://owner:q@localhost/snapotter?host=/run/postgresql";
    expect(resolveRoleSplit(runtime, migration).active).toBe(true);
  });

  it("treats an omitted ?port= on a socket url as the postgres default", () => {
    const runtime = "postgres://app:p@localhost/snapotter?host=/run/pg&port=5432";
    const migration = "postgres://owner:q@localhost/snapotter?host=/run/pg";
    expect(resolveRoleSplit(runtime, migration).active).toBe(true);
  });

  // Socket paths live on a case-sensitive filesystem, unlike DNS names.
  it("compares socket directories case-sensitively", () => {
    const runtime = "postgres://app:p@localhost/snapotter?host=/run/PG";
    const migration = "postgres://owner:q@localhost/snapotter?host=/run/pg";
    expect(() => resolveRoleSplit(runtime, migration)).toThrow(/same database/i);
  });

  it("decodes percent-encoded passwords", () => {
    const encoded = "postgres://snapotter_app:p%40ss%3Aword@db:5432/snapotter";
    const split = resolveRoleSplit(encoded, MIGRATION);
    expect(split).toMatchObject({ runtimePassword: "p@ss:word" });
  });

  it("rejects a runtime role that is not a safe identifier", () => {
    const bad = 'postgres://"ev il":pw@db:5432/snapotter';
    expect(() => resolveRoleSplit(bad, MIGRATION)).toThrow(/role name/i);
  });

  // Postgres truncates identifiers past 63 characters, so a longer role would
  // be provisioned under a name the runtime connection never uses.
  it("rejects a runtime role longer than the postgres identifier limit", () => {
    const tooLong = `postgres://${"r".repeat(64)}:pw@db:5432/snapotter`;
    expect(() => resolveRoleSplit(tooLong, MIGRATION)).toThrow(/role name/i);
  });

  it("accepts a runtime role exactly at the identifier limit", () => {
    const atLimit = "r".repeat(63);
    const split = resolveRoleSplit(`postgres://${atLimit}:pw@db:5432/snapotter`, MIGRATION);
    expect(split).toMatchObject({ runtimeRole: atLimit });
  });

  it("rejects a runtime url with no password, which could not be provisioned", () => {
    const noPw = "postgres://snapotter_app@db:5432/snapotter";
    expect(() => resolveRoleSplit(noPw, MIGRATION)).toThrow(/password/i);
  });
});
