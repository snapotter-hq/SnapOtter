import { type ZodErrorMap, type ZodIssue, type ZodTypeAny, z } from "zod";

/**
 * Schemas for the SCIM request bodies. Before these, every route cast
 * request.body field by field, so a wrong-typed value went straight to
 * Postgres: an object became its JSON text, an array a Postgres array literal,
 * and a non-array where a list belonged threw a 500 partway through (#1511).
 *
 * The line is drawn where it breaks nothing an IdP sends today. A number or
 * boolean in a string attribute is coerced, the way Postgres used to coerce it
 * silently. An object or array where a single value belongs, or a list that
 * isn't one, is a SCIM 400 invalidValue naming the field. Resource objects
 * pass unknown attributes through: IdPs send extension schemas we ignore.
 */

/** A SCIM string attribute. A number or boolean becomes its string form. */
const scimString = z.preprocess(
  (value) => (typeof value === "number" || typeof value === "boolean" ? String(value) : value),
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

export const scimUserBody = z
  .object({
    userName: scimString.optional(),
    externalId: scimString.nullable().optional(),
    active: scimBoolean.optional(),
    emails: z.array(email).optional(),
  })
  .passthrough();

export const scimGroupBody = z
  .object({
    displayName: scimString.optional(),
    // RFC 7643 2.5: null and an empty list are the same state.
    members: z.array(member).nullable().optional(),
  })
  .passthrough();

const patchOperation = z
  .object({ op: z.string(), path: z.string().optional(), value: z.unknown().optional() })
  .passthrough();

export const scimPatchBody = z
  .object({ Operations: z.array(patchOperation).optional() })
  .passthrough();

export type ScimPatchOp = z.infer<typeof patchOperation>;
export type ScimEmail = z.infer<typeof email>;
export type ScimMember = z.infer<typeof member>;

// Per-operation values, checked before any operation writes.
const emailsValue = z.union([z.array(email), email, scimString]);
const membersValue = z.union([z.array(member), member]);
const userValueObject = scimUserBody;

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

/** Readable details: "members must be an array", "Operations.0.op is required". */
function errorMapFor(prefix: (string | number)[]): ZodErrorMap {
  return (issue, ctx) => {
    const field = fieldName(issue.path, prefix);
    if (issue.code === "invalid_type") {
      if (issue.received === "undefined") return { message: `${field} is required` };
      return { message: `${field} must be ${article(issue.expected)}` };
    }
    return { message: `${field} is invalid: ${ctx.defaultError}` };
  };
}

function firstMessage(issues: ZodIssue[]): string {
  // A union reports each branch it tried; the plain type mismatch reads best.
  const [first] = issues;
  if (first?.code === "invalid_union") {
    const nested = first.unionErrors.flatMap((e) => e.issues);
    const typeIssue = nested.find((i) => i.code === "invalid_type");
    if (typeIssue) return typeIssue.message;
  }
  return first?.message ?? "Invalid request body";
}

export type ScimParse<T> = { ok: true; data: T } | { ok: false; detail: string };

function parseWith<S extends ZodTypeAny>(
  schema: S,
  value: unknown,
  prefix: (string | number)[] = [],
): ScimParse<z.infer<S>> {
  const result = schema.safeParse(value, { errorMap: errorMapFor(prefix) });
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, detail: firstMessage(result.error.issues) };
}

/** Parse a request body; a missing body reads as an empty object. */
export function parseScimBody<S extends ZodTypeAny>(
  schema: S,
  body: unknown,
): ScimParse<z.infer<S>> {
  return parseWith(schema, body ?? {});
}

/**
 * Check and coerce each Users PATCH operation's value for the paths the route
 * acts on. Emails always come back as a list.
 */
export function normalizeUserOps(ops: ScimPatchOp[]): ScimParse<ScimPatchOp[]> {
  const normalized: ScimPatchOp[] = [];
  for (const [index, op] of ops.entries()) {
    const opType = op.op.toLowerCase();
    const at = ["Operations", index, "value"];
    let value: ScimParse<unknown> = { ok: true, data: op.value };
    if (opType === "replace" || opType === "add") {
      if (op.path === "userName") value = parseWith(scimString, op.value, at);
      else if (op.path === "externalId") value = parseWith(scimString.nullable(), op.value, at);
      else if (op.path === "active") value = parseWith(scimBoolean, op.value, at);
      else if (op.path === "emails" || op.path === 'emails[type eq "work"].value') {
        const emails = parseWith(emailsValue, op.value, at);
        value = emails.ok ? { ok: true, data: emailList(emails.data) } : emails;
      } else if (!op.path && typeof op.value === "object" && op.value !== null) {
        value = parseWith(userValueObject, op.value, at);
      }
    }
    if (!value.ok) return value;
    normalized.push({ ...op, value: value.data });
  }
  return { ok: true, data: normalized };
}

/**
 * Check and coerce each Groups PATCH operation's value for the paths the route
 * acts on. Members always come back as a list: a single member object is one
 * member, and null on a replace is none.
 */
export function normalizeGroupOps(ops: ScimPatchOp[]): ScimParse<ScimPatchOp[]> {
  const normalized: ScimPatchOp[] = [];
  for (const [index, op] of ops.entries()) {
    const opType = op.op.toLowerCase();
    const at = ["Operations", index, "value"];
    let value: ScimParse<unknown> = { ok: true, data: op.value };
    const replacesMembers = opType === "replace" && op.path === "members";
    if ((opType === "add" && op.path === "members") || replacesMembers) {
      if (replacesMembers && op.value === null) {
        value = { ok: true, data: [] };
      } else {
        const members = parseWith(membersValue, op.value, at);
        value = members.ok
          ? { ok: true, data: Array.isArray(members.data) ? members.data : [members.data] }
          : members;
      }
    } else if (opType === "replace" && op.path === "displayName") {
      value = parseWith(scimString.optional(), op.value, at);
    }
    if (!value.ok) return value;
    normalized.push({ ...op, value: value.data });
  }
  return { ok: true, data: normalized };
}
