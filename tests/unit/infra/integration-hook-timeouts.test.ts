import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import rootConfig from "../../../vitest.config.ts";

const repoRoot = path.resolve(__dirname, "../../..");

/** Every .ts file under tests/integration, repo-relative, sorted. */
function integrationSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) out.push(path.relative(repoRoot, full));
    }
  };
  walk(path.join(repoRoot, "tests/integration"));
  return out.sort();
}

const LIFECYCLE_HOOKS = new Set(["beforeAll", "afterAll", "beforeEach", "afterEach"] as const);
type LifecycleHookName = "beforeAll" | "afterAll" | "beforeEach" | "afterEach";

interface HookTimeoutMatch {
  hook: LifecycleHookName;
  line: number;
  timeoutArg: string;
  timeoutMs: number | null;
}

function evaluateTimeoutExpression(expr: ts.Expression): number | null {
  if (ts.isNumericLiteral(expr)) {
    return Number(expr.text);
  }
  if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.PlusToken) {
    return evaluateTimeoutExpression(expr.operand);
  }
  if (ts.isParenthesizedExpression(expr)) {
    return evaluateTimeoutExpression(expr.expression);
  }
  if (ts.isBinaryExpression(expr)) {
    const left = evaluateTimeoutExpression(expr.left);
    const right = evaluateTimeoutExpression(expr.right);
    if (left === null || right === null) return null;
    if (expr.operatorToken.kind === ts.SyntaxKind.AsteriskToken) return left * right;
    if (expr.operatorToken.kind === ts.SyntaxKind.PlusToken) return left + right;
  }
  if (ts.isObjectLiteralExpression(expr)) {
    for (const prop of expr.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ((ts.isIdentifier(prop.name) && prop.name.text === "timeout") ||
          (ts.isStringLiteral(prop.name) && prop.name.text === "timeout"))
      ) {
        return evaluateTimeoutExpression(prop.initializer);
      }
    }
  }
  return null;
}

function getVitestLifecycleHookCallee(expr: ts.Expression): LifecycleHookName | null {
  if (ts.isIdentifier(expr) && LIFECYCLE_HOOKS.has(expr.text as LifecycleHookName)) {
    return expr.text as LifecycleHookName;
  }
  if (
    ts.isPropertyAccessExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    (expr.expression.text === "vi" || expr.expression.text === "vitest") &&
    LIFECYCLE_HOOKS.has(expr.name.text as LifecycleHookName)
  ) {
    return expr.name.text as LifecycleHookName;
  }
  return null;
}

/**
 * Extracts every Vitest lifecycle hook (`beforeAll`, `afterAll`, `beforeEach`,
 * `afterEach`) call in `source` that passes a second argument, using
 * TypeScript's AST parser so regex literals, template literal interpolations,
 * comments, and trailing commas cannot desynchronize scanning.
 */
