// Pure-Unicode unit tests for the text cleanup in doc_text.py.
// Runs python3 against the actual module helpers (no PyMuPDF needed), the same
// way ssrf-prescan-regex.test.ts exercises doc_html_pdf.py.
// Invisible codepoints are written as \u escapes so they survive review and
// reformatting; the Arabic literals are left as-is because they are the point.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasPython } from "../../helpers/python-gate.js";

const SCRIPT_DIR = join(process.cwd(), "packages", "ai", "python");

/** Call one doc_text helper with a single string argument and return its result. */
function callHelper<T>(fn: string, input: string): T {
  const code = [
    "import sys, json",
    `sys.path.insert(0, ${JSON.stringify(SCRIPT_DIR)})`,
    `from doc_text import ${fn}`,
    `sys.stdout.write(json.dumps(${fn}(json.loads(sys.argv[1]))))`,
  ].join("; ");
  const res = spawnSync("python3", ["-c", code, JSON.stringify(input)], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (res.status !== 0) throw new Error(`python3 failed: ${res.stderr}`);
  return JSON.parse(res.stdout) as T;
}

const normalize = (text: string) => callHelper<string>("normalize_presentation_forms", text);
const hasReadable = (text: string) => callHelper<boolean>("has_readable_text", text);

describe.skipIf(!hasPython)("doc_text.normalize_presentation_forms", () => {
  it("folds shaped Arabic back to base letters", () => {
    // What a self-shaping producer leaves in the ToUnicode map for the phrase below.
    expect(normalize("ﻣﺮﺣﺒﺎ ﺑﺎﻟﻌﺎﻟﻢ")).toBe("مرحبا بالعالم");
  });

  it("expands the lam-alef ligature into its two letters", () => {
    expect(normalize("ﻻ")).toBe("لا");
  });

  it("covers Presentation Forms-A as well as Forms-B", () => {
    // U+FB50 (alef wasla isolated) sits in Forms-A, U+FEF4 (yeh medial) in Forms-B.
    expect(normalize("ﭐﻴ")).toBe("ٱي");
  });

  it("leaves ordinary Arabic untouched", () => {
    const arabic = "مرحبا بالعالم";
    expect(normalize(arabic)).toBe(arabic);
  });

  it("leaves Latin, CJK and punctuation byte-for-byte identical", () => {
    const mixed = "Hello, world! 日本語 (c) 2026, naive cafe";
    expect(normalize(mixed)).toBe(mixed);
  });

  it("does not apply NFKC to the rest of the string", () => {
    // Whole-string NFKC would also rewrite the fi ligature, the superscript and
    // the fullwidth Latin. Only the Arabic run may change.
    expect(normalize("ﬁ ² ｆｕｌｌ ﻣ")).toBe("ﬁ ² ｆｕｌｌ م");
  });

  it("carries harakat forms back as a carrier plus the mark", () => {
    // U+FE77 (fatha medial) has no base letter to fold to, so NFKC yields
    // tatweel + fatha. Pinned because it is the one case where the fold inserts
    // a character instead of replacing one.
    expect(normalize("ﹷ")).toBe("ـَ");
  });

  it("preserves the zero-width no-break space that shares the Forms-B block", () => {
    expect(normalize("a\uFEFFb")).toBe("a\uFEFFb");
  });

  it("preserves noncharacters inside the Forms-A range", () => {
    expect(normalize("\uFDD0")).toBe("\uFDD0");
  });

  it("keeps mixed Arabic and Latin in place", () => {
    expect(normalize("Invoice ﻣﺮﺣﺒﺎ 2026")).toBe("Invoice مرحبا 2026");
  });
});

describe.skipIf(!hasPython)("doc_text.has_readable_text", () => {
  it("rejects the raw glyph ids a font with no ToUnicode map yields", () => {
    // MuPDF emits one control codepoint per glyph, so the .txt renders blank (#724).
    expect(hasReadable("\u0001\u0002\u0003\u0004\u0002\u000B\u000C\u0005")).toBe(false);
  });

  it("rejects the replacement character MuPDF uses for unmappable glyphs", () => {
    expect(hasReadable("\uFFFD\uFFFD\uFFFD")).toBe(false);
  });

  it("rejects a page that is only whitespace", () => {
    expect(hasReadable("   \n\t  ")).toBe(false);
  });

  it("rejects a page of only bidi direction marks", () => {
    expect(hasReadable("\u200F\u200E\u061C")).toBe(false);
  });

  it("keeps private-use codepoints readable", () => {
    // Symbolic TrueType fonts (Symbol, Wingdings) decode to U+F0xx through a
    // (3,0) cmap. That text layer decoded fine, so it must not be sent to OCR.
    expect(hasReadable("\uF041\uF042\uF043")).toBe(true);
    expect(hasReadable("\uE000")).toBe(true);
  });

  it("keeps unassigned codepoints readable so the answer is arch-independent", () => {
    // Which codepoints count as unassigned follows the interpreter Unicode
    // version, and the arm64 and amd64 images ship different ones. Judging them
    // unreadable would 422 the same PDF on one architecture only.
    expect(hasReadable("\u0378")).toBe(true);
  });

  it("accepts Arabic", () => {
    expect(hasReadable("مرحبا")).toBe(true);
  });

  it("accepts shaped Arabic presentation forms", () => {
    expect(hasReadable("ﻣﺮ")).toBe(true);
  });

  it("accepts Latin, CJK and digits", () => {
    expect(hasReadable("hello")).toBe(true);
    expect(hasReadable("日本語")).toBe(true);
    expect(hasReadable("2026")).toBe(true);
  });

  it("accepts a page whose only content is punctuation or symbols", () => {
    expect(hasReadable("€ ± §")).toBe(true);
  });

  it("accepts real text that also carries control characters", () => {
    expect(hasReadable(" total ")).toBe(true);
  });
});

// The helpers above are only worth anything if extraction actually calls them,
// and PyMuPDF is absent from CI so no test here can run main(). Guard the wiring
// at the source level instead, the way pymupdf-message-redirect.test.ts does.
describe("doc_text.main wiring", () => {
  const source = readFileSync(join(SCRIPT_DIR, "doc_text.py"), "utf8");
  const main = source.slice(source.indexOf("def main("));

  it("normalizes every page it extracts", () => {
    expect(main).toMatch(/normalize_presentation_forms\(page\.get_text\(\)\)/);
  });

  it("decides hasText with the readability test", () => {
    expect(main).toMatch(/has_text = any\(has_readable_text\(part\) for part in parts\)/);
  });

  it("reports the character count of the text it actually wrote", () => {
    // Folding a ligature changes the length, so chars must be measured after it.
    expect(main).toMatch(/text = "\\n"\.join\(parts\)/);
    expect(main).toMatch(/fh\.write\(text\)/);
    expect(main).toMatch(/"chars": len\(text\)/);
  });
});
