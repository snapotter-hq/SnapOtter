// Issue #871: the accelerated (huggingface_hub) bundle download emitted one
// progress frame before the transfer and one after it, so a multi-GB download
// sat at 2% for its whole duration. The UI extrapolated an ETA of hours from
// the frozen percent and the install watchdog killed slow-but-live transfers
// as "no progress for 20 minutes". This drives install_feature.py's
// download_with_hf_hub under python3 with a fake huggingface_hub that feeds
// the library's tqdm seam the way xet_get/http_get do, and checks that bytes
// in flight become moving-percent frames. Lives in vitest (not pytest) so it
// runs in CI, which has python3 but no pytest.

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasPython } from "../../helpers/python-gate.js";

const SCRIPT = join(process.cwd(), "packages", "ai", "python", "install_feature.py");

const DRIVER = `
import importlib.util, json, os, sys, tempfile, types

spec = importlib.util.spec_from_file_location("installer", sys.argv[1])
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

class RecordingTqdm:
    def __init__(self, *args, **kwargs):
        self.n = kwargs.get("initial", 0)
        self.total = kwargs.get("total")
        self.disable = kwargs.get("disable", False)
    def update(self, n=1):
        if self.disable:
            return
        self.n += n
    def close(self):
        pass

hub = types.ModuleType("huggingface_hub")
utils = types.ModuleType("huggingface_hub.utils")
tqdm_mod = types.ModuleType("huggingface_hub.utils.tqdm")
tqdm_mod.tqdm = RecordingTqdm
utils.tqdm = tqdm_mod
hub.utils = utils

EXPECTED = 512 * 1024 * 1024
STEP = 32 * 1024 * 1024

def hf_hub_download(repo_id, filename, repo_type, local_dir):
    bar = tqdm_mod.tqdm(unit="B", unit_scale=True, total=None, initial=0,
                        desc=filename, disable=True, name="huggingface_hub.xet_get")
    for _ in range(EXPECTED // STEP):
        bar.update(STEP)
    bar.close()
    target = os.path.join(local_dir, filename)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "wb") as f:
        f.write(b"archive")
    return target

hub.hf_hub_download = hf_hub_download
sys.modules["huggingface_hub"] = hub
sys.modules["huggingface_hub.utils"] = utils
sys.modules["huggingface_hub.utils.tqdm"] = tqdm_mod

frames = []
installer.emit_progress = lambda p, s: frames.append([p, s])

staging = os.path.join(tempfile.mkdtemp(), "staging")
os.makedirs(staging)
dest = os.path.join(staging, "upscale-enhance-amd64-gpu.tar.gz")
ok = installer.download_with_hf_hub(
    "deepsafe/feature-bundles", "v2.0.0/upscale-enhance-amd64-gpu.tar.gz",
    dest, EXPECTED, 2, 85,
)
print(json.dumps({
    "ok": ok,
    "frames": frames,
    "seamRestored": tqdm_mod.tqdm is RecordingTqdm,
    "archive": open(dest, "rb").read().decode(),
}))
`;

interface DriverResult {
  ok: boolean;
  frames: Array<[number, string]>;
  seamRestored: boolean;
  archive: string;
}

function runDriver(): DriverResult {
  const res = spawnSync("python3", ["-c", DRIVER, SCRIPT], { encoding: "utf8", timeout: 20000 });
  if (res.status !== 0) throw new Error(`python3 failed: ${res.stderr}`);
  return JSON.parse(res.stdout.trim()) as DriverResult;
}

describe.skipIf(!hasPython)("install_feature.py accelerated download progress (#871)", () => {
  it("reports bytes as moving-percent frames while the transfer is in flight", () => {
    const result = runDriver();
    expect(result.ok).toBe(true);
    expect(result.archive).toBe("archive");

    const start = result.frames.findIndex(([, stage]) => /accelerated/i.test(stage));
    const end = result.frames.findIndex(([, stage]) => stage.startsWith("Downloaded"));
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    // Everything between the "starting" and "downloaded" frames is the
    // transfer itself; before the fix this slice was empty.
    const inflight = result.frames.slice(start + 1, end);
    expect(inflight.length).toBeGreaterThanOrEqual(8);

    const percents = inflight.map(([percent]) => percent);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(Math.min(...percents)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...percents)).toBeLessThanOrEqual(85);
    expect(percents[percents.length - 1]).toBeGreaterThanOrEqual(80);
    for (const [, stage] of inflight) expect(stage).toMatch(/Downloading\.\.\. [0-9.]+ GB/);

    // The seam is scoped to the download: the library's class comes back.
    expect(result.seamRestored).toBe(true);
  });
});
