import { describe, expect, it } from "vitest";
import {
  detachedIdentityWarning,
  detachTwinIdentities,
  identityKey,
} from "../../../apps/api/src/db/migrate-from-sqlite.js";

/**
 * 1.x carried the same auto-create race migration 0008 cleans up (issue #969),
 * so a source database can hold two users rows for one external identity. The
 * partial unique index exists before the copy starts, so the importer settles
 * the twins itself rather than let the second INSERT roll the import back
 * (issue #1005).
 */
describe("detachTwinIdentities", () => {
  const at = (seconds: number) => new Date(seconds * 1000);
  const key = (provider: string, external: string) =>
    identityKey({ auth_provider: provider, external_id: external }) as string;

  it("keeps the oldest row of a group linked and detaches the rest", () => {
    const rows = [
      { id: "b", username: "sso-2", auth_provider: "oidc", external_id: "x", created_at: at(200) },
      { id: "a", username: "sso-1", auth_provider: "oidc", external_id: "x", created_at: at(100) },
    ];
    const detached = detachTwinIdentities(rows, new Set());
    expect(rows[1].external_id).toBe("x");
    expect(rows[0].external_id).toBeNull();
    expect(detached).toEqual([
      {
        id: "b",
        username: "sso-2",
        authProvider: "oidc",
        externalId: "x",
        keptBy: { id: "a", username: "sso-1" },
      },
    ]);
  });

  it("detaches every row but the first of a group larger than two", () => {
    // The 1.x race is not limited to two tabs.
    const rows = [
      { id: "a", username: "a", auth_provider: "oidc", external_id: "x", created_at: at(100) },
      { id: "b", username: "b", auth_provider: "oidc", external_id: "x", created_at: at(200) },
      { id: "c", username: "c", auth_provider: "oidc", external_id: "x", created_at: at(300) },
    ];
    expect(detachTwinIdentities(rows, new Set()).map((d) => d.id)).toEqual(["b", "c"]);
    expect(rows.map((r) => r.external_id)).toEqual(["x", null, null]);
  });

  it("breaks a created_at tie on the smallest id, as migration 0008 does", () => {
    const rows = [
      { id: "z", username: "sso-z", auth_provider: "oidc", external_id: "x", created_at: at(100) },
      { id: "a", username: "sso-a", auth_provider: "oidc", external_id: "x", created_at: at(100) },
    ];
    detachTwinIdentities(rows, new Set());
    expect(rows[1].external_id).toBe("x");
    expect(rows[0].external_id).toBeNull();
  });

  it("detaches every row of a group the target already answers for", () => {
    const rows = [
      { id: "a", username: "sso-a", auth_provider: "oidc", external_id: "x", created_at: at(100) },
      { id: "b", username: "sso-b", auth_provider: "oidc", external_id: "x", created_at: at(200) },
    ];
    const detached = detachTwinIdentities(rows, new Set([key("oidc", "x")]));
    expect(rows.map((r) => r.external_id)).toEqual([null, null]);
    expect(detached.map((d) => d.id)).toEqual(["a", "b"]);
    // No imported row won it, so there is no winner to name.
    expect(detached.map((d) => d.keptBy)).toEqual([null, null]);
  });

  it("matches a held identity on the provider too, not the external id alone", () => {
    const rows = [
      { id: "a", username: "a", auth_provider: "saml", external_id: "x", created_at: at(100) },
    ];
    expect(detachTwinIdentities(rows, new Set([key("oidc", "x")]))).toEqual([]);
    expect(rows[0].external_id).toBe("x");
  });

  it("keys a source that predates auth_provider the way Postgres will store it", () => {
    // The column is absent, so the target's 'local' default decides the row's
    // identity. Keying it as "" would miss the collision the INSERT then hits.
    const rows = [{ id: "a", username: "a", external_id: "x", created_at: at(100) }];
    expect(detachTwinIdentities(rows, new Set([key("local", "x")])).map((d) => d.id)).toEqual([
      "a",
    ]);
    expect(rows[0].external_id).toBeNull();
  });

  it("separates identities that differ only by provider", () => {
    const rows = [
      { id: "a", username: "a", auth_provider: "oidc", external_id: "x", created_at: at(100) },
      { id: "b", username: "b", auth_provider: "saml", external_id: "x", created_at: at(200) },
    ];
    expect(detachTwinIdentities(rows, new Set())).toEqual([]);
    expect(rows.map((r) => r.external_id)).toEqual(["x", "x"]);
  });

  it("leaves local accounts, which carry no external id, outside every group", () => {
    const rows = [
      { id: "a", username: "a", auth_provider: "local", external_id: null, created_at: at(100) },
      { id: "b", username: "b", auth_provider: "local", external_id: null, created_at: at(200) },
    ];
    expect(detachTwinIdentities(rows, new Set())).toEqual([]);
    expect(rows.map((r) => r.external_id)).toEqual([null, null]);
  });

  it("groups an empty-string external id, which the index still indexes", () => {
    const rows = [
      { id: "a", username: "a", auth_provider: "oidc", external_id: "", created_at: at(100) },
      { id: "b", username: "b", auth_provider: "oidc", external_id: "", created_at: at(200) },
    ];
    expect(detachTwinIdentities(rows, new Set()).map((d) => d.id)).toEqual(["b"]);
    expect(rows.map((r) => r.external_id)).toEqual(["", null]);
  });

  it("reports detached rows in source order, not group order", () => {
    const rows = [
      { id: "a1", username: "a1", auth_provider: "oidc", external_id: "a", created_at: at(100) },
      { id: "b1", username: "b1", auth_provider: "oidc", external_id: "b", created_at: at(100) },
      { id: "b2", username: "b2", auth_provider: "oidc", external_id: "b", created_at: at(200) },
      { id: "a2", username: "a2", auth_provider: "oidc", external_id: "a", created_at: at(300) },
    ];
    expect(detachTwinIdentities(rows, new Set()).map((d) => d.id)).toEqual(["b2", "a2"]);
  });

  it("does not confuse a separator-shaped external id with a different identity", () => {
    // A provider/external-id pair must not be able to forge another pair's key.
    expect(key("oidc", "a:b")).not.toBe(key("oidc:a", "b"));
  });
});

describe("detachedIdentityWarning", () => {
  it("names the winning row when both twins came from this import", () => {
    const line = detachedIdentityWarning({
      id: "u-b",
      username: "sso-2",
      authProvider: "oidc",
      externalId: "ext-1",
      keptBy: { id: "u-a", username: "sso-1" },
    });
    expect(line).toContain('user "sso-2" (id u-b)');
    expect(line).toContain('user "sso-1" (id u-a)');
    expect(line).toContain('oidc identity "ext-1"');
    // Both rows landed in this import, so nothing "already" answered to it.
    expect(line).not.toMatch(/already/i);
  });

  it("points at the existing account when the target already held the identity", () => {
    const line = detachedIdentityWarning({
      id: "u-b",
      username: "sso-2",
      authProvider: "oidc",
      externalId: "ext-1",
      keptBy: null,
    });
    expect(line).toContain("already in this database");
    expect(line).toContain('oidc identity "ext-1"');
  });
});
