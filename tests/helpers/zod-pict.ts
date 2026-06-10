import type { z } from "zod";

/**
 * Derives PICT combinatorial axes from a tool's Zod settings schema.
 *
 * Enums and booleans enumerate their members; bounded numbers contribute
 * min/mid/max; optional fields add `undefined` so "field omitted" is part of
 * the matrix. Free-form strings, arrays, and nested objects are skipped here
 * (the fast-check fuzz layer covers those).
 *
 * Zod v3 internals (`_def`) are accessed deliberately; if a Zod upgrade breaks
 * this helper, the pairwise suite fails loudly at collection time.
 */
export interface PictAxis {
  key: string;
  values: unknown[];
}

interface ZodDefLike {
  typeName?: string;
  schema?: ZodSchemaLike;
  innerType?: ZodSchemaLike;
  in?: ZodSchemaLike;
  shape?: () => Record<string, ZodSchemaLike>;
  values?: unknown;
  options?: ZodSchemaLike[];
  checks?: Array<{ kind: string; value?: number }>;
  value?: unknown;
}

interface ZodSchemaLike {
  _def?: ZodDefLike;
}

/** Unwraps effects/defaults/optional/nullable wrappers around a schema. */
function unwrap(schema: ZodSchemaLike): ZodSchemaLike {
  let current = schema;
  for (let i = 0; i < 10; i++) {
    const def = current._def;
    if (!def) return current;
    if (def.typeName === "ZodEffects" && def.schema) current = def.schema;
    else if (def.typeName === "ZodPipeline" && def.in) current = def.in;
    else if (
      (def.typeName === "ZodDefault" ||
        def.typeName === "ZodOptional" ||
        def.typeName === "ZodNullable") &&
      def.innerType
    )
      current = def.innerType;
    else return current;
  }
  return current;
}

function isOmittable(schema: ZodSchemaLike): boolean {
  const t = schema._def?.typeName;
  return t === "ZodOptional" || t === "ZodDefault" || t === "ZodNullable";
}

function deriveValues(field: ZodSchemaLike): unknown[] | null {
  const omittable = isOmittable(field);
  const inner = unwrap(field);
  const def = inner._def;
  if (!def) return null;

  let values: unknown[] | null = null;
  switch (def.typeName) {
    case "ZodEnum":
      values = [...(def.values as string[])];
      break;
    case "ZodNativeEnum":
      values = Object.values(def.values as Record<string, unknown>);
      break;
    case "ZodBoolean":
      values = [true, false];
      break;
    case "ZodLiteral":
      values = [def.value];
      break;
    case "ZodNumber": {
      const checks = def.checks ?? [];
      let min: number | undefined;
      let max: number | undefined;
      let isInt = false;
      for (const c of checks) {
        if (c.kind === "min") min = c.value;
        if (c.kind === "max") max = c.value;
        if (c.kind === "int") isInt = true;
      }
      const lo = min ?? 0;
      const hi = max ?? Math.max(lo + 100, 100);
      const mid = isInt ? Math.round((lo + hi) / 2) : (lo + hi) / 2;
      values = [...new Set([lo, mid, hi])];
      break;
    }
    case "ZodUnion": {
      const merged = (def.options ?? []).flatMap((option) => deriveValues(option) ?? []);
      values = merged.length > 0 ? [...new Set(merged)] : null;
      break;
    }
    default:
      values = null;
  }

  if (values && omittable) values = [...values, undefined];
  return values;
}

/**
 * Returns the combinatorial axes for a settings schema, or [] when the schema
 * is not an object or has no enumerable fields.
 */
export function deriveAxes(schema: z.ZodType<unknown, z.ZodTypeDef, unknown>): PictAxis[] {
  const obj = unwrap(schema as ZodSchemaLike);
  if (obj._def?.typeName !== "ZodObject" || typeof obj._def.shape !== "function") return [];

  const axes: PictAxis[] = [];
  for (const [key, field] of Object.entries(obj._def.shape())) {
    const values = deriveValues(field);
    // An axis needs at least two values to contribute to pair coverage.
    if (values && values.length >= 2) axes.push({ key, values });
  }
  return axes;
}

/** Removes undefined-valued keys so "omitted" really means omitted. */
export function compactCase(combo: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(combo).filter(([, v]) => v !== undefined));
}

/**
 * Recursively collects every string sub-schema that carries a regex check
 * (hex colors and similar). zod-fast-check cannot generate for those without
 * an override, so the fuzz suite overrides each collected instance.
 */
export function collectRegexStringSchemas(schema: unknown): unknown[] {
  const found: unknown[] = [];
  const seen = new Set<unknown>();

  const visit = (node: ZodSchemaLike | undefined): void => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    const def = node._def;
    if (!def) return;

    if (def.typeName === "ZodString") {
      const hasRegex = (def.checks ?? []).some((c) => c.kind === "regex");
      if (hasRegex) found.push(node);
      return;
    }

    if (def.typeName === "ZodObject" && typeof def.shape === "function") {
      for (const field of Object.values(def.shape())) visit(field);
      return;
    }

    // Wrappers and containers
    visit(def.schema);
    visit(def.innerType);
    visit(def.in);
    visit((def as { type?: ZodSchemaLike }).type); // ZodArray element
    for (const option of def.options ?? []) visit(option);
  };

  visit(schema as ZodSchemaLike);
  return found;
}
