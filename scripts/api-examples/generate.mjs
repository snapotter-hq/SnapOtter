// Adds request and success examples to operations in apps/api/src/openapi.yaml.
//
// Examples are derived from each schema, not written by hand. Value order:
// `example`, `default`, first `enum` value, then type placeholders: string ->
// "example" (or a format-specific or name-specific placeholder), integer and
// number -> 1, boolean -> true, binary -> "photo.png" in requests and
// "(binary data)" in responses. A string described as a JSON string gets "{}".
//
// The file is edited as text so the rest of it keeps its formatting. Operations
// and media types that already have `example` or `examples` are left alone, so
// the script is safe to run again. Pass --check to report without writing.
//
// Usage: node scripts/api-examples/generate.mjs [--check]

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { checkValue } from "./schema-check.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const SPEC_PATH = join(here, "../../apps/api/src/openapi.yaml");
const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];
const UUID = "3f2c8a1e-6b7d-4c9a-9e1f-2a5b8c7d6e4f";
const MAX_DEPTH = 12;

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function resolveRef(root, ref) {
  return ref
    .slice(2)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((node, key) => node?.[key], root);
}

function stringFor(name, schema, role) {
  if (schema.format === "binary") return role === "response" ? "(binary data)" : "photo.png";
  if (schema.format === "date-time") return "2026-11-04T09:00:00.000Z";
  if (schema.format === "uuid") return UUID;
  if (schema.format === "email") return "user@example.com";
  if (schema.format === "uri") return "https://example.com/";
  if (typeof schema.description === "string" && schema.description.startsWith("JSON string"))
    return "{}";
  if (name && /(^id|Id|_id)$/.test(name)) return UUID;
  if (name && /filename$/i.test(name)) return "photo.png";
  const value = "example";
  return schema.minLength && schema.minLength > value.length
    ? value.padEnd(schema.minLength, "x")
    : value;
}

/**
 * Build an example value from a schema. Returns undefined when the schema is too
 * deep or cyclic to produce one.
 */
export function buildValue(schema, root, name, role, depth = 0) {
  if (depth > MAX_DEPTH || schema === null || typeof schema !== "object") return undefined;
  if (schema.example !== undefined) return schema.example;
  if (schema.$ref) return buildValue(resolveRef(root, schema.$ref), root, name, role, depth + 1);
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.const !== undefined) return schema.const;
  if (schema.allOf) {
    let merged = {};
    let scalar;
    for (const sub of schema.allOf) {
      const v = buildValue(sub, root, name, role, depth + 1);
      if (isPlainObject(v)) merged = { ...merged, ...v };
      else if (v !== undefined && scalar === undefined) scalar = v;
    }
    return scalar ?? merged;
  }
  let type = Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type;
  if (!type && !schema.properties && !schema.items) {
    const branch = schema.oneOf?.[0] ?? schema.anyOf?.[0];
    if (branch) return buildValue(branch, root, name, role, depth + 1);
  }
  if (!type) type = schema.properties ? "object" : schema.items ? "array" : "string";
  switch (type) {
    case "object": {
      const out = {};
      const branches = [...(schema.oneOf ?? []), ...(schema.anyOf ?? [])];
      const inFirstBranch = new Set(branches[0]?.required ?? []);
      const inAnyBranch = new Set(branches.flatMap((b) => b.required ?? []));
      for (const [key, sub] of Object.entries(schema.properties ?? {})) {
        // Keys that only one alternative requires stay out, or every branch would match.
        if (inAnyBranch.has(key) && !inFirstBranch.has(key)) continue;
        const v = buildValue(sub, root, key, role, depth + 1);
        if (v !== undefined) out[key] = v;
      }
      return out;
    }
    case "array": {
      const item = buildValue(schema.items, root, name, role, depth + 1);
      return item === undefined ? [] : [item];
    }
    case "integer":
    case "number": {
      let v = 1;
      if (schema.minimum !== undefined && v < schema.minimum) v = schema.minimum;
      if (schema.maximum !== undefined && v > schema.maximum) v = schema.maximum;
      return v;
    }
    case "boolean":
      return true;
    case "string":
      return stringFor(name, schema, role);
    default:
      return undefined;
  }
}

const indentOf = (line) => line.length - line.trimStart().length;
const isBlank = (line) => line.trim() === "" || line.trimStart().startsWith("#");

