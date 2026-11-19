// Unit tests for doc_markdown.py, the PDF to Markdown converter (#1096).
// The structure helpers take PyMuPDF's get_text("dict") shape, so they run
// against hand-built blocks with plain python3. The end-to-end case builds a
// real PDF and needs PyMuPDF.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasFitz, hasPython, pythonBin } from "../../helpers/python-gate.js";

const SCRIPT_DIR = join(process.cwd(), "packages", "ai", "python");

interface Span {
  text: string;
  size: number;
  flags?: number;
  bbox?: [number, number, number, number];
}

function span(text: string, size = 11, flags = 0): Span {
  return { text, size, flags, bbox: [0, 0, 10, 10] };
}

function block(...lines: Span[][]) {
  return { type: 0, bbox: [0, 0, 100, 100], lines: lines.map((spans) => ({ spans })) };
}

/** Call one doc_markdown helper with JSON arguments and return its JSON result. */
function call<T>(fn: string, ...args: unknown[]): T {
  const code = [
    "import sys, json",
    `sys.path.insert(0, ${JSON.stringify(SCRIPT_DIR)})`,
    `import doc_markdown`,
    `sys.stdout.write(json.dumps(doc_markdown.${fn}(*json.loads(sys.argv[1]))))`,
  ].join("; ");
  const res = spawnSync(pythonBin ?? "python3", ["-c", code, JSON.stringify(args)], {
    encoding: "utf8",
    timeout: 10_000,
  });
  if (res.status !== 0) throw new Error(`python failed: ${res.stderr}`);
  return JSON.parse(res.stdout) as T;
}

