import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { addExamples, SPEC_PATH } from "../../../scripts/api-examples/generate.mjs";
import { checkValue } from "../../../scripts/api-examples/schema-check.mjs";

interface Node {
  schema?: unknown;
  example?: unknown;
  examples?: unknown;
}
interface Operation {
  operationId: string;
  requestBody?: { content?: Record<string, Node> };
  responses?: Record<string, { content?: Record<string, Node> }>;
  parameters?: Array<Node & { name: string }>;
}

const text = readFileSync(SPEC_PATH, "utf8");
const spec = load(text) as { paths: Record<string, Record<string, Operation>> };
const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];
const operations = Object.entries(spec.paths).flatMap(([path, item]) =>
  METHODS.filter((m) => item[m]).map((m) => ({ id: `${m.toUpperCase()} ${path}`, op: item[m] })),
);

const hasExample = (node: Node) => node.example !== undefined || node.examples !== undefined;
const successMedia = (op: Operation): Node[] =>
  Object.entries(op.responses ?? {})
    .filter(([code]) => /^2\d\d$/.test(code))
    .flatMap(([, r]) => Object.values(r.content ?? {}));
// An operation with no 2xx body (redirects, 204s, guidance-only routes) has nothing
// a schema can exemplify, so it is exempt from the success-example rule.
const hasSuccessBody = (op: Operation) => successMedia(op).length > 0;

describe("openapi.yaml operation examples", () => {
  it.each(operations.filter(({ op }) => op.requestBody))("$id has a request example", ({ op }) => {
    const media = Object.values(op.requestBody?.content ?? {});
    expect(media.some(hasExample)).toBe(true);
  });

  it.each(operations.filter(({ op }) => hasSuccessBody(op)))(
    "$id has a success example",
    ({ op }) => {
      expect(successMedia(op).some(hasExample)).toBe(true);
    },
  );

  it("every example matches its own schema", () => {
    const failures: string[] = [];
    for (const { id, op } of operations) {
      const nodes = [
        ...Object.values(op.requestBody?.content ?? {}),
        ...successMedia(op),
        ...(op.parameters ?? []),
      ];
      for (const node of nodes) {
        if (node.example === undefined || node.schema === undefined) continue;
        const errors = checkValue(node.example, node.schema, spec);
        if (errors.length > 0) failures.push(`${id}: ${errors.join("; ")}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("the committed spec is fully generated, so the generator has nothing left to add", () => {
    expect(addExamples(text, spec).added).toBe(0);
  });
});
