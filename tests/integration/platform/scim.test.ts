import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { hashPassword } from "../../../apps/api/src/plugins/auth.js";
import { buildTestApp, type TestApp } from "../test-server.js";

let testApp: TestApp;
const SCIM_TOKEN = "test-scim-token-abc123";

beforeAll(async () => {
  testApp = await buildTestApp();

  // Set up a SCIM token hash in the settings table
  const tokenHash = await hashPassword(SCIM_TOKEN);
  await db
    .insert(schema.settings)
    .values({ key: "scim_token_hash", value: tokenHash })
    .onConflictDoNothing();
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("SCIM 2.0 provisioning", () => {
  // ── Discovery (no auth required) ───────────────────────────────

  describe("discovery endpoints", () => {
    it("returns ServiceProviderConfig", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/ServiceProviderConfig",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.schemas).toContain("urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig");
      expect(body.patch.supported).toBe(true);
      expect(body.filter.supported).toBe(true);
    });

    it("returns Schemas", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Schemas",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.totalResults).toBe(2);
      expect(body.Resources).toHaveLength(2);
      const schemaIds = body.Resources.map((r: { id: string }) => r.id);
      expect(schemaIds).toContain("urn:ietf:params:scim:schemas:core:2.0:User");
      expect(schemaIds).toContain("urn:ietf:params:scim:schemas:core:2.0:Group");
    });

    it("returns ResourceTypes", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/ResourceTypes",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.totalResults).toBe(2);
      const names = body.Resources.map((r: { name: string }) => r.name);
      expect(names).toContain("User");
      expect(names).toContain("Group");
    });

    it("ServiceProviderConfig includes correct maxResults", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/ServiceProviderConfig",
      });
      const body = JSON.parse(res.body);
      expect(body.filter.maxResults).toBe(200);
    });

    it("Schemas response has correct User schema attributes", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Schemas",
      });
      const body = JSON.parse(res.body);
      const userSchema = body.Resources.find(
        (r: { id: string }) => r.id === "urn:ietf:params:scim:schemas:core:2.0:User",
      );
      expect(userSchema).toBeDefined();
      const attrNames = userSchema.attributes.map((a: { name: string }) => a.name);
      expect(attrNames).toContain("userName");
      expect(attrNames).toContain("name");
      expect(attrNames).toContain("emails");
      expect(attrNames).toContain("active");
      expect(attrNames).toContain("externalId");
    });

    it("Schemas response has correct Group schema attributes", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Schemas",
      });
      const body = JSON.parse(res.body);
      const groupSchema = body.Resources.find(
        (r: { id: string }) => r.id === "urn:ietf:params:scim:schemas:core:2.0:Group",
      );
      expect(groupSchema).toBeDefined();
      const attrNames = groupSchema.attributes.map((a: { name: string }) => a.name);
      expect(attrNames).toContain("displayName");
      expect(attrNames).toContain("members");
    });

    it("ResourceTypes have correct endpoints", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/ResourceTypes",
      });
      const body = JSON.parse(res.body);
      const userType = body.Resources.find((r: { name: string }) => r.name === "User");
      const groupType = body.Resources.find((r: { name: string }) => r.name === "Group");
      expect(userType.endpoint).toBe("/api/v1/scim/v2/Users");
      expect(groupType.endpoint).toBe("/api/v1/scim/v2/Groups");
    });
  });

  // ── Auth ───────────────────────────────────────────────────────

  describe("SCIM auth", () => {
    it("returns 401 for user operations without token", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
      });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.schemas).toContain("urn:ietf:params:scim:api:messages:2.0:Error");
    });

    it("returns 401 with invalid token", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: "Bearer wrong-token" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 for group operations without token", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Groups",
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects Bearer token with extra whitespace", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `Bearer  ${SCIM_TOKEN}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects lowercase bearer prefix", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `bearer ${SCIM_TOKEN}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects empty Bearer token value", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: "Bearer " },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── Enterprise gate ────────────────────────────────────────────
  // Without a valid enterprise license, SCIM operations return 403.

  describe("enterprise feature gate", () => {
    it("returns 403 for Users list without enterprise license", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.detail).toContain("enterprise");
    });

    it("returns 403 for Groups list without enterprise license", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Groups",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 403 for POST Users without enterprise license", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
        payload: { userName: "scim-test-user", active: true },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 403 for POST Groups without enterprise license", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Groups",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
        payload: { displayName: "scim-test-group" },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── SCIM error format ──────────────────────────────────────────

  describe("SCIM error format", () => {
    it("returns proper SCIM error schema on 401", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: "Bearer bad" },
      });
      const body = JSON.parse(res.body);
      expect(body.schemas).toEqual(["urn:ietf:params:scim:api:messages:2.0:Error"]);
      expect(body.status).toBe(401);
      expect(typeof body.detail).toBe("string");
    });

    it("403 enterprise error includes SCIM error schema", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.schemas).toEqual(["urn:ietf:params:scim:api:messages:2.0:Error"]);
      expect(body.status).toBe(403);
      expect(typeof body.detail).toBe("string");
    });

    it("SCIM error responses include schemas, status, and detail fields", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
      });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("schemas");
      expect(body).toHaveProperty("status");
      expect(body).toHaveProperty("detail");
      expect(Array.isArray(body.schemas)).toBe(true);
      expect(typeof body.status).toBe("number");
      expect(typeof body.detail).toBe("string");
    });

    it("POST Users with missing userName returns 403 from enterprise gate", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
        payload: { active: true },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.schemas).toContain("urn:ietf:params:scim:api:messages:2.0:Error");
    });
  });

  describe("POST Users validation (enterprise gate)", () => {
    it("POST with empty body returns 403", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
    });

    it("POST with numeric userName returns 403", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
        payload: { userName: 12345 },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("POST Groups validation (enterprise gate)", () => {
    it("POST with empty displayName returns 403", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Groups",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
        payload: { displayName: "" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("POST with very long displayName returns 403", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Groups",
        headers: { authorization: `Bearer ${SCIM_TOKEN}` },
        payload: { displayName: "x".repeat(10000) },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
