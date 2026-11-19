"""Convert a PDF to Markdown. Args: {"path": in, "out": out-md-path}. Prints {"chars": N}.

PDF has no notion of a heading or a list, only positioned glyphs, so the
structure is inferred: the size most of the text is set in is the body size,
and a short block set clearly larger than that is a heading. MuPDF's own
"xhtml" output does this from absolute point sizes, which turns a 12pt body
into <h3>; ranking sizes relative to the body keeps the levels meaningful.
Tables come from PyMuPDF's table finder. Images are dropped.

The caller probes the file with doc_text first, so a PDF with no text layer
never reaches this script (#589).
"""
import json
import re
import sys
from collections import Counter

from doc_text import normalize_presentation_forms

# A block counts as a heading when its text is set at least this much larger
# than the body. Below it, size differences are usually a font's own metrics or
# a pull quote, not structure.
HEADING_RATIO = 1.15
MAX_HEADING_LEVELS = 6
# A long run of large text is a lead paragraph or a cover blurb, not a heading.
MAX_HEADING_CHARS = 200

# PyMuPDF span flags.
_BOLD = 16
_ITALIC = 2

_BULLETS = r"\u00b7\u2022\u25e6\u25aa\u25ab\u2023\u2043\u25cf\u25cb\u25a0\u25a1\u2013\u2014*-"
_BULLET_RE = re.compile(rf"^\s*[{_BULLETS}]\s+")
_NUMBERED_RE = re.compile(r"^\s*(\d{1,3})[.)]\s+")
_MD_SPECIAL_RE = re.compile(r"([\\`*_\[\]<>|~])")
_ENTITY_RE = re.compile(r"&(?=#?\w+;)")
# Characters that would make the start of a paragraph parse as something else.
_LEADING_SPECIAL_RE = re.compile(r"^((?:-[ \t]*){3,}|#{1,6}|[+-]|=+)(?=\s|$)")
_LEADING_ORDERED_RE = re.compile(r"^(\d{1,9})([.)])(?=\s|$)")
# Only schemes a reader can follow safely; a javascript: link in a PDF must not
# become a clickable link in whatever renders the Markdown.
_SAFE_LINK_RE = re.compile(r"^(?:https?://|mailto:)", re.IGNORECASE)


def size_key(size):
    """Bucket a span size to the nearest half point so 11.98 and 12.02 match."""
    return round(size * 2) / 2


def _text_spans(blocks):
    for block in blocks:
        if block.get("type", 0) != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                if span.get("text", "").strip():
                    yield span


def body_size(blocks):
    """The size most characters are set in, or 0 when there is no text."""
    counts = Counter()
    for span in _text_spans(blocks):
        counts[size_key(span["size"])] += len(span["text"].strip())
    return counts.most_common(1)[0][0] if counts else 0


def heading_levels(blocks, body):
    """Map each size clearly above the body to a heading level, largest first."""
    if not body:
        return {}
    sizes = sorted(
        {size_key(s["size"]) for s in _text_spans(blocks) if size_key(s["size"]) >= body * HEADING_RATIO},
        reverse=True,
    )
    return {size: level for level, size in enumerate(sizes[:MAX_HEADING_LEVELS], start=1)}


def escape_inline(text):
    """Backslash-escape characters that Markdown would read as formatting.

    An "&" is only escaped where it would start an entity, so "&amp;" in the
    PDF stays "&amp;" on screen instead of rendering as "&".
    """
    return _ENTITY_RE.sub(r"\\&", _MD_SPECIAL_RE.sub(r"\\\1", text))


def escape_heading(text):
    """escape_inline, plus a trailing "#" run that would read as a closing sequence."""
    return re.sub(r"#+$", lambda m: "\\" + m.group(), escape_inline(text))


def escape_line_start(text):
    """Escape a paragraph opening that would parse as a heading, list, or rule."""
    text = _LEADING_SPECIAL_RE.sub(lambda m: "\\" + m.group(1), text)
    return _LEADING_ORDERED_RE.sub(lambda m: m.group(1) + "\\" + m.group(2), text)


def _safe_uri(uri):
    if not uri or not _SAFE_LINK_RE.match(uri):
        return None
    return uri.replace(" ", "%20").replace("(", "%28").replace(")", "%29")


