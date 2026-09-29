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

    Glyph ids at or above 0x20 are ordinary letters ("Hello" arrives as "+HOOR")
    and no per-character test can separate them from real text. main() handles
    that case before calling this, with draws_unmapped_composite_font (#955).
    """
    return any(
        not char.isspace()
        and char != "\uFFFD"
        and unicodedata.category(char) not in ("Cc", "Cf")
        for char in text
    )


def draws_unmapped_composite_font(page):
    """True when the page uses a composite (Type0) font with no ToUnicode map.

    That is the one font shape whose unmapped glyphs come back as glyph ids:
    PyMuPDF's default text flags include TEXT_CID_FOR_UNKNOWN_UNICODE, which
    swaps each glyph MuPDF could not map for its CID, and under Identity-H the
    CID is the glyph id, so "Hello" reads as "+HOOR" (#955). Simple fonts are
    left out on purpose. Their fallback is the character code rather than the
    glyph id, those codes are often plain ASCII that reads correctly, and
    base-14 fonts extract through their standard encoding with no ToUnicode at
    all (tests/fixtures/document/valid/test-3page.pdf).

    Reads the page's font resources, not what it actually draws, so an unused
    unmapped Type0 font in shared resources also answers True. The caller then
    judges that page on MuPDF's U+FFFD marker, which leaves correctly mapped
    text readable, so the only cost is a second get_text on that page.
    """
    doc = page.parent
    return any(
        ftype == "Type0" and doc.xref_get_key(xref, "ToUnicode")[0] == "null"
        for xref, _ext, ftype, *_rest in page.get_fonts()
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
        # Same as the default flags minus the glyph-id substitution, so a glyph
        # MuPDF could not map comes back as U+FFFD instead of a plausible letter.
        unmapped_as_fffd = fitz.TEXTFLAGS_TEXT & ~fitz.TEXT_CID_FOR_UNKNOWN_UNICODE
        doc = fitz.open(path)
        parts, judged = [], []
        for page in doc:
            part = normalize_presentation_forms(page.get_text())
            parts.append(part)
            # The .txt keeps the default extraction either way; only the
            # readability verdict looks through the glyph ids (#955).
            judged.append(
                page.get_text(flags=unmapped_as_fffd)
                if draws_unmapped_composite_font(page)
                else part
            )
        doc.close()
        text = "\n".join(parts)
        # hasText separates a PDF with a usable text layer from one that has
        # nothing to give: a scanned or image-only page returns "" so only the
        # join newlines remain (#589), a page whose font carries no ToUnicode
        # map returns raw glyph ids that render blank (#724), and a composite
        # font with no map returns glyph ids that look like letters (#955).
        # len(text) alone can't tell any of them apart, so the caller uses this
        # to offer OCR instead of handing back a file the user can't read.
        has_text = any(has_readable_text(part) for part in judged)
        with open(out, "w", encoding="utf-8") as fh:
            fh.write(text)
        print(json.dumps({"chars": len(text), "hasText": has_text}))
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
