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
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROUTES = join(__dirname, "../../../apps/api/src/routes");

/**
 * Routes whose reads answer a failure another way. `how` is the helper their
 * catch must call, or "error handler" for reads with no catching try, where
 * the error's own statusCode reaches the error handler, which answers 413
 * (#1280). `reads` pins how many such unguarded reads the file has, so a new
 * one has to be added here on purpose.
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
 * Functions that read multipart on behalf of their callers. The read inside is
 * exempt; every call to the function is checked like a read instead.
 */
const SHARED_READERS: Record<string, string[]> = {
  "tools/pdf-to-image.ts": ["readPdfFromParts"],
};

const RECEIVERS = new Set(["request", "req"]);
const READ_METHODS = new Set(["parts", "file", "files"]);

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

/** How a call reads multipart, or null when it isn't a read. */
function readSpelling(call: ts.CallExpression, sharedReaders: string[]): string | null {
  const callee = call.expression;
  if (
    ts.isPropertyAccessExpression(callee) &&
    READ_METHODS.has(callee.name.text) &&
    ts.isIdentifier(callee.expression) &&
    RECEIVERS.has(callee.expression.text)
  ) {
    return `${callee.expression.text}.${callee.name.text}()`;
  }
  if (ts.isIdentifier(callee)) {
    if (callee.text === "multipartParts") return "multipartParts()";
    if (sharedReaders.includes(callee.text)) return `${callee.text}()`;
  }
  return null;
}

/**
 * Where a throw from `node` goes: the nearest catching try in the same function, or
 * else the function itself (whose callers then decide).
 */
function enclosing(node: ts.Node): {
  fn: ts.SignatureDeclaration | undefined;
  tryNode?: ts.TryStatement;
} {
  let child: ts.Node = node;
  for (let n: ts.Node | undefined = node.parent; n; child = n, n = n.parent) {
    if (ts.isFunctionLike(n)) return { fn: n };
    // A try with no catch (try/finally) lets the error through, so keep climbing.
    if (ts.isTryStatement(n) && n.tryBlock === child && n.catchClause) {
      return { fn: undefined, tryNode: n };
    }
  }
  return { fn: undefined };
}

function nameOf(fn: ts.SignatureDeclaration | undefined): string | undefined {
  if (!fn) return undefined;
  if ("name" in fn && fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  const parent = fn.parent;
  return parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)
    ? parent.name.text
    : undefined;
}

/** True when the catch calls `helper` and does something with what it returns. */
function catchUses(catchClause: ts.CatchClause, helper: string): boolean {
  let used = false;
  const walk = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === helper &&
      !ts.isExpressionStatement(node.parent)
    ) {
      used = true;
    }
    ts.forEachChild(node, walk);
  };
  walk(catchClause);
  return used;
}

