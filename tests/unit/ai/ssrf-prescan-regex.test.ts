// Pure-regex unit test for the SSRF pre-scan in doc_html_pdf.py.
// Runs python3 against the actual module regexes (no weasyprint needed).
// Mirrors the step-3 verification matrix from the fix ticket.

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasPython } from "../../helpers/python-gate.js";

const SCRIPT_DIR = join(process.cwd(), "packages", "ai", "python");

/** Run a python3 snippet that imports regexes from the actual module and tests a case. */
function testRegex(html: string, patternName: string): boolean {
  const code = [
    "import sys, os",
    `sys.path.insert(0, ${JSON.stringify(SCRIPT_DIR)})`,
    "from doc_html_pdf import _REMOTE_REF_RE, _REMOTE_CSS_URL_RE",
    `pat = ${patternName}`,
    `m = pat.search(${JSON.stringify(html)})`,
    "print('MATCH' if m else 'NO_MATCH')",
  ].join("; ");
  const res = spawnSync("python3", ["-c", code], { encoding: "utf8", timeout: 5000 });
  if (res.status !== 0) throw new Error(`python3 failed: ${res.stderr}`);
  return res.stdout.trim() === "MATCH";
}

describe.skipIf(!hasPython)("SSRF pre-scan regexes (doc_html_pdf.py)", () => {
  describe("_REMOTE_REF_RE", () => {
    it("matches double-slash http img", () => {
      expect(testRegex('<img src="http://h/x.png">', "_REMOTE_REF_RE")).toBe(true);
    });

    it("matches single-slash http img (pandoc rewrite)", () => {
      expect(testRegex('<img src="http:/h/x.png">', "_REMOTE_REF_RE")).toBe(true);
    });

    it("matches double-slash https img", () => {
      expect(testRegex('<img src="https://h/x.png">', "_REMOTE_REF_RE")).toBe(true);
    });

    it("matches single-slash https img", () => {
      expect(testRegex('<img src="https:/h/x.png">', "_REMOTE_REF_RE")).toBe(true);
    });

    it("does NOT match data: URIs", () => {
      expect(testRegex('<img src="data:image/png;base64,AA==">', "_REMOTE_REF_RE")).toBe(false);
    });

    it("does NOT match relative paths", () => {
      expect(testRegex('<a href="page2.xhtml">', "_REMOTE_REF_RE")).toBe(false);
    });
  });

  describe("_REMOTE_CSS_URL_RE", () => {
    it("matches single-slash CSS url()", () => {
      expect(testRegex("url(https:/h/a.css)", "_REMOTE_CSS_URL_RE")).toBe(true);
    });

    it("matches double-slash CSS url()", () => {
      expect(testRegex("url(https://h/a.css)", "_REMOTE_CSS_URL_RE")).toBe(true);
    });

    it("does NOT match data: CSS url()", () => {
      expect(testRegex("url(data:image/png;base64,AA==)", "_REMOTE_CSS_URL_RE")).toBe(false);
    });
  });
});
