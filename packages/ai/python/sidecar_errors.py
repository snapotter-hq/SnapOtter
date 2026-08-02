"""
Structured error envelope for the sidecar. Mirrors the Node redactMessage so a
Python failure reaches Sentry with its type, a redacted message, and our own
stack frames (basename only) instead of a bare "Error: Error".
"""
import os
import re
import traceback

# _CTRL: matches ASCII control chars 0x00-0x1F and 0x7F only. Written with \x
# hex escapes so no literal control bytes appear in this file. It must NOT match
# spaces, "/", ".", or any printable character.
_CTRL = re.compile(r"[\x00-\x1f\x7f]")
_BLOB = re.compile(r"blob:[^\s\"')]+")
_DATA = re.compile(r"data:[^\s\"')]+")
_URL = re.compile(r"https?://[^\s\"')]+")
_PATH = re.compile(r"(?:/(?:Users|home|root|data|tmp|var|app|opt|mnt|srv)|[A-Za-z]:\\)[^\s\"')]*")
# Relative object-storage keys (uploads/<jobId>/…, outputs/…, previews/…) carry a
# user-supplied filename tail; mask them like absolute paths. Runs after _PATH,
# which already swallows the absolute /data/uploads/… form.
_RELKEY = re.compile(r"\b(?:uploads|outputs|previews)/[^\s\"')]+")
_IP = re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b")
# IPv6: a full 8-group form, or any ::-compressed form (::1, fe80::…, …::). The
# negative lookbehind/lookahead ((?<![\w:]) … (?![\w:])) require the address to
# stand alone, so C++/Rust scope resolution (std::bad_alloc, core::result) is left
# intact. A plain decimal version like 2.2.0 has no colons, and a bare HH:MM needs
# no ::, so both survive too.
_IPV6 = re.compile(
    r"(?<![\w:])(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|"
    r"(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4})*)?::(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4})*)?)(?![\w:])"
)
_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_USER_FILE_EXT = (
    "jpe?g|png|gif|webp|avif|heif?|tiff?|bmp|svg|raw|psd|mp4|mov|avi|mkv|webm|"
    "flv|wmv|m4v|mp3|wav|flac|aac|ogg|m4a|opus|pdf|docx?|xlsx?|pptx?|odt|ods|"
    "odp|txt|csv|epub|zip"
)
_FILE = re.compile(r"\b[\w-]{1,80}\.(?:" + _USER_FILE_EXT + r")\b", re.IGNORECASE)
_QUOTED = re.compile(r"(['\"])(.{24,}?)\1")
_HEX = re.compile(r"\b[0-9a-fA-F]{16,}\b")
_MAX_LEN = 300
_SIDECAR_DIR = os.path.dirname(os.path.abspath(__file__))


def redact(message):
    s = _CTRL.sub(" ", str(message or ""))
    s = _BLOB.sub("<blob>", s)
    s = _DATA.sub("<data>", s)
    s = _URL.sub("<url>", s)
    s = _PATH.sub("<path>", s)
    s = _RELKEY.sub("<path>", s)
    s = _IP.sub("<ip>", s)
    s = _IPV6.sub("<ip>", s)
    s = _EMAIL.sub("<email>", s)
    s = _QUOTED.sub(lambda m: m.group(1) + "<value>" + m.group(1), s)
    s = _HEX.sub("<hex>", s)
    s = _FILE.sub("<file>", s)
    s = re.sub(r"\s+", " ", s).strip()
    return (s[:_MAX_LEN] + "…") if len(s) > _MAX_LEN else s


def _our_frames(exc):
    frames = []
    for fr in traceback.extract_tb(exc.__traceback__):
        # Keep only our sidecar-script frames; drop stdlib and venv/site-packages.
        if os.path.dirname(os.path.abspath(fr.filename)) != _SIDECAR_DIR:
            continue
        frames.append({"file": os.path.basename(fr.filename), "line": fr.lineno, "func": fr.name})
    return frames[-20:]


def build_error_envelope(exc):
    """A JSON-serializable {type, message, frames} describing a caught exception."""
    return {
        "type": type(exc).__name__,
        "message": redact(str(exc)),
        "frames": _our_frames(exc),
    }
