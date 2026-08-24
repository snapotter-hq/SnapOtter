import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * AST scan for user-facing English literals in tool settings panels (#906):
 * JSX text nodes, user-facing string attributes, and string literals rendered
 * as JSX children (ternary branches, && right sides, || / ?? fallbacks, and
 * string concatenation). Everything user-visible must go through i18n keys;
 * intentional literals (format names, placeholder examples, units) live in
 * tool-ui-literal-allowlist.json.
 */

const ATTRS = new Set(["placeholder", "title", "aria-label", "alt", "label"]);

// Never user-copy: units, separators, symbols, hex masks, ALL-CAPS format
// names, HTML entities, template variables, bare domains, ellipsis-only.
const NEVER_COPY =
  /^([%×x·.:/()\d\s-]+|px|ms|deg|kbps|Hz|auto|serif|monospace|sans-serif|#[A-Za-z0-9]+|[A-Z0-9 :\-/().]+|&[a-z]+;|\{\{[a-z]+\}\}|[a-z0-9.-]+\.(com|org|net)|\.{3}.*)$/;

export interface LiteralHit {
  file: string;
  line: number;
  kind: string;
  text: string;
}

function skip(s: string): boolean {
  return !/[a-zA-Z]{2}/.test(s) || NEVER_COPY.test(s.trim());
}

/**
 * Walk up through render-transparent wrappers (parens, ternary branches, the
 * right side of &&, || / ?? fallbacks, + concatenation, template spans).
 * Returns the JsxExpression the literal ultimately renders through, or null
 * when the literal sits in a non-rendered position (conditions, comparisons,
 * call arguments, object properties).
 */
function renderedJsxExpression(node: ts.Node): ts.JsxExpression | null {
  let cur: ts.Node = node;
  let parent: ts.Node | undefined = cur.parent;
  while (parent) {
    if (ts.isParenthesizedExpression(parent)) {
      cur = parent;
      parent = cur.parent;
      continue;
    }
    if (ts.isTemplateSpan(parent) || ts.isTemplateExpression(parent)) {
      cur = ts.isTemplateSpan(parent) ? parent.parent : parent;
      parent = cur.parent;
      continue;
    }
    if (ts.isConditionalExpression(parent)) {
      if (parent.condition === cur) return null;
      cur = parent;
      parent = cur.parent;
      continue;
    }
    if (ts.isBinaryExpression(parent)) {
      const op = parent.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
        if (parent.left === cur) return null;
        cur = parent;
        parent = cur.parent;
        continue;
      }
      if (
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken ||
        op === ts.SyntaxKind.PlusToken
      ) {
        cur = parent;
        parent = cur.parent;
        continue;
      }
      return null;
    }
    break;
  }
  return parent && ts.isJsxExpression(parent) ? parent : null;
}

function isRenderedString(node: ts.Node): boolean {
  const expr = renderedJsxExpression(node);
  return !!expr && !!expr.parent && (ts.isJsxElement(expr.parent) || ts.isJsxFragment(expr.parent));
}

/** Literal inside a user-facing attribute's expression: label={x ? "A" : "B"} */
function isUserFacingAttrExpr(node: ts.Node): boolean {
  const expr = renderedJsxExpression(node);
  return (
    !!expr &&
    !!expr.parent &&
    ts.isJsxAttribute(expr.parent) &&
    ATTRS.has(expr.parent.name.getText())
  );
}

export function scanToolUiLiterals(dir: string): LiteralHit[] {
  const hits: LiteralHit[] = [];
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .sort()) {
    const code = readFileSync(path.join(dir, f), "utf8");
    const sf = ts.createSourceFile(f, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const seen = new Set<string>();
    const add = (kind: string, pos: number, text: string) => {
      const t = text.replace(/\s+/g, " ").trim();
      if (!t || skip(t)) return;
      const line = sf.getLineAndCharacterOfPosition(pos).line + 1;
      const key = `${line}|${t}`;
      if (seen.has(key)) return;
      seen.add(key);
      hits.push({ file: f, line, kind, text: t });
    };
    const literalText = (node: ts.Node): string | null => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
      // template literal with expressions: report the static English parts
      if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))
        return node.text;
      return null;
    };
    const walk = (node: ts.Node) => {
      if (ts.isJsxText(node)) add("TEXT", node.getStart(), node.text);
      if (
        ts.isJsxAttribute(node) &&
        ATTRS.has(node.name.getText()) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer)
      ) {
        add(`ATTR:${node.name.getText()}`, node.getStart(), node.initializer.text);
      }
      const text = literalText(node);
      if (text != null) {
        if (isRenderedString(node)) add("EXPR", node.getStart(), text);
        else if (isUserFacingAttrExpr(node)) add("ATTREXPR", node.getStart(), text);
      }
      ts.forEachChild(node, walk);
    };
    walk(sf);
  }
  return hits;
}
