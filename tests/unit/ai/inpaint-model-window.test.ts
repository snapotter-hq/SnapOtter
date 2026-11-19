import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hasPython, pythonBin, pythonWith } from "../../helpers/python-gate.js";

const here = dirname(fileURLToPath(import.meta.url));
const pyDir = resolve(here, "../../../packages/ai/python");

// Pins the native 512 crop window in inpaint.py (#4644). Resizing a crop to the
// model's 512 and back softened the erased area by about a fifth. The session is
// a fake that echoes its input, so any resize shows up as changed pixels. Needs
// numpy and cv2; skipped where the AI env is absent (as on CI integration shards).
const SCRIPT = `
import sys
sys.path.insert(0, ${JSON.stringify(pyDir)})
import numpy as np
import inpaint

S = inpaint.MODEL_SIZE
H, W = 800, 1200
rng = np.random.default_rng(4644)
img = rng.integers(0, 256, (H, W, 3), dtype=np.uint8)

def ellipse(cx, cy, rx, ry, h=H, w=W):
    yy, xx = np.mgrid[0:h, 0:w]
    inside = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1
    return np.where(inside, 255, 0).astype(np.uint8)

class EchoSession:
    """Returns the model input unchanged, scaled to LaMa's [0, 255] output."""
    def run(self, _outputs, feeds):
        return [feeds["image"] * 255.0]

seen = []
def recording(run_model):
    def run(crop_img, crop_mask):
        seen.append(crop_img.shape[:2])
        return run_model(crop_img, crop_mask)
    return run

echo = inpaint._make_run_model(EchoSession())

# 1. A mask that fits gets an exact 512x512 native crop, and the echoed fill comes
#    back byte-identical inside the mask (alpha 1 there): no resize touched it.
mask = ellipse(600, 400, 90, 60)
out = inpaint.inpaint_array(img, mask, recording(echo), model_window=S)
assert seen[-1] == (S, S), seen[-1]
assert np.array_equal(out[mask > 0], img[mask > 0]), "a native 512 crop must not be resized"

# 2. Without model_window (the HQ path) the old margin-scaled crop is used, and its
#    resize round trip changes the erased pixels. This is the softening in #4644.
out_old = inpaint.inpaint_array(img, mask, recording(echo))
assert seen[-1] != (S, S), seen[-1]
assert not np.array_equal(out_old[mask > 0], img[mask > 0])

# 3. The window is centred on the mask and shifted, never shrunk, at the frame edge.
dil = inpaint.dilate_mask(ellipse(60, 760, 40, 30), 6)
box = inpaint.compute_model_window(dil, img.shape, S, inpaint.MARGIN_MIN)
assert box == (0, H - S, S, H), box
dil = inpaint.dilate_mask(ellipse(600, 400, 40, 30), 6)
box = inpaint.compute_model_window(dil, img.shape, S, inpaint.MARGIN_MIN)
assert box[2] - box[0] == S and box[3] - box[1] == S, box
assert box[0] < 600 < box[2] and box[1] < 400 < box[3], box

# 4. A mask whose bounds plus the minimum margin exceed 512 falls back (None), and
#    inpaint_array then uses the margin-scaled crop.
big = ellipse(600, 400, 250, 120)
assert inpaint.compute_model_window(big, img.shape, S, inpaint.MARGIN_MIN) is None
inpaint.inpaint_array(img, big, recording(echo), model_window=S)
assert seen[-1][1] > S, seen[-1]

# 5. A frame side shorter than 512 is taken whole on that axis.
small = img[:300, :900]
dil = inpaint.dilate_mask(ellipse(450, 150, 40, 30, 300, 900), 6)
box = inpaint.compute_model_window(dil, small.shape, S, inpaint.MARGIN_MIN)
assert box[1] == 0 and box[3] == 300 and box[2] - box[0] == S, box

print("OK")
`;

describe.skipIf(!(hasPython && pythonWith("numpy") && pythonWith("cv2")))(
  "erase-object native model window (#4644)",
  () => {
    it("crops a native 512 window when the mask fits, so the fill is never resized", () => {
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
