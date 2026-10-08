/**
 * A route that reads multipart must answer a failed read through
 * multipartFailure(), so an over-limit upload gets 413 instead of a
 * hard-coded 400 (#1341). 45 route files spelled a 400 out by hand, two of
 * them with a different error string, so this checks structure, not one message.
 *
 * The check parses each route file and pairs every read with its own catch
 * (#2157). Counting calls per file could not: a spare call elsewhere hid a
 * route that went back to a hand-written 400 (pdf-to-image.ts shares one
 * reader between three routes), a call whose result was thrown away still
 * counted, and a read spelled `multipartParts(...)` or `request.file()` was
 * never counted at all.
 *
 * Where a read throws matters more than where it is called. `request.parts()`
 * and `multipartParts()` are async generators: calling them never throws, and
 * the 413 for an over-limit file is raised while the loop body drains it. So a
 * read is paired at the `for await` that consumes it (or the `await` for
 * `request.file()` and the shared readers), and the catch that counts has to
 * bind multipartFailure()'s result from the caught error and answer with both
 * its status and its body.
 *
 * Known limits, which the guard does not try to close: it only parses
 * apps/api/src/routes (a reader in lib/ or a plugin is invisible to it, and so
 * is a route calling a reader imported from another file), it matches
 * spellings rather than resolving types, and a catch that branches between the
 * helper and a literal status (features.ts does, legitimately) passes. A
 * route-level test that sends an over-limit file would cover what static
 * analysis can't.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROUTES = join(__dirname, "../../../apps/api/src/routes");

/**
 * Routes whose reads answer a failure another way. `how` is the helper their
 * catch must call, or "error handler" for reads that let the error reach the
 * app's error handler, which answers 413 (#1280): either no catching try, or a
 * catch that only cleans up and rethrows. `reads` pins how many such reads the
 * file has, so a new one has to be added here on purpose.
 */
type Handled = { how: "ocrUploadErrorStatus" } | { how: "error handler"; reads: number };

const HANDLED_ELSEWHERE: Record<string, Handled> = {
  // Map the error through ocrUploadErrorStatus (lib/ocr-limits.ts), which
  // already answers 413 for an over-limit read and 503 for storage faults.
  "pipeline.ts": { how: "ocrUploadErrorStatus" },
  "batch.ts": { how: "ocrUploadErrorStatus" },
  "tools/ocr.ts": { how: "ocrUploadErrorStatus" },
  "tools/ocr-pdf.ts": { how: "ocrUploadErrorStatus" },
  "files.ts": { how: "error handler", reads: 2 },
  "user-files.ts": { how: "error handler", reads: 2 },
  "file-preview.ts": { how: "error handler", reads: 1 },
};

/**
 * Functions that read multipart on behalf of their callers. The loop inside is
 * exempt; every call to the function is checked like a read instead, and the
 * function may not be exported or passed around as a value.
 */
const SHARED_READERS: Record<string, string[]> = {
  "tools/pdf-to-image.ts": ["readPdfFromParts"],
};

const RECEIVERS = new Set(["request", "req"]);
const READ_METHODS = new Set(["parts", "file", "files", "saveRequestFiles"]);
const ROUTE_VERBS = new Set(["get", "post", "put", "patch", "delete", "route", "all"]);

interface Config {
  handled?: Handled;
  sharedReaders?: string[];
}

interface Finding {
  line: number;
  what: string;
}

function parse(name: string, src: string): ts.SourceFile {
  return ts.createSourceFile(name, src, ts.ScriptTarget.Latest, true);
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function enclosingFn(node: ts.Node): ts.SignatureDeclaration | undefined {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n)) return n;
  }
  return undefined;
}

/** The nearest try in the same function whose catch would take a throw from `node`. */
function nearestTry(node: ts.Node): ts.TryStatement | undefined {
  let child: ts.Node = node;
  for (let n: ts.Node | undefined = node.parent; n; child = n, n = n.parent) {
    if (ts.isFunctionLike(n)) return undefined;
    // A try with no catch (try/finally) lets the error through, so keep climbing.
    if (ts.isTryStatement(n) && n.tryBlock === child && n.catchClause) return n;
  }
  return undefined;
}

const bodyOf = (fn: ts.SignatureDeclaration): ts.Node =>
  (fn as ts.FunctionLikeDeclaration).body ?? fn;

