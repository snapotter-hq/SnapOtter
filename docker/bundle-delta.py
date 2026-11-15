"""Make a bundle's staged site-packages delta self-consistent (#4740).

Usage: bundle-delta.py <site-packages> <staging-site-packages> <base-entries> <manifest>

  site-packages          the build venv's site-packages, after every install step
  staging-site-packages  the delta build-bundle.sh Step 6 copied out of it
  base-entries           Step 1's listing of the base venv's top-level entries
  manifest               feature-manifest.json, for `basePackages`

Step 6 diffs top-level names, so a build that upgrades a package the base venv
already has stages the new `<name>-<version>.dist-info` (a new name) without
the package directory (an old name). Installed, that metadata relabels the
venv's copy of the package. This pass enforces, for every staged distribution:

  * A distribution the base venv already has, or a manifest `basePackages`
    entry, is never shipped: its metadata and any of its files that were
    staged are removed. The shared venv keeps the image's copy, which the
    Dockerfile may have patched (setuptools is), so a bundle's `setuptools<75`
    only shapes its own build. Each one is logged.
  * Any other distribution ships every file its RECORD lists. Files Step 6 left
    out (they sat in a top-level directory the base venv already had, such as a
    namespace package) are copied in from the build venv.

It exits 1 when a staged distribution still lacks files after that, so a build
can never publish metadata without its package.
"""

import csv
import json
import os
import re
import shutil
import sys

DIST_INFO = ".dist-info"


def canonical(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def dist_name(dist_info: str) -> str:
    name, sep, _version = dist_info[: -len(DIST_INFO)].rpartition("-")
    return canonical(name if sep else dist_info[: -len(DIST_INFO)])


def payload(sp: str, dist_info: str) -> list:
    """Files a distribution's RECORD installs inside site-packages, outside its
    own metadata. Bytecode is skipped: pip writes it, archives may not."""
    record = os.path.join(sp, dist_info, "RECORD")
    if not os.path.isfile(record):
        return []
    files = []
    with open(record, newline="", errors="replace") as f:
        for row in csv.reader(f):
            if not row:
                continue
            rel = row[0].strip().replace("\\", "/")
            if (
                not rel
                or rel.startswith("/")
                or ".." in rel.split("/")
                or rel.startswith(dist_info + "/")
                or rel.endswith(".pyc")
                or "/__pycache__/" in f"/{rel}"
            ):
                continue
            files.append(rel)
    return files


def prune_empty_parents(root: str, rel: str) -> None:
    directory = os.path.dirname(os.path.join(root, rel))
    while os.path.abspath(directory) != os.path.abspath(root):
        try:
            os.rmdir(directory)
        except OSError:
            return
        directory = os.path.dirname(directory)


def staged_dist_infos(staging: str) -> list:
    return sorted(
        e
        for e in os.listdir(staging)
        if e.endswith(DIST_INFO) and os.path.isdir(os.path.join(staging, e))
    )


def main(argv: list) -> int:
    if len(argv) != 5:
        print(__doc__.strip().splitlines()[2], file=sys.stderr)
        return 2
    site_packages, staging, base_entries_file, manifest_path = argv[1:]

    with open(manifest_path) as f:
        manifest = json.load(f)
    base_names = set()
    for spec in manifest.get("basePackages", []) or []:
        m = re.match(r"\s*([A-Za-z0-9][A-Za-z0-9._-]*)", spec)
        if m:
            base_names.add(canonical(m.group(1)))
    with open(base_entries_file) as f:
        for line in f:
            entry = os.path.basename(line.strip())
            if entry.endswith(DIST_INFO):
                base_names.add(dist_name(entry))

    dists = staged_dist_infos(staging)
    base_present = [d for d in dists if dist_name(d) in base_names]
    keep = [d for d in dists if d not in base_present]

    claimed_by_kept = {rel for d in keep for rel in payload(staging, d)}
    for d in base_present:
        removed = 0
        for rel in payload(staging, d):
            path = os.path.join(staging, rel)
            if rel in claimed_by_kept or not (os.path.isfile(path) or os.path.islink(path)):
                continue
            os.unlink(path)
            prune_empty_parents(staging, rel)
            removed += 1
        shutil.rmtree(os.path.join(staging, d))
        print(
            f"  Dropped {d} (the base venv has this package; its copy stays"
            + (f", removed {removed} staged file(s)" if removed else "")
            + ")"
        )

    incomplete = []
    for d in keep:
        copied = 0
        missing = []
        for rel in payload(staging, d):
            dst = os.path.join(staging, rel)
            if os.path.lexists(dst):
                continue
            src = os.path.join(site_packages, rel)
            if not (os.path.isfile(src) or os.path.islink(src)):
                missing.append(rel)
                continue
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst, follow_symlinks=False)
            copied += 1
        if copied:
            print(f"  Completed {d}: copied {copied} file(s) Step 6 left out")
        if missing:
            incomplete.append((d, missing))

    if incomplete:
        for d, missing in incomplete:
            print(
                f"ERROR: {d} lists {len(missing)} file(s) that are in neither the delta "
                f"nor the build venv, e.g. {missing[0]}",
                file=sys.stderr,
            )
        return 1
    print(f"  Delta metadata consistent: {len(keep)} distribution(s), {len(base_present)} dropped")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
