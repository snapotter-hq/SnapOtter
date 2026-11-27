import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hasPython, pythonBin, pythonWith } from "../../helpers/python-gate.js";

const here = dirname(fileURLToPath(import.meta.url));
const pyDir = resolve(here, "../../../packages/ai/python");

// Pins the native 512 crop window on the HQ (SD1.5) erase path (#4904), the
// same fix #4644 gave LaMa. The pipe is a fake that echoes its input image, so
// a resize round trip shows up as changed pixels inside the mask. Needs numpy,
// cv2 and PIL; skipped where the AI env is absent (as on CI integration shards).
const SCRIPT = `
import sys
sys.path.insert(0, ${JSON.stringify(pyDir)})
import numpy as np
import inpaint_hq

S = inpaint_hq.MODEL_SIZE
H, W = 800, 1200
rng = np.random.default_rng(4904)
img = rng.integers(0, 256, (H, W, 3), dtype=np.uint8)

def ellipse(cx, cy, rx, ry):
    yy, xx = np.mgrid[0:H, 0:W]
    inside = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1
    return np.where(inside, 255, 0).astype(np.uint8)

class Out:
    def __init__(self, image):
        self.images = [image]

def echo_pipe(image, mask_image, **kwargs):
    """Diffusers-shaped fake: returns the image it was given."""
    return Out(image)

def erase(mask, model_window=True):
    crops = []
    # strength=1 skips the context-fill pre-pass (#5000), which would otherwise
    # change the echoed pixels and hide a resize round trip.
    echo = inpaint_hq.make_run_model(echo_pipe, "cpu", strength=1.0)
    def run_model(crop_img, crop_mask):
        crops.append(crop_img.shape[:2])
        return echo(crop_img, crop_mask)
    if model_window:
        return inpaint_hq.erase(img, mask, run_model), crops
    return inpaint_hq.inpaint.inpaint_array(img, mask, run_model), crops

# 1. A mask that fits gets a native 512x512 crop, so the echoed fill comes back
#    byte-identical inside the mask: nothing was resized on the way in or out.
mask = ellipse(600, 400, 90, 60)
out, crops = erase(mask)
assert crops == [(S, S)], crops
assert np.array_equal(out[mask > 0], img[mask > 0]), "a native 512 crop must not be resized"

# 2. Control: the old call (no model_window) gets the margin-scaled crop, and its
#    resize round trip changes the erased pixels, so the echo check can tell them apart.
out, crops = erase(mask, model_window=False)
assert crops[0] != (S, S), crops
assert not np.array_equal(out[mask > 0], img[mask > 0])

# 3. A mask too large for one window still falls back to the margin-scaled crop.
big = ellipse(600, 400, 250, 120)
out, crops = erase(big)
assert crops[0][1] > S, crops
assert not np.array_equal(out[big > 0], img[big > 0])

print("OK")
`;

describe.skipIf(!(hasPython && pythonWith("numpy") && pythonWith("cv2") && pythonWith("PIL")))(
  "erase-object HQ native model window (#4904)",
  () => {
    it("crops a native 512 window for SD1.5 when the mask fits, so the fill is never resized", () => {
      const res = spawnSync(pythonBin as string, ["-c", SCRIPT], {
        encoding: "utf8",
        timeout: 60_000,
      });
      expect(res.stderr, res.stderr).toBe("");
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("OK");
    }, 70_000);
  },
);
