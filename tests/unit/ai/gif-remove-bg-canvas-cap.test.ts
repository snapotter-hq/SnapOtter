import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isToolInputError } from "@snapotter/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasPython, pythonBin, pythonWith } from "../../helpers/python-gate.js";

vi.mock("../../../packages/ai/src/bridge.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../packages/ai/src/bridge.js")>()),
  runPythonWithProgress: vi.fn(),
}));

import { removeBackgroundAnimated } from "../../../packages/ai/src/background-removal-animated.js";
import { runPythonWithProgress } from "../../../packages/ai/src/bridge.js";

const here = dirname(fileURLToPath(import.meta.url));
const pyDir = resolve(here, "../../../packages/ai/python");

// Pillow sizes every coalesced frame to the GIF's logical screen, grown to fit
// any frame placed past it, so a 2 x 2 animation that declares 13000 x 13000
// costs 676 MB per RGBA frame in _read_frames. The sidecar refuses such a
// canvas before convert() allocates it.

function runPython(script: string) {
  return spawnSync(pythonBin as string, ["-c", script], { encoding: "utf8", timeout: 60_000 });
}

const PRELUDE = `
import sys
sys.path.insert(0, ${JSON.stringify(pyDir)})
import gif_remove_bg as g
`;

// Builds the animations in-process, so no binary fixture is committed.
const MAKE_GIFS = `
import os, tempfile
from PIL import Image

def make_gif(path, screen=None, last_frame_at=None, count=2):
    colors = [(255, 0, 0, 255), (0, 255, 0, 255)]
    frames = [Image.new("RGBA", (2, 2), colors[i % 2]) for i in range(count)]
    frames[0].save(path, format="GIF", save_all=True, append_images=frames[1:], duration=100, loop=0)
    b = bytearray(open(path, "rb").read())
    if screen:
        b[6:10] = screen[0].to_bytes(2, "little") + screen[1].to_bytes(2, "little")
    if last_frame_at:
        i = max(j for j in range(13, len(b) - 9) if b[j] == 0x2C and b[j + 5:j + 9] == bytes([2, 0, 2, 0]))
        b[i + 1:i + 5] = last_frame_at[0].to_bytes(2, "little") + last_frame_at[1].to_bytes(2, "little")
    open(path, "wb").write(b)

tmp = tempfile.mkdtemp()
`;

