"""Convert a font between TTF, OTF, WOFF and WOFF2 with fontTools.

Args: {"path": "/abs/in", "out": "/abs/out", "format": "ttf|otf|woff|woff2"}.
Prints {"ok": true, "format": ...}. A bad upload prints {"inputError": ...} and
exits 0, since the script worked and the dispatcher must not count it as a
failure; anything else prints {"error": ...} and exits 1.

WOFF and WOFF2 are compressed wrappers, so wrapping or unwrapping keeps the
outlines unchanged. TTF needs quadratic (glyf) outlines and OTF needs cubic
(CFF) ones, so crossing between them redraws every glyph: CFF to TrueType
approximates each cubic curve within CURVE_TOLERANCE font units (lossy), while
TrueType to CFF keeps each curve's shape and only rounds control points to whole
font units. The OS/2 fsType embedding bits are left untouched.
"""

import json
import re
import struct
import sys
import zlib

FORMATS = ("ttf", "otf", "woff", "woff2")

DAMAGED_MESSAGE = "This font file is damaged or not a supported font, so it couldn't be read."

# Max distance, in font units, between a cubic curve and its quadratic
# replacement. 1 unit is fontTools' own otf2ttf default and invisible at any
# practical size (a 1000-unit em at 1000 px is 1 px).
CURVE_TOLERANCE = 1.0

# TrueType instruction tables mean nothing once the outlines are CFF.
TRUETYPE_ONLY_TABLES = ("glyf", "loca", "fpgm", "prep", "cvt ", "gasp", "hdmx", "LTSH", "VDMX")

# Largest decompressed font accepted from a WOFF or WOFF2. Real fonts, CJK and
# variable ones included, stay well under 64 MB; a small crafted file must not
# be able to inflate the shared docs dispatcher out of memory.
MAX_SFNT_BYTES = 64 * 1024 * 1024

TOO_LARGE_MESSAGE = "This font is too large to convert once decompressed."

# What a CFF name string may hold: PostScript-safe printable ASCII.
PS_NAME_UNSAFE = re.compile(r"[^!-~]|[\[\](){}<>/%]")


class FontInputError(Exception):
    """The upload is not a font this tool can convert; the message is user-facing."""


def detect_format(header: bytes):
    """Container format from the first four bytes, or None when unrecognised."""
    magic = header[:4]
    if magic in (b"\x00\x01\x00\x00", b"true"):
        return "ttf"
    if magic == b"OTTO":
        return "otf"
    if magic == b"wOFF":
        return "woff"
    if magic == b"wOF2":
        return "woff2"
    if magic == b"ttcf":
        raise FontInputError(
            "Font collections (.ttc) aren't supported. Extract a single font first."
        )
    return None


def outline_kind(table_tags) -> str:
    """'truetype', 'cff' or 'cff2' from a font's table tags."""
    tags = set(table_tags)
    if "glyf" in tags:
        return "truetype"
    if "CFF2" in tags:
        return "cff2"
    if "CFF " in tags:
        return "cff"
    raise FontInputError("This font has no glyph outlines to convert.")


def plan(source_tags, target: str) -> str:
    """Outline change a conversion needs: 'keep', 'to_truetype' or 'to_cff'."""
    if target not in FORMATS:
        raise ValueError(f"unknown target format {target!r}")
    kind = outline_kind(source_tags)
    if target == "ttf" and kind != "truetype":
        if kind == "cff2":
            raise FontInputError(
                "Variable CFF2 fonts can't be converted to TTF. Convert them to WOFF or WOFF2 instead."
            )
        return "to_truetype"
    if target == "otf" and kind != "cff":
        if kind == "cff2":
            # OTTO-flavoured already; saving as-is keeps it a valid .otf.
            return "keep"
        if "fvar" in set(source_tags):
            raise FontInputError(
                "Variable TrueType fonts can't be converted to OTF. Convert them to WOFF or WOFF2 instead."
            )
        return "to_cff"
    return "keep"


