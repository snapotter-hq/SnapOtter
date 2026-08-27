import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * AST scan for user-facing English literals in the web app (#906, #909):
 * JSX text nodes, user-facing string attributes, string literals rendered as
 * JSX children (ternary branches, && right sides, || / ?? fallbacks, string
 * concatenation, template literals), and literals that reach the screen via a
 * local variable. Everything user-visible must go through i18n keys;
 * intentional literals (format names, placeholder examples, units) live in
 * tool-ui-literal-allowlist.json.
 *
 * Known limits: a literal that travels through two locals before rendering, or
 * that lives in a module-scope object/array read back through a property
 * access, is still invisible here. Those have to be caught by review.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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
 * Template arguments of the two i18n composition helpers. `format(template,
 * values)` substitutes into argument 0; `plural(count, one, other)` picks
 * between arguments 1 and 2. A literal in one of those slots renders verbatim,
 * so it has to be reported: this sweep made both helpers the standard way to
 * build a sentence that carries an expression.
 */
function isComposedTemplateArgument(call: ts.CallExpression, arg: ts.Node): boolean {
  if (!ts.isIdentifier(call.expression)) return false;
  const index = call.arguments.indexOf(arg as ts.Expression);
  if (call.expression.text === "format") return index === 0;
  if (call.expression.text === "plural") return index === 1 || index === 2;
  return false;
}

/** Parent hops that keep a literal on its way to being rendered verbatim. */
function transparentParent(cur: ts.Node, parent: ts.Node): ts.Node | null {
  if (ts.isParenthesizedExpression(parent)) return parent;
  if (ts.isTemplateSpan(parent) || ts.isTemplateExpression(parent)) return parent;
  if (ts.isCallExpression(parent)) return isComposedTemplateArgument(parent, cur) ? parent : null;
  if (ts.isConditionalExpression(parent)) return parent.condition === cur ? null : parent;
  if (ts.isBinaryExpression(parent)) {
    const op = parent.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return parent.left === cur ? null : parent;
    if (
      op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.QuestionQuestionToken ||
      op === ts.SyntaxKind.PlusToken
    ) {
      return parent;
    }
  }
  return null;
}

/**
 * Walk up through render-transparent wrappers. Returns the JsxExpression the
 * node ultimately renders through, or null when it sits in a non-rendered
 * position (conditions, comparisons, call arguments, object properties).
 */
function renderedJsxExpression(node: ts.Node): ts.JsxExpression | null {
  let cur: ts.Node = node;
  let parent: ts.Node | undefined = cur.parent;
  while (parent) {
    const next = transparentParent(cur, parent);
    if (!next) break;
    cur = next;
    parent = cur.parent;
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

/** True when `node` reaches `root` through render-transparent hops only. */
function flowsTo(node: ts.Node, root: ts.Node): boolean {
  let cur: ts.Node = node;
  while (cur !== root) {
    const parent: ts.Node | undefined = cur.parent;
    if (!parent) return false;
    const next = transparentParent(cur, parent);
    if (!next) return false;
    cur = next;
  }
  return true;
}

function hasStatements(
  node: ts.Node,
): node is ts.Node & { statements: ts.NodeArray<ts.Statement> } {
  return (
    ts.isBlock(node) ||
    ts.isSourceFile(node) ||
    ts.isModuleBlock(node) ||
    ts.isCaseClause(node) ||
    ts.isDefaultClause(node)
  );
}

/** Does this binding (plain, destructured or nested) introduce `name`? */
function bindingIntroduces(binding: ts.BindingName, name: string): boolean {
  if (ts.isIdentifier(binding)) return binding.text === name;
  return binding.elements.some(
    (element) => ts.isBindingElement(element) && bindingIntroduces(element.name, name),
  );
}

/**
 * Resolve a rendered identifier to its nearest lexical `const`/`let`
 * declaration. Approximates scope by walking enclosing statement lists, so an
 * inner declaration shadows an outer one of the same name.
 *
 * Parameters shadow too, and in React they shadow constantly: `label`, `title`
 * and `name` are all prop names here. Walking past a function that binds the
 * identifier as a parameter would attribute a prop's value to an unrelated
 * outer const and report a string that never renders, so stop there instead.
 */
function resolveLocalDeclaration(id: ts.Identifier): ts.VariableDeclaration | null {
  let cur: ts.Node | undefined = id.parent;
  while (cur) {
    if (hasStatements(cur)) {
      for (const statement of cur.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        for (const decl of statement.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.name.text === id.text && decl.initializer) {
            return decl;
          }
        }
      }
    }
    if (
      ts.isFunctionLike(cur) &&
      cur.parameters.some((parameter) => bindingIntroduces(parameter.name, id.text))
    ) {
      return null;
    }
    cur = cur.parent;
  }
  return null;
}

function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  // template literal with expressions: report the static English parts
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))
    return node.text;
  return null;
}

function relativeToRepo(file: string): string {
  const rel = path.relative(REPO_ROOT, file);
  return rel.startsWith("..") ? file : rel;
}

function scanDirectory(dir: string, hits: LiteralHit[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (entry.isDirectory()) {
      scanDirectory(path.join(dir, entry.name), hits);
      continue;
    }
    const f = entry.name;
    if (!f.endsWith(".tsx")) continue;
    const full = path.join(dir, f);
    const code = readFileSync(full, "utf8");
    const sf = ts.createSourceFile(f, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const display = relativeToRepo(full);
    const seen = new Set<string>();
    const add = (kind: string, pos: number, text: string) => {
      const t = text.replace(/\s+/g, " ").trim();
      if (!t || skip(t)) return;
      const line = sf.getLineAndCharacterOfPosition(pos).line + 1;
      const key = `${line}|${t}`;
      if (seen.has(key)) return;
      seen.add(key);
      hits.push({ file: display, line, kind, text: t });
    };
    /** Literals inside a local's initializer that the local renders verbatim. */
    const addViaLocal = (id: ts.Identifier) => {
      const decl = resolveLocalDeclaration(id);
      const init = decl?.initializer;
      if (!init) return;
      const visit = (node: ts.Node) => {
        const text = literalText(node);
        if (text != null && flowsTo(node, init)) add("LOCAL", node.getStart(), text);
        ts.forEachChild(node, visit);
      };
      visit(init);
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
      } else if (ts.isIdentifier(node) && (isRenderedString(node) || isUserFacingAttrExpr(node))) {
        addViaLocal(node);
      }
      ts.forEachChild(node, walk);
    };
    walk(sf);
  }
}

export function scanToolUiLiterals(dirs: string | string[]): LiteralHit[] {
  const hits: LiteralHit[] = [];
  for (const dir of Array.isArray(dirs) ? dirs : [dirs]) scanDirectory(dir, hits);
  return hits;
}