describe.skipIf(!hasPython)("gif_remove_bg canvas cap", () => {
  it("allows a canvas at the cap and refuses one past it or past the side limit", () => {
    const res = runPython(`${PRELUDE}
g._check_canvas_size((8192, 8192))
g._check_canvas_size((16383, 4096))
for size in [(8193, 8192), (16384, 1), (1, 16384), (13000, 13000)]:
    try:
        g._check_canvas_size(size)
    except g.CanvasTooLargeError as e:
        assert "pixel limit" in str(e), str(e)
    else:
        raise AssertionError(f"{size} should be refused")
assert g.MAX_CANVAS_PIXELS == 67_108_864 and g.MAX_CANVAS_SIDE == 16383
print("OK")
`);
    expect(res.stderr).toBe("");
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("OK");
  });

  it.skipIf(!pythonWith("PIL"))("refuses a huge logical screen before decoding frames", () => {
    const res = runPython(`${PRELUDE}${MAKE_GIFS}
import resource
ok = os.path.join(tmp, "ok.gif")
make_gif(ok)
frames, durations, loop = g._read_frames(ok)
assert len(frames) == 2 and frames[0].size == (2, 2), (len(frames), frames[0].size)

for name, kwargs in [("screen", {"screen": (13000, 13000)}), ("offset", {"last_frame_at": (13000, 13000)})]:
    path = os.path.join(tmp, name + ".gif")
    make_gif(path, **kwargs)
    try:
        g._read_frames(path)
    except g.CanvasTooLargeError as e:
        assert "13000" in str(e) or "13002" in str(e), str(e)
    else:
        raise AssertionError(name + " canvas should be refused")
# 676 MB per frame if it had been converted; well under that proves it was not.
rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
rss_mb = rss / (1024 * 1024) if sys.platform == "darwin" else rss / 1024
assert rss_mb < 300, rss_mb
print("OK")
`);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain("OK");
  });

  it("caps the pixels summed over frames at 16383 squared", () => {
    const res = runPython(`${PRELUDE}
assert g.MAX_TOTAL_PIXELS == 268_402_689
g._check_total_pixels(268_402_689, 129)
for total, frames in [(268_402_690, 130), (8000 * 8000 * 150, 150)]:
    try:
        g._check_total_pixels(total, frames)
    except g.CanvasTooLargeError as e:
        assert f"across {frames} frames" in str(e), str(e)
    else:
        raise AssertionError(f"{total} should be refused")
print("OK")
`);
    expect(res.stderr).toBe("");
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("OK");
  });

  it.skipIf(!pythonWith("PIL"))(
    "refuses an animation over the frame budget before converting any frame",
    () => {
      // 65 frames on a 2048 x 2048 screen is 272,629,760 pixels; converting
      // them would hold over 1 GB of RGBA. The header and frame count refuse it.
      const res = runPython(`${PRELUDE}${MAKE_GIFS}
import resource
path = os.path.join(tmp, "long.gif")
make_gif(path, screen=(2048, 2048), count=65)
try:
    g._read_frames(path)
except g.CanvasTooLargeError as e:
    assert "across 65 frames" in str(e), str(e)
else:
    raise AssertionError("over-budget animation should be refused")
rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
rss_mb = rss / (1024 * 1024) if sys.platform == "darwin" else rss / 1024
assert rss_mb < 300, rss_mb

# Canvas growth partway through is caught by the running sum: 130 frames, the
# last placed at 1500,1500 on a 2 x 2 screen, so the up-front check passes.
g.MAX_TOTAL_PIXELS = 2_000_000
grow = os.path.join(tmp, "grow.gif")
make_gif(grow, last_frame_at=(1500, 1500), count=130)
try:
    g._read_frames(grow)
except g.CanvasTooLargeError as e:
    assert "across 130 frames" in str(e), str(e)
else:
    raise AssertionError("running sum should refuse the grown canvas")
print("OK")
`);
      expect(res.status, res.stderr).toBe(0);
      expect(res.stdout).toContain("OK");
    },
  );

  it.skipIf(!pythonWith("PIL"))("main() reports the refusal with the CANVAS_TOO_LARGE code", () => {
    // main() imports the onnx and rembg helpers before it reads frames; stub
    // them so the run needs nothing but Pillow.
    const res = runPython(`${PRELUDE}${MAKE_GIFS}
import json, types
gpu = types.ModuleType("gpu"); gpu.onnx_providers = lambda: ([], "cpu")
mp = types.ModuleType("model_paths"); mp.ensure_rembg_model_home = lambda: None
rb = types.ModuleType("remove_bg"); rb.ALLOWED_MODELS = {"u2net"}
sys.modules.update({"gpu": gpu, "model_paths": mp, "remove_bg": rb})
path = os.path.join(tmp, "bomb.gif")
make_gif(path, screen=(13000, 13000))
sys.argv = ["gif_remove_bg.py", path, os.path.join(tmp, "out.webp"), "{}"]
g.main()
`);
    expect(res.status, res.stderr).toBe(0);
    const line = res.stdout.trim().split("\n").at(-1) ?? "";
    expect(JSON.parse(line)).toEqual({
      success: false,
      error: "Animation canvas 13000 x 13000 is over the 67,108,864 pixel limit",
      code: "CANVAS_TOO_LARGE",
    });
  });
});

describe("removeBackgroundAnimated canvas refusal", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gifbg-cap-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("turns the sidecar's CANVAS_TOO_LARGE result into a ToolInputError", async () => {
    vi.mocked(runPythonWithProgress).mockResolvedValue({
      stdout: JSON.stringify({
        success: false,
        error: "Animation canvas 13000 x 13000 is over the 67,108,864 pixel limit",
        code: "CANVAS_TOO_LARGE",
      }),
      stderr: "",
    });

    const err = await removeBackgroundAnimated(Buffer.from("GIF89a"), dir).catch((e) => e);
    expect(isToolInputError(err)).toBe(true);
    expect(err.message).toBe("Animation canvas 13000 x 13000 is over the 67,108,864 pixel limit");
  });
});
