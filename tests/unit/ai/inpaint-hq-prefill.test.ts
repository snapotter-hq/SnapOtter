import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hasPython, pythonBin, pythonWith } from "../../helpers/python-gate.js";

const here = dirname(fileURLToPath(import.meta.url));
const pyDir = resolve(here, "../../../packages/ai/python");

// Pins the context-fill pre-pass on the HQ (SD1.5) erase path (#5000). SD1.5
// inpainting with an empty prompt drew invented objects (a jet ski, boats) into
// plain water. The crop now reaches the model with the masked area already
// filled from its surroundings and a strength below 1, so the denoise starts
// from background instead of from nothing. The pipe is a fake that records its
// kwargs. Needs numpy, cv2 and PIL; skipped where the AI env is absent (as on
// CI integration shards).
const SCRIPT = `
import sys
sys.path.insert(0, ${JSON.stringify(pyDir)})
import numpy as np
import inpaint_hq

S = inpaint_hq.MODEL_SIZE

# Smooth sea-like gradient with a saturated red blob standing in for the object.
yy, xx = np.mgrid[0:S, 0:S]
crop = np.stack([40 + yy * 0.1, 90 + yy * 0.2 + xx * 0.05, 140 + xx * 0.1], axis=-1).astype(np.uint8)
mask = np.where(((xx - 256) / 60.0) ** 2 + ((yy - 256) / 40.0) ** 2 <= 1, 255, 0).astype(np.uint8)
clean = crop.copy()
crop[mask > 0] = (250, 20, 20)

class Out:
    def __init__(self, image):
        self.images = [image]

class RecordingPipe:
    def __init__(self):
        self.kwargs = None
    def __call__(self, image, mask_image, **kwargs):
        self.kwargs = dict(kwargs, image=image, mask_image=mask_image)
        return Out(image)

def seen_by_model(**opts):
    pipe = RecordingPipe()
    inpaint_hq.make_run_model(pipe, "cpu", **opts)(crop, mask)
    return pipe.kwargs, np.array(pipe.kwargs["image"])

# 1. By default the model receives the masked area already filled from the
#    surroundings (close to the clean gradient, nowhere near the red object),
#    with a strength below 1 so that fill is kept as the starting point.
kwargs, seen = seen_by_model()
assert 0 < kwargs["strength"] < 1, kwargs["strength"]
inside = mask > 0
fill_err = np.abs(seen[inside].astype(int) - clean[inside].astype(int)).mean()
assert fill_err < 12, fill_err

# 2. Pixels outside the mask reach the model untouched.
assert np.array_equal(seen[~inside], crop[~inside])

# 3. strength=1 restores the old behaviour: the object pixels go in as they were
#    and no pre-pass runs, since a full-strength denoise ignores its init image.
kwargs, seen = seen_by_model(strength=1.0)
assert kwargs["strength"] == 1.0
assert np.array_equal(seen[inside], crop[inside])

print("OK")
`;

describe.skipIf(!(hasPython && pythonWith("numpy") && pythonWith("cv2") && pythonWith("PIL")))(
  "HQ erase context-fill pre-pass (#5000)",
  () => {
    it("fills the masked area from its surroundings before the model sees it", () => {
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
