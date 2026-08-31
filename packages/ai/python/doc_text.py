"""Extract plain text. Args: {"path": in, "out": out-txt-path}. Prints {"chars": N, "hasText": bool}."""
import json
import re
import sys
import unicodedata

# Arabic Presentation Forms-A (U+FB50..U+FDFF) and Forms-B (U+FE70..U+FEFF).
# Unicode keeps these blocks for compatibility only: they hold one codepoint per
# position-specific glyph shape, and real text is meant to store base letters and
# let the renderer shape them. Producers that shape Arabic themselves before
# drawing (common, since it sidesteps needing a shaping engine) write the shaped
# forms into the font's ToUnicode map, so extraction hands back a string that
# looks right but compares equal to nothing (#724).
_PRESENTATION_FORMS_RE = re.compile("[\uFB50-\uFDFF\uFE70-\uFEFF]+")


def normalize_presentation_forms(text):
    """Fold Arabic presentation forms back to the base letters they stand for.

    NFKC is applied per matched run rather than to the whole string so it cannot
    rewrite unrelated content the caller expects verbatim: whole-string NFKC also
    expands the fi ligature, fullwidth Latin and superscript digits. Characters in
    these blocks that carry no compatibility mapping (the zero-width no-break
    space at U+FEFF, the noncharacters at U+FDD0..U+FDEF) pass through unchanged,
    because NFKC leaves them alone.

    "Base letters" is exact for the letter forms and approximate for the harakat
    forms at U+FE70..U+FE7F, which decompose to a carrier plus the mark rather
    than to a letter: U+FE77 becomes U+0640 U+064E, so vocalized text comes back
    with a tatweel where the shaped form used to be. That is still a large
    improvement on an unmatchable presentation codepoint, and the alternative is
    a hand-maintained mapping table, so NFKC stays.
    """
    return _PRESENTATION_FORMS_RE.sub(
        lambda match: unicodedata.normalize("NFKC", match.group()), text
    )


def has_readable_text(text):
    """True when extraction produced at least one character a human could read.

    Rejects the two things MuPDF hands back when a glyph carries no Unicode
    value: control codepoints, which is what a font with no ToUnicode map yields
    for glyph ids below 0x20, and U+FFFD, its stand-in for a glyph it cannot map
    at all. Those are not whitespace, so the older `.strip()` test accepted them
    as real text and the user downloaded a .txt that renders blank (#724).
    Format codepoints go too, so a page of nothing but bidi direction marks does
    not count. Whitespace is tested separately because Zs/Zl/Zp are not C
    categories, so a page of spaces would otherwise read as text.

    Deliberately narrower than "any C* category". Private-use stays readable
    because symbolic fonts decode legitimately to U+F0xx, and unassigned stays
    readable because which codepoints are unassigned depends on the interpreter's
    Unicode version, which differs between the arm64 and amd64 images. Judging
    either unreadable would reject a PDF whose text layer decoded fine, on one
    architecture only.

    This does not catch every unmappable font, and cannot. A subset font with
    more than 31 glyphs produces ids at or above 0x20, so "Hello" arrives as
    "+HOOR": ordinary letters, indistinguishable from real text at this level.
    """
    return any(
        not char.isspace()
        and char != "\uFFFD"
        and unicodedata.category(char) not in ("Cc", "Cf")
        for char in text
    )


def main():
    args = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    path, out = args.get("path"), args.get("out")
    if not path or not out:
        print(json.dumps({"error": "missing path/out"}))
        sys.exit(1)
    try:
        # PyMuPDF's message system writes to sys.stdout by default, and MuPDF
        # damage diagnostics ("error: cannot find object in xref (14 0 R)")
        # are routed through it. This stdout is a one-JSON-line protocol; keep
        # library messages on stderr (#843/#898, Sentry NODE-5M/NODE-60).
        # Redirect before importing fitz so the alias deprecation notice lands
        # on stderr too.
        import pymupdf

        pymupdf.set_messages(stream=sys.stderr)
    except Exception as exc:  # noqa: BLE001
        # Degraded mode: MuPDF noise will share the JSON channel. Leave a
        # breadcrumb on stderr so the failed redirect is visible in bridge logs.
        print(f"[doc_text] pymupdf message redirect unavailable: {exc}", file=sys.stderr)
    try:
        import fitz
    except ImportError:
        print(json.dumps({"error": "PyMuPDF not installed"}))
        sys.exit(1)
    try:
        doc = fitz.open(path)
        parts = [normalize_presentation_forms(page.get_text()) for page in doc]
        doc.close()
        text = "\n".join(parts)
        # hasText separates a PDF with a usable text layer from one that has
        # nothing to give: a scanned or image-only page returns "" so only the
        # join newlines remain (#589), and a page whose font carries no ToUnicode
        # map returns raw glyph ids that render blank (#724). len(text) alone
        # can't tell any of them apart, so the caller uses this to offer OCR
        # instead of handing back a file the user will read as empty.
        has_text = any(has_readable_text(part) for part in parts)
        with open(out, "w", encoding="utf-8") as fh:
            fh.write(text)
        print(json.dumps({"chars": len(text), "hasText": has_text}))
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