/** The name a read is stored under: `const x = read` or `x = read`. */
function assignedName(expr: ts.Node): string | null {
  const parent = expr.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isIdentifier(parent.left)
  ) {
    return parent.left.text;
  }
  return null;
}

/** Visit a subtree without entering nested functions, which may never run. */
function walkSameFn(root: ts.Node, visit: (node: ts.Node) => void) {
  const go = (node: ts.Node) => {
    visit(node);
    ts.forEachChild(node, (child) => {
      if (!ts.isFunctionLike(child)) go(child);
    });
  };
  go(root);
}

function nameOf(fn: ts.SignatureDeclaration | undefined): string | undefined {
  if (!fn) return undefined;
  if ("name" in fn && fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  const parent = fn.parent;
  return parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)
    ? parent.name.text
    : undefined;
}

/** True for the callback handed straight to `app.post(...)` and friends. */
function isRouteHandler(fn: ts.SignatureDeclaration | undefined): boolean {
  const call = fn?.parent;
  return (
    !!fn &&
    !!call &&
    ts.isCallExpression(call) &&
    call.arguments.includes(fn as unknown as ts.Expression) &&
    ts.isPropertyAccessExpression(call.expression) &&
    ROUTE_VERBS.has(call.expression.name.text)
  );
}

/**
 * True when the catch binds `helper(<the caught error>)` and answers with what
 * it returns: its status as the reply status and, for multipartFailure, its body
 * as what is sent. A bare call, `void helper(...)`, a variable nothing reads, a
 * hand-written status next to `failure.body`, or `failure.status` next to a
 * hand-written body each leave the route answering something else.
 */
function catchAnswersWith(catchClause: ts.CatchClause, helper: string): boolean {
  const caught = catchClause.variableDeclaration?.name;
  if (!caught || !ts.isIdentifier(caught)) return false;

  const bound = new Set<string>();
  walkSameFn(catchClause.block, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === helper &&
      node.initializer.arguments.length === 1 &&
      ts.isIdentifier(node.initializer.arguments[0]) &&
      node.initializer.arguments[0].text === caught.text
    ) {
      bound.add(node.name.text);
    }
  });
  if (bound.size === 0) return false;

  const isBound = (expr: ts.Expression) => ts.isIdentifier(expr) && bound.has(expr.text);
  const fieldOfBound = (expr: ts.Node, field: string) =>
    ts.isPropertyAccessExpression(expr) && expr.name.text === field && isBound(expr.expression);

  let statusOk = false;
  let bodyOk = helper !== "multipartFailure";
  walkSameFn(catchClause.block, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["status", "code"].includes(node.expression.name.text) &&
      node.arguments.length === 1
    ) {
      const arg = node.arguments[0];
      if (helper === "multipartFailure" ? fieldOfBound(arg, "status") : isBound(arg)) {
        statusOk = true;
      }
    }
    if (helper === "multipartFailure" && fieldOfBound(node, "body")) {
      const parent = node.parent;
      const sentOrReturned =
        ts.isReturnStatement(parent) ||
        (ts.isCallExpression(parent) &&
          ts.isPropertyAccessExpression(parent.expression) &&
          parent.expression.name.text === "send");
      if (sentOrReturned) bodyOk = true;
    }
  });
  return statusOk && bodyOk;
}

/** A catch that only cleans up and rethrows the caught error unchanged. */
function isBareRethrow(catchClause: ts.CatchClause): boolean {
  const caught = catchClause.variableDeclaration?.name;
  if (!caught || !ts.isIdentifier(caught)) return false;
  const statements = catchClause.block.statements;
  const last = statements[statements.length - 1];
  if (!last || !ts.isThrowStatement(last)) return false;
  if (!ts.isIdentifier(last.expression) || last.expression.text !== caught.text) return false;
  let answers = false;
  walkSameFn(catchClause.block, (node) => {
    if (ts.isReturnStatement(node)) answers = true;
  });
  return !answers;
}

interface Analysis {
  findings: Finding[];
  reads: number;
}