def postscript_name(name):
    """A CFF-safe PostScript name: printable ASCII, no delimiters, 63 chars max."""
    cleaned = PS_NAME_UNSAFE.sub("", name or "")[:63]
    return cleaned or "Font"


def latin1_text(value):
    """CFF strings are Latin-1; drop what cannot be encoded rather than fail."""
    if not value:
        return value
    return value.encode("latin-1", "ignore").decode("latin-1").strip()


def check_woff_size(data: bytes) -> None:
    """Refuse a WOFF whose tables inflate past their declared sizes or the cap."""
    num_tables, total = struct.unpack(">H2xI", data[12:20])
    if total > MAX_SFNT_BYTES:
        raise FontInputError(TOO_LARGE_MESSAGE)
    declared = 0
    for i in range(num_tables):
        entry = data[44 + 20 * i : 64 + 20 * i]
        if len(entry) < 20:
            raise FontInputError(DAMAGED_MESSAGE)
        _tag, offset, comp_length, orig_length, _checksum = struct.unpack(">4sIIII", entry)
        declared += orig_length
        if declared > MAX_SFNT_BYTES:
            raise FontInputError(TOO_LARGE_MESSAGE)
        if comp_length < orig_length:
            inflater = zlib.decompressobj()
            try:
                inflater.decompress(data[offset : offset + comp_length], orig_length)
            except zlib.error as exc:
                raise FontInputError(DAMAGED_MESSAGE) from exc
            if inflater.unconsumed_tail:
                raise FontInputError(DAMAGED_MESSAGE)


class CappedBrotli:
    """Stands in for fontTools.ttLib.woff2's brotli module so a WOFF2's one
    compressed stream can never decompress past MAX_SFNT_BYTES."""

    def __init__(self, brotli):
        self._brotli = brotli

    def __getattr__(self, name):
        return getattr(self._brotli, name)

    def decompress(self, data):
        decompressor = self._brotli.Decompressor()
        out = decompressor.process(data, output_buffer_limit=MAX_SFNT_BYTES + 1)
        if len(out) > MAX_SFNT_BYTES or not decompressor.is_finished():
            raise FontInputError(TOO_LARGE_MESSAGE)
        return out


def to_truetype(font) -> None:
    """Replace CFF outlines with quadratic glyf outlines (fontTools' otf2ttf recipe)."""
    from fontTools.pens.cu2quPen import Cu2QuPen
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.ttLib import newTable

    glyph_order = font.getGlyphOrder()
    glyph_set = font.getGlyphSet()
    glyphs = {}
    for name in glyph_order:
        tt_pen = TTGlyphPen(glyph_set)
        glyph_set[name].draw(Cu2QuPen(tt_pen, CURVE_TOLERANCE, reverse_direction=True))
        glyphs[name] = tt_pen.glyph()

    font["loca"] = newTable("loca")
    font["glyf"] = glyf = newTable("glyf")
    glyf.glyphOrder = glyph_order
    glyf.glyphs = glyphs
    del font["CFF "]
    for tag in ("VORG", "DSIG"):
        if tag in font:
            del font[tag]
    glyf.compile(font)

    hmtx = font["hmtx"]
    for name, glyph in glyf.glyphs.items():
        if hasattr(glyph, "xMin"):
            hmtx[name] = (hmtx[name][0], glyph.xMin)

    font["maxp"] = maxp = newTable("maxp")
    maxp.tableVersion = 0x00010000
    maxp.maxZones = 1
    maxp.maxTwilightPoints = 0
    maxp.maxStorage = 0
    maxp.maxFunctionDefs = 0
    maxp.maxInstructionDefs = 0
    maxp.maxStackElements = 0
    maxp.maxSizeOfInstructions = 0
    maxp.maxComponentElements = max(
        (len(getattr(g, "components", [])) for g in glyf.glyphs.values()), default=0
    )
    maxp.compile(font)

    post = font["post"]
    post.formatType = 2.0
    post.extraNames = []
    post.mapping = {}
    post.glyphOrder = glyph_order
    try:
        post.compile(font)
    except OverflowError:
        post.formatType = 3.0

    font["head"].glyphDataFormat = 0
    font.sfntVersion = "\x00\x01\x00\x00"


