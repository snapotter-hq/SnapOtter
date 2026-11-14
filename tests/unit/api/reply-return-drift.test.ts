/**
 * An async route handler or hook that has already sent its response must
 * return the reply, not resolve undefined.
 *
 * Resolving undefined after a send makes Fastify's wrapThenable send a second
 * time while the app's async onSend hooks are still running. Depending on how
 * long those hooks take, that is a "Reply was already sent" warning on every
 * denied request (#4657) or an ERR_HTTP_HEADERS_SENT 500 (#4656, /llms.txt).
 *
 * The check parses every file under apps/api/src and, inside each async
 * function with a `reply` parameter, flags three shapes:
 *
 * - `if (!user) return;` where `user` came from a call that was passed `reply`
 *   (requirePermission, requireFullAdmin, requireAuth, ...). Those helpers send
 *   the 401/403 themselves before returning null.
 * - `if (!(await scimAuth(request, reply))) return;`, the same thing inline.
 * - `reply.send(...)` or `reply.redirect(...)` as a statement followed by a
 *   bare `return;`, or as the last statement of the function body.
 *
 * Known limits: it matches spellings rather than types, so a helper that is
 * passed `reply` but can return null without sending would be flagged wrongly
 * (none do today; requireOwnershipOrPermission is the one that could, and it
 * has no callers). It does not follow a send inside a nested block that then
 * falls off the end of the function. Runtime coverage for representative
 * routes lives in denied-route-single-send.test.ts.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const API_SRC = join(__dirname, "../../../apps/api/src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

const isAsync = (fn: ts.SignatureDeclaration) =>
  ts.canHaveModifiers(fn) &&
  (ts.getModifiers(fn)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false);

const hasReplyParam = (fn: ts.SignatureDeclaration) =>
  fn.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === "reply");

function unwrap(expr: ts.Expression): ts.Expression {
  let e = expr;
  while (ts.isParenthesizedExpression(e) || ts.isAwaitExpression(e) || ts.isNonNullExpression(e)) {
    e = e.expression;
  }
  return e;
}

/** True when `node` contains a call that is passed `reply`, outside nested functions. */
function passesReply(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (
      ts.isCallExpression(n) &&
      n.arguments.some((arg) => ts.isIdentifier(arg) && arg.text === "reply")
    ) {
      found = true;
      return;
    }
    if (!ts.isFunctionLike(n)) ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** `reply.….send(...)` or `reply.….redirect(...)`, optionally awaited or voided. */
function isReplySend(expr: ts.Expression): boolean {
  let e = expr;
  if (ts.isAwaitExpression(e) || ts.isVoidExpression(e)) e = e.expression;
  if (!ts.isCallExpression(e) || !ts.isPropertyAccessExpression(e.expression)) return false;
  const method = e.expression.name.text;
  if (method !== "send" && method !== "redirect") return false;
  let root: ts.Expression = e;
  while (ts.isCallExpression(root) || ts.isPropertyAccessExpression(root)) {
    root = root.expression;
  }
  return ts.isIdentifier(root) && root.text === "reply";
}

interface Finding {
  file: string;
  line: number;
  shape: string;
}

function scan(sf: ts.SourceFile): Finding[] {
  const findings: Finding[] = [];
  const at = (node: ts.Node, shape: string) =>
    findings.push({
      file: relative(API_SRC, sf.fileName),
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      shape,
    });

  const visit = (
    node: ts.Node,
    outerFn: ts.SignatureDeclaration | undefined,
    outerSentVars: Set<string>,
  ) => {
    const ownFn = ts.isFunctionLike(node);
    const fn = ownFn ? node : outerFn;
    const sentVars = ownFn ? new Set<string>() : outerSentVars;
    if (fn && isAsync(fn) && hasReplyParam(fn)) {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        passesReply(node.initializer)
      ) {
        sentVars.add(node.name.text);
      }

      if (ts.isReturnStatement(node) && !node.expression) {
        const parent = node.parent;
        const guard = ts.isIfStatement(parent)
          ? parent
          : ts.isBlock(parent) && ts.isIfStatement(parent.parent)
            ? parent.parent
            : undefined;
        const cond = guard?.expression;
        if (
          cond &&
          ts.isPrefixUnaryExpression(cond) &&
          cond.operator === ts.SyntaxKind.ExclamationToken
        ) {
          const operand = unwrap(cond.operand);
          if (ts.isCallExpression(operand) && passesReply(operand)) {
            at(node, "bare return after a helper that was passed reply");
          } else if (ts.isIdentifier(operand) && sentVars.has(operand.text)) {
            at(node, `bare return after \`${operand.text}\` came from a helper passed reply`);
          }
        }
        if (ts.isBlock(parent)) {
          const prev = parent.statements[parent.statements.indexOf(node) - 1];
          if (prev && ts.isExpressionStatement(prev) && isReplySend(prev.expression)) {
            at(node, "bare return after reply.send()");
          }
        }
      }

      const body = (fn as ts.FunctionLikeDeclaration).body;
      if (
        ts.isExpressionStatement(node) &&
        body &&
        ts.isBlock(body) &&
        node.parent === body &&
        body.statements.at(-1) === node &&
        isReplySend(node.expression)
      ) {
        at(node, "reply.send() is the last statement and the reply is not returned");
      }
    }
    ts.forEachChild(node, (child) => visit(child, fn, sentVars));
  };
  visit(sf, undefined, new Set());
  return findings;
}

