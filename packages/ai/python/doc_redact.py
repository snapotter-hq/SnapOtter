"""True redaction: remove every occurrence of the given terms, then VERIFY
none remain extractable. Args: {"path": in, "out": out, "terms": [".."],
"caseSensitive": false}. Prints {"found": N, "verified": true}.

Case-sensitivity note (PyMuPDF 1.27.2): fitz.Page.search_for is ALWAYS
case-insensitive. When caseSensitive=true is requested, the search phase
still finds all case variants (over-redaction, which is the safe direction
for a legal redaction tool). The verification pass then enforces exact-case
matching, so a caseSensitive=true request only reports leakage when the
exact-case term survives. This is the sanctioned fallback documented in
the wave-2 plan."""
import json
import sys


def main():
    args = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    path, out, terms = args.get("path"), args.get("out"), args.get("terms") or []
    case_sensitive = bool(args.get("caseSensitive", False))
    if not path or not out or not isinstance(terms, list) or not terms:
        print(json.dumps({"error": "missing path/out/terms"}))
        sys.exit(1)
    try:
        import fitz
    except ImportError:
        print(json.dumps({"error": "PyMuPDF not installed"}))
        sys.exit(1)
    try:
        doc = fitz.open(path)
        flags = fitz.TEXT_DEHYPHENATE
        found = 0
        for page in doc:
            for term in terms:
                quads = page.search_for(term, quads=True, flags=flags) if case_sensitive else page.search_for(term, quads=True)
                for quad in quads:
                    page.add_redact_annot(quad, fill=(0, 0, 0))
                    found += 1
            page.apply_redactions()
        doc.save(out, garbage=4, deflate=True)
        doc.close()
        # Verification pass: reopen and prove no term is extractable anymore.
        check = fitz.open(out)
        leaked = []
        for page in check:
            text = page.get_text()
            haystack = text if case_sensitive else text.lower()
            for term in terms:
                needle = term if case_sensitive else term.lower()
                if needle and needle in haystack:
                    leaked.append(term)
        check.close()
        if leaked:
            print(json.dumps({"error": f"verification failed: terms still extractable: {sorted(set(leaked))}"}))
            sys.exit(1)
        print(json.dumps({"found": found, "verified": True}))
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
