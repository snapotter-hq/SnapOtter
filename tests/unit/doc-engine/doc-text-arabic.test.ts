// Pure-Unicode unit tests for the text cleanup in doc_text.py.
// Runs python3 against the actual module helpers (no PyMuPDF needed), the same
// way ssrf-url-fetcher.test.ts exercises doc_html_pdf.py.
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

interface FakeFont {
  type: string;
  /** "stream" is a real map; "identity-stream" a stream mapping every code to
   *  itself; "name" is /Identity-H; "dangling" points at no object. */
  toUnicode: "stream" | "identity-stream" | "none" | "name" | "dangling";
  /** On the descendant CIDFont. "stream" is the tFPDF/TCPDF CID = Unicode shape. */
  cidToGid?: "absent" | "identity" | "stream";
  /** Defaults to an indirect font; 0 is how get_fonts reports an inline font dict. */
  xref?: number;
  /** Where an inline (xref 0) font dict lives. "page" is the page's own
   *  Resources, "inherited" its Pages parent's, "xobject" a Form XObject's
   *  (get_fonts full=True names it as the referencer), and "missing" means the
   *  refname resolves to nothing. Defaults to "page". */
  location?: "page" | "inherited" | "xobject" | "missing";
  /** A Type3 font's /Name, without the slash. */
  name?: string;
}

/** Run draws_unmapped_composite_font against a fake page, so the font rule is
 *  tested without PyMuPDF. The fake doc mirrors the PyMuPDF calls it answers:
 *  get_fonts() rows, xref_get_key() pairs (including the key paths PyMuPDF
 *  resolves through references, such as "Resources/Font/F0/ToUnicode"),
 *  xref_object() text, xref_is_stream(), and "bad xref" for an object number
 *  out of range, as the real one raises. A missing key answers ('null', 'null'),
 *  as it does in PyMuPDF. */