/** Render a page of blocks with heading levels computed the way main() does. */
function render(blocks: unknown[], tables: unknown[] = [], links: unknown[] = []): string {
  const code = [
    "import sys, json",
    `sys.path.insert(0, ${JSON.stringify(SCRIPT_DIR)})`,
    "import doc_markdown as d",
    "blocks, tables, links = json.loads(sys.argv[1])",
    "levels = d.heading_levels(blocks, d.body_size(blocks))",
    "sys.stdout.write(d.page_markdown(blocks, levels, [(tuple(r), md) for r, md in tables], [(tuple(r), u) for r, u in links]))",
  ].join("; ");
  const res = spawnSync(
    pythonBin ?? "python3",
    ["-c", code, JSON.stringify([blocks, tables, links])],
    {
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  if (res.status !== 0) throw new Error(`python failed: ${res.stderr}`);
  return res.stdout;
}

describe.skipIf(!hasPython)("doc_markdown structure helpers", () => {
  it("takes the body size from where most characters are set, not the largest size", () => {
    const blocks = [
      block([span("Title", 24)]),
      block([span("A long paragraph of body text.", 11)]),
    ];
    expect(call<number>("body_size", blocks)).toBe(11);
  });

  it("ranks sizes above the body into heading levels, largest first", () => {
    const blocks = [
      block([span("Body text that dominates the page by character count.", 11)]),
      block([span("H1", 24)]),
      block([span("H2", 16)]),
      block([span("Slightly bigger", 12)]),
    ];
    // 12pt is under the 1.15x threshold over an 11pt body, so it is not a heading.
    expect(call<Record<string, number>>("heading_levels", blocks, 11)).toEqual({
      "24.0": 1,
      "16.0": 2,
    });
  });

  it("renders headings relative to the body rather than by absolute size", () => {
    // A 12pt body made MuPDF's own xhtml output tag every paragraph <h3>.
    const md = render([
      block([span("Report", 20)]),
      block([span("This is the body of the report, set at twelve points.", 12)]),
      block([span("Results", 15)]),
      block([span("More body text follows the results heading here.", 12)]),
    ]);
    expect(md).toBe(
      "# Report\n\nThis is the body of the report, set at twelve points.\n\n## Results\n\nMore body text follows the results heading here.",
    );
  });

  it("splits a heading out of the paragraph MuPDF grouped it with", () => {
    const md = render([
      block(
        [span("Intro paragraph text set in the body size for the page.", 11)],
        [span("Revenue", 16)],
        [span("Revenue grew this quarter across every region.", 11)],
      ),
    ]);
    expect(md).toBe(
      "Intro paragraph text set in the body size for the page.\n\n# Revenue\n\nRevenue grew this quarter across every region.",
    );
  });

  it("does not treat a long run of large text as a heading", () => {
    const long = "Large lead paragraph ".repeat(12).trim();
    const md = render([block([span(long, 18)]), block([span("short body", 11)])]);
    expect(md.startsWith("#")).toBe(false);
  });

  it("turns bullet and numbered lines into list items and joins wrapped lines", () => {
    const md = render([
      block(
        [span("• First point that wraps", 11)],
        [span("onto a second line", 11)],
        [span("• Second point", 11)],
      ),
      block([span("1. Step one", 11)], [span("2. Step two", 11)]),
    ]);
    expect(md).toBe(
      "- First point that wraps onto a second line\n- Second point\n\n1. Step one\n2. Step two",
    );
  });

  it("keeps a number inside a paragraph from starting a list", () => {
    const md = render([block([span("Sales rose in", 11)], [span("2024. Costs fell.", 11)])]);
    expect(md).toBe("Sales rose in 2024. Costs fell.");
  });

  it("escapes text that Markdown would read as formatting", () => {
    const md = render([block([span("# not a heading, a *star* and [brackets] <tag> a|b", 11)])]);
    expect(md).toBe("\\# not a heading, a \\*star\\* and \\[brackets\\] \\<tag\\> a\\|b");
  });

  it("merges adjacent bold spans and keeps spaces outside the markers", () => {
    const md = render([
      block([
        span("Plain ", 11),
        span("bold ", 11, 16),
        span("words", 11, 16),
        span(" and ", 11),
        span("italic", 11, 2),
      ]),
    ]);
    expect(md).toBe("Plain **bold words** and *italic*");
  });

  it("links spans that sit inside a web link and drops unsafe schemes", () => {
    const linked = { text: "the site", size: 11, flags: 0, bbox: [10, 10, 50, 20] };
    const md = render(
      [block([span("Visit ", 11), linked as Span])],
      [],
      [[[8, 8, 60, 25], "https://example.com/a%20b"]],
    );
    expect(md).toBe("Visit [the site](https://example.com/a%20b)");
    expect(call<string | null>("_safe_uri", "javascript:alert(1)")).toBeNull();
    expect(call<string | null>("_safe_uri", "https://x.test/a (b)")).toBe(
      "https://x.test/a%20%28b%29",
    );
  });

  it("strips a list marker set in bold instead of repeating it inside the emphasis", () => {
    const md = render([
      block([span("1. Bold item", 11, 16)]),
      block([span("\u2022 Bold bullet", 11, 16)]),
    ]);
    expect(md).toBe("1. **Bold item**\n\n- **Bold bullet**");
  });

  it("escapes a dash rule, a closing heading hash, entities and a list item opening with #", () => {
    const md = render([
      block([span("C#", 18)]),
      block([span("--- not a rule, and &amp; stays literal while R&D is fine", 11)]),
      block([span("- # not a heading", 11)]),
    ]);
    expect(md).toBe(
      "# C\\#\n\n\\--- not a rule, and \\&amp; stays literal while R&D is fine\n\n- \\# not a heading",
    );
  });

  it("builds tables from cells with the same escaping as body text", () => {
    const md = call<string>("table_markdown", [
      ["Name", "Note"],
      ["a|b", "<img src=x onerror=alert(1)>"],
      ["multi\nline", null],
    ]);
    expect(md).toBe(
      "|Name|Note|\n|---|---|\n|a\\|b|\\<img src=x onerror=alert(1)\\>|\n|multi line||",
    );
  });

  it("swaps a table region for its Markdown once and drops the cell text", () => {
    const cell = (text: string, y: number) => ({
      type: 0,
      bbox: [80, y, 120, y + 10],
      lines: [{ spans: [span(text)] }],
    });
    const md = render(
      [
        block([span("Before the table", 11)]),
        cell("a", 210),
        cell("b", 230),
        block([span("After the table", 11)]),
      ],
      [[[70, 200, 300, 260], "|a|b|\n|---|---|\n|1|2|\n"]],
    );
    expect(md).toBe("Before the table\n\n|a|b|\n|---|---|\n|1|2|\n\nAfter the table");
  });
});

describe.skipIf(!hasFitz)("doc_markdown end to end (requires PyMuPDF)", () => {
  it("converts a generated PDF with headings, a list, a link and a ruled table", () => {
    const dir = mkdtempSync(join(tmpdir(), "doc-markdown-"));
    try {
      const pdfPath = join(dir, "in.pdf");
      const outPath = join(dir, "out.md");
      const build = [
        "import sys, pymupdf",
        "doc = pymupdf.open(); page = doc.new_page()",
        "page.insert_text((72, 72), 'Quarterly Report', fontsize=24, fontname='hebo')",
        "page.insert_text((72, 110), 'This report covers the quarter in plain body text.', fontsize=11)",
        "page.insert_text((72, 140), 'Revenue', fontsize=16, fontname='hebo')",
        "page.insert_text((72, 170), '- First point', fontsize=11)",
        "page.insert_text((72, 190), '- Second point', fontsize=11)",
        "page.insert_text((72, 220), 'Link to the site', fontsize=11)",
        "page.insert_link({'kind': pymupdf.LINK_URI, 'from': pymupdf.Rect(72, 208, 160, 224), 'uri': 'https://example.com/'})",
        "page.insert_link({'kind': pymupdf.LINK_URI, 'from': pymupdf.Rect(72, 50, 300, 78), 'uri': 'javascript:alert(1)'})",
        "cols, rows = [72, 200, 328], [250, 270, 290]",
        "[page.draw_line((x, rows[0]), (x, rows[-1])) for x in cols]",
        "[page.draw_line((cols[0], r), (cols[-1], r)) for r in rows]",
        "[page.insert_text((cols[c] + 4, rows[r] + 14), t, fontsize=11) for r, row in enumerate([['Name', 'Value'], ['alpha', '1']]) for c, t in enumerate(row)]",
        "doc.save(sys.argv[1])",
      ].join("\n");
      const made = spawnSync(pythonBin as string, ["-c", build, pdfPath], { encoding: "utf8" });
      expect(made.status, made.stderr).toBe(0);

      const res = spawnSync(
        pythonBin as string,
        [join(SCRIPT_DIR, "doc_markdown.py"), JSON.stringify({ path: pdfPath, out: outPath })],
        { encoding: "utf8", timeout: 60_000 },
      );
      expect(res.status, res.stderr).toBe(0);
      // stdout stays one JSON line: find_tables() print()s a layout nag otherwise.
      const md = readFileSync(outPath, "utf8");
      expect(JSON.parse(res.stdout.trim())).toEqual({ chars: md.length });
      expect(md).toContain("# Quarterly Report\n");
      expect(md).toContain("## Revenue\n");
      expect(md).toContain("- First point\n");
      expect(md).toContain("[Link to the site](https://example.com/)");
      expect(md).not.toContain("javascript:");
      expect(md).toMatch(/\|Name\|Value\|\n\|---\|---\|\n\|alpha\|1\|/);
      expect(md.endsWith("\n")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
