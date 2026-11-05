// Minimal JSON Schema checker for OpenAPI 3.1 examples. It covers the keywords
// the SnapOtter spec uses; a keyword it does not know is ignored, so an unusual
// schema can pass without being checked. Add the keyword here before relying on it.

const resolvePointer = (root, ref) => {
  if (!ref.startsWith("#/")) throw new Error(`Unsupported $ref ${ref}`);
  return ref
    .slice(2)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((node, key) => node?.[key], root);
};

const typeOf = (value) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
};

const matchesType = (value, type) => {
  const actual = typeOf(value);
  if (type === "number") return actual === "number" || actual === "integer";
  return actual === type;
};

/**
 * Return a list of human-readable errors; an empty list means the value conforms.
 * @param {unknown} value
 * @param {any} schema
 * @param {any} root the parsed document that `$ref`s resolve against
 * @param {string} [path]
 * @returns {string[]}
 */
export function checkValue(value, schema, root, path = "$") {
  if (schema === true || schema === undefined) return [];
  if (schema === false) return [`${path}: schema forbids any value`];
  if (schema.$ref) return checkValue(value, resolvePointer(root, schema.$ref), root, path);

  const errors = [];
  if (schema.const !== undefined && JSON.stringify(schema.const) !== JSON.stringify(value)) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))
  ) {
    errors.push(`${path}: ${JSON.stringify(value)} is not in enum`);
  }
  if (schema.nullable === true && value === null) return errors;

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      errors.push(`${path}: expected ${types.join("|")}, got ${typeOf(value)}`);
      return errors;
    }
  }

  for (const sub of schema.allOf ?? []) errors.push(...checkValue(value, sub, root, path));
  if (schema.anyOf && !schema.anyOf.some((s) => checkValue(value, s, root, path).length === 0)) {
    errors.push(`${path}: matches no anyOf branch`);
  }
  if (
    schema.oneOf &&
    schema.oneOf.filter((s) => checkValue(value, s, root, path).length === 0).length !== 1
  ) {
    errors.push(`${path}: must match exactly one oneOf branch`);
  }

  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${path}: missing required "${key}"`);
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in value) errors.push(...checkValue(value[key], sub, root, `${path}.${key}`));
    }
    if (schema.additionalProperties === false) {
      const known = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(value)) {
        if (!known.has(key)) errors.push(`${path}: unexpected property "${key}"`);
      }
    } else if (typeof schema.additionalProperties === "object") {
      const known = new Set(Object.keys(schema.properties ?? {}));
      for (const [key, v] of Object.entries(value)) {
        if (!known.has(key))
          errors.push(...checkValue(v, schema.additionalProperties, root, `${path}.${key}`));
      }
    }
  }

  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, i) => {
      errors.push(...checkValue(item, schema.items, root, `${path}[${i}]`));
    });
  }
  if (
    typeof value === "string" &&
    schema.minLength !== undefined &&
    value.length < schema.minLength
  ) {
    errors.push(`${path}: shorter than minLength ${schema.minLength}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum)
      errors.push(`${path}: below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum)
      errors.push(`${path}: above maximum ${schema.maximum}`);
  }
  return errors;
}
