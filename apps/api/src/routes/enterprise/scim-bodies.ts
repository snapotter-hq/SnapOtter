import { type ZodErrorMap, type ZodIssue, type ZodTypeAny, z } from "zod";

/**
 * Schemas for the SCIM request bodies. Before these, every route cast
 * request.body field by field, so a wrong-typed value went straight to
 * Postgres: an object became its JSON text, an array a Postgres array literal,
 * and a non-array where a list belonged threw a 500 partway through (#1511).
 *
 * The line is drawn where it breaks nothing an IdP sends today. A whole number
 * in a string attribute is coerced, since some IdPs map numeric ids. Anything
 * else of the wrong type is a SCIM 400 naming the field: an object or array
 * where a single value belongs, a boolean in an identity field (a broken
 * attribute mapping), a number too large to have survived JSON parsing
 * intact, or a list that isn't one. Null means unassigned (RFC 7643 2.5).
 * Resource objects pass unknown attributes through: IdPs send extension
 * schemas we ignore.
 */

/**
 * A SCIM string attribute. A safe whole number becomes its string form; a
 * larger one has already lost digits to JSON parsing, so coercing it would
 * store a different id than the IdP holds.
 */
const scimString = z.preprocess(
  (value) => (typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value),
  z.string(),
);

/**
 * A SCIM boolean. Entra ID sends "True" and "False" as strings, so those
 * count, in any case. Any other string is refused rather than read as true:
 * `active !== false` used to make "false" an active user.
 */
const scimBoolean = z.preprocess(
  (value) =>
    typeof value === "string" && /^(true|false)$/i.test(value)
      ? value.toLowerCase() === "true"
      : value,
  z.boolean(),
);

const email = z.object({ value: scimString, primary: scimBoolean.optional() }).passthrough();
const member = z.object({ value: scimString }).passthrough();

// Null is unassigned (RFC 7643 2.5), which each route reads as "not sent".
export const scimUserBody = z
  .object({
    userName: scimString.nullish(),
    externalId: scimString.nullish(),
    active: scimBoolean.nullish(),
    emails: z.array(email).nullish(),
  })
  .passthrough();

export const scimGroupBody = z
  .object({
    displayName: scimString.nullish(),
    members: z.array(member).nullish(),
  })
  .passthrough();

const patchOperation = z
  .object({ op: z.string(), path: z.string().optional(), value: z.unknown().optional() })
  .passthrough();

// RFC 7644 3.5.2 requires at least one operation, and attribute names are
// case-insensitive (RFC 7643 2.1). A patch carrying none used to answer 200
// having done nothing, which silently dropped a deactivation.
export const scimPatchBody = z.preprocess((body) => {
  if (typeof body !== "object" || body === null || "Operations" in body) return body;
  const key = Object.keys(body).find((k) => k.toLowerCase() === "operations");
  return key ? { ...body, Operations: (body as Record<string, unknown>)[key] } : body;
}, z.object({ Operations: z.array(patchOperation).min(1) }).passthrough());

export type ScimPatchOp = z.infer<typeof patchOperation>;
export type ScimEmail = z.infer<typeof email>;
export type ScimMember = z.infer<typeof member>;

// Per-operation values, checked before any operation writes.
const emailsValue = z.union([z.array(email), email, scimString]);
const membersValue = z.union([z.array(member), member]);

/** A bare address is the primary one; a single entry is a list of one. */
function emailList(value: z.infer<typeof emailsValue>): ScimEmail[] {
  if (typeof value === "string") return [{ value, primary: true }];
  return Array.isArray(value) ? value : [value];
}

function article(expected: string): string {
  return /^[aeiou]/.test(expected) ? `an ${expected}` : `a ${expected}`;
}

function fieldName(path: (string | number)[], prefix: (string | number)[]): string {
  const full = [...prefix, ...path];
  return full.length ? full.join(".") : "body";
}

/** Readable details: "members must be an array, got object", "Operations.0.op is required". */
function errorMapFor(prefix: (string | number)[]): ZodErrorMap {
  return (issue, ctx) => {
    const field = fieldName(issue.path, prefix);
    if (issue.code === "invalid_type") {
      if (issue.received === "undefined") return { message: `${field} is required` };
      return { message: `${field} must be ${article(issue.expected)}, got ${issue.received}` };
    }
    if (issue.code === "too_small" && issue.type === "array") {
      return { message: `${field} must not be empty` };
    }
    return { message: `${field} is invalid: ${ctx.defaultError}` };
  };
}