/** Every multipart read in a file, and each one not answered the way the file's rule says. */
function analyze(name: string, src: string, config: Config = {}): Analysis {
  const sf = parse(name, src);
  const shared = config.sharedReaders ?? [];
  const helper =
    config.handled?.how === "ocrUploadErrorStatus" ? "ocrUploadErrorStatus" : "multipartFailure";
  const errorHandlerFile = config.handled?.how === "error handler";
  const findings: Finding[] = [];
  const flag = (node: ts.Node, what: string) => findings.push({ line: lineOf(sf, node), what });
  let unguarded = 0;

  // multipartParts() can be imported under an alias or as a namespace.
  const aliases = new Set(["multipartParts"]);
  const namespaces = new Set<string>();
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (!statement.moduleSpecifier.text.endsWith("multipart-parts.js")) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) {
        if ((el.propertyName ?? el.name).text === "multipartParts") aliases.add(el.name.text);
      }
    }
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
  }

  const reads: Array<{ node: ts.CallExpression; spelling: string; sharedCall: boolean }> = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee)) {
        const method = callee.name.text;
        const known = ts.isIdentifier(callee.expression) && RECEIVERS.has(callee.expression.text);
        if (READ_METHODS.has(method) && known) {
          reads.push({
            node,
            spelling: `${(callee.expression as ts.Identifier).text}.${method}()`,
            sharedCall: false,
          });
        } else if (method === "parts" || method === "saveRequestFiles") {
          flag(node, `${callee.getText(sf)}() on a receiver this guard doesn't scan`);
        } else if ((method === "file" || method === "files") && node.arguments.length <= 1) {
          // archive.file(path, options) takes two; a multipart read takes none.
          flag(node, `${callee.getText(sf)}() on a receiver this guard doesn't scan`);
        } else if (method === "multipartParts") {
          if (ts.isIdentifier(callee.expression) && namespaces.has(callee.expression.text)) {
            reads.push({ node, spelling: "multipartParts()", sharedCall: false });
          } else {
            flag(node, `${callee.getText(sf)}() through a receiver this guard doesn't scan`);
          }
        }
      } else if (ts.isIdentifier(callee)) {
        if (aliases.has(callee.text)) {
          reads.push({ node, spelling: `${callee.text}()`, sharedCall: false });
        } else if (shared.includes(callee.text)) {
          reads.push({ node, spelling: `${callee.text}()`, sharedCall: true });
        }
      }
    }
    // request["parts"](): same read, spelled so a text search misses it.
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      RECEIVERS.has(node.expression.text) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      READ_METHODS.has(node.argumentExpression.text)
    ) {
      flag(node, `${node.getText(sf)} reads multipart through element access`);
    }
    // request.parts handed around as a value (.call, .bind, an alias).
    if (
      ts.isPropertyAccessExpression(node) &&
      READ_METHODS.has(node.name.text) &&
      ts.isIdentifier(node.expression) &&
      RECEIVERS.has(node.expression.text) &&
      !(ts.isCallExpression(node.parent) && node.parent.expression === node)
    ) {
      flag(node, `${node.getText(sf)} is used as a value, not called`);
    }
    // const { parts } = request
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      ts.isIdentifier(node.initializer) &&
      RECEIVERS.has(node.initializer.text)
    ) {
      for (const el of node.name.elements) {
        const key = (el.propertyName ?? el.name).getText(sf);
        if (READ_METHODS.has(key)) flag(el, `${key} is destructured off ${node.initializer.text}`);
      }
    }
    // A shared reader referenced other than by calling it: its callers can't be checked.
    if (
      ts.isIdentifier(node) &&
      shared.includes(node.text) &&
      !(ts.isCallExpression(node.parent) && node.parent.expression === node) &&
      !(ts.isFunctionDeclaration(node.parent) && node.parent.name === node)
    ) {
      flag(node, `shared reader ${node.text} is used as a value, not called`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  for (const { node: call, spelling, sharedCall } of reads) {
    const fn = enclosingFn(call);
    // The shared reader's own read: its callers are checked instead.
    const insideSharedReader =
      !sharedCall && !!fn && shared.includes(nameOf(fn) ?? "") && !nearestTry(call);

    const parent = call.parent;
    if (ts.isPropertyAccessExpression(parent) && ["catch", "then"].includes(parent.name.text)) {
      flag(
        call,
        `${spelling} has a .${parent.name.text}() chained on it, which swallows its error`,
      );
      continue;
    }

    // Where does this read throw? Collect the sites that consume it.
    const sites: ts.Node[] = [];
    const loops: ts.ForOfStatement[] = [];
    if (ts.isForOfStatement(parent) && parent.expression === call) {
      loops.push(parent);
    } else if (ts.isAwaitExpression(parent)) {
      sites.push(parent);
      // await request.file(): the 413 comes from reading the file, not from the await.
      const data = assignedName(parent);
      if (data && fn) {
        walkSameFn(bodyOf(fn), (node) => {
          if (
            ts.isPropertyAccessExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === data &&
            ["toBuffer", "file"].includes(node.name.text)
          ) {
            sites.push(node);
          }
        });
      }
    } else {
      const variable = assignedName(call);
      if (variable && fn) {
        walkSameFn(bodyOf(fn), (node) => {
          if (
            ts.isForOfStatement(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === variable
          ) {
            loops.push(node);
          }
        });
        if (loops.length === 0) {
          flag(call, `${spelling} is assigned to ${variable} but never iterated in this function`);
        }
      } else if (sharedCall) {
        sites.push(call);
      } else {
        flag(call, `${spelling} isn't iterated or awaited where it is called`);
      }
    }
    sites.push(...loops);

    let counted = false;
    for (const site of insideSharedReader ? [] : sites) {
      const tryNode = nearestTry(site);
      if (tryNode?.catchClause) {
        if (catchAnswersWith(tryNode.catchClause, helper)) continue;
        if (errorHandlerFile && isBareRethrow(tryNode.catchClause)) {
          if (!counted) unguarded++;
          counted = true;
          continue;
        }
        flag(
          site,
          `${spelling} (read at line ${lineOf(sf, call)}) throws inside a try whose catch doesn't answer through ${helper}(...)`,
        );
      } else if (errorHandlerFile) {
        if (!isRouteHandler(enclosingFn(site))) {
          flag(
            site,
            `${spelling} has no catch here, but sits in a helper whose caller may catch it`,
          );
          continue;
        }
        if (!counted) unguarded++;
        counted = true;
      } else {
        flag(
          site,
          `${spelling} (read at line ${lineOf(sf, call)}) throws outside any catch that calls ${helper}(...)`,
        );
      }
    }

    // A try inside the loop body that drains the part stream catches the 413 before
    // the outer catch sees it.
    for (const loop of loops) {
      const declaration = loop.initializer;
      const part =
        ts.isVariableDeclarationList(declaration) &&
        ts.isIdentifier(declaration.declarations[0]?.name)
          ? (declaration.declarations[0].name as ts.Identifier).text
          : null;
      if (!part) continue;
      walkSameFn(loop.statement, (node) => {
        if (!ts.isTryStatement(node) || !node.catchClause) return;
        let drains = false;
        walkSameFn(node.tryBlock, (inner) => {
          if (
            ts.isPropertyAccessExpression(inner) &&
            ts.isIdentifier(inner.expression) &&
            inner.expression.text === part &&
            ["file", "toBuffer"].includes(inner.name.text)
          ) {
            drains = true;
          }
          if (
            ts.isCallExpression(inner) &&
            inner.arguments.some((a) => ts.isIdentifier(a) && a.text === part)
          ) {
            drains = true;
          }
        });
        // A shared reader has no reply, so only a rethrow is acceptable there.
        const ok = insideSharedReader
          ? isBareRethrow(node.catchClause)
          : catchAnswersWith(node.catchClause, helper) || isBareRethrow(node.catchClause);
        if (drains && !ok) {
          flag(
            node,
            `a try reads ${part}'s stream inside the loop, and its catch answers without ${helper}(...)`,
          );
        }
      });
    }
  }

  if (
    errorHandlerFile &&
    config.handled?.how === "error handler" &&
    unguarded !== config.handled.reads
  ) {
    findings.push({
      line: 0,
      what: `${unguarded} multipart reads reach the error handler, but the list says ${config.handled.reads}`,
    });
  }
  return { findings, reads: reads.length };
}

const check = (name: string, src: string, config: Config = {}) =>
  analyze(name, src, config).findings;

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

const files = routeFiles(ROUTES).map((path) => ({
  name: relative(ROUTES, path),
  src: readFileSync(path, "utf8"),
}));

const configFor = (name: string): Config => ({
  handled: HANDLED_ELSEWHERE[name],
  sharedReaders: SHARED_READERS[name],
});

describe("multipart read failures go through multipartFailure (#1341, #2157)", () => {
  it("pairs every multipart read in every route with its own catch", () => {
    const offenders = files.flatMap(({ name, src }) =>
      check(name, src, configFor(name)).map((f) => `${name}:${f.line} ${f.what}`),
    );
    expect(offenders).toEqual([]);
  });

  it("still finds the reads it is meant to check", () => {
    // A guard that parses nothing passes everything.
    const perFile = files.map(({ name, src }) => analyze(name, src, configFor(name)).reads);
    expect(perFile.reduce((a, b) => a + b, 0)).toBeGreaterThan(50);
    expect(perFile.filter((n) => n > 0).length).toBeGreaterThan(45);
  });

  it("the lists have no stale entries", () => {
    for (const name of Object.keys(HANDLED_ELSEWHERE)) {
      const file = files.find((f) => f.name === name);
      expect(file, `${name} no longer exists`).toBeDefined();
      expect(
        analyze(name, file?.src ?? "", configFor(name)).reads,
        `${name} no longer reads multipart`,
      ).toBeGreaterThan(0);
    }
    for (const [name, readers] of Object.entries(SHARED_READERS)) {
      const file = files.find((f) => f.name === name);
      expect(file, `${name} no longer exists`).toBeDefined();
      for (const reader of readers) {
        expect(file?.src, `${name} no longer defines ${reader}`).toContain(`function ${reader}(`);
        const calls = (file?.src.split(`${reader}(`).length ?? 1) - 1;
        expect(calls, `${name} no longer calls ${reader}`).toBeGreaterThan(1);
        // Only this file's calls are checked, so the reader can't be exported.
        expect(file?.src, `${reader} is exported; check its callers elsewhere`).not.toMatch(
          new RegExp(`export\\s+(async\\s+)?function\\s+${reader}\\b`),
        );
      }
    }
  });

  it("no route hard-codes the old multipart parse error", () => {
    const offenders = files
      .filter(({ src }) => src.includes('"Failed to parse multipart request"'))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });
});

describe("the multipart guard catches what counting could not (#2157)", () => {
  const GOOD_CATCH =
    "const failure = multipartFailure(err); return reply.status(failure.status).send(failure.body);";
  const HAND_WRITTEN =
    'return reply.status(400).send({ error: "Failed to parse multipart request" });';
  const LOOP = "for await (const part of request.parts()) { void part; }";
  const route = (inner: string, catchBody = GOOD_CATCH) => `
    app.post("/r", async (request, reply) => {
      try { ${inner} } catch (err) { ${catchBody} }
    });
  `;
  const GOOD = route(LOOP);

  it("passes a read paired with its catch", () => {
    expect(check("r.ts", GOOD)).toEqual([]);
  });

  describe("the catch has to answer through the helper", () => {
    it("flags a route that went back to a hand-written 400 while spare calls sit elsewhere", () => {
      const src = `
        ${GOOD}
        ${route(LOOP, HAND_WRITTEN)}
        function elsewhere(err) { return multipartFailure(err); }
        function elsewhereToo(err) { return multipartFailure(err); }
      `;
      // Three used helper calls against two reads: the old count saw "enough".
      const findings = check("r.ts", src);
      expect(findings).toHaveLength(1);
      // It is the second route's read, not the first.
      const secondRead = src
        .split("\n")
        .findIndex(
          (l, i, all) =>
            l.includes("request.parts()") &&
            all.slice(0, i).some((p) => p.includes("request.parts()")),
        );
      expect(findings[0].line).toBe(secondRead + 1);
    });

    it("flags the same regression in the real pdf-to-image.ts, which has spare calls", () => {
      const name = "tools/pdf-to-image.ts";
      const real = files.find((f) => f.name === name)?.src ?? "";
      const config = configFor(name);

      // Swap the catch of the first route that reads multipart inline (the batch route)
      // for a hand-written 400. Found by position in the AST, so a reformat or a renamed
      // variable can't move the break to a different route.
      const sf = parse(name, real);
      let catchBlock: ts.Block | undefined;
      const find = (node: ts.Node) => {
        if (!catchBlock && ts.isCallExpression(node) && node.getText(sf) === "request.parts()") {
          catchBlock = nearestTry(node)?.catchClause?.block;
        }
        ts.forEachChild(node, find);
      };
      find(sf);
      if (!catchBlock)
        throw new Error("no route in pdf-to-image.ts reads multipart inline any more");
      const mutated = `${real.slice(0, catchBlock.getStart(sf))}{ ${HAND_WRITTEN} }${real.slice(catchBlock.getEnd())}`;

      expect(check(name, real, config)).toEqual([]);
      expect(check(name, mutated, config)).toHaveLength(1);
      // What the count-based check saw: still at least one helper call per read.
      const calls = (src: string, fn: string) => src.split(`${fn}(`).length - 1;
      expect(calls(mutated, "multipartFailure")).toBeGreaterThanOrEqual(
        calls(mutated, "request.parts"),
      );
    });

    it.each([
      ["a bare call", "multipartFailure(err);"],
      ["a void call", "void multipartFailure(err);"],
      ["a variable nothing reads", "const failure = multipartFailure(err);"],
      [
        "its status next to a hand-written 400",
        "const failure = multipartFailure(err); return reply.status(400).send(failure.body);",
      ],
      [
        "its status with a hand-written body",
        'const failure = multipartFailure(err); return reply.status(failure.status).send({ error: "Upload failed" });',
      ],
      [
        "the whole result sent as the body",
        "const failure = multipartFailure(err); return reply.send(failure);",
      ],
      [
        "a different error than the one caught",
        "const failure = multipartFailure(new Error(String(err))); return reply.status(failure.status).send(failure.body);",
      ],
      [
        "a call inside a closure that never runs",
        "const f = () => multipartFailure(err); return reply.status(400).send({});",
      ],
    ])("flags %s", (_label, catchBody) => {
      expect(check("r.ts", route(LOOP, `${catchBody}`))).toHaveLength(1);
    });

    it("requires the OCR helper, not multipartFailure, in the files mapped to it", () => {
      expect(check("r.ts", GOOD, { handled: { how: "ocrUploadErrorStatus" } })).toHaveLength(1);
    });

    it("holds every read in an OCR-mapped file to its own ocrUploadErrorStatus catch", () => {
      // pipeline.ts reads twice; one call to the helper must not cover both.
      const mapped =
        "const status = ocrUploadErrorStatus(err); return reply.status(status).send({});";
      const handled: Handled = { how: "ocrUploadErrorStatus" };
      expect(check("r.ts", route(LOOP, mapped) + route(LOOP, mapped), { handled })).toEqual([]);
      expect(
        check("r.ts", route(LOOP, mapped) + route(LOOP, HAND_WRITTEN), { handled }),
      ).toHaveLength(1);
    });

    it("does not let an OCR-mapped file keep a read with no catch", () => {
      const src = `app.post("/a", async (request) => { ${LOOP} });`;
      expect(check("r.ts", src, { handled: { how: "ocrUploadErrorStatus" } })).toHaveLength(1);
    });
  });

  describe("the read is paired where it throws", () => {
    it("passes a read assigned first and iterated inside the guarded try", () => {
      const src = `
        app.post("/a", async (request, reply) => {
          const parts = request.parts();
          try { for await (const part of parts) { void part; } } catch (err) { ${GOOD_CATCH} }
        });
      `;
      expect(check("r.ts", src)).toEqual([]);
    });

    it("flags a call in a guarded try whose loop runs outside it", () => {
      const src = `
        app.post("/a", async (request, reply) => {
          let parts;
          try { parts = request.parts(); } catch (err) { ${GOOD_CATCH} }
          for await (const part of parts) { void part; }
        });
      `;
      expect(check("r.ts", src)).toHaveLength(1);
    });

    it("flags a call in one try and its loop in a second try with a hand-written 400", () => {
      const src = `
        app.post("/a", async (request, reply) => {
          let parts;
          try { parts = request.parts(); } catch (err) { ${GOOD_CATCH} }
          try { for await (const part of parts) { void part; } } catch { ${HAND_WRITTEN} }
        });
      `;
      expect(check("r.ts", src)).toHaveLength(1);
    });

    it("flags a read that is assigned and never iterated", () => {
      const src = `app.post("/a", async (request) => { const parts = request.parts(); void parts; });`;
      expect(check("r.ts", src)).toHaveLength(1);
    });

    it("flags a try inside the loop body that swallows the part stream", () => {
      const inner = `
        for await (const part of request.parts()) {
          try { for await (const chunk of part.file) { void chunk; } } catch { ${HAND_WRITTEN} }
        }
      `;
      expect(check("r.ts", route(inner))).toHaveLength(1);
    });

    it("allows a try inside the loop body that rethrows or answers through the helper", () => {
      const rethrow = `
        for await (const part of request.parts()) {
          try { for await (const chunk of part.file) { void chunk; } } catch (e) { cleanup(); throw e; }
        }
      `;
      const answers = `
        for await (const part of request.parts()) {
          try { for await (const chunk of part.file) { void chunk; } } catch (err) { ${GOOD_CATCH} }
        }
      `;
      expect(check("r.ts", route(rethrow))).toEqual([]);
      expect(check("r.ts", route(answers))).toEqual([]);
    });

    it("flags a .catch() chained on the read", () => {
      const src = `app.post("/a", async (request) => { const data = await request.file().catch(() => undefined); void data; });`;
      expect(check("r.ts", src)).toHaveLength(1);
    });

    it("pairs request.file() at the toBuffer() that throws the 413", () => {
      const guarded = route(
        "const data = await request.file(); const buffer = await data.toBuffer(); void buffer;",
      );
      const unguardedBuffer = `
        app.post("/a", async (request, reply) => {
          let data;
          try { data = await request.file(); } catch (err) { ${GOOD_CATCH} }
          const buffer = await data.toBuffer();
        });
      `;
      expect(check("r.ts", guarded)).toEqual([]);
      expect(check("r.ts", unguardedBuffer)).toHaveLength(1);
    });
  });

  describe("scope of a try", () => {
    it("flags a read with no catch at all", () => {
      expect(check("r.ts", `app.post("/a", async (request) => { ${LOOP} });`)).toHaveLength(1);
    });

    // Deliberately strict: awaited inside the try, a rejection here would reach the catch,
    // but a read that hides in a closure is easy to lose track of, so it has to be listed.
    it("flags a read whose try is outside the function it sits in", () => {
      const inner =
        "const read = async () => { for await (const part of request.parts()) { void part; } }; await read();";
      expect(check("r.ts", route(inner))).toHaveLength(1);
    });

    it("flags a try/finally, which lets the error through", () => {
      const src = `
        app.post("/a", async (request) => {
          try { ${LOOP} } finally { cleanup(); }
        });
      `;
      expect(check("r.ts", src)).toHaveLength(1);
    });

    it("keeps climbing past a try/finally to a guarded try/catch around it", () => {
      expect(check("r.ts", route(`try { ${LOOP} } finally { cleanup(); }`))).toEqual([]);
    });

    it("does not credit a read in the finally block of a guarded try", () => {
      // A throw from a finally block is not caught by that try's own catch.
      const src = `
        app.post("/a", async (request, reply) => {
          try { await work(); } catch (err) { ${GOOD_CATCH} } finally { ${LOOP} }
        });
      `;
      expect(check("r.ts", src)).toHaveLength(1);
    });
  });

  describe("other spellings of a read", () => {
    it("scans multipartParts(), request.file() and request.saveRequestFiles()", () => {
      expect(
        check(
          "r.ts",
          `app.post("/a", async (request) => { for await (const p of multipartParts(request, {})) { void p; } });`,
        ),
      ).toHaveLength(1);
      expect(
        check(
          "r.ts",
          `app.post("/a", async (request) => { const d = await request.file(); void d; });`,
        ),
      ).toHaveLength(1);
      expect(
        check(
          "r.ts",
          `app.post("/a", async (request) => { const d = await request.saveRequestFiles(); void d; });`,
        ),
      ).toHaveLength(1);
    });

    it.each(["req.files()", "request.files()"])("scans %s", (call) => {
      const src = `app.post("/a", async (request, req) => { const files = ${call}; void files; });`;
      expect(check("r.ts", src)).toHaveLength(1);
    });

    it("follows multipartParts() through an alias and a namespace import", () => {
      const alias = `
        import { multipartParts as readParts } from "../lib/multipart-parts.js";
        app.post("/a", async (request) => { for await (const p of readParts(request, {})) { void p; } });
      `;
      const namespace = `
        import * as mp from "../lib/multipart-parts.js";
        app.post("/a", async (request) => { for await (const p of mp.multipartParts(request, {})) { void p; } });
      `;
      expect(check("r.ts", alias)).toHaveLength(1);
      expect(check("r.ts", namespace)).toHaveLength(1);
    });

    it("flags element access, destructuring and .parts used as a value", () => {
      expect(
        check(
          "r.ts",
          `app.post("/a", async (request) => { const p = request["parts"](); void p; });`,
        ),
      ).toHaveLength(1);
      expect(
        check(
          "r.ts",
          `app.post("/a", async (request) => { const { parts } = request; void parts; });`,
        ),
      ).toHaveLength(1);
      expect(
        check(
          "r.ts",
          `app.post("/a", async (request) => { const read = request.parts; void read; });`,
        ),
      ).toHaveLength(1);
    });

    it("flags .parts() on a receiver it doesn't scan", () => {
      expect(
        check("r.ts", `app.post("/a", async (r) => { const p = r.parts(); void p; });`),
      ).toHaveLength(1);
    });

    it("leaves an archive's two-argument .file() alone: it is not a multipart read", () => {
      expect(
        check("r.ts", `function zip(archive) { archive.file("a.txt", { name: "a" }); }`),
      ).toEqual([]);
    });

    it("ignores a read named in a comment or a string", () => {
      const src = `
        // for await (const part of request.parts()) {}
        const doc = "request.parts()";
        /* request.file() */
      `;
      expect(check("r.ts", src)).toEqual([]);
    });
  });

  describe("shared readers", () => {
    const reader = `
      async function readPdf(request) {
        for await (const part of request.parts()) { void part; }
      }
    `;
    const guardedCaller = route("await readPdf(request);");
    const config = { sharedReaders: ["readPdf"] };

    it("checks the callers of a shared reader, and exempts the reader's own read", () => {
      const bareCaller = `app.post("/b", async (request) => { await readPdf(request); });`;
      expect(check("r.ts", reader + guardedCaller, config)).toEqual([]);
      expect(check("r.ts", reader + guardedCaller + bareCaller, config)).toHaveLength(1);
    });

    it("checks a caller that does not await it", () => {
      const unawaited = `app.post("/b", async (request) => { return readPdf(request); });`;
      expect(check("r.ts", reader + unawaited, config)).toHaveLength(1);
    });

    it("exempts only the listed reader, not any other function with a bare read", () => {
      const other =
        "async function other(request) { for await (const p of request.parts()) { void p; } }";
      expect(check("r.ts", reader + other + guardedCaller, config)).toHaveLength(1);
    });

    it("flags a reader that is exported or passed along instead of called", () => {
      expect(check("r.ts", `${reader}\nexport { readPdf };`, config)).toHaveLength(1);
      expect(check("r.ts", `${reader}\nconst read = readPdf;`, config)).toHaveLength(1);
    });

    it("holds the reader's own loop body to a rethrow", () => {
      const swallowing = `
        async function readPdf(request) {
          for await (const part of request.parts()) {
            try { for await (const chunk of part.file) { void chunk; } } catch { break; }
          }
        }
      `;
      expect(check("r.ts", swallowing + guardedCaller, config)).toHaveLength(1);
    });
  });

  describe("files that let the error reach the error handler", () => {
    const handled = (reads: number): Handled => ({ how: "error handler", reads });
    const one = `app.post("/a", async (request) => { ${LOOP} });`;

    it("holds the file to its pinned count, both ways", () => {
      expect(check("r.ts", one, { handled: handled(1) })).toEqual([]);
      expect(check("r.ts", `${one}\n${one}`, { handled: handled(1) })).toHaveLength(1);
      // A pin that is too high is as stale as one that is too low.
      expect(check("r.ts", one, { handled: handled(2) })).toHaveLength(1);
    });

    it("counts a catch that cleans up and rethrows, because the error still reaches the handler", () => {
      const rethrowing = route(LOOP, "await cleanup(); throw err;");
      expect(check("r.ts", rethrowing, { handled: handled(1) })).toEqual([]);
    });

    it("does not count a catch that answers with a hand-written 400", () => {
      const findings = check("r.ts", route(LOOP, HAND_WRITTEN), { handled: handled(1) });
      expect(findings.some((f) => f.what.includes("doesn't answer"))).toBe(true);
    });

    it("does not count a read in a helper that a caller might catch", () => {
      const src = `async function read(request) { ${LOOP} }`;
      expect(
        check("r.ts", src, { handled: handled(1) }).some((f) => f.what.includes("helper")),
      ).toBe(true);
    });

    it("pairs the pinned read where it is drained, not where it is called", () => {
      // The call sits outside any try, but the loop that throws is in one whose catch
      // answers with its own status: the 413 never reaches the error handler.
      const src = `
        app.post("/a", async (request, reply) => {
          const parts = request.parts();
          try { for await (const part of parts) { void part; } } catch { ${HAND_WRITTEN} }
        });
      `;
      expect(check("r.ts", src, { handled: handled(1) }).length).toBeGreaterThan(0);
    });
  });
});
