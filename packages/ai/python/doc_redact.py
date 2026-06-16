"""True redaction: remove every occurrence of the given terms, then VERIFY
none remain extractable. Args: {"path": in, "out": out, "terms": [".."],
"caseSensitive": false}. Prints {"found": N, "verified": true}.

Case sensitivity: fitz.Page.search_for is ALWAYS case-insensitive, so when
caseSensitive=true we post-filter the hits to only those whose on-page glyphs
match the term's exact case (checked with get_textbox). caseSensitive=false
redacts every case variant. The verification pass applies the same casing
rule, so it proves the intended occurrences are gone."""
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
                if case_sensitive:
                    # search_for is always case-insensitive; keep only the
                    # exact-case hits by checking the glyphs under each quad.
                    quads = [
                        q
                        for q in page.search_for(term, quads=True, flags=flags)
                        if term in page.get_textbox(q.rect)
                    ]
                else:
                    quads = page.search_for(term, quads=True)
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
