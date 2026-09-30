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


# Leading object number of an indirect reference such as "10 0 R" or "[10 0 R]".
_REF_RE = re.compile(r"\[?\s*(\d+)\s+\d+\s+R")
# A CIDToGIDMap that points at a stream rather than being /Identity.
_CID_TO_GID_STREAM_RE = re.compile(r"/CIDToGIDMap\s*\d+\s+\d+\s+R")


def _object_number(doc, text):
    """The object a reference string points at, or None if it is not one or is out of range."""
    ref = _REF_RE.match(text)
    if not ref:
        return None
    number = int(ref.group(1))
    return number if 0 < number < doc.xref_length() else None


def _falls_back_to_glyph_ids(doc, xref, prefix=""):
    """True when an unmapped glyph in this Type0 font would come back as its glyph id.

    The font dict is object xref, or, with a prefix such as
    "Resources/Font/F1/", the dict at that key path under object xref (an
    inline font, see _inline_font_location).

    Needs both halves. No ToUnicode stream: a missing key, a name such as
    /Identity-H, or a reference to nothing all leave MuPDF without a map. And a
    CID that is the glyph id: the descendant font's CIDToGIDMap absent or
    /Identity. Producers that store Unicode as the CID and map it to glyphs
    through a CIDToGIDMap stream (the tFPDF and TCPDF style) fall back to the
    CID too, but there the CID is the right character, so that text reads fine
    today and must not be sent to OCR.

    Only reads objects whose numbers are in range, so a damaged font dict makes
    this answer False (the behaviour before #955) instead of raising.
    """
    if not 0 < xref < doc.xref_length():
        return False
    to_unicode = _object_number(doc, doc.xref_get_key(xref, prefix + "ToUnicode")[1])
    if to_unicode is not None and doc.xref_is_stream(to_unicode):
        return False
    descendant = doc.xref_get_key(xref, prefix + "DescendantFonts")[1]
    # DescendantFonts is an array holding the CIDFont, sometimes itself behind a
    # reference; follow at most those two hops, then read the CIDFont's text.
    for _hop in range(2):
        number = _object_number(doc, descendant)
        if number is None:
            break
        descendant = doc.xref_object(number, compressed=True)
    return not _CID_TO_GID_STREAM_RE.search(descendant)


# Page tree nodes to climb looking for inherited Resources. Real trees are a
# handful deep; the cap only stops a Parent loop in a damaged file.
_MAX_PAGE_TREE_DEPTH = 32


def _inline_font_location(page, referencer, refname):
    """(xref, key prefix) addressing an inline font dict, or None if it can't be found.

    get_fonts reports an inline dict as xref 0, and xref_get_key(0) raises, so
    the dict is read as a key path instead, which PyMuPDF resolves through any
    references on the way. It lives in the Resources of whatever uses the font:
    a Form XObject when get_fonts(full=True) names one as the referencer,
    otherwise the page, or the nearest Pages ancestor when the page inherits
    its Resources.

    A missing key reads as ('null', 'null'), the same as /ToUnicode null, so
    the dict itself has to resolve before any of its keys are trusted. A
    refname that decodes to contain "/" (written /F#2F1) splits the key path
    and is not found, which leaves that font unchecked as it was before #1566.
    """
    doc = page.parent
    holder = referencer or page.xref
    for _hop in range(_MAX_PAGE_TREE_DEPTH):
        if not 0 < holder < doc.xref_length():
            return None
        if doc.xref_get_key(holder, "Resources")[0] != "null":
            path = "Resources/Font/" + refname
            return (holder, path + "/") if doc.xref_get_key(holder, path)[0] == "dict" else None
        if referencer:
            return None
        holder = _object_number(doc, doc.xref_get_key(holder, "Parent")[1])
        if holder is None:
            return None
    return None


def draws_unmapped_composite_font(page):
    """True when the page uses a composite (Type0) font whose fallback is glyph ids.

    PyMuPDF's default text flags include TEXT_CID_FOR_UNKNOWN_UNICODE, which
    swaps each glyph MuPDF could not map for its CID. For a Type0 font with no
    ToUnicode map and CID = glyph id, "Hello" then reads as "+HOOR" (#955).
    Simple fonts are left out on purpose. Their fallback is the character code
    rather than the glyph id, those codes are often plain ASCII that reads
    correctly, and base-14 fonts extract through their standard encoding with
    no ToUnicode at all (tests/fixtures/document/valid/test-3page.pdf).

    Reads the page's font resources, not what it actually draws, so an unused
    unmapped Type0 font in shared resources also answers True. The caller then
    judges that page on MuPDF's U+FFFD marker, which leaves correctly mapped
    text readable, so the only cost is a second get_text on that page. A font
    dict written inline in the resources has no object number (get_fonts
    reports xref 0) and is read through its resources instead (#1566).
    """
    doc = page.parent
    for xref, _ext, ftype, _name, refname, _encoding, referencer, *_rest in page.get_fonts(
        full=True
    ):
        if ftype != "Type0":
            continue
        location = (xref, "") if xref else _inline_font_location(page, referencer, refname)
        if location and _falls_back_to_glyph_ids(doc, *location):
            return True
    return False


# A span needs this many chars MuPDF could map before it's judged, and this
# share of them equal to their glyph ids. Real fonts line a few glyph ids up
# with codepoints by coincidence; a whole span doing it is an identity map.
_MIN_JUDGED_CHARS = 3
_GLYPH_ID_SHARE = 0.9


def _reads_as_glyph_ids(chars):
    """True when nearly every char of a texttrace span has its glyph id as its Unicode."""
    mapped = [char for char in chars if char[0] != 0xFFFD]
    if len(mapped) < _MIN_JUDGED_CHARS:
        return False
    return sum(1 for char in mapped if char[0] == char[1]) >= _GLYPH_ID_SHARE * len(mapped)


def text_without_glyph_id_spans(trace):
    """The page's text minus spans that came out as glyph ids, or None if none did.

    A Type0 font whose ToUnicode is the name /Identity-H rather than a stream
    gets an identity map from MuPDF, so unicode = CID = glyph id and "Hello"
    reads as ",IPPS" (#1566). MuPDF thinks it has a mapping, so there's no
    U+FFFD for the #955 verdict to see. page.get_texttrace() pairs each char's
    Unicode with its glyph id, and in those spans the two are equal, which a
    real font almost never does across a whole span. Measured on PyMuPDF
    1.27.2.3: the case-2 span matched on all 45 chars MuPDF could map, while
    mapped Type0, base-14, CJK, and CID-is-Unicode spans matched on none.

    Judged per span, so a line in another font on the same page still counts.
    U+FFFD stays out of the ratio: texttrace reports glyph ids below 0x20 that
    way, and a #955 span is nothing but U+FFFD, which the caller's own verdict
    already handles. None means no span read as glyph ids.
    """
    kept, dropped = [], False
    for span in trace:
        chars = span["chars"]
        if _reads_as_glyph_ids(chars):
            dropped = True
            continue
        kept.extend(chr(char[0]) for char in chars)
    return "".join(kept) if dropped else None


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
            # readability verdict looks through the glyph ids (#955), and
            # past spans that came out as glyph ids anyway (#1566).
            if draws_unmapped_composite_font(page):
                readable = text_without_glyph_id_spans(page.get_texttrace())
                judged.append(
                    readable if readable is not None else page.get_text(flags=unmapped_as_fffd)
                )
            else:
                judged.append(part)
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
