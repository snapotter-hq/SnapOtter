import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hasPython, pythonBin, pythonWith } from "../../helpers/python-gate.js";

const here = dirname(fileURLToPath(import.meta.url));
const pyDir = resolve(here, "../../../packages/ai/python");

// Pins the seam blend in inpaint.py (#141). The model is a fake that fills the
// crop with a flat value, so the expected pixel values are exact. Needs numpy
// and cv2; skipped where the AI env is absent (as on CI integration shards).
const SCRIPT = `
import sys
sys.path.insert(0, ${JSON.stringify(pyDir)})
import numpy as np
import inpaint

H, W = 120, 220
BG, FILL = 40, 220
yy, xx = np.mgrid[0:H, 0:W]
user = np.where((xx - 80) ** 2 + (yy - 60) ** 2 <= 20 ** 2, 255, 0).astype(np.uint8)
core = user > 127
img = np.full((H, W, 3), BG, np.uint8)

def flat_fill(crop_img, crop_mask):
    return np.full(crop_img.shape, FILL, np.uint8)

# 1. The erased object is fully replaced, with no original pixels pulled back in.
out = inpaint.inpaint_array(img, user, flat_fill)
assert (out[core] == FILL).all(), "erased object must be fully replaced"

# 2. The seam ramps outward into the margin. The dilated edge on row 60 is at x=106
#    (radius 20 plus the 6 px DILATE_MIN dilation).
dil = inpaint.dilate_mask(user, 6)
edge = int(np.where(dil[60] > 0)[0].max())
assert edge == 106, edge
assert BG < out[60, edge + 2, 0] < FILL, "seam 2 px out must be partly blended"
assert BG < out[60, edge + 8, 0], "blend must reach 8 px beyond the dilated edge"
assert out[60, edge + 17, 0] == BG, "blend stops at the feather radius"

# 3. Without the core, the feather pulls original pixels into the object edge.
#    With the core, the object stays at the fill value.
box = (0, 0, W, H)
leaky = inpaint.composite(img, np.full(img.shape, FILL, np.uint8), dil, box, 16)
tight = inpaint.composite(
    img, np.full(img.shape, FILL, np.uint8), dil, box, 16, core_native=user
)
assert (tight[core] == FILL).all(), "core must keep the object fully replaced"
assert (leaky[core] < FILL).any(), "without the core the feather leaks original pixels"

# 4. Tiny frames: a feather wider than the image must not raise.
small = np.full((8, 8, 3), BG, np.uint8)
small_mask = np.zeros((8, 8), np.uint8)
small_mask[3:5, 3:5] = 255
assert inpaint.inpaint_array(small, small_mask, flat_fill).shape == (8, 8, 3)

print("OK")
`;

describe.skipIf(!(hasPython && pythonWith("numpy") && pythonWith("cv2")))(
  "erase-object seam blend (#141)",
  () => {
    it("fully replaces the object, feathers outward, and stops at the feather radius", () => {
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
