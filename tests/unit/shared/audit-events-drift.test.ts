/**
 * Every audit event the API can write to `audit_log` must appear in
 * `CORE_AUDIT_EVENTS`, and the Settings audit-log filter dropdown must read
 * that shared list instead of maintaining a hand-copied array (#1013).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { CORE_AUDIT_EVENTS } from "../../../packages/shared/src/audit-events.js";

const ROOT = join(__dirname, "../../..");
const API_SRC = join(ROOT, "apps/api/src");
const SETTINGS_DIALOG = join(ROOT, "apps/web/src/components/settings/settings-dialog.tsx");

const EXTERNAL_AUTH_PROVIDERS = ["OIDC", "SAML"] as const;
const EXTERNAL_AUTH_PROVIDER_IDS = new Set(["oidc", "saml"]);
const PASS_THROUGH_AUDIT_WRAPPERS = new Set(["lib/audit.ts", "lib/external-auth-resolver.ts"]);

// Declared in CORE_AUDIT_EVENTS for tool/batch/pipeline audit logging, but not
// yet emitted by batch.ts or pipeline.ts (#3973).
const UNEMITTED_CORE_AUDIT_EVENTS = ["BATCH_EXECUTED", "PIPELINE_EXECUTED"] as const;

interface ExtractedAuditEvents {
  emitted: Map<string, string[]>;
  unresolved: string[];
}

function walkTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walkTsFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

function extractAuditEventsFromSource(
  relPath: string,
  sourceText: string,
  into: ExtractedAuditEvents = { emitted: new Map(), unresolved: [] },
): ExtractedAuditEvents {
  const sf = ts.createSourceFile(relPath, sourceText, ts.ScriptTarget.Latest, true);
  const normalizedRel = relPath.split("\\").join("/");

  const record = (name: string, node: ts.Node) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const loc = `${normalizedRel}:${line}`;
    const list = into.emitted.get(name) ?? [];
    list.push(loc);
    into.emitted.set(name, list);
  };

  const recordUnresolved = (node: ts.Node, reason?: string) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const text = reason ?? node.getText(sf);
    into.unresolved.push(`${normalizedRel}:${line}: ${text}`);
  };

  const extractExpr = (expr: ts.Expression, allowPassThroughEvent: boolean): void => {
    if (ts.isStringLiteralLike(expr)) {
      record(expr.text, expr);
      return;
    }
    if (ts.isParenthesizedExpression(expr)) {
      extractExpr(expr.expression, allowPassThroughEvent);
      return;
    }
    if (ts.isConditionalExpression(expr)) {
      extractExpr(expr.whenTrue, allowPassThroughEvent);
      extractExpr(expr.whenFalse, allowPassThroughEvent);
      return;
    }
    if (
      ts.isTemplateExpression(expr) &&
      expr.head.text === "" &&
      expr.templateSpans.length === 1 &&
      ts.isIdentifier(expr.templateSpans[0].expression) &&
      expr.templateSpans[0].expression.text === "providerUpper"
    ) {
      const suffix = expr.templateSpans[0].literal.text;
      for (const prefix of EXTERNAL_AUTH_PROVIDERS) {
        record(`${prefix}${suffix}`, expr);
      }
      return;
    }
    if (allowPassThroughEvent && ts.isIdentifier(expr) && expr.text === "event") {
      return;
    }
    recordUnresolved(expr);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && callee.text === "audit" && node.arguments.length >= 1) {
        extractExpr(node.arguments[0], false);
      } else if (
        ts.isIdentifier(callee) &&
        callee.text === "auditLog" &&
        node.arguments.length >= 2
      ) {
        extractExpr(node.arguments[1], PASS_THROUGH_AUDIT_WRAPPERS.has(normalizedRel));
      } else if (ts.isIdentifier(callee) && callee.text === "auditFromRequest") {
        const parent = node.parent;
        const invokedImmediately =
          ts.isCallExpression(parent) && parent.expression === node && parent.arguments.length >= 1;
        const boundToAudit =
          ts.isVariableDeclaration(parent) &&
          ts.isIdentifier(parent.name) &&
          parent.name.text === "audit";
        if (invokedImmediately) {
          extractExpr(parent.arguments[0], false);
        } else if (!boundToAudit) {
          recordUnresolved(
            parent,
            `auditFromRequest must be called directly or bound to 'audit' (${parent.getText(sf)})`,
          );
        }
      } else if (
        ts.isIdentifier(callee) &&
        callee.text === "resolveExternalUser" &&
        node.arguments.length >= 1
      ) {
        const arg = node.arguments[0];
        if (!ts.isObjectLiteralExpression(arg)) {
          recordUnresolved(arg, `resolveExternalUser argument is not an object literal`);
        } else {
          const providerProp = arg.properties.find(
            (p): p is ts.PropertyAssignment =>
              ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "provider",
          );
          if (
            !providerProp ||
            !ts.isStringLiteralLike(providerProp.initializer) ||
            !EXTERNAL_AUTH_PROVIDER_IDS.has(providerProp.initializer.text)
          ) {
            recordUnresolved(
              providerProp ?? arg,
              `resolveExternalUser provider must be 'oidc' or 'saml'`,
            );
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return into;
}

describe("CORE_AUDIT_EVENTS drift guard (#1013)", () => {
  const extracted: ExtractedAuditEvents = { emitted: new Map(), unresolved: [] };
  for (const file of walkTsFiles(API_SRC)) {
    extractAuditEventsFromSource(relative(API_SRC, file), readFileSync(file, "utf8"), extracted);
  }

  it("contains no duplicate entries", () => {
    expect(new Set(CORE_AUDIT_EVENTS).size).toBe(CORE_AUDIT_EVENTS.length);
  });

  it("includes all four SAML audit events alongside the OIDC events", () => {
    expect(CORE_AUDIT_EVENTS).toEqual(
      expect.arrayContaining([
        "SAML_LOGIN_SUCCESS",
        "SAML_USER_CREATED",
        "SAML_USER_LINKED",
        "SAML_LOGIN_FAILED",
      ]),
    );
  });

  it("resolves every audit() and auditLog() call site in apps/api/src statically", () => {
    expect(extracted.emitted.size).toBeGreaterThan(20);
    expect(extracted.unresolved).toEqual([]);
  });

  it("lists every audit event emitted anywhere in apps/api/src in CORE_AUDIT_EVENTS", () => {
    const coreSet = new Set<string>(CORE_AUDIT_EVENTS);
    const missing = [...extracted.emitted.entries()]
      .filter(([event]) => !coreSet.has(event))
      .map(([event, locs]) => `${event} (${locs.join(", ")})`);
    expect(missing).toEqual([]);
  });

  it("has no dead entries in CORE_AUDIT_EVENTS outside the tracked unemitted list (#3973)", () => {
    const unemittedAllowlist = new Set<string>(UNEMITTED_CORE_AUDIT_EVENTS);
    const dead = CORE_AUDIT_EVENTS.filter(
      (event) => !extracted.emitted.has(event) && !unemittedAllowlist.has(event),
    );
    expect(dead).toEqual([]);

    const nowEmitted = UNEMITTED_CORE_AUDIT_EVENTS.filter((event) => extracted.emitted.has(event));
    expect(nowEmitted).toEqual([]);
  });

  it("AuditLogSection in settings-dialog.tsx consumes CORE_AUDIT_EVENTS instead of a local list", () => {
    const dialogSrc = readFileSync(SETTINGS_DIALOG, "utf8");
    expect(dialogSrc).not.toMatch(/\bconst\s+AUDIT_ACTIONS\b/);
    expect(dialogSrc).toMatch(/\bCORE_AUDIT_EVENTS\.map\(/);
  });
});

describe("extractAuditEventsFromSource", () => {
  it("extracts literals from audit(), auditFromRequest()(), auditLog(), ternaries, and providerUpper templates", () => {
    const sample = `
      const audit = auditFromRequest(request);
      await audit("SAML_LOGIN_SUCCESS", {});
      await auditFromRequest(request)("API_KEY_CREATED", {});
      await auditLog(request.log, "SCIM_USER_PROVISIONED", {});
      await audit(hold ? "LEGAL_HOLD_APPLIED" : "LEGAL_HOLD_RELEASED", {});
      await audit(\`\${providerUpper}_USER_LINKED\`, {});
      await resolveExternalUser({ provider: "saml", externalId: "1" });
      const wrap = (event: string) => auditLog(logger, event, {});
    `;
    const res = extractAuditEventsFromSource("lib/external-auth-resolver.ts", sample);
    expect(res.unresolved).toEqual([]);
    expect([...res.emitted.keys()].sort()).toEqual([
      "API_KEY_CREATED",
      "LEGAL_HOLD_APPLIED",
      "LEGAL_HOLD_RELEASED",
      "OIDC_USER_LINKED",
      "SAML_LOGIN_SUCCESS",
      "SAML_USER_LINKED",
      "SCIM_USER_PROVISIONED",
    ]);
  });

  it("flags an unresolvable dynamic event expression, including an identifier named 'event' outside the wrapper files", () => {
    const res = extractAuditEventsFromSource(
      "routes/foo.ts",
      "await audit(dynamicAction, {}); await audit(event, {}); await auditLog(log, event, {});",
    );
    expect(res.unresolved).toEqual([
      "routes/foo.ts:1: dynamicAction",
      "routes/foo.ts:1: event",
      "routes/foo.ts:1: event",
    ]);
  });

  it("flags auditFromRequest bound to a name other than 'audit' or resolveExternalUser with an unknown provider", () => {
    const res = extractAuditEventsFromSource(
      "routes/bar.ts",
      'const logAudit = auditFromRequest(request); await resolveExternalUser({ provider: "ldap" });',
    );
    expect(res.unresolved).toHaveLength(2);
  });
});