function onFakePage<T = boolean>(fn: string, fonts: FakeFont[]): T {
  const code = [
    "import sys, json",
    `sys.path.insert(0, ${JSON.stringify(SCRIPT_DIR)})`,
    `from doc_text import ${fn}`,
    "fonts = json.loads(sys.argv[1])",
    "LENGTH = 1000",
    "TO_UNICODE = {'stream': ('xref', '%d 0 R'), 'none': ('null', 'null'),",
    "              'name': ('name', '/Identity-H'), 'dangling': ('xref', '5000 0 R'),",
    "              'identity-stream': ('xref', '%d 0 R')}",
    "REAL_CMAP = b'1 beginbfrange\\n<0004> <0062> <0020>\\nendbfrange\\n'",
    "IDENTITY_CMAP = b'1 beginbfrange\\n<0000> <FFFF> <0000>\\nendbfrange\\n'",
    "CID_TO_GID = {'absent': '', 'identity': '/CIDToGIDMap/Identity', 'stream': '/CIDToGIDMap %d 0 R'}",
    "PAGE, PAGES, XOBJECT = 900, 901, 902",
    "HOLDER = {'page': PAGE, 'inherited': PAGES, 'xobject': XOBJECT, 'missing': PAGE}",
    "def location(f):",
    "    return f.get('location', 'page')",
    "def inline(f):",
    "    return f.get('xref', 1) == 0",
    "def font_at(xref):",
    "    if not 0 < xref < LENGTH:",
    "        raise ValueError('bad xref')",
    "    return fonts[xref - 1]",
    "def font_key(i, key):",
    "    if key == 'Name':",
    "        name = fonts[i].get('name')",
    "        return ('name', '/' + name) if name else ('null', 'null')",
    "    if key == 'ToUnicode':",
    "        kind, value = TO_UNICODE[fonts[i]['toUnicode']]",
    "        base = 400 if fonts[i]['toUnicode'] == 'identity-stream' else 100",
    "        return (kind, value % (base + i) if '%d' in value else value)",
    "    assert key == 'DescendantFonts', key",
    "    return ('array', '[%d 0 R]' % (200 + i))",
    "def has_resources(holder):",
    "    held = [HOLDER[location(f)] for f in fonts if inline(f)]",
    "    if holder == PAGE:",
    "        return PAGES not in held or PAGE in held",
    "    return holder in held",
    "def tree_key(holder, key):",
    "    if key == 'Parent':",
    "        return ('xref', '%d 0 R' % PAGES) if holder == PAGE else ('null', 'null')",
    "    if key == 'Resources':",
    "        return ('xref', '950 0 R') if has_resources(holder) else ('null', 'null')",
    "    prefix = 'Resources/Font/F'",
    "    assert key.startswith(prefix), key",
    "    name, _, rest = key[len(prefix):].partition('/')",
    "    i = int(name)",
    "    f = fonts[i]",
    "    if HOLDER[location(f)] != holder or location(f) == 'missing' or not has_resources(holder):",
    "        return ('null', 'null')",
    "    return font_key(i, rest) if rest else ('dict', '<</Type/Font/Subtype/Type0>>')",
    "class Doc:",
    "    def xref_length(self):",
    "        return LENGTH",
    "    def xref_is_stream(self, xref):",
    "        return 100 <= xref < 200 or 300 <= xref < 500",
    "    def xref_stream(self, xref):",
    "        assert 100 <= xref < 200 or 400 <= xref < 500, xref",
    "        return IDENTITY_CMAP if xref >= 400 else REAL_CMAP",
    "    def xref_get_key(self, xref, key):",
    "        if xref in (PAGE, PAGES, XOBJECT):",
    "            return tree_key(xref, key)",
    "        font_at(xref)",
    "        return font_key(xref - 1, key)",
    "    def xref_object(self, xref, compressed=False):",
    "        assert 200 <= xref < 300, xref",
    "        i = xref - 200",
    "        entry = CID_TO_GID[fonts[i].get('cidToGid', 'absent')]",
    "        entry = entry % (300 + i) if '%d' in entry else entry",
    "        return '<</Type/Font/Subtype/CIDFontType2/BaseFont/ABCDEF+Font%s>>' % entry",
    "class Page:",
    "    parent = Doc()",
    "    xref = PAGE",
    "    def get_fonts(self, full=False):",
    "        rows = []",
    "        for i, f in enumerate(fonts):",
    "            row = (f.get('xref', i + 1), 'ttf', f['type'], 'ABCDEF+Font', 'F%d' % i, '')",
    "            referencer = XOBJECT if inline(f) and location(f) == 'xobject' else 0",
    "            rows.append(row + (referencer,) if full else row)",
    "        return rows",
    `result = ${fn}(Page())`,
    "sys.stdout.write(json.dumps(sorted(result) if isinstance(result, set) else result))",
  ].join("\n");
  const res = spawnSync("python3", ["-c", code, JSON.stringify(fonts)], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (res.status !== 0) throw new Error(`python3 failed: ${res.stderr}`);
  return JSON.parse(res.stdout) as T;
}

const drawsUnmappedComposite = (fonts: FakeFont[]) =>
  onFakePage("draws_unmapped_composite_font", fonts);
const mapsGlyphIdsAsUnicode = (fonts: FakeFont[]) => onFakePage("maps_glyph_ids_as_unicode", fonts);
const type3SpanNames = (fonts: FakeFont[]) =>
  onFakePage<string[] | null>("type3_span_names", fonts);

/** Run cmap_is_identity on a CMap given as text. */
function cmapIsIdentity(cmap: string): boolean {
  const code = [
    "import sys, json",
    `sys.path.insert(0, ${JSON.stringify(SCRIPT_DIR)})`,
    "from doc_text import cmap_is_identity",
    "sys.stdout.write(json.dumps(cmap_is_identity(sys.argv[1].encode('latin1'))))",
  ].join("\n");
  const res = spawnSync("python3", ["-c", code, cmap], { encoding: "utf8", timeout: 5000 });
  if (res.status !== 0) throw new Error(`python3 failed: ${res.stderr}`);
  return JSON.parse(res.stdout) as boolean;
}

describe.skipIf(!hasPython)("doc_text.cmap_is_identity (#1754)", () => {
  const ranges = (body: string) =>
    `1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${body}`;

  it("accepts a CMap whose every range and char maps a code to itself", () => {
    expect(cmapIsIdentity(ranges("1 beginbfrange\n<0000> <FFFF> <0000>\nendbfrange\n"))).toBe(true);
    expect(
      cmapIsIdentity(
        ranges(
          "2 beginbfrange\n<0000> <00FF> <0000>\n<0100> <01FF> <0100>\nendbfrange\n1 beginbfchar\n<0041> <0041>\nendbfchar\n",
        ),
      ),
    ).toBe(true);
  });

  it("refuses a real map, even one PyMuPDF names Adobe-Identity-UCS", () => {
    // PyMuPDF writes its correct maps under that CMapName, so the name proves nothing.
    expect(
      cmapIsIdentity(
        "/CMapName /Adobe-Identity-UCS def\n" +
          ranges("1 beginbfrange\n<0004> <0062> <0020>\nendbfrange\n"),
      ),
    ).toBe(false);
    expect(cmapIsIdentity(ranges("1 beginbfchar\n<0041> <0042>\nendbfchar\n"))).toBe(false);
    // A ligature maps one code to two characters.
    expect(cmapIsIdentity(ranges("1 beginbfchar\n<0066> <00660069>\nendbfchar\n"))).toBe(false);
  });

  it("accepts the pasted-in Identity-H CMap, a usecmap of it, and hex with spaces", () => {
    expect(cmapIsIdentity(ranges("1 begincidrange\n<0000> <FFFF> 0\nendcidrange\n"))).toBe(true);
    expect(cmapIsIdentity("/Identity-H usecmap\n")).toBe(true);
    expect(cmapIsIdentity(ranges("1 beginbfrange\n<00 00> <FF FF> <00 00>\nendbfrange\n"))).toBe(
      true,
    );
    expect(cmapIsIdentity(ranges("1 begincidrange\n<0000> <FFFF> 1\nendcidrange\n"))).toBe(false);
  });

  it("refuses a range mapped through an array, and a CMap with no entries", () => {
    expect(
      cmapIsIdentity(ranges("1 beginbfrange\n<0000> <0001> [<0000> <0001>]\nendbfrange\n")),
    ).toBe(false);
    expect(cmapIsIdentity(ranges(""))).toBe(false);
    expect(cmapIsIdentity("")).toBe(false);
  });
});

describe.skipIf(!hasPython)("doc_text.maps_glyph_ids_as_unicode (#1566)", () => {
  it("accepts a Type0 font whose ToUnicode is the name /Identity-H", () => {
    expect(mapsGlyphIdsAsUnicode([{ type: "Type0", toUnicode: "name" }])).toBe(true);
    expect(mapsGlyphIdsAsUnicode([{ type: "Type0", toUnicode: "name", xref: 0 }])).toBe(true);
  });

  it("ignores the #955 shapes, which MuPDF already reports as U+FFFD", () => {
    expect(mapsGlyphIdsAsUnicode([{ type: "Type0", toUnicode: "none" }])).toBe(false);
    expect(mapsGlyphIdsAsUnicode([{ type: "Type0", toUnicode: "dangling" }])).toBe(false);
    expect(mapsGlyphIdsAsUnicode([{ type: "Type0", toUnicode: "stream" }])).toBe(false);
  });

  it("ignores an identity name when a CIDToGIDMap stream makes the CID Unicode", () => {
    expect(mapsGlyphIdsAsUnicode([{ type: "Type0", toUnicode: "name", cidToGid: "stream" }])).toBe(
      false,
    );
  });

  it("accepts a ToUnicode stream that maps every code to itself (#1754)", () => {
    expect(mapsGlyphIdsAsUnicode([{ type: "Type0", toUnicode: "identity-stream" }])).toBe(true);
    expect(
      mapsGlyphIdsAsUnicode([{ type: "Type0", toUnicode: "identity-stream", cidToGid: "stream" }]),
    ).toBe(false);
  });

  it("no longer stands down for a Type3 font on the page (#1754)", () => {
    // Its spans are left out of the tally by name instead (type3_span_names).
    const identity: FakeFont = { type: "Type0", toUnicode: "name" };
    const type3: FakeFont = { type: "Type3", toUnicode: "none" };
    expect(mapsGlyphIdsAsUnicode([identity, type3])).toBe(true);
    expect(mapsGlyphIdsAsUnicode([type3, identity])).toBe(true);
  });
});

describe.skipIf(!hasPython)("doc_text.type3_span_names (#1754)", () => {
  it("names each Type3 font the way texttrace does: no subset tag, at most 31 characters", () => {
    // Measured on PyMuPDF 1.27.2.3: a span is named after /Name, else
    // "Type3 (<xref> 0 R)" (matched by prefix in glyph_id_fonts). get_fonts
    // reports /Name or /BaseFont, here the harness's "ABCDEF+Font".
    expect(
      type3SpanNames([
        { type: "Type0", toUnicode: "name" },
        { type: "Type3", toUnicode: "none" },
      ]),
    ).toEqual(["Font"]);
    expect(
      type3SpanNames([{ type: "Type3", toUnicode: "none", name: "QWERTY+SubsetType3Font" }]),
    ).toEqual(["Font", "SubsetType3Font"]);
    const long = `T3${"x".repeat(60)}`;
    expect(type3SpanNames([{ type: "Type3", toUnicode: "none", name: long }])).toEqual([
      "Font",
      long.slice(0, 31),
    ]);
    expect(type3SpanNames([{ type: "Type0", toUnicode: "name" }])).toEqual([]);
  });

  it("can't name an inline Type3 font, so the caller keeps the old verdict", () => {
    expect(type3SpanNames([{ type: "Type3", toUnicode: "none", xref: 0 }])).toBeNull();
  });
});

describe.skipIf(!hasPython)("doc_text.draws_unmapped_composite_font", () => {
  it("flags a Type0 font with no ToUnicode map, the glyph-id fallback case (#955)", () => {
    expect(drawsUnmappedComposite([{ type: "Type0", toUnicode: "none" }])).toBe(true);
  });

  it("flags it when the descendant says CIDToGIDMap /Identity outright", () => {
    expect(
      drawsUnmappedComposite([{ type: "Type0", toUnicode: "none", cidToGid: "identity" }]),
    ).toBe(true);
  });

  it("flags a ToUnicode reference that points at no object", () => {
    expect(drawsUnmappedComposite([{ type: "Type0", toUnicode: "dangling" }])).toBe(true);
  });

  it("does not flag a Type0 font that carries a ToUnicode map", () => {
    expect(drawsUnmappedComposite([{ type: "Type0", toUnicode: "stream" }])).toBe(false);
  });

  it("does not flag CID = Unicode through a CIDToGIDMap stream, which reads fine today", () => {
    // tFPDF and TCPDF write this. PyMuPDF's fallback emits the CID, which here is
    // the right character, so judging it on U+FFFD would 422 a good PDF.
    expect(drawsUnmappedComposite([{ type: "Type0", toUnicode: "none", cidToGid: "stream" }])).toBe(
      false,
    );
  });

  it("flags an inline Type0 font dict with no ToUnicode map (#1566)", () => {
    // get_fonts reports an inline dict as xref 0, and xref_get_key(0) raises, so
    // the dict has to be read through the page's Resources instead.
    expect(drawsUnmappedComposite([{ type: "Type0", toUnicode: "none", xref: 0 }])).toBe(true);
  });

  it("does not flag an inline Type0 font dict that carries a ToUnicode map", () => {
    expect(drawsUnmappedComposite([{ type: "Type0", toUnicode: "stream", xref: 0 }])).toBe(false);
  });

  it("does not flag an inline CID = Unicode font with a CIDToGIDMap stream", () => {
    expect(
      drawsUnmappedComposite([{ type: "Type0", toUnicode: "none", cidToGid: "stream", xref: 0 }]),
    ).toBe(false);
  });

  it("finds an inline font in Resources inherited from the Pages parent", () => {
    expect(
      drawsUnmappedComposite([
        { type: "Type0", toUnicode: "none", xref: 0, location: "inherited" },
      ]),
    ).toBe(true);
  });

  it("finds an inline font in a Form XObject's Resources through the referencer", () => {
    expect(
      drawsUnmappedComposite([{ type: "Type0", toUnicode: "none", xref: 0, location: "xobject" }]),
    ).toBe(true);
  });

  it("reads each inline font through its own refname", () => {
    const mapped = { type: "Type0", toUnicode: "stream", xref: 0 } as const;
    const unmapped = { type: "Type0", toUnicode: "none", xref: 0 } as const;
    expect(drawsUnmappedComposite([mapped, unmapped])).toBe(true);
    expect(drawsUnmappedComposite([unmapped, mapped])).toBe(true);
    expect(drawsUnmappedComposite([mapped, mapped])).toBe(false);
  });

  it("keeps scanning after an inline font it can't find", () => {
    expect(
      drawsUnmappedComposite([
        { type: "Type0", toUnicode: "none", xref: 0, location: "missing" },
        { type: "Type0", toUnicode: "none" },
      ]),
    ).toBe(true);
  });

  it("does not flag an inline font whose dict can't be found, and doesn't raise", () => {
    // A missing key reads as ('null', 'null'), the same as /ToUnicode null. Without
    // checking the dict exists first, a failed lookup would look like an unmapped
    // font.
    expect(
      drawsUnmappedComposite([{ type: "Type0", toUnicode: "none", xref: 0, location: "missing" }]),
    ).toBe(false);
  });

  it("does not flag a simple TrueType font with no ToUnicode map", () => {
    // MuPDF falls back to the character code for simple fonts, not the glyph id,
    // and those codes are often plain ASCII that reads correctly today.
    expect(drawsUnmappedComposite([{ type: "TrueType", toUnicode: "none" }])).toBe(false);
  });

  it("does not flag base-14 Type1 with no ToUnicode, the shape of test-3page.pdf", () => {
    expect(drawsUnmappedComposite([{ type: "Type1", toUnicode: "none" }])).toBe(false);
  });

  it("flags a page that mixes a mapped simple font with an unmapped Type0 font", () => {
    expect(
      drawsUnmappedComposite([
        { type: "TrueType", toUnicode: "stream" },
        { type: "Type0", toUnicode: "none" },
      ]),
    ).toBe(true);
  });

  it("does not flag a page with no fonts", () => {
    expect(drawsUnmappedComposite([])).toBe(false);
  });
});
describe.skipIf(!hasPython)("doc_text._inline_font_location", () => {
  it("gives up on a Parent loop instead of climbing forever", () => {
    // Two page tree nodes, neither holding Resources, each naming the other as
    // Parent. MuPDF's get_fonts normally trips on a cycle first; this pins the
    // depth cap for the case where it doesn't.
    const code = [
      "import sys, json",
      `sys.path.insert(0, ${JSON.stringify(SCRIPT_DIR)})`,
      "from doc_text import _inline_font_location",
      "class Doc:",
      "    calls = 0",
      "    def xref_length(self):",
      "        return 100",
      "    def xref_get_key(self, xref, key):",
      "        Doc.calls += 1",
      "        if key == 'Parent':",
      "            return ('xref', '%d 0 R' % (11 if xref == 10 else 10))",
      "        return ('null', 'null')",
      "class Page:",
      "    parent = Doc()",
      "    xref = 10",
      "print(json.dumps([_inline_font_location(Page(), 0, 'F0'), Doc.calls]))",
    ].join("\n");
    const res = spawnSync("python3", ["-c", code], { encoding: "utf8", timeout: 5000 });
    if (res.status !== 0) throw new Error(`python3 failed: ${res.stderr}`);
    const [location, calls] = JSON.parse(res.stdout) as [unknown, number];
    expect(location).toBeNull();
    expect(calls).toBeLessThan(200);
  });
});

/** A texttrace span as PyMuPDF returns it, reduced to what the helper reads. */
type FakeSpan = { font: string; chars: Array<[number, number]> };

/** Call a doc_text helper with JSON arguments and return its JSON result. */
function callWith<T>(fn: string, ...args: unknown[]): T {
  const code = [
    "import sys, json",
    `sys.path.insert(0, ${JSON.stringify(SCRIPT_DIR)})`,
    `from doc_text import ${fn}`,
    `result = ${fn}(*json.loads(sys.argv[1]))`,
    "sys.stdout.write(json.dumps(sorted(result) if isinstance(result, set) else result))",
  ].join("\n");
  const res = spawnSync("python3", ["-c", code, JSON.stringify(args)], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (res.status !== 0) throw new Error(`python3 failed: ${res.stderr}`);
  return JSON.parse(res.stdout) as T;
}

const glyphIdFonts = (trace: FakeSpan[]) => callWith<string[]>("glyph_id_fonts", trace);

/** Each char of text as a span char whose glyph id is its codepoint plus an offset. */
function span(font: string, text: string, glyphOffset: number): FakeSpan {
  return {
    font,
    chars: [...text].map((ch) => [
      ch.codePointAt(0) as number,
      (ch.codePointAt(0) as number) + glyphOffset,
    ]),
  };
}

// The shape of #1566 case 2, measured on PyMuPDF 1.27.2.3: with ToUnicode
// written as the name /Identity-H, texttrace reports each char's unicode as its
// glyph id, and glyph ids below 0x20 (Roboto's space is glyph 4) as U+FFFD.
const IDENTITY: FakeSpan = {
  font: "Roboto-Black",
  chars: [
    [44, 44],
    [73, 73],
    [80, 80],
    [80, 80],
    [83, 83],
    [0xfffd, 4],
    [91, 91],
    [83, 83],
  ],
};

describe.skipIf(!hasPython)("doc_text.glyph_id_fonts (#1566)", () => {
  it("names a font whose unicode is its glyph id, and no other", () => {
    expect(glyphIdFonts([IDENTITY, span("Helvetica", "Hi there", -31)])).toEqual(["Roboto-Black"]);
    expect(glyphIdFonts([span("Helvetica", "Hello world", -31)])).toEqual([]);
    expect(glyphIdFonts([])).toEqual([]);
  });

  it("tallies across the page, so a short span in a glyph-id font is caught too", () => {
    const short: FakeSpan = {
      font: "Roboto-Black",
      chars: [
        [44, 44],
        [73, 73],
      ],
    };
    expect(glyphIdFonts([short, IDENTITY])).toEqual(["Roboto-Black"]);
  });

  it("leaves U+FFFD out, so a #955 or CID-is-Unicode font isn't taken for glyph ids", () => {
    const unmapped: FakeSpan = {
      font: "Montserrat-Black",
      chars: [...Array(8)].map((_, i) => [0xfffd, 40 + i]),
    };
    expect(glyphIdFonts([unmapped])).toEqual([]);
  });

  it("leaves out the fonts it's told to, so a Type3 font's own codes aren't taken for glyph ids", () => {
    // MuPDF reports a Type3 glyph as its character code, equal to the Unicode
    // for ASCII text (measured: 11 of 11 on a hand-built Type3 font).
    const unnamed = span("Type3 (13 0 R)", "Hello world", 0);
    const named = span("SubT3", "Hello world", 0);
    // "Type3 (...)" is always left out; a named one by its normalized name.
    expect(callWith<string[]>("glyph_id_fonts", [IDENTITY, unnamed, named], ["SubT3"])).toEqual([
      "Roboto-Black",
    ]);
    expect(glyphIdFonts([IDENTITY, named])).toEqual(["Roboto-Black", "SubT3"]);
  });

  it("doesn't judge a font with too few chars to tell from coincidence", () => {
    expect(
      glyphIdFonts([
        {
          font: "F",
          chars: [
            [44, 44],
            [73, 73],
          ],
        },
      ]),
    ).toEqual([]);
  });

  it("doesn't judge a font where only some chars line up", () => {
    const partly: FakeSpan = {
      font: "F",
      chars: [
        [44, 44],
        [73, 73],
        [80, 80],
        [81, 50],
        [82, 51],
        [83, 52],
      ],
    };
    expect(glyphIdFonts([partly])).toEqual([]);
  });
});

describe.skipIf(!hasPython)("doc_text.text_outside_fonts (#1566)", () => {
  const dict = {
    blocks: [
      {
        lines: [
          {
            spans: [
              { font: "Roboto-Black", text: ",IPPS" },
              { font: "Montserrat-Black", text: "Hello" },
            ],
          },
        ],
      },
      { type: 1, image: "..." },
      { lines: [{ spans: [{ font: "Roboto-Black", text: "[SVPH" }] }] },
    ],
  };

  it("keeps the text of every span outside the named fonts, skipping image blocks", () => {
    expect(callWith<string>("text_outside_fonts", dict, ["Roboto-Black"])).toBe("Hello");
  });

  it("answers empty text when every span is in a named font", () => {
    expect(callWith<string>("text_outside_fonts", dict, ["Roboto-Black", "Montserrat-Black"])).toBe(
      "",
    );
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
    expect(main).toMatch(/has_text = any\(has_readable_text\(part\) for part in judged\)/);
  });

  it("judges unmapped composite-font pages on MuPDF's own U+FFFD, not glyph ids (#955)", () => {
    // PyMuPDF's default flags swap an unmapped glyph for its glyph id, which reads
    // as ordinary letters; dropping that flag hands back the U+FFFD MuPDF meant.
    expect(main).toMatch(
      /unmapped_as_fffd = fitz\.TEXTFLAGS_TEXT & ~fitz\.TEXT_CID_FOR_UNKNOWN_UNICODE/,
    );
    expect(main).toMatch(/page\.get_text\(flags=unmapped_as_fffd\)/);
    expect(main).toMatch(/flagged = draws_unmapped_composite_font\(page\)/);
  });

  it("drops glyph-id spans from a flagged page's verdict (#1566)", () => {
    // Every page, not just flagged ones: an identity ToUnicode stream isn't
    // flagged by draws_unmapped_composite_font (#1754).
    expect(main).toMatch(
      /readable = _judge_without_glyph_id_fonts\(page\)\n\s+if readable is not None:/,
    );
    const judge = source.slice(
      source.indexOf("def _judge_without_glyph_id_fonts("),
      source.indexOf("def main("),
    );
    // Only on the identity-name shape: a Type3 font's readable text looks the same.
    expect(judge).toMatch(/if not maps_glyph_ids_as_unicode\(page\)/);
    expect(judge).toMatch(/glyph_id_fonts\(page\.get_texttrace\(\), type3\)/);
    expect(judge).toMatch(/type3 = type3_span_names\(page\)/);
    expect(judge).toMatch(/text_outside_fonts\(page\.get_text\("dict"\), fonts\)/);
    // Verdict-only, so a failure keeps the #955 verdict rather than failing extraction.
    expect(judge).toMatch(/except Exception as exc:[\s\S]*return None/);
  });

  it("reports the character count of the text it actually wrote", () => {
    // Folding a ligature changes the length, so chars must be measured after it.
    expect(main).toMatch(/text = "\\n"\.join\(parts\)/);
    expect(main).toMatch(/fh\.write\(text\)/);
    expect(main).toMatch(/"chars": len\(text\)/);
  });
});