function firstMessage(issues: ZodIssue[]): string {
  // A union reports each branch it tried. The deepest mismatch is the most
  // specific: a single email missing its value should say so, not that the
  // value isn't a list.
  const [first] = issues;
  if (first?.code === "invalid_union") {
    const nested = first.unionErrors.flatMap((e) => e.issues);
    const deepest = nested.reduce<ZodIssue | undefined>(
      (best, issue) => (!best || issue.path.length > best.path.length ? issue : best),
      undefined,
    );
    if (deepest) return deepest.message;
  }
  return first?.message ?? "Invalid request body";
}

/**
 * RFC 7644 3.12: a malformed request is invalidSyntax, a bad attribute value
 * invalidValue, a remove with nothing to remove noTarget, and a path the
 * server can't apply invalidPath.
 */
export type ScimErrorType = "invalidSyntax" | "invalidValue" | "noTarget" | "invalidPath";

export type ScimParse<T> =
  | { ok: true; data: T }
  | { ok: false; detail: string; scimType: ScimErrorType };

function parseWith<S extends ZodTypeAny>(
  schema: S,
  value: unknown,
  scimType: ScimErrorType,
  prefix: (string | number)[] = [],
): ScimParse<z.infer<S>> {
  const result = schema.safeParse(value, { errorMap: errorMapFor(prefix) });
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, detail: firstMessage(result.error.issues), scimType };
}

/** Parse a resource body (Users or Groups); a missing body reads as empty. */
export function parseScimBody<S extends ZodTypeAny>(
  schema: S,
  body: unknown,
): ScimParse<z.infer<S>> {
  return parseWith(schema, body ?? {}, "invalidValue");
}

/** Parse a PatchOp body. What's wrong here is the request's shape, not a value. */
export function parseScimPatch(body: unknown): ScimParse<z.infer<typeof scimPatchBody>> {
  return parseWith(scimPatchBody, body ?? {}, "invalidSyntax");
}

const PATCH_OPS = new Set(["add", "remove", "replace"]);

// The paths the Users PATCH route acts on, keyed by their lowercase form.
// Attribute names are case-insensitive (RFC 7643 2.1), and an exact match
// used to skip "Active" and answer 200 with the user still active (#1731).
// Any other path is an attribute SnapOtter keeps no column for (title,
// name.givenName, phoneNumbers) and is ignored on purpose: IdPs send them on
// every sync, so refusing them would break provisioning.
const USER_PATHS = new Map(
  [
    "active",
    "userName",
    "externalId",
    "emails",
    'emails[type eq "work"].value',
    "name.formatted",
    "displayName",
  ].map((path) => [path.toLowerCase(), path]),
);

// RFC 7644 3.10 lets a path carry its schema URN.
const USER_SCHEMA_PREFIX = "urn:ietf:params:scim:schemas:core:2.0:user:";

/** The canonical spelling of a known Users path, or undefined for any other. */
function canonicalUserPath(path: string): string | undefined {
  let key = path.trim().toLowerCase();
  if (key.startsWith(USER_SCHEMA_PREFIX)) key = key.slice(USER_SCHEMA_PREFIX.length);
  return USER_PATHS.get(key);
}

// The attributes a path-less value object can set, keyed by lowercase name.
const USER_VALUE_KEYS = new Map(
  ["userName", "externalId", "active", "emails"].map((key) => [key.toLowerCase(), key]),
);

/**
 * A path-less value object with its known keys spelled canonically, so
 * {"Active": false} deactivates like {"active": false} (#1731). Two spellings
 * of one attribute are ambiguous, so that's refused rather than guessed.
 */
function canonicalValueObject(
  value: Record<string, unknown>,
  at: (string | number)[],
): ScimParse<Record<string, unknown>> {
  const canonical: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    const name = USER_VALUE_KEYS.get(key.toLowerCase()) ?? key;
    if (name in canonical) {
      return {
        ok: false,
        detail: `${at.join(".")} sets ${name} more than once`,
        scimType: "invalidSyntax",
      };
    }
    canonical[name] = field;
  }
  return { ok: true, data: canonical };
}