/** Every multipart read in a file that isn't answered the way the file's rule says. */
function check(name: string, src: string, config: Config = {}): Finding[] {
  const sf = parse(name, src);
  const sharedReaders = config.sharedReaders ?? [];
  const helper =
    config.handled?.how === "ocrUploadErrorStatus" ? "ocrUploadErrorStatus" : "multipartFailure";
  const findings: Finding[] = [];
  let unguarded = 0;

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      // A `.parts(` on a receiver the guard doesn't know would slip past it.
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === "parts" &&
        !(ts.isIdentifier(callee.expression) && RECEIVERS.has(callee.expression.text))
      ) {
        findings.push({
          line: lineOf(sf, node),
          what: `${callee.getText(sf)}() reads multipart through a receiver this guard doesn't scan`,
        });
      }
      const spelling = readSpelling(node, sharedReaders);
      if (spelling) {
        const { fn, tryNode } = enclosing(node);
        if (fn && sharedReaders.includes(nameOf(fn) ?? "")) {
          // A shared reader's own read, with no catch of its own: its callers are checked.
        } else if (tryNode?.catchClause) {
          if (!catchUses(tryNode.catchClause, helper)) {
            findings.push({
              line: lineOf(sf, node),
              what: `${spelling} is in a try whose catch never uses ${helper}(...)'s result`,
            });
          }
        } else if (config.handled?.how === "error handler") {
          unguarded++;
        } else {
          findings.push({
            line: lineOf(sf, node),
            what: `${spelling} has no catch that calls ${helper}(...)`,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (config.handled?.how === "error handler" && unguarded !== config.handled.reads) {
    findings.push({
      line: 0,
      what: `${unguarded} unguarded multipart reads, but the list says ${config.handled.reads}`,
    });
  }
  return findings;
}

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

describe("multipart read failures go through multipartFailure (#1341, #2157)", () => {
  it("pairs every multipart read in every route with its own catch", () => {
    const offenders = files.flatMap(({ name, src }) =>
      check(name, src, {
        handled: HANDLED_ELSEWHERE[name],
        sharedReaders: SHARED_READERS[name],
      }).map((f) => `${name}:${f.line} ${f.what}`),
    );
    expect(offenders).toEqual([]);
  });

  it("still finds the reads it is meant to check", () => {
    // A guard that parses nothing passes everything.
    let reads = 0;
    const filesWithReads = new Set<string>();
    for (const { name, src } of files) {
      const sf = parse(name, src);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && readSpelling(node, SHARED_READERS[name] ?? []) !== null) {
          reads++;
          filesWithReads.add(name);
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    expect(reads).toBeGreaterThan(50);
    expect(filesWithReads.size).toBeGreaterThan(45);
  });

  it("the lists have no stale entries", () => {
    for (const name of Object.keys(HANDLED_ELSEWHERE)) {
      const file = files.find((f) => f.name === name);
      expect(file, `${name} no longer exists`).toBeDefined();
      const sf = parse(name, file?.src ?? "");
      let reads = 0;
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && readSpelling(node, []) !== null) reads++;
        ts.forEachChild(node, visit);
      };
      visit(sf);
      expect(reads, `${name} no longer reads multipart`).toBeGreaterThan(0);
    }
    for (const [name, readers] of Object.entries(SHARED_READERS)) {
      const file = files.find((f) => f.name === name);
      expect(file, `${name} no longer exists`).toBeDefined();
      for (const reader of readers) {
        expect(file?.src, `${name} no longer defines ${reader}`).toContain(`function ${reader}(`);
        // Only this file's calls are checked, so the reader can't be exported.
        expect(file?.src, `${reader} is exported; check its callers elsewhere`).not.toMatch(
          new RegExp(`export\\s+(async\\s+)?function\\s+${reader}\\b`),
        );
        const calls = (file?.src.split(`${reader}(`).length ?? 1) - 1;
        expect(calls, `${name} no longer calls ${reader}`).toBeGreaterThan(1);
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
  const GOOD = `
    app.post("/a", async (request, reply) => {
      try {
        for await (const part of request.parts()) { void part; }
      } catch (err) {
        const failure = multipartFailure(err);
        return reply.status(failure.status).send(failure.body);
      }
    });
  `;

  it("passes a read paired with its catch", () => {
    expect(check("r.ts", GOOD)).toEqual([]);
  });

  it("flags a route that went back to a hand-written 400 while a spare call sits elsewhere", () => {
    const src = `
      ${GOOD}
      app.post("/b", async (request, reply) => {
        try {
          for await (const part of request.parts()) { void part; }
        } catch {
          return reply.status(400).send({ error: "Failed to parse multipart request" });
        }
      });
      function elsewhere(err) { multipartFailure(err); multipartFailure(err); }
    `;
    // Three helper calls against two reads: the old count saw "enough".
    expect(check("r.ts", src)).toHaveLength(1);
  });

  it("flags the same regression in the real pdf-to-image.ts, which has spare calls", () => {
    const name = "tools/pdf-to-image.ts";
    const real = files.find((f) => f.name === name)?.src ?? "";
    const config = { sharedReaders: SHARED_READERS[name] };

    // Swap the catch of the first route that reads multipart inline (the batch route)
    // for a hand-written 400. Found by position in the AST, so a reformat or a renamed
    // variable can't move the break to a different route.
    const sf = parse(name, real);
    let catchBlock: ts.Block | undefined;
    const find = (node: ts.Node) => {
      if (
        !catchBlock &&
        ts.isCallExpression(node) &&
        readSpelling(node, []) === "request.parts()"
      ) {
        catchBlock = enclosing(node).tryNode?.catchClause?.block;
      }
      ts.forEachChild(node, find);
    };
    find(sf);
    if (!catchBlock) throw new Error("no route in pdf-to-image.ts reads multipart inline any more");
    const handWritten =
      '{ return reply.status(400).send({ error: "Failed to parse multipart request" }); }';
    const mutated =
      real.slice(0, catchBlock.getStart(sf)) + handWritten + real.slice(catchBlock.getEnd());

    expect(check(name, real, config)).toEqual([]);
    expect(check(name, mutated, config)).toHaveLength(1);
    // What the count-based check saw: still at least one helper call per read.
    const calls = (src: string, fn: string) => src.split(`${fn}(`).length - 1;
    expect(calls(mutated, "multipartFailure")).toBeGreaterThanOrEqual(
      calls(mutated, "request.parts"),
    );
  });

  it("flags a helper call whose result is thrown away", () => {
    const src = GOOD.replace(
      "const failure = multipartFailure(err);\n        return reply.status(failure.status).send(failure.body);",
      'multipartFailure(err);\n        return reply.status(400).send({ error: "bad" });',
    );
    expect(check("r.ts", src)).toHaveLength(1);
  });

  it("flags a read with no catch at all", () => {
    const src = `
      app.post("/a", async (request) => {
        for await (const part of request.parts()) { void part; }
      });
    `;
    expect(check("r.ts", src)).toHaveLength(1);
  });

  it("flags a read whose try is outside the function it sits in", () => {
    const src = `
      app.post("/a", async (request, reply) => {
        try {
          const read = async () => { for await (const part of request.parts()) { void part; } };
          await read();
        } catch (err) {
          const failure = multipartFailure(err);
          return reply.status(failure.status).send(failure.body);
        }
      });
    `;
    expect(check("r.ts", src)).toHaveLength(1);
  });

  it("flags a try/finally, which lets the error through", () => {
    const src = `
      app.post("/a", async (request) => {
        try {
          for await (const part of request.parts()) { void part; }
        } finally {
          cleanup();
        }
      });
    `;
    expect(check("r.ts", src)).toHaveLength(1);
  });

  it("keeps climbing past a try/finally to a guarded try/catch around it", () => {
    const src = `
      app.post("/a", async (request, reply) => {
        try {
          try {
            for await (const part of request.parts()) { void part; }
          } finally {
            cleanup();
          }
        } catch (err) {
          const failure = multipartFailure(err);
          return reply.status(failure.status).send(failure.body);
        }
      });
    `;
    expect(check("r.ts", src)).toEqual([]);
  });

  it("does not credit a read in the finally block of a guarded try", () => {
    // A throw from a finally block is not caught by that try's own catch.
    const src = `
      app.post("/a", async (request, reply) => {
        try {
          await work();
        } catch (err) {
          const failure = multipartFailure(err);
          return reply.status(failure.status).send(failure.body);
        } finally {
          for await (const part of request.parts()) { void part; }
        }
      });
    `;
    expect(check("r.ts", src)).toHaveLength(1);
  });

  it("scans the other spellings: multipartParts() and request.file()", () => {
    const parts = `
      app.post("/a", async (request) => {
        for await (const part of multipartParts(request, {})) { void part; }
      });
    `;
    const file = `app.post("/a", async (request) => { const data = await request.file(); void data; });`;
    expect(check("r.ts", parts)).toHaveLength(1);
    expect(check("r.ts", file)).toHaveLength(1);
  });

  it("flags .parts() on a receiver it doesn't scan", () => {
    const src = `app.post("/a", async (r) => { const p = r.parts(); void p; });`;
    expect(check("r.ts", src)).toHaveLength(1);
  });

  it("ignores a read named in a comment or a string", () => {
    const src = `
      // for await (const part of request.parts()) {}
      const doc = "request.parts()";
      /* request.file() */
    `;
    expect(check("r.ts", src)).toEqual([]);
  });

  it("checks the callers of a shared reader, and exempts the reader's own read", () => {
    const reader = `
      async function readPdf(request) {
        for await (const part of request.parts()) { void part; }
      }
    `;
    const guardedCaller = `
      app.post("/a", async (request, reply) => {
        try {
          await readPdf(request);
        } catch (err) {
          const failure = multipartFailure(err);
          return reply.status(failure.status).send(failure.body);
        }
      });
    `;
    const bareCaller = `app.post("/b", async (request) => { await readPdf(request); });`;
    const config = { sharedReaders: ["readPdf"] };
    expect(check("r.ts", reader + guardedCaller, config)).toEqual([]);
    expect(check("r.ts", reader + guardedCaller + bareCaller, config)).toHaveLength(1);
  });

  it("holds a file whose reads go to the error handler to its pinned count", () => {
    const one = `app.post("/a", async (request) => { for await (const p of request.parts()) { void p; } });`;
    const two = `${one}\n${one}`;
    const handled: Handled = { how: "error handler", reads: 1 };
    expect(check("r.ts", one, { handled })).toEqual([]);
    expect(check("r.ts", two, { handled })).toHaveLength(1);
    // A pin that is too high is as stale as one that is too low.
    expect(check("r.ts", one, { handled: { how: "error handler", reads: 2 } })).toHaveLength(1);
  });

  it("requires the OCR helper, not multipartFailure, in the files mapped to it", () => {
    const src = `
      app.post("/a", async (request, reply) => {
        try {
          for await (const part of request.parts()) { void part; }
        } catch (err) {
          const failure = multipartFailure(err);
          return reply.status(failure.status).send(failure.body);
        }
      });
    `;
    expect(check("r.ts", src, { handled: { how: "ocrUploadErrorStatus" } })).toHaveLength(1);
  });
});
