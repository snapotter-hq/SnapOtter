import { describe, expect, it } from "vitest";
import {
  normalizeGroupOps,
  normalizeUserOps,
  parseScimBody,
  scimGroupBody,
  scimPatchBody,
  scimUserBody,
} from "../../../apps/api/src/routes/enterprise/scim-bodies.js";

// #1511: SCIM bodies had no schema, so a wrong-typed field reached Postgres
// as JSON text or an array literal, or threw a 500 partway through.

describe("scimUserBody", () => {
  it("coerces a number or boolean in a string attribute, as Postgres used to", () => {
    expect(parseScimBody(scimUserBody, { userName: 42, externalId: 123 })).toEqual({
      ok: true,
      data: { userName: "42", externalId: "123" },
    });
  });

  it("refuses an object or array where a string belongs, naming the field", () => {
    expect(parseScimBody(scimUserBody, { userName: "u", externalId: { id: 1 } })).toEqual({
      ok: false,
      detail: "externalId must be a string",
    });
    expect(parseScimBody(scimUserBody, { userName: ["u"] })).toEqual({
      ok: false,
      detail: "userName must be a string",
    });
  });

  it("reads Entra's string booleans, in any case, and refuses other strings", () => {
    for (const [sent, read] of [
      ["False", false],
      ["false", false],
      ["TRUE", true],
      [true, true],
    ] as const) {
      expect(parseScimBody(scimUserBody, { active: sent })).toEqual({
        ok: true,
        data: { active: read },
      });
    }
    expect(parseScimBody(scimUserBody, { active: "yes" })).toEqual({
      ok: false,
      detail: "active must be a boolean",
    });
  });

  it("refuses emails that aren't a list, and an entry without a value", () => {
    expect(parseScimBody(scimUserBody, { emails: { value: "a@b.c" } })).toEqual({
      ok: false,
      detail: "emails must be an array",
    });
    expect(parseScimBody(scimUserBody, { emails: [{ primary: true }] })).toEqual({
      ok: false,
      detail: "emails.0.value is required",
    });
  });

  it("keeps attributes it doesn't know, as IdPs send extension schemas", () => {
    const body = {
      userName: "u",
      "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": { department: "x" },
    };
    expect(parseScimBody(scimUserBody, body)).toEqual({ ok: true, data: body });
  });

  it("reads a missing body as empty, so the route's own required-field check answers", () => {
    expect(parseScimBody(scimUserBody, undefined)).toEqual({ ok: true, data: {} });
  });
});

describe("scimGroupBody", () => {
  it("accepts null members, which RFC 7643 treats as an empty list", () => {
    expect(parseScimBody(scimGroupBody, { displayName: "g", members: null })).toEqual({
      ok: true,
      data: { displayName: "g", members: null },
    });
  });

  it("refuses members that aren't a list, and a member without a value", () => {
    expect(parseScimBody(scimGroupBody, { members: { value: "u1" } })).toEqual({
      ok: false,
      detail: "members must be an array",
    });
    expect(parseScimBody(scimGroupBody, { members: [{}] })).toEqual({
      ok: false,
      detail: "members.0.value is required",
    });
  });
});

describe("scimPatchBody", () => {
  it("refuses an operation without an op", () => {
    expect(parseScimBody(scimPatchBody, { Operations: [{ path: "userName" }] })).toEqual({
      ok: false,
      detail: "Operations.0.op is required",
    });
  });

  it("refuses Operations that aren't a list", () => {
    expect(parseScimBody(scimPatchBody, { Operations: { op: "add" } })).toEqual({
      ok: false,
      detail: "Operations must be an array",
    });
  });
});

describe("normalizeUserOps", () => {
  it("coerces values and turns every emails shape into a list", () => {
    const result = normalizeUserOps([
      { op: "replace", path: "userName", value: 7 },
      { op: "replace", path: "externalId", value: null },
      { op: "replace", path: "active", value: "False" },
      { op: "add", path: "emails", value: "a@b.c" },
      { op: "add", path: "emails", value: { value: "d@e.f", primary: "true" } },
    ]);
    expect(result).toEqual({
      ok: true,
      data: [
        { op: "replace", path: "userName", value: "7" },
        { op: "replace", path: "externalId", value: null },
        { op: "replace", path: "active", value: false },
        { op: "add", path: "emails", value: [{ value: "a@b.c", primary: true }] },
        { op: "add", path: "emails", value: [{ value: "d@e.f", primary: true }] },
      ],
    });
  });

  it("checks a path-less value object and names the failing field", () => {
    expect(
      normalizeUserOps([{ op: "replace", value: { userName: "u", externalId: ["x"] } }]),
    ).toEqual({ ok: false, detail: "Operations.0.value.externalId must be a string" });
  });

  it("names the operation when a path's value has the wrong type", () => {
    expect(
      normalizeUserOps([
        { op: "add", path: "emails", value: "a@b.c" },
        { op: "replace", path: "userName", value: { first: "u" } },
      ]),
    ).toEqual({ ok: false, detail: "Operations.1.value must be a string" });
  });

  it("leaves operations on paths the route ignores alone", () => {
    const ops = [{ op: "replace", path: "name.formatted", value: { any: "thing" } }];
    expect(normalizeUserOps(ops)).toEqual({ ok: true, data: ops });
  });
});

describe("normalizeGroupOps", () => {
  it("turns a single member into a list and a null replace into none", () => {
    expect(
      normalizeGroupOps([
        { op: "add", path: "members", value: { value: "u1" } },
        { op: "replace", path: "members", value: null },
        { op: "replace", path: "members", value: [{ value: 5 }] },
      ]),
    ).toEqual({
      ok: true,
      data: [
        { op: "add", path: "members", value: [{ value: "u1" }] },
        { op: "replace", path: "members", value: [] },
        { op: "replace", path: "members", value: [{ value: "5" }] },
      ],
    });
  });

  it("refuses a member without a value and a displayName that isn't a string", () => {
    expect(normalizeGroupOps([{ op: "add", path: "members", value: [{}] }])).toEqual({
      ok: false,
      detail: "Operations.0.value.0.value is required",
    });
    expect(
      normalizeGroupOps([{ op: "replace", path: "displayName", value: { name: "g" } }]),
    ).toEqual({ ok: false, detail: "Operations.0.value must be a string" });
  });
});