def _span_uri(span, links):
    x0, y0, x1, y1 = span["bbox"]
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    for rect, uri in links:
        if rect[0] <= cx <= rect[2] and rect[1] <= cy <= rect[3]:
            return uri
    return None


def _wrap(text, bold, italic, uri):
    """Apply emphasis and a link to an already-escaped run, keeping its outer spaces outside."""
    core = text.strip()
    if not core:
        return text
    lead = text[: len(text) - len(text.lstrip())]
    trail = text[len(text.rstrip()) :]
    if italic:
        core = f"*{core}*"
    if bold:
        core = f"**{core}**"
    if uri:
        core = f"[{core}]({uri})"
    return lead + core + trail


def line_markdown(line, links=()):
    """One line's text with emphasis and links, adjacent runs of one style merged."""
    runs = []
    for span in line.get("spans", []):
        text = normalize_presentation_forms(span.get("text", ""))
        if not text:
            continue
        flags = span.get("flags", 0)
        style = (bool(flags & _BOLD), bool(flags & _ITALIC), _span_uri(span, links))
        if runs and runs[-1][0] == style:
            runs[-1][1].append(text)
        else:
            runs.append((style, [text]))
    return "".join(_wrap(escape_inline("".join(parts)), *style) for style, parts in runs)


def _plain(line):
    return normalize_presentation_forms("".join(s.get("text", "") for s in line.get("spans", [])))


def _dominant_size(line):
    counts = Counter()
    for span in line.get("spans", []):
        counts[size_key(span["size"])] += len(span.get("text", "").strip())
    return counts.most_common(1)[0][0] if counts else 0


def block_markdown(block, levels, links=()):
    """Render one text block as headings, list items, and paragraphs.

    Judged line by line: MuPDF often groups a heading into the same block as
    the paragraph under it when the spacing is tight.
    """
    items = []  # [kind, marker, text], kind is "h", "li" or "p"
    for line in block.get("lines", []):
        raw = _plain(line)
        if not raw.strip():
            continue
        current = items[-1] if items else None
        level = levels.get(_dominant_size(line))
        if level and len(raw.strip()) <= MAX_HEADING_CHARS:
            marker = "#" * level + " "
            if current and current[0] == "h" and current[1] == marker:
                current[2] = current[2] + " " + escape_heading(raw.strip())
            else:
                items.append(["h", marker, escape_heading(raw.strip())])
            continue
        bullet = _BULLET_RE.match(raw)
        numbered = _NUMBERED_RE.match(raw)
        if bullet:
            text = line_markdown(_drop_prefix(line, bullet.end()), links).strip()
            items.append(["li", "- ", escape_line_start(text)])
            continue
        if numbered and (current is None or current[0] != "p"):
            text = line_markdown(_drop_prefix(line, numbered.end()), links).strip()
            items.append(["li", f"{numbered.group(1)}. ", escape_line_start(text)])
            continue
        text = line_markdown(line, links).strip()
        if current is None or current[0] == "h":
            items.append(["p", "", escape_line_start(text)])
        else:
            current[2] += " " + text
    rendered = []
    for i, (kind, marker, text) in enumerate(items):
        if i:
            rendered.append("\n" if kind == "li" and items[i - 1][0] == "li" else "\n\n")
        rendered.append(marker + text)
    return "".join(rendered)


def _drop_prefix(line, count):
    """A copy of the line with its first count characters removed across spans.

    Strips a list marker from the raw text before emphasis is applied, so a bold
    "1. Item" doesn't come back as "1. **1. Item**".
    """
    spans = []
    for span in line.get("spans", []):
        text = span.get("text", "")
        cut = min(count, len(text))
        count -= cut
        if text[cut:]:
            spans.append({**span, "text": text[cut:]})
    return {**line, "spans": spans}


_RENDERED_ITEM_RE = re.compile(r"^(?:(- )|\d+\. )")


def _item_kind(line):
    """"-" or "1." for a rendered list item line, None for anything else."""
    m = _RENDERED_ITEM_RE.match(line)
    return None if not m else ("-" if m.group(1) else "1.")


def join_parts(parts):
    """Join rendered blocks with blank lines, keeping a list tight across them.

    MuPDF often puts each list item in a block of its own, and a blank line
    between items would make a loose list.
    """
    out = []
    for part in parts:
        if out:
            kind = _item_kind(part)
            tight = kind is not None and kind == _item_kind(out[-1].rsplit("\n", 1)[-1])
            out.append("\n" if tight else "\n\n")
        out.append(part)
    return "".join(out)