function findLifecycleHookTimeoutArgs(source: string, fileName = "sample.ts"): HookTimeoutMatch[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const matches: HookTimeoutMatch[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.arguments.length >= 2) {
      const hook = getVitestLifecycleHookCallee(node.expression);
      if (hook !== null) {
        const secondArg = node.arguments[1];
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        matches.push({
          hook,
          line: line + 1,
          timeoutArg: secondArg.getText(sf),
          timeoutMs: evaluateTimeoutExpression(secondArg),
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return matches;
}

/**
 * Reject `<= 30_000` on any lifecycle hook (`beforeAll`, `afterAll`,
 * `beforeEach`, `afterEach`) so hooks inherit `vitest.config.ts` `hookTimeout`
 * (and respect `VITEST_HOOK_TIMEOUT`), plus any non-literal timeout expression
 * (`timeoutMs === null`).
 */
function isDisallowedHookTimeout(match: HookTimeoutMatch): boolean {
  return match.timeoutMs === null || match.timeoutMs <= 30_000;
}

describe("integration lifecycle hook timeout policy (#3357, #3584, #3595)", () => {
  it("configures a global hookTimeout of at least 30_000ms in vitest.config.ts", () => {
    expect(rootConfig.test?.hookTimeout).toBeGreaterThanOrEqual(30_000);
  });

  it("extracts second-argument timeouts across lifecycle hooks, comments, regexes, templates, and multi-line imports", () => {
    const sample = [
      "import {",
      "  beforeAll,",
      "  afterAll,",
      "  beforeEach,",
      "  afterEach",
      '} from "vitest";',
      "// afterAll(async () => {}, 10_000);",
      "/* beforeAll(async () => {}, 15_000); */",
      'const headerRe = /^attachment; filename="split-/',
      "const msg = `outer ${`it's afterAll(() => {}, 10_000)`}`;",
      "helper.afterAll(() => {}, 10_000);",
      "afterAll(async () => {",
      "  const parenRe = /\\(/;",
      "  await waitFor(async () => true, 10_000);",
      "  await testApp.cleanup();",
      "}, /* trailing comment */);",
      "afterAll(async () => {",
      "  await testApp.cleanup();",
      "}, 10_000);",
      "beforeAll(async () => {",
      "  await testApp.cleanup();",
      "}, 15_000);",
      "beforeAll(async () => {",
      "  await testApp.cleanup();",
      "}, 30_000);",
      "afterAll(async () => {",
      "  await testApp.cleanup();",
      "}, 30_000);",
      "vi.beforeEach(async () => {}, 20_000);",
      "beforeEach(async () => {}, (15_000 + +15_000));",
      "vitest.afterEach(async () => {}, { timeout: 10 * 1000 },);",
      'afterEach(async () => {}, { "timeout": 60_000 });',
      "afterAll(async () => {}, CUSTOM_TIMEOUT);",
      "beforeAll(async () => {",
      "  await testApp.cleanup();",
      "}, 60_000);",
      "afterAll(async () => {",
      "  await testApp.cleanup();",
      "}, 100_000);",
    ].join("\n");

    const matches = findLifecycleHookTimeoutArgs(sample);
    expect(matches).toEqual([
      { hook: "afterAll", line: 17, timeoutArg: "10_000", timeoutMs: 10_000 },
      { hook: "beforeAll", line: 20, timeoutArg: "15_000", timeoutMs: 15_000 },
      { hook: "beforeAll", line: 23, timeoutArg: "30_000", timeoutMs: 30_000 },
      { hook: "afterAll", line: 26, timeoutArg: "30_000", timeoutMs: 30_000 },
      { hook: "beforeEach", line: 29, timeoutArg: "20_000", timeoutMs: 20_000 },
      { hook: "beforeEach", line: 30, timeoutArg: "(15_000 + +15_000)", timeoutMs: 30_000 },
      {
        hook: "afterEach",
        line: 31,
        timeoutArg: "{ timeout: 10 * 1000 }",
        timeoutMs: 10_000,
      },
      {
        hook: "afterEach",
        line: 32,
        timeoutArg: '{ "timeout": 60_000 }',
        timeoutMs: 60_000,
      },
      { hook: "afterAll", line: 33, timeoutArg: "CUSTOM_TIMEOUT", timeoutMs: null },
      { hook: "beforeAll", line: 34, timeoutArg: "60_000", timeoutMs: 60_000 },
      { hook: "afterAll", line: 37, timeoutArg: "100_000", timeoutMs: 100_000 },
    ]);

    expect(
      matches
        .filter(isDisallowedHookTimeout)
        .map((match) => `${match.hook}:${match.line} (${match.timeoutArg})`),
    ).toEqual([
      "afterAll:17 (10_000)",
      "beforeAll:20 (15_000)",
      "beforeAll:23 (30_000)",
      "afterAll:26 (30_000)",
      "beforeEach:29 (20_000)",
      "beforeEach:30 ((15_000 + +15_000))",
      "afterEach:31 ({ timeout: 10 * 1000 })",
      "afterAll:33 (CUSTOM_TIMEOUT)",
    ]);
  });

  it("does not lower vitest hookTimeout or pass redundant lifecycle hook timeouts in tests/integration", () => {
    const files = integrationSourceFiles();
    expect(files.length).toBeGreaterThan(390);

    const offenders: string[] = [];
    for (const relPath of files) {
      const fullPath = path.join(repoRoot, relPath);
      const content = readFileSync(fullPath, "utf8");
      for (const match of findLifecycleHookTimeoutArgs(content, relPath)) {
        if (isDisallowedHookTimeout(match)) {
          offenders.push(`${relPath}:${match.line} ${match.hook} (${match.timeoutArg})`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
