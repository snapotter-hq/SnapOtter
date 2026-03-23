"""Pre-download all rembg models offered in the UI."""
import sys

MODELS = [
    "u2net",
    "isnet-general-use",
    "bria-rmbg",
    "birefnet-general-lite",
    "birefnet-portrait",
    "birefnet-general",
]

try:
    from rembg import new_session
except ImportError:
    print("WARNING: rembg not installed, skipping model pre-download")
    sys.exit(0)

for model in MODELS:
    print(f"Downloading {model}...")
    try:
        new_session(model)
        print(f"  {model} ready")
    except Exception as e:
        print(f"  WARNING: {model} failed: {e}")

print("Model pre-download complete")
