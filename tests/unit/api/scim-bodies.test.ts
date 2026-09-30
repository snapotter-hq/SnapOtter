import { describe, expect, it } from "vitest";
import {
  normalizeGroupOps,
  normalizeUserOps,
  parseScimBody,
  parseScimPatch,
  scimGroupBody,
  scimUserBody,
} from "../../../apps/api/src/routes/enterprise/scim-bodies.js";

// #1511: SCIM bodies had no schema, so a wrong-typed field reached Postgres
// as JSON text or an array literal, or threw a 500 partway through.

const invalid = (detail: string) => ({ ok: false, detail, scimType: "invalidValue" });
const syntax = (detail: string) => ({ ok: false, detail, scimType: "invalidSyntax" });
const noTarget = (detail: string) => ({ ok: false, detail, scimType: "noTarget" });

describe("scimUserBody", () => {
  it("coerces a whole number in a string attribute, as some IdPs map numeric ids", () => {
    expect(parseScimBody(scimUserBody, { userName: 42, externalId: 123 })).toEqual({
      ok: true,
      data: { userName: "42", externalId: "123" },
    });
  });

  it("refuses a boolean in an identity field, a broken attribute mapping", () => {
    expect(parseScimBody(scimUserBody, { userName: true })).toEqual(
      invalid("userName must be a string, got boolean"),
    );
  });

  it("refuses a number JSON parsing has already rounded, rather than store another id", () => {
    // Parsed from JSON, the way the route receives it: the digits are already gone.
    const body = JSON.parse('{"externalId": 12345678901234567890}');
    expect(parseScimBody(scimUserBody, body)).toEqual(
      invalid("externalId must be a string, got number"),
    );
  });

  it("refuses an object or array where a string belongs, naming the field", () => {
    expect(parseScimBody(scimUserBody, { userName: "u", externalId: { id: 1 } })).toEqual(
      invalid("externalId must be a string, got object"),
    );
    expect(parseScimBody(scimUserBody, { userName: ["u"] })).toEqual(
      invalid("userName must be a string, got array"),
    );
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
    expect(parseScimBody(scimUserBody, { active: "yes" })).toEqual(
      invalid("active must be a boolean, got string"),
    );
  });

  it("reads null as unassigned on every attribute", () => {
    const body = { userName: null, externalId: null, active: null, emails: null };
    expect(parseScimBody(scimUserBody, body)).toEqual({ ok: true, data: body });
  });

  it("refuses emails that aren't a list, and an entry without a value", () => {
    expect(parseScimBody(scimUserBody, { emails: { value: "a@b.c" } })).toEqual(
      invalid("emails must be an array, got object"),
    );
    expect(parseScimBody(scimUserBody, { emails: [{ primary: true }] })).toEqual(
      invalid("emails.0.value is required"),
    );
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
  it("accepts null members and displayName, which RFC 7643 treats as unassigned", () => {
    expect(parseScimBody(scimGroupBody, { displayName: null, members: null })).toEqual({
      ok: true,
      data: { displayName: null, members: null },
    });
  });

  it("refuses members that aren't a list, and a member without a value", () => {
    expect(parseScimBody(scimGroupBody, { members: { value: "u1" } })).toEqual(
      invalid("members must be an array, got object"),
    );
    expect(parseScimBody(scimGroupBody, { members: [{}] })).toEqual(
      invalid("members.0.value is required"),
    );
  });
});

describe("parseScimPatch", () => {
  it("answers a malformed request with invalidSyntax", () => {
    expect(parseScimPatch({ Operations: [{ path: "userName" }] })).toEqual(
      syntax("Operations.0.op is required"),
    );
    expect(parseScimPatch({ Operations: { op: "add" } })).toEqual(
      syntax("Operations must be an array, got object"),
    );
  });

  it("requires at least one operation, so an empty patch can't answer 200 doing nothing", () => {
    expect(parseScimPatch({})).toEqual(syntax("Operations is required"));
    expect(parseScimPatch(undefined)).toEqual(syntax("Operations is required"));
    expect(parseScimPatch({ Operations: [] })).toEqual(syntax("Operations must not be empty"));
  });

  it("finds the Operations key in any case, as SCIM attribute names are case-insensitive", () => {
    const parsed = parseScimPatch({
      operations: [{ op: "replace", path: "active", value: false }],
    });
    expect(parsed.ok && parsed.data.Operations).toEqual([
      { op: "replace", path: "active", value: false },
    ]);
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
      { op: "replace", path: "emails", value: null },
    ]);
    expect(result).toEqual({
      ok: true,
      data: [
        { op: "replace", path: "userName", value: "7" },
        { op: "replace", path: "externalId", value: null },
        { op: "replace", path: "active", value: false },
        { op: "add", path: "emails", value: [{ value: "a@b.c", primary: true }] },
        { op: "add", path: "emails", value: [{ value: "d@e.f", primary: true }] },
        { op: "replace", path: "emails", value: null },
      ],
    });
  });

  it("refuses an empty userName rather than write it", () => {
    expect(normalizeUserOps([{ op: "replace", path: "userName", value: "  " }])).toEqual(
      invalid("Operations.0.value must not be empty"),
    );
  });

  it("refuses a null active rather than read it as a deactivation", () => {
    expect(normalizeUserOps([{ op: "replace", path: "active", value: null }])).toEqual(
      invalid("Operations.0.value must be a boolean, got null"),
    );
  });

  it("names the missing value on a single email, not the list it could have been", () => {
    expect(normalizeUserOps([{ op: "add", path: "emails", value: { primary: true } }])).toEqual(
      invalid("Operations.0.value.value is required"),
    );
  });

  it("checks a path-less value object and names the failing field", () => {
    expect(
      normalizeUserOps([{ op: "replace", value: { userName: "u", externalId: ["x"] } }]),
    ).toEqual(invalid("Operations.0.value.externalId must be a string, got array"));
  });

  it("names the operation when a path's value has the wrong type", () => {
    expect(
      normalizeUserOps([
        { op: "add", path: "emails", value: "a@b.c" },
        { op: "replace", path: "userName", value: { first: "u" } },
      ]),
    ).toEqual(invalid("Operations.1.value must be a string, got object"));
  });

  it("matches paths case-insensitively and hands the route their canonical spelling (#1731)", () => {
    expect(
      normalizeUserOps([
        { op: "Replace", path: "Active", value: "False" },
        { op: "replace", path: "USERNAME", value: "u" },
        { op: "remove", path: "ExternalId" },
        { op: "replace", path: 'Emails[Type eq "work"].Value', value: "a@b.c" },
        { op: "add", path: "EMAILS", value: "x@y.z" },
        { op: "replace", path: " urn:ietf:params:scim:schemas:core:2.0:User:active ", value: true },
      ]),
    ).toEqual({
      ok: true,
      data: [
        { op: "Replace", path: "active", value: false },
        { op: "replace", path: "userName", value: "u" },
        { op: "remove", path: "externalId" },
        {
          op: "replace",
          path: 'emails[type eq "work"].value',
          value: [{ value: "a@b.c", primary: true }],
        },
        { op: "add", path: "emails", value: [{ value: "x@y.z", primary: true }] },
        { op: "replace", path: "active", value: true },
      ],
    });
  });

  it("spells a path-less value object's known keys canonically", () => {
    expect(
      normalizeUserOps([
        { op: "Replace", value: { Active: "False", USERNAME: "u", department: "x" } },
      ]),
    ).toEqual({
      ok: true,
      data: [{ op: "Replace", value: { active: false, userName: "u", department: "x" } }],
    });
  });

  it("refuses a value object that sets one attribute under two spellings", () => {
    expect(normalizeUserOps([{ op: "replace", value: { active: true, Active: false } }])).toEqual(
      syntax("Operations.0.value sets active more than once"),
    );
  });

  it("refuses a value object whose active is null, rather than read it as a deactivation", () => {
    expect(normalizeUserOps([{ op: "replace", value: { active: null } }])).toEqual(
      invalid("Operations.0.value.active must be a boolean, got null"),
    );
  });

  it("refuses to remove userName or active, and a remove with no path", () => {
    expect(normalizeUserOps([{ op: "remove", path: "USERNAME" }])).toEqual(
      invalid("Operations.0: userName can't be removed"),
    );
    expect(normalizeUserOps([{ op: "remove", path: "active" }])).toEqual(
      invalid("Operations.0: active can't be removed"),
    );
    expect(normalizeUserOps([{ op: "remove" }])).toEqual(
      noTarget("Operations.0.path is required for remove"),
    );
  });

  it("refuses an op that isn't add, remove or replace, before anything applies", () => {
    expect(normalizeUserOps([{ op: "delete", path: "active" }])).toEqual(
      syntax("Operations.0.op must be add, remove or replace"),
    );
  });

  it("leaves operations on paths the route ignores alone", () => {
    const ops = [{ op: "replace", path: "title", value: { any: "thing" } }];
    expect(normalizeUserOps(ops)).toEqual({ ok: true, data: ops });
  });
});

