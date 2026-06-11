"""Health probe for the docs-profile dispatcher. No dependencies. Prints {"ok": true}."""
import json
import sys


def main():
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
