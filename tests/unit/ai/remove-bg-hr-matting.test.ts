import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hasPython, pythonBin, pythonWith } from "../../helpers/python-gate.js";

const here = dirname(fileURLToPath(import.meta.url));
const pyDir = resolve(here, "../../../packages/ai/python");

// BiRefNet's ONNX output is logits. rembg's BiRefNetSessionGeneral.predict runs
// a sigmoid before its min-max; the HR matting session used to override predict
// without it, so the matte came back mid-grey and every subject half
// transparent (#1298). The session now inherits rembg's predict and only
// changes the input size.

// rembg and pooch are stubbed, so this needs nothing but python3 and runs in
// CI. The stub's predict stands in for rembg's: whatever it returns is what
// the HR session must hand back, and the size it feeds must be 2048.
const INHERITS_PREDICT = `
import sys, types
sys.path.insert(0, ${JSON.stringify(pyDir)})

fed_sizes = []

class FakeBiRefNetSessionGeneral:
    @classmethod
    def u2net_home(cls, *args, **kwargs):
        return "/nonexistent"

    def normalize(self, img, mean, std, size, *args, **kwargs):
        fed_sizes.append(size)
        return {"input": None}

    def predict(self, img, *args, **kwargs):
        self.normalize(img, (0.485, 0.456, 0.406), (0.229, 0.224, 0.225), (1024, 1024))
        return ["rembg predict"]

birefnet_general = types.ModuleType("rembg.sessions.birefnet_general")
birefnet_general.BiRefNetSessionGeneral = FakeBiRefNetSessionGeneral
sys.modules["rembg"] = types.ModuleType("rembg")
sys.modules["rembg.sessions"] = types.ModuleType("rembg.sessions")
sys.modules["rembg.sessions.birefnet_general"] = birefnet_general
sys.modules["pooch"] = types.ModuleType("pooch")

import remove_bg

sessions = []
remove_bg._register_hr_matting_session(sessions)
(cls,) = sessions
assert cls.name() == "birefnet-hr-matting", cls.name()

session = cls.__new__(cls)
result = session.predict(object())
assert result == ["rembg predict"], ("must run rembg's predict, which applies the sigmoid", result)
assert fed_sizes == [(2048, 2048)], ("the HR model takes 2048x2048 input", fed_sizes)
print("OK")
`;

// With the real rembg installed: feed known logits through the actual session
// and check the mask. A subject at logit +12 must come out opaque and a
// background at -12 transparent, whatever outliers pin the min-max.
const MASK_FROM_LOGITS = `
import sys
sys.path.insert(0, ${JSON.stringify(pyDir)})
import numpy as np
from PIL import Image
import remove_bg

sessions = []
remove_bg._register_hr_matting_session(sessions)
(cls,) = sessions
session = cls.__new__(cls)

class FakeInput:
    name = "input_image"

class FakeInnerSession:
    def get_inputs(self):
        return [FakeInput()]

    def run(self, outputs, feed):
        (image,) = feed.values()
        assert image.shape == (1, 3, 2048, 2048), image.shape
        logits = np.full((1, 1, 2048, 2048), -12.0, dtype=np.float32)
        logits[..., 512:1536, 512:1536] = 12.0
        logits[..., 0, 0] = -40.0
        logits[..., 0, 1] = 40.0
        return [logits]

session.inner_session = FakeInnerSession()
(mask,) = session.predict(Image.new("RGB", (64, 64)))
alpha = np.array(mask)
subject = alpha[20:44, 20:44]
background = alpha[2:10, 40:60]
assert subject.min() >= 250, ("subject must be opaque", int(subject.min()))
assert background.max() <= 5, ("background must be transparent", int(background.max()))
print("OK")
`;

function runPython(script: string) {
  return spawnSync(pythonBin as string, ["-c", script], { encoding: "utf8", timeout: 60_000 });
}

describe.skipIf(!hasPython)("birefnet-hr-matting session", () => {
  it("runs rembg's predict, which applies the sigmoid, at 2048x2048", () => {
    const res = runPython(INHERITS_PREDICT);
    expect(res.stderr).toBe("");
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("OK");
  }, 70_000);

  it.skipIf(!pythonWith("rembg"))(
    "turns subject logits opaque and background logits transparent",
    () => {
      const res = runPython(MASK_FROM_LOGITS);
      expect(res.stderr).toBe("");
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("OK");
    },
    70_000,
  );
});
