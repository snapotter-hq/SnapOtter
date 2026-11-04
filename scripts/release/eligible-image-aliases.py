import os
import re
import subprocess
from pathlib import Path

version = os.environ["VERSION"]
output = Path(os.environ["ALIAS_OUTPUT"])
stable_pattern = re.compile(
    r"^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$"
)
current_match = stable_pattern.fullmatch(f"v{version}")
if current_match is None:
    output.write_text("", encoding="utf-8")
    raise SystemExit(0)

current = tuple(int(component) for component in current_match.groups())
stable_versions = {
    tuple(int(component) for component in match.groups())
    for tag in subprocess.check_output(
        ["git", "tag", "--list", "v*"], text=True
    ).splitlines()
    if (match := stable_pattern.fullmatch(tag)) is not None
}
if current not in stable_versions:
    raise SystemExit("Approved stable release tag is absent after remote refresh")

aliases = []
same_minor = [candidate for candidate in stable_versions if candidate[:2] == current[:2]]
same_major = [candidate for candidate in stable_versions if candidate[0] == current[0]]
if current == max(same_minor):
    aliases.append(f"{current[0]}.{current[1]}")
if current == max(same_major):
    aliases.append(str(current[0]))
if current == max(stable_versions):
    aliases.append("latest")
output.write_text(
    "".join(f"{alias}\n" for alias in aliases), encoding="utf-8"
)