/** Direct children of the node at `parentIdx`, found by indentation alone. */
function childrenOf(lines, parentIdx) {
  const parentIndent = indentOf(lines[parentIdx]);
  const block = [];
  for (let j = parentIdx + 1; j < lines.length; j++) {
    if (isBlank(lines[j])) continue;
    if (indentOf(lines[j]) <= parentIndent) break;
    block.push(j);
  }
  if (block.length === 0) return [];
  const childIndent = Math.min(...block.map((j) => indentOf(lines[j])));
  return block
    .filter((j) => indentOf(lines[j]) === childIndent)
    .map((idx) => {
      const text = lines[idx].trimStart();
      const dash = text.startsWith("- ") || text === "-";
      const keyText = dash ? text.slice(1).trimStart() : text;
      const match = keyText.match(/^("[^"]*"|'[^']*'|[^:\s][^:]*?):(?:\s|$)/);
      const key = match ? match[1].replace(/^["']|["']$/g, "") : null;
      return { idx, indent: childIndent, key, dash };
    });
}

/** Last non-blank line inside the block that starts at `idx`. */
function blockEnd(lines, idx) {
  const indent = indentOf(lines[idx]);
  let end = idx;
  for (let j = idx + 1; j < lines.length; j++) {
    if (isBlank(lines[j])) continue;
    if (indentOf(lines[j]) <= indent) break;
    end = j;
  }
  return end;
}

const child = (lines, idx, key) => childrenOf(lines, idx).find((c) => c.key === key);
const hasExample = (lines, idx) =>
  childrenOf(lines, idx).some((c) => c.key === "example" || c.key === "examples");

/** Lines for an `example:` entry at `indent`, rendered as YAML block text. */
export function renderExample(value, indent) {
  const pad = " ".repeat(indent);
  if (isPlainObject(value) || Array.isArray(value)) {
    if (Object.keys(value).length > 0) {
      return yaml
        .dump({ example: value }, { lineWidth: -1, noRefs: true })
        .replace(/\n$/, "")
        .split("\n")
        .map((l) => pad + l);
    }
  }
  return [`${pad}example: ${yaml.dump(value, { lineWidth: -1, noRefs: true }).trim()}`];
}

/** Find every media type or parameter that needs an example, with its spec node. */
function collectTargets(lines, spec) {
  const targets = [];
  const pathsIdx = lines.indexOf("paths:");
  for (const pathEntry of childrenOf(lines, pathsIdx)) {
    const specItem = spec.paths[pathEntry.key];
    for (const methodEntry of childrenOf(lines, pathEntry.idx)) {
      if (!METHODS.includes(methodEntry.key)) continue;
      const op = specItem[methodEntry.key];
      const opId = op.operationId;
      const opIdx = methodEntry.idx;

      const rbEntry = child(lines, opIdx, "requestBody");
      if (rbEntry && op.requestBody.content) {
        const content = child(lines, rbEntry.idx, "content");
        for (const media of childrenOf(lines, content.idx)) {
          targets.push({
            opId,
            mediaIdx: media.idx,
            role: "request",
            node: op.requestBody.content[media.key],
            label: `${opId} request ${media.key}`,
          });
        }
      }

      const respEntry = child(lines, opIdx, "responses");
      for (const code of respEntry ? childrenOf(lines, respEntry.idx) : []) {
        if (!/^2\d\d$/.test(code.key)) continue;
        const response = op.responses[code.key];
        const content = child(lines, code.idx, "content");
        if (!content || !response.content) continue;
        for (const media of childrenOf(lines, content.idx)) {
          targets.push({
            opId,
            mediaIdx: media.idx,
            role: "response",
            node: response.content[media.key],
            label: `${opId} ${code.key} ${media.key}`,
          });
        }
      }

      const paramsEntry = child(lines, opIdx, "parameters");
      const params = paramsEntry ? childrenOf(lines, paramsEntry.idx).filter((c) => c.dash) : [];
      params.forEach((item, i) => {
        const param = op.parameters[i];
        targets.push({
          opId,
          mediaIdx: item.idx,
          role: "parameter",
          node: param,
          label: `${opId} parameter ${param.name}`,
        });
      });
    }
  }
  return targets;
}

/**
 * Plan the insertions for one spec. Returns { lines, added, unfilled }.
 * `unfilled` lists targets that have no schema to build from.
 */
export function addExamples(text, spec) {
  const lines = text.split("\n");
  const insertions = [];
  const unfilled = [];
  let added = 0;

  for (const target of collectTargets(lines, spec)) {
    if (hasExample(lines, target.mediaIdx)) continue;
    const schemaEntry = child(lines, target.mediaIdx, "schema");
    if (!schemaEntry || !target.node.schema) {
      unfilled.push(target.label);
      continue;
    }
    const name = target.role === "parameter" ? target.node.name : undefined;
    const value = buildValue(target.node.schema, spec, name, target.role);
    if (value === undefined) {
      unfilled.push(target.label);
      continue;
    }
    const errors = checkValue(value, target.node.schema, spec);
    if (errors.length > 0)
      throw new Error(`${target.label}: generated example is invalid: ${errors.join("; ")}`);
    insertions.push({ at: blockEnd(lines, schemaEntry.idx), indent: schemaEntry.indent, value });
    added++;
  }

  insertions.sort((a, b) => b.at - a.at);
  for (const ins of insertions)
    lines.splice(ins.at + 1, 0, ...renderExample(ins.value, ins.indent));
  return { text: lines.join("\n"), added, unfilled };
}

function main() {
  const check = process.argv.includes("--check");
  const text = readFileSync(SPEC_PATH, "utf8");
  const spec = yaml.load(text);
  const { text: next, added, unfilled } = addExamples(text, spec);
  if (!check) writeFileSync(SPEC_PATH, next, "utf8");
  console.log(JSON.stringify({ added, unfilled }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
