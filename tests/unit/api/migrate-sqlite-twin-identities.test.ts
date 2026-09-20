import { describe, expect, it } from "vitest";
import { detachTwinIdentities, identityKey } from "../../../apps/api/src/db/migrate-from-sqlite.js";

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
      { id: "b", username: "sso-2", authProvider: "oidc", externalId: "x" },
    ]);
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