describe("normalizeGroupOps", () => {
  it("turns a single member into a list and a null replace into none", () => {
    expect(
      normalizeGroupOps([
        { op: "Add", path: "members", value: { value: "u1" } },
        { op: "replace", path: "members", value: null },
        { op: "replace", path: "members", value: [{ value: 5 }] },
      ]),
    ).toEqual({
      ok: true,
      data: [
        { op: "Add", path: "members", value: [{ value: "u1" }] },
        { op: "replace", path: "members", value: [] },
        { op: "replace", path: "members", value: [{ value: "5" }] },
      ],
    });
  });

  it("refuses a member without a value and a displayName that isn't a string", () => {
    expect(normalizeGroupOps([{ op: "add", path: "members", value: [{}] }])).toEqual(
      invalid("Operations.0.value.0.value is required"),
    );
    expect(
      normalizeGroupOps([{ op: "replace", path: "displayName", value: { name: "g" } }]),
    ).toEqual(invalid("Operations.0.value must be a string, got object"));
  });

  it("lets a null displayName through to the route's own empty-name answer (#988)", () => {
    expect(normalizeGroupOps([{ op: "replace", path: "displayName", value: null }])).toEqual({
      ok: true,
      data: [{ op: "replace", path: "displayName", value: null }],
    });
  });
});
