// Per-page readability tally in doc_text.py (#954, #4947). Runs python3 against the
// module helper directly, so it needs no PyMuPDF and runs in CI.
// Control and replacement codepoints are written as \u escapes so they survive
// review and reformatting.

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasPython } from "../../helpers/python-gate.js";

const SCRIPT_DIR = join(process.cwd(), "packages", "ai", "python");

interface PageTally {
  pages: number;
  emptyPages: number;
  unreadablePages: number;
  partlyUnreadablePages: number;
  hasText: boolean;
}

/** Call doc_text.tally_pages(parts, judged[, glyphIdPages]) and return its result. */
function tally(parts: string[], judged: string[], glyphIdPages?: boolean[]): PageTally {
  const args = glyphIdPages ? [parts, judged, glyphIdPages] : [parts, judged];
  const code = [
    "import sys, json",
    `sys.path.insert(0, ${JSON.stringify(SCRIPT_DIR)})`,
    "from doc_text import tally_pages",
    "sys.stdout.write(json.dumps(tally_pages(*json.loads(sys.argv[1]))))",
  ].join("; ");
  const res = spawnSync("python3", ["-c", code, JSON.stringify(args)], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (res.status !== 0) throw new Error(`python3 failed: ${res.stderr}`);
  return JSON.parse(res.stdout) as PageTally;
}

describe.skipIf(!hasPython)("doc_text.tally_pages", () => {
  it("counts a fully readable document as having text and no bad pages", () => {
    expect(tally(["Page one\n", "Page two\n"], ["Page one\n", "Page two\n"])).toEqual({
      pages: 2,
      emptyPages: 0,
      unreadablePages: 0,
      partlyUnreadablePages: 0,
      hasText: true,
    });
  });

  it("counts a page that returned nothing as empty, not unreadable", () => {
    // A scanned or image-only page (#589).
    expect(tally(["", " \n"], ["", " \n"])).toEqual({
      pages: 2,
      emptyPages: 2,
      unreadablePages: 0,
      partlyUnreadablePages: 0,
      hasText: false,
    });
  });

  it("counts a page of control codes as unreadable, not empty", () => {
    // A font with no ToUnicode map and glyph ids below 0x20 (#724).
    const soup = "\u0001\u0002\u0003\n";
    expect(tally([soup], [soup])).toEqual({
      pages: 1,
      emptyPages: 0,
      unreadablePages: 1,
      partlyUnreadablePages: 0,
      hasText: false,
    });
  });

  it("judges a page by its judged text while telling empty from unreadable by the extracted text", () => {
    // A composite font with no map (#955): the .txt holds plausible letters,
    // the verdict pass sees U+FFFD.
    expect(tally([",IPPS [SVPH\n"], ["\uFFFD\uFFFD\uFFFD\uFFFD\n"])).toEqual({
      pages: 1,
      emptyPages: 0,
      unreadablePages: 1,
      partlyUnreadablePages: 0,
      hasText: false,
    });
  });

  it("keeps hasText for a partly unreadable document and reports the bad page", () => {
    const parts = ["Real invoice text\n", ",IPPS [SVPH\n", ""];
    const judged = ["Real invoice text\n", "\uFFFD\uFFFD\n", ""];
    expect(tally(parts, judged)).toEqual({
      pages: 3,
      emptyPages: 1,
      unreadablePages: 1,
      partlyUnreadablePages: 0,
      hasText: true,
    });
  });

  it("reports a document with no pages as having no text", () => {
    expect(tally([], [])).toEqual({
      pages: 0,
      emptyPages: 0,
      unreadablePages: 0,
      partlyUnreadablePages: 0,
      hasText: false,
    });
  });

  it("counts a readable page whose glyph-id fonts were set aside as partly unreadable (#4947)", () => {
    // An /Identity-H line next to a Helvetica line: the verdict text is only
    // the Helvetica line, so the page reads fine, but its .txt has the soup.
    const parts = [",IPPS [SVPH\nReal invoice text\n", "Page two\n"];
    const judged = ["Real invoice text\n", "Page two\n"];
    expect(tally(parts, judged, [true, false])).toEqual({
      pages: 2,
      emptyPages: 0,
      unreadablePages: 0,
      partlyUnreadablePages: 1,
      hasText: true,
    });
  });

  it("counts a readable page with a run of U+FFFD in its verdict text as partly unreadable (#4947)", () => {
    // A no-ToUnicode composite font next to a Helvetica line, judged without
    // MuPDF's CID fallback.
    const parts = [",IPPS [SVPH\nReal invoice text\n"];
    const judged = ["\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD \uFFFD\uFFFD\uFFFD\nReal invoice text\n"];
    expect(tally(parts, judged)).toMatchObject({ unreadablePages: 0, partlyUnreadablePages: 1 });
  });

  it("counts a readable page with a run of control codes as partly unreadable (#4947)", () => {
    // A simple font with no ToUnicode map and low glyph ids (#724) next to readable text.
    const text = "\u0001\u0002\u0003\nReal invoice text\n";
    expect(tally([text], [text])).toMatchObject({ unreadablePages: 0, partlyUnreadablePages: 1 });
  });

  it("ignores a stray replacement or control character in otherwise readable text (#4947)", () => {
    const text = "Real \uFFFD invoice\u0002 text\t\f\n";
    expect(tally([text], [text])).toMatchObject({ partlyUnreadablePages: 0 });
  });

  it("does not count a wholly unreadable page as partly unreadable too (#4947)", () => {
    expect(tally([",IPPS\n"], ["\uFFFD\uFFFD\uFFFD\uFFFD\n"], [true])).toMatchObject({
      unreadablePages: 1,
      partlyUnreadablePages: 0,
    });
  });
});
