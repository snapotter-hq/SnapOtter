import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hasPython, pythonBin } from "../../helpers/python-gate.js";

const here = dirname(fileURLToPath(import.meta.url));
const pyDir = resolve(here, "../../../packages/ai/python");

// gfpgan and codeformer-pip read their weights (and codeformer writes
// output/out.png) relative to the process cwd. The sidecar inherits the API's
// cwd, which a read-only root filesystem makes unwritable, so the bundled
// weights could not be linked there and enhance-faces reported them missing
// (#4710). offline_guard is pure stdlib, so this runs wherever python3 does.
const SCRIPT = `
import os, sys, tempfile
sys.path.insert(0, ${JSON.stringify(pyDir)})
import offline_guard as og

root = tempfile.mkdtemp()
models = os.path.join(root, "models")
for parts in [("codeformer", "codeformer.pth"),
              ("gfpgan", "facelib", "detection_Resnet50_Final.pth"),
              ("gfpgan", "facelib", "parsing_parsenet.pth"),
              ("realesrgan", "RealESRGAN_x2plus.pth")]:
    p = os.path.join(models, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        f.write("w:" + parts[-1])

# The server's cwd: read-only, like /app/apps/api under --read-only.
app_cwd = os.path.join(root, "app")
os.makedirs(app_cwd)
os.chmod(app_cwd, 0o555)
os.environ["DATA_DIR"] = os.path.join(root, "data")
os.environ["SNAPOTTER_ALLOW_MODEL_DOWNLOAD"] = "0"
os.chdir(app_cwd)

with og.library_workdir() as workdir:
    assert os.getcwd() == os.path.realpath(workdir) or os.getcwd() == workdir, os.getcwd()
    assert workdir == os.path.join(root, "data", "ai", "lib-cwd"), workdir
    og.prepare_codeformer_weights(models)
    og.prepare_gfpgan_helper_weights(models)
    with open(os.path.join("CodeFormer", "weights", "CodeFormer", "codeformer.pth")) as f:
        assert f.read() == "w:codeformer.pth"
    with open(os.path.join("gfpgan", "weights", "parsing_parsenet.pth")) as f:
        assert f.read() == "w:parsing_parsenet.pth"
    # codeformer-pip writes its result here; it must land in the writable dir.
    os.makedirs("output", exist_ok=True)
assert os.getcwd() == os.path.realpath(app_cwd), ("cwd restored", os.getcwd())
assert os.listdir(app_cwd) == [], "nothing may be written under the app tree"
print("READONLY_CWD_OK")

# A link left pointing at a models dir that moved must be replaced, not
# reported as a missing weight.
link_dir = os.path.join(root, "links")
os.makedirs(link_dir)
link = os.path.join(link_dir, "codeformer.pth")
os.symlink(os.path.join(root, "old-models", "codeformer.pth"), link)
target = os.path.join(models, "codeformer", "codeformer.pth")
assert og.link_bundled_weight(link, target) is True
assert os.path.realpath(link) == os.path.realpath(target)
# A live link to a different file is repointed at the bundle too.
other = os.path.join(root, "other.pth")
open(other, "w").close()
os.unlink(link)
os.symlink(other, link)
assert og.link_bundled_weight(link, target) is True
assert os.path.realpath(link) == os.path.realpath(target)
assert sorted(os.listdir(link_dir)) == ["codeformer.pth"], os.listdir(link_dir)
print("DANGLING_OK")

# When the bundled file exists but linking fails, the real OSError surfaces
# instead of the "missing, reinstall the bundle" message.
locked = os.path.join(root, "locked")
os.makedirs(locked)
os.chmod(locked, 0o555)
if os.access(locked, os.W_OK):
    print("LINK_ERROR_SKIPPED_ROOT")
else:
    try:
        og.link_bundled_weight(os.path.join(locked, "w.pth"), target)
        raise SystemExit("link failure was swallowed")
    except RuntimeError as err:
        msg = str(err)
        assert "Could not link bundled weight" in msg, msg
        assert "missing" not in msg, msg
        assert "Permission denied" in msg or "Read-only" in msg, msg
    assert os.listdir(locked) == []
    print("LINK_ERROR_OK")

import shutil
for d in (app_cwd, locked):
    os.chmod(d, 0o755)
shutil.rmtree(root)
`;

describe.skipIf(!hasPython)("offline_guard bundled weight links (#4710)", () => {
  it("links weights under the data dir when the server cwd is read-only, replaces stale links, and surfaces link errors", () => {
    const res = spawnSync(pythonBin as string, ["-c", SCRIPT], {
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(res.stderr).toBe("");
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("READONLY_CWD_OK");
    expect(res.stdout).toContain("DANGLING_OK");
    expect(res.stdout).toMatch(/LINK_ERROR_(OK|SKIPPED_ROOT)/);
  }, 40_000);
});

// The helpers only help if the face scripts call them inside the workdir.
describe("face scripts resolve weights inside library_workdir (#4710)", () => {
  const read = (name: string) => readFileSync(resolve(pyDir, name), "utf8");

  it.each([
    ["enhance_faces.py", "prepare_gfpgan_helper_weights"],
    ["enhance_faces.py", "prepare_codeformer_weights"],
    ["upscale.py", "prepare_gfpgan_helper_weights"],
  ])("%s calls %s within `with library_workdir():`", (file, helper) => {
    const source = read(file);
    const pattern = new RegExp(`with library_workdir\\(\\):\\n\\s+${helper}\\(_MODELS_BASE\\)`);
    expect(source).toMatch(pattern);
  });

  it("enhance_faces.py imports codeformer.app and reads its output inside the workdir", () => {
    const source = read("enhance_faces.py");
    const fn = source.slice(source.indexOf("def enhance_with_codeformer("));
    const body = fn.slice(0, fn.indexOf("\ndef "));
    const indentOf = (re: RegExp) => re.exec(body)?.[1].length ?? -1;
    const withIndent = indentOf(/\n( *)with library_workdir\(\):/);
    expect(withIndent).toBeGreaterThan(-1);
    // Lines indented deeper than the with-opener sit inside the block.
    expect(indentOf(/\n( *)from codeformer\.app import inference_app/)).toBeGreaterThan(withIndent);
    expect(indentOf(/\n( *)result_path = inference_app\(/)).toBeGreaterThan(withIndent);
    expect(indentOf(/\n( *)restored_bgr = cv2\.imread\(str\(result_path\)/)).toBeGreaterThan(
      withIndent,
    );
  });
});
