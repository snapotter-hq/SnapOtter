import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * AST scan for user-facing English literals in the web app (#906, #909):
 * JSX text nodes, user-facing string attributes, string literals rendered as
 * JSX children (ternary branches, && right sides, || / ?? fallbacks, string
 * concatenation, template literals), and literals that reach the screen via a
 * local variable (its initializer, a parameter or destructuring default, or a
 * later assignment to a `let`). Everything user-visible must go through i18n
 * keys; intentional literals (format names, placeholder examples, units) live
 * in tool-ui-literal-allowlist.json.
 *
 * Labels held in data structures (#922) are reported without tracing them to a
 * render site: any literal assigned to a copy-named property (PROP_NAMES) in an
 * object literal counts, because a label array is read back through property
 * accesses, lookups and child components that no file-local analysis can
 * follow. So does a literal handed to an error/message state setter or to
 * confirm()/alert(), which reaches the screen through state or a native dialog.
 *
 * Known limits: a literal that travels through two locals before rendering,
 * object keys used as display text (`Object.keys(PRESETS)`), and strings built
 * in .ts files are still invisible here. Those have to be caught by review.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ATTRS = new Set(["placeholder", "title", "aria-label", "alt", "label"]);

/** Object-literal property names that hold display copy (#922). */
const PROP_NAMES = new Set([
  "label",
  "title",
  "description",
  "desc",
  "placeholder",
  "hint",
  "tooltip",
  "text",
  "name",
  "message",
]);

/** State setters and native dialogs whose string argument reaches the screen. */
const MESSAGE_SINK = /^(set\w*(Error|Message)|confirm|alert)$/;

// A property value shaped like an identifier ("crosshair", "move-tool") is a
// key or a mode, not copy; display labels in this app are capitalized.
const IDENTIFIER_SHAPED = /^[a-z][a-zA-Z0-9]*([-_][a-zA-Z0-9]+)*$/;

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

/**
 * The binding (parameter, variable or destructuring element) that introduces
 * `name` inside `binding`, if any.
 */
function findBinding(
  binding: ts.BindingName,
  name: string,
): ts.BindingElement | ts.Identifier | null {
  if (ts.isIdentifier(binding)) return binding.text === name ? binding : null;
  for (const element of binding.elements) {
    if (!ts.isBindingElement(element)) continue;
    if (ts.isIdentifier(element.name) && element.name.text === name) return element;
    const nested = findBinding(element.name, name);
    if (nested) return nested;
  }
  return null;
}

/** The value a binding defaults to: `{ label = "Cancel" }` or `(caption = "x")`. */
function bindingDefault(
  found: ts.BindingElement | ts.Identifier,
  owner: ts.ParameterDeclaration | ts.VariableDeclaration,
): ts.Expression[] {
  if (ts.isBindingElement(found)) return found.initializer ? [found.initializer] : [];
  return owner.initializer ? [owner.initializer] : [];
}

/** Right-hand sides of every `name = ...` assignment under `scope`. */
function assignmentsTo(scope: ts.Node, name: string): ts.Expression[] {
  const found: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      node.left.text === name
    ) {
      found.push(node.right);
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return found;
}

/**
 * Resolve a rendered identifier to the expressions that can supply its value:
 * the nearest lexical `const`/`let` initializer (plus later assignments when
 * it is a `let`), or the default of the parameter that binds it. Approximates
 * scope by walking enclosing statement lists, so an inner declaration shadows
 * an outer one of the same name.
 *
 * Parameters shadow too, and in React they shadow constantly: `label`, `title`
 * and `name` are all prop names here. Walking past a function that binds the
 * identifier as a parameter would attribute a prop's value to an unrelated
 * outer const and report a string that never renders, so stop there and take
 * only the parameter's own default.
 */
function resolveLocalSources(id: ts.Identifier): ts.Expression[] {
  let cur: ts.Node | undefined = id.parent;
  while (cur) {
    if (hasStatements(cur)) {
      for (const statement of cur.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        const list = statement.declarationList;
        for (const decl of list.declarations) {
          const found = findBinding(decl.name, id.text);
          if (!found) continue;
          const sources = ts.isIdentifier(decl.name)
            ? decl.initializer
              ? [decl.initializer]
              : []
            : bindingDefault(found, decl);
          if (list.flags & ts.NodeFlags.Let) sources.push(...assignmentsTo(cur, id.text));
          return sources;
        }
      }
    }
    if (ts.isFunctionLike(cur)) {
      for (const parameter of cur.parameters) {
        const found = findBinding(parameter.name, id.text);
        if (found) return bindingDefault(found, parameter);
      }
    }
    cur = cur.parent;
  }
  return [];
}

/** Walk up through render-transparent wrappers; returns the outermost node. */
function outermostTransparent(node: ts.Node): ts.Node {
  let cur: ts.Node = node;
  while (cur.parent) {
    const next = transparentParent(cur, cur.parent);
    if (!next) break;
    cur = next;
  }
  return cur;
}

/** `{ label: "Grid" }`: a literal that is the value of a copy-named property. */
function isCopyPropertyValue(node: ts.Node): boolean {
  const top = outermostTransparent(node);
  const prop = top.parent;
  return (
    !!prop &&
    ts.isPropertyAssignment(prop) &&
    prop.initializer === top &&
    ts.isObjectLiteralExpression(prop.parent) &&
    (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) &&
    PROP_NAMES.has(prop.name.text)
  );
}

/** `setError("Failed")`, `confirm("Delete?")`: a literal handed to a message sink. */
function isMessageSinkArgument(node: ts.Node): boolean {
  const top = outermostTransparent(node);
  const call = top.parent;
  if (!call || !ts.isCallExpression(call) || !call.arguments.includes(top as ts.Expression)) {
    return false;
  }
  const callee = call.expression;
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "window"
      ? callee.name.text
      : null;
  return !!name && MESSAGE_SINK.test(name);
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
      for (const source of resolveLocalSources(id)) {
        const visit = (node: ts.Node) => {
          const text = literalText(node);
          if (text != null && flowsTo(node, source)) add("LOCAL", node.getStart(), text);
          ts.forEachChild(node, visit);
        };
        visit(source);
      }
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
        else if (isCopyPropertyValue(node)) {
          if (!IDENTIFIER_SHAPED.test(text.trim())) add("PROP", node.getStart(), text);
        } else if (isMessageSinkArgument(node)) add("SINK", node.getStart(), text);
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