/**
 * Findings left in place on purpose, counted per file. #4712 fixes these; when
 * a count drops, shrink it here so the exemption can't hide a new site.
 */
const KNOWN_UNFIXED: Record<string, number> = {
  "routes/batch.ts": 1,
  "routes/tools/ocr-pdf.ts": 1,
  "routes/tools/ocr.ts": 1,
  "routes/tools/pdf-to-image.ts": 4,
  "routes/tools/svg-to-raster.ts": 1,
};

describe("async handlers return the reply after sending", () => {
  const files = sourceFiles(API_SRC);

  it("finds the API source", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("no async function with a reply parameter resolves undefined after a send", () => {
    const all = files
      .map((file) =>
        ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true),
      )
      .flatMap(scan);
    const perFile = new Map<string, number>();
    for (const f of all) perFile.set(f.file, (perFile.get(f.file) ?? 0) + 1);

    const findings = all
      .filter((f) => !(f.file in KNOWN_UNFIXED))
      .map((f) => `${f.file}:${f.line} ${f.shape}`);
    expect(findings).toEqual([]);

    const exemptCounts = Object.fromEntries(
      Object.keys(KNOWN_UNFIXED).map((file) => [file, perFile.get(file) ?? 0]),
    );
    expect(exemptCounts).toEqual(KNOWN_UNFIXED);
  });

  it("flags each shape it is meant to catch", () => {
    const src = `
      async function a(request, reply) {
        const user = await requirePermission("x")(request, reply);
        if (!user) return;
      }
      async function b(request, reply) {
        if (!(await scimAuth(request, reply))) return;
      }
      async function c(request, reply) {
        reply.status(403).send({});
        return;
      }
      async function d(_request, reply) {
        reply.type("text/plain").send("x");
      }
      async function ok(request, reply) {
        const user = await requirePermission("x")(request, reply);
        if (!user) return reply;
        if (!(await scimAuth(request, reply))) return reply;
        return reply.send("x");
      }
      function syncHandler(request, reply) {
        const user = requireAuth(request, reply);
        if (!user) return;
      }
    `;
    const sf = ts.createSourceFile(join(API_SRC, "fixture.ts"), src, ts.ScriptTarget.Latest, true);
    expect(scan(sf).map((f) => f.line)).toEqual([4, 7, 11, 14]);
  });
});