/**
 * Check and coerce each Users PATCH operation's value for the paths the route
 * acts on, and give each known path its canonical spelling so the route can
 * match it exactly. Emails always come back as a list, or null to clear the
 * address. An op other than add, remove or replace is malformed.
 */
export function normalizeUserOps(ops: ScimPatchOp[]): ScimParse<ScimPatchOp[]> {
  const normalized: ScimPatchOp[] = [];
  for (const [index, raw] of ops.entries()) {
    const opType = raw.op.toLowerCase();
    if (!PATCH_OPS.has(opType)) {
      return {
        ok: false,
        detail: `Operations.${index}.op must be add, remove or replace`,
        scimType: "invalidSyntax",
      };
    }
    const canonical = raw.path === undefined ? undefined : canonicalUserPath(raw.path);
    const op = canonical === undefined ? raw : { ...raw, path: canonical };
    const at = ["Operations", index, "value"];
    let value: ScimParse<unknown> = { ok: true, data: op.value };
    if (opType === "remove") {
      // RFC 7644 3.5.2.2: a remove names what it removes.
      if (op.path === undefined) {
        return {
          ok: false,
          detail: `Operations.${index}.path is required for remove`,
          scimType: "noTarget",
        };
      }
      // userName is required (RFC 7643 4.1), and dropping a request to unset
      // active would leave the user as they were while the IdP thinks otherwise.
      if (op.path === "userName" || op.path === "active") {
        return {
          ok: false,
          detail: `Operations.${index}: ${op.path} can't be removed`,
          scimType: "invalidValue",
        };
      }
    }
    if (opType === "replace" || opType === "add") {
      if (op.path === "userName") {
        value = parseWith(scimString, op.value, "invalidValue", at);
        if (value.ok && !(value.data as string).trim()) {
          value = {
            ok: false,
            detail: `${at.join(".")} must not be empty`,
            scimType: "invalidValue",
          };
        }
      } else if (op.path === "externalId") {
        value = parseWith(scimString.nullable(), op.value, "invalidValue", at);
      } else if (op.path === "active") {
        value = parseWith(scimBoolean, op.value, "invalidValue", at);
      } else if (op.path === "emails" || op.path === 'emails[type eq "work"].value') {
        // Null clears the address, as it always has.
        const emails = parseWith(emailsValue.nullable(), op.value, "invalidValue", at);
        value = emails.ok
          ? { ok: true, data: emails.data === null ? null : emailList(emails.data) }
          : emails;
      } else if (!op.path && typeof op.value === "object" && op.value !== null) {
        const keyed = canonicalValueObject(op.value as Record<string, unknown>, at);
        value = keyed.ok ? parseWith(scimUserBody, keyed.data, "invalidValue", at) : keyed;
        // Null reads as "not sent" on a resource body, but here the route
        // tests `"active" in value` and would read null as a deactivation.
        // Refuse it, as the path form does.
        if (value.ok && (value.data as { active?: unknown }).active === null) {
          value = {
            ok: false,
            detail: `${at.join(".")}.active must be a boolean, got null`,
            scimType: "invalidValue",
          };
        }
      }
    }
    if (!value.ok) return value;
    normalized.push({ ...op, value: value.data });
  }
  return { ok: true, data: normalized };
}

// RFC 7644 3.10 lets a path carry its schema URN.
const GROUP_SCHEMA_PREFIX = "urn:ietf:params:scim:schemas:core:2.0:group:";
// Attribute names are case-insensitive; the quoted member id is not.
const MEMBER_FILTER = /^members\[value\s+eq\s+"([^"]+)"\]$/i;

type GroupPath =
  | { kind: "members" }
  | { kind: "displayName" }
  | { kind: "member"; id: string }
  | { kind: "unsupported" }
  | { kind: "ignored" };

/**
 * What a Groups path targets. A filter or sub-attribute on members or
 * displayName other than members[value eq "<id>"] names something the route
 * stores in a form it can't apply. Any other attribute is one SnapOtter
 * doesn't store, ignored the way the Users route ignores them (#1731).
 */
function groupPath(path: string): GroupPath {
  let trimmed = path.trim();
  if (trimmed.toLowerCase().startsWith(GROUP_SCHEMA_PREFIX)) {
    trimmed = trimmed.slice(GROUP_SCHEMA_PREFIX.length);
  }
  const lower = trimmed.toLowerCase();
  if (lower === "members") return { kind: "members" };
  if (lower === "displayname") return { kind: "displayName" };
  const filter = trimmed.match(MEMBER_FILTER);
  if (filter) return { kind: "member", id: filter[1] };
  return /^(members|displayname)\b/.test(lower) ? { kind: "unsupported" } : { kind: "ignored" };
}

