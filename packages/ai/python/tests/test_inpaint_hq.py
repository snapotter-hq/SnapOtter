"""Unit tests for the SD1.5 diffusion inpainting sidecar (inpaint_hq.py).

The diffusion pipeline is injected as a fake, so no torch/diffusers or model is
needed: only the resize/call/resize-back contract and its reuse of inpaint.py's
crop-and-composite geometry are exercised. Skips where numpy/cv2 are absent, as
on CI integration shards (matches test_inpaint_geometry.py).
"""
import os
import sys

import pytest

np = pytest.importorskip("numpy")
cv2 = pytest.importorskip("cv2")
pytest.importorskip("PIL")

from PIL import Image  # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import inpaint  # noqa: E402
import inpaint_hq  # noqa: E402


class _FakePipeResult:
    def __init__(self, image):
        self.images = [image]


class FakePipe:
    """Stand-in for a diffusers inpaint pipeline. Fills the whole 512 canvas with
    a constant colour so callers can assert what landed in the masked region.
    Records the last call's image/mask sizes and whether a step callback ran."""

    def __init__(self, fill=(255, 0, 255)):
        self.fill = fill
        self.calls = []
        self.callback_ran = False

    def __call__(
        self,
        prompt=None,
        negative_prompt=None,
        image=None,
        mask_image=None,
        num_inference_steps=1,
        guidance_scale=7.0,
        height=512,
        width=512,
        generator=None,
        callback_on_step_end=None,
    ):
        self.calls.append(
            {
                "image_size": image.size if image is not None else None,
                "mask_size": mask_image.size if mask_image is not None else None,
                "steps": num_inference_steps,
            }
        )
        if callback_on_step_end is not None:
            callback_on_step_end(self, 0, 0, {})
            self.callback_ran = True
        out = Image.new("RGB", (width, height), self.fill)
        return _FakePipeResult(out)


def test_make_run_model_resizes_to_model_and_back():
    pipe = FakePipe(fill=(10, 20, 30))
    run_model = inpaint_hq.make_run_model(pipe, "cpu", steps=3)
    crop = np.zeros((100, 120, 3), np.uint8)
    mask = np.zeros((100, 120), np.uint8)
    mask[30:70, 40:80] = 255

    out = run_model(crop, mask)

    # Output is resized back to the native crop size, RGB.
    assert out.shape == (100, 120, 3)
    # The pipe saw a 512x512 image and mask (PIL size is (w, h)).
    assert pipe.calls[-1]["image_size"] == (inpaint_hq.MODEL_SIZE, inpaint_hq.MODEL_SIZE)
    assert pipe.calls[-1]["mask_size"] == (inpaint_hq.MODEL_SIZE, inpaint_hq.MODEL_SIZE)
    assert pipe.calls[-1]["steps"] == 3
    # The constant fill is what came back (resized), so the centre is that colour.
    assert tuple(int(v) for v in out[50, 60]) == (10, 20, 30)


def test_make_run_model_invokes_progress_callback():
    pipe = FakePipe()
    seen = []
    run_model = inpaint_hq.make_run_model(
        pipe, "cpu", steps=2, progress=lambda pct, stage: seen.append((pct, stage))
    )
    run_model(np.zeros((60, 60, 3), np.uint8), _center_mask(60, 60))
    assert pipe.callback_ran is True
    assert seen and all(0 <= p <= 100 for p, _ in seen)


def test_inpaint_array_with_diffusion_leaves_far_pixels_untouched():
    # Reuse inpaint.py's crop/composite via a diffusion run_model. The fill only
    # lands inside the (feathered) mask; everything far from it stays identical.
    rng = np.random.RandomState(0)
    img = rng.randint(0, 256, (400, 500, 3), np.uint8)
    mask = np.zeros((400, 500), np.uint8)
    cv2.circle(mask, (250, 200), 50, 255, -1)

    pipe = FakePipe(fill=(255, 0, 255))
    run_model = inpaint_hq.make_run_model(pipe, "cpu", steps=1)
    out = inpaint.inpaint_array(img, mask, run_model)

    assert out.shape == img.shape
    # Corner far from the mask is byte-identical to the original.
    assert np.array_equal(out[0:60, 0:60], img[0:60, 0:60])
    # Mask centre received the magenta fill.
    assert out[200, 250, 0] > 200 and out[200, 250, 2] > 200


def test_load_pipeline_missing_dir_raises_actionable_error():
    with pytest.raises(FileNotFoundError) as exc:
        inpaint_hq._load_pipeline("/nonexistent/sd15-inpainting", "cpu")
    assert "feature bundle" in str(exc.value).lower()


def _center_mask(h, w):
    m = np.zeros((h, w), np.uint8)
    m[h // 4 : 3 * h // 4, w // 4 : 3 * w // 4] = 255
    return m