def _inside(bbox, rect):
    x0, y0, x1, y1 = bbox
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return rect[0] <= cx <= rect[2] and rect[1] <= cy <= rect[3]


def page_markdown(blocks, levels, tables=(), links=()):
    """Render a page's blocks in reading order, swapping table regions for their Markdown.

    tables is a list of (bbox, markdown). A table replaces the first text block
    that falls inside it, and the rest of the blocks inside it are dropped, so
    its cells don't also come out as loose paragraphs.
    """
    parts = []
    emitted = set()
    for block in blocks:
        if block.get("type", 0) != 0:
            continue
        hit = next((i for i, (rect, _md) in enumerate(tables) if _inside(block["bbox"], rect)), None)
        if hit is not None:
            if hit not in emitted:
                emitted.add(hit)
                parts.append(tables[hit][1].strip())
            continue
        rendered = block_markdown(block, levels, links)
        if rendered:
            parts.append(rendered)
    parts.extend(md.strip() for i, (_rect, md) in enumerate(tables) if i not in emitted and md.strip())
    return join_parts(parts)


def table_markdown(rows):
    """A GFM table from extracted cell rows, the first row as header.

    Built here rather than with Table.to_markdown() so cells get the same
    escaping as body text: a "|" can't shift columns and markup in a cell
    can't reach the renderer.
    """
    rows = [row for row in rows if row]
    if not rows:
        return ""
    width = max(len(row) for row in rows)

    def cells(row):
        padded = list(row) + [None] * (width - len(row))
        return "|" + "|".join(escape_inline(" ".join((c or "").split())) for c in padded) + "|"

    return "\n".join([cells(rows[0]), "|" + "---|" * width] + [cells(r) for r in rows[1:]])


def _page_tables(page):
    """(bbox, markdown) for each table on the page; any finder failure means no tables."""
    try:
        found = page.find_tables()
        return [(tuple(t.bbox), table_markdown(t.extract())) for t in found.tables]
    except Exception as exc:  # noqa: BLE001
        print(f"[doc_markdown] table detection skipped on page {page.number}: {exc!r}", file=sys.stderr)
        return []


def _page_links(page):
    links = []
    for link in page.get_links():
        uri = _safe_uri(link.get("uri"))
        if uri:
            r = link["from"]
            links.append(((r.x0, r.y0, r.x1, r.y1), uri))
    return links


def main():
    args = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    path, out = args.get("path"), args.get("out")
    if not path or not out:
        print(json.dumps({"error": "missing path/out"}))
        sys.exit(1)
    try:
        # Keep MuPDF diagnostics off the one-JSON-line stdout (#843/#898).
        import pymupdf

        pymupdf.set_messages(stream=sys.stderr)
        # find_tables() print()s a one-time "consider pymupdf_layout" nag
        # straight to stdout, outside the message system.
        if hasattr(pymupdf, "no_recommend_layout"):
            pymupdf.no_recommend_layout()
    except Exception as exc:  # noqa: BLE001
        print(f"[doc_markdown] pymupdf message redirect unavailable: {exc}", file=sys.stderr)
    try:
        import fitz
    except ImportError:
        print(json.dumps({"error": "PyMuPDF not installed"}))
        sys.exit(1)
    try:
        doc = fitz.open(path)
        try:
            # Images are dropped anyway; without this every image block keeps
            # its raw bytes for the whole run.
            flags = (fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES) | fitz.TEXT_DEHYPHENATE
            pages = [page.get_text("dict", flags=flags).get("blocks", []) for page in doc]
            # Sizes are ranked across the whole document so a chapter title is
            # the same level on every page.
            all_blocks = [block for blocks in pages for block in blocks]
            levels = heading_levels(all_blocks, body_size(all_blocks))
            rendered = []
            for page, blocks in zip(doc, pages):
                text = page_markdown(blocks, levels, _page_tables(page), _page_links(page))
                if text:
                    rendered.append(text)
        finally:
            doc.close()
        markdown = join_parts(rendered).strip() + "\n"
        with open(out, "w", encoding="utf-8") as fh:
            fh.write(markdown)
        print(json.dumps({"chars": len(markdown)}))
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc).strip() or type(exc).__name__}))
        sys.exit(1)


if __name__ == "__main__":
    main()
