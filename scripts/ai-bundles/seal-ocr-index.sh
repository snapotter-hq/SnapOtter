#!/usr/bin/env bash
set -e
python3 - <<'PY'
import base64
import json
import os
from pathlib import Path

root = Path("/tmp/ocr-index")

def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()

unsigned_path = root / "ocr-runtime-index.unsigned.json"
unsigned_bytes = unsigned_path.read_bytes()
unsigned = json.loads(unsigned_bytes)
unsigned["signature"] = {
    "algorithm": "ed25519",
    "keyId": os.environ["OCR_RUNTIME_INDEX_KEY_ID"],
    "value": base64.b64encode((root / "ocr-runtime-index.signature").read_bytes()).decode(),
}
sealed_path = root / "ocr-runtime-index.json"
sealed_path.write_bytes(canonical(unsigned))
sealed = json.loads(sealed_path.read_bytes())
sealed.pop("signature")
if canonical(sealed) != unsigned_bytes:
    raise SystemExit("sealed OCR index does not reconstruct its signed payload")

trust = {
    "keys": [{
        "algorithm": "ed25519",
        "keyId": os.environ["OCR_RUNTIME_INDEX_KEY_ID"],
        "publicKey": (root / "trusted-public.pem").read_text(),
    }],
    "schemaVersion": 1,
}
(root / "ocr-runtime-trusted-keys.json").write_bytes(canonical(trust))
PY
rm -f \
  /tmp/ocr-index/private.pem \
  /tmp/ocr-index/configured-public.pem \
  /tmp/ocr-index/derived-public.pem \
  /tmp/ocr-index/ocr-runtime-index.signature