const groupValueObject = z.record(z.unknown());

/**
 * Check and coerce each Groups PATCH operation for the route, before any of
 * them writes (#1683). What comes out is one of two shapes: add, replace or
 * remove on "members" with a member list, or replace on "displayName". A
 * remove on "members" without a list removes every member. Getting there:
 *
 * - A filter path, members[value eq "<id>"], is a remove of that one member.
 * - A path-less value object ({displayName, members}, the way Okta renames a
 *   group) becomes the path ops it stands for.
 * - add on displayName replaces it (RFC 7644 3.5.2.1).
 *
 * An op other than add, remove or replace, a remove with no path, and a path
 * the route can't apply are refused. Attributes SnapOtter doesn't store are
 * dropped.
 */
export function normalizeGroupOps(ops: ScimPatchOp[]): ScimParse<ScimPatchOp[]> {
  const normalized: ScimPatchOp[] = [];
  for (const [index, raw] of ops.entries()) {
    const opType = raw.op.toLowerCase();
    if (!PATCH_OPS.has(opType)) {
      return {
        ok: false,
        detail: `Operations.${index}.op must be add, remove or replace`,
        scimType: "invalidSyntax",
      };
    }
    const at = ["Operations", index, "value"];

    if (raw.path === undefined) {
      // RFC 7644 3.5.2.2: a remove names what it removes.
      if (opType === "remove") {
        return {
          ok: false,
          detail: `Operations.${index}.path is required for remove`,
          scimType: "noTarget",
        };
      }
      const object = parseWith(groupValueObject, raw.value, "invalidValue", at);
      if (!object.ok) return object;
      const keyed: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(object.data)) {
        const lower = key.toLowerCase();
        const name =
          lower === "displayname" ? "displayName" : lower === "members" ? "members" : undefined;
        if (!name) continue;
        if (name in keyed) {
          return {
            ok: false,
            detail: `${at.join(".")} sets ${name} more than once`,
            scimType: "invalidSyntax",
          };
        }
        keyed[name] = field;
      }
      const body = parseWith(scimGroupBody, keyed, "invalidValue", at);
      if (!body.ok) return body;
      if ("displayName" in body.data) {
        normalized.push({ op: "replace", path: "displayName", value: body.data.displayName });
      }
      if ("members" in body.data) {
        const list = body.data.members ?? [];
        if (opType === "replace" || list.length > 0) {
          normalized.push({ op: raw.op, path: "members", value: list });
        }
      }
      continue;
    }

    const target = groupPath(raw.path);
    if (target.kind === "ignored") continue;
    if (target.kind === "unsupported" || (target.kind === "member" && opType !== "remove")) {
      return {
        ok: false,
        detail: `Operations.${index}.path ${JSON.stringify(raw.path)} isn't one SnapOtter can apply`,
        scimType: "invalidPath",
      };
    }

    if (target.kind === "displayName") {
      if (opType === "remove") {
        return {
          ok: false,
          detail: `Operations.${index}: displayName can't be removed`,
          scimType: "invalidValue",
        };
      }
      // Null or blank falls to the route's "displayName cannot be empty" (#988).
      const name = parseWith(scimString.nullish(), raw.value, "invalidValue", at);
      if (!name.ok) return name;
      normalized.push({ op: "replace", path: "displayName", value: name.data });
      continue;
    }

    if (target.kind === "member") {
      normalized.push({ op: raw.op, path: "members", value: [{ value: target.id }] });
      continue;
    }

    // Null is unassigned (RFC 7643 2.5): none on a replace, all on a remove.
    if (raw.value === undefined || raw.value === null) {
      if (opType === "remove") {
        normalized.push({ op: raw.op, path: "members" });
        continue;
      }
      if (opType === "replace") {
        normalized.push({ op: raw.op, path: "members", value: [] });
        continue;
      }
    }
    const members = parseWith(membersValue, raw.value, "invalidValue", at);
    if (!members.ok) return members;
    const list = Array.isArray(members.data) ? members.data : [members.data];
    normalized.push({ op: raw.op, path: "members", value: list });
  }
  return { ok: true, data: normalized };
}
