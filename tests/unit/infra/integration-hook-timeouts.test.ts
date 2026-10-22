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

interface HookTimeoutMatch {
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

function isVitestAfterAllCallee(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr)) {
    return expr.text === "afterAll";
  }
  if (
    ts.isPropertyAccessExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    (expr.expression.text === "vi" || expr.expression.text === "vitest") &&
    expr.name.text === "afterAll"
  ) {
    return true;
  }
  return false;
}

/**
 * Extracts every `afterAll(fn, timeout)` call in `source` that passes a second
 * argument, using TypeScript's AST parser so regex literals, template literal
 * interpolations, comments, and trailing commas cannot desynchronize scanning.
 */
function findAfterAllTimeoutArgs(source: string, fileName = "sample.ts"): HookTimeoutMatch[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const matches: HookTimeoutMatch[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      isVitestAfterAllCallee(node.expression) &&
      node.arguments.length >= 2
    ) {
      const secondArg = node.arguments[1];
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      matches.push({
        line: line + 1,
        timeoutArg: secondArg.getText(sf),
        timeoutMs: evaluateTimeoutExpression(secondArg),
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return matches;
}

describe("integration afterAll hook timeout policy (#3357)", () => {
  it("configures a global hookTimeout of at least 30_000ms in vitest.config.ts", () => {
    expect(rootConfig.test?.hookTimeout).toBeGreaterThanOrEqual(30_000);
  });

  it("extracts second-argument timeouts across comments, regexes, templates, and multi-line imports", () => {
    const sample = [
      "import {",
      "  beforeAll,",
      "  afterAll",
      '} from "vitest";',
      "// afterAll(async () => {}, 10_000);",
      "/* afterAll(async () => {}, 10_000); */",
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
      "afterAll(async () => {",
      "  await testApp.cleanup();",
      "}, { timeout: 10 * 1000 },);",
      "afterAll(async () => {",
      "  await testApp.cleanup();",
      "}, 100_000);",
    ].join("\n");

    expect(findAfterAllTimeoutArgs(sample)).toEqual([
      { line: 15, timeoutArg: "10_000", timeoutMs: 10_000 },
      { line: 18, timeoutArg: "{ timeout: 10 * 1000 }", timeoutMs: 10_000 },
      { line: 21, timeoutArg: "100_000", timeoutMs: 100_000 },
    ]);
  });

  it("does not override vitest hookTimeout with a 10_000ms afterAll timeout in tests/integration", () => {
    const files = integrationSourceFiles();
    expect(files.length).toBeGreaterThan(390);

    const offenders: string[] = [];
    for (const relPath of files) {
      const fullPath = path.join(repoRoot, relPath);
      const content = readFileSync(fullPath, "utf8");
      for (const match of findAfterAllTimeoutArgs(content, relPath)) {
        if (match.timeoutMs !== null && match.timeoutMs <= 10_000) {
          offenders.push(`${relPath}:${match.line} (${match.timeoutArg})`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