def to_cff(font) -> None:
    """Replace glyf outlines with exact cubic CFF outlines."""
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.reverseContourPen import ReverseContourPen
    from fontTools.pens.t2CharStringPen import T2CharStringPen
    from fontTools.ttLib import newTable

    glyph_order = font.getGlyphOrder()
    glyph_set = font.getGlyphSet()
    hmtx = font["hmtx"]
    char_strings = {}
    for name in glyph_order:
        # TrueType outer contours run clockwise, CFF ones counter-clockwise.
        pen = T2CharStringPen(hmtx[name][0], glyph_set)
        glyph_set[name].draw(ReverseContourPen(pen))
        char_strings[name] = pen.getCharString()

    name_table = font["name"]
    ps_name = postscript_name(name_table.getDebugName(6))
    font_info = {}
    for key, name_id in (("FullName", 4), ("FamilyName", 1), ("Copyright", 0)):
        value = latin1_text(name_table.getDebugName(name_id))
        if value:
            font_info[key] = value

    for tag in (*TRUETYPE_ONLY_TABLES, "DSIG"):
        if tag in font:
            del font[tag]

    builder = FontBuilder(font=font, isTTF=False)
    builder.setupCFF(ps_name, font_info, char_strings, {})

    font["maxp"] = maxp = newTable("maxp")
    maxp.tableVersion = 0x00005000
    maxp.numGlyphs = len(glyph_order)

    post = font["post"]
    post.formatType = 3.0
    font.sfntVersion = "OTTO"


def decode_fully(font) -> None:
    font.ensureDecompiled(recurse=True)
    if "glyf" in font:
        glyf = font["glyf"]
        for name in font.getGlyphOrder():
            glyf[name]  # indexing expands the glyph
    for tag in ("CFF ", "CFF2"):
        if tag in font:
            for top in font[tag].cff.topDictIndex:
                for charstring in top.CharStrings.values():
                    charstring.decompile()


def convert(in_path: str, out_path: str, target: str) -> None:
    import brotli
    from fontTools.ttLib import TTFont, TTLibError, woff2

    with open(in_path, "rb") as handle:
        data = handle.read()
    source = detect_format(data[:4])
    if source is None:
        raise FontInputError("This file isn't a TTF, OTF, WOFF or WOFF2 font.")
    if source == "woff":
        check_woff_size(data)
    if not isinstance(woff2.brotli, CappedBrotli):
        woff2.brotli = CappedBrotli(woff2.brotli)

    # Decode every table, glyph and charstring up front so a damaged upload
    # fails here, as the user's input, and never later inside conversion or
    # save(). lazy=False alone still leaves glyphs and charstrings packed.
    try:
        font = TTFont(in_path, lazy=False)
        decode_fully(font)
        step = plan(font.keys(), target)
    except FontInputError:
        raise
    except (
        TTLibError,
        KeyError,
        ValueError,
        AssertionError,
        EOFError,
        IndexError,
        struct.error,
        zlib.error,
        brotli.error,
    ) as exc:
        raise FontInputError(DAMAGED_MESSAGE) from exc

    if step == "to_truetype":
        to_truetype(font)
    elif step == "to_cff":
        to_cff(font)
    font.flavor = target if target in ("woff", "woff2") else None
    font.save(out_path)


def main():
    args = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    in_path, out_path, target = args.get("path"), args.get("out"), args.get("format")
    if not in_path or not out_path or target not in FORMATS:
        print(json.dumps({"error": "missing path, out or format"}))
        sys.exit(1)
    try:
        convert(in_path, out_path, target)
    except FontInputError as exc:
        print(json.dumps({"inputError": str(exc)}))
        return
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc).strip() or type(exc).__name__}))
        sys.exit(1)
    print(json.dumps({"ok": True, "format": target}))


if __name__ == "__main__":
    main()
