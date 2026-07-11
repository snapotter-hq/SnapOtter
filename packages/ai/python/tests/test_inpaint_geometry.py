"""Pure-geometry unit tests for the crop-and-composite inpaint pipeline.

No ONNX model needed: the pipeline's model step is injected as a fake. Skips
cleanly where the AI env (numpy/cv2) is absent, as on CI integration shards.
"""
import os
import sys

import pytest

np = pytest.importorskip("numpy")
cv2 = pytest.importorskip("cv2")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import inpaint  # noqa: E402


def test_dilate_mask_grows_the_region():
    mask = np.zeros((100, 100), np.uint8)
    mask[40:60, 40:60] = 255
    before = int((mask > 0).sum())
    grown = inpaint.dilate_mask(mask, 5)
    assert int((grown > 0).sum()) > before
    # original masked pixels stay masked
    assert np.all(grown[mask > 0] == 255)


def test_dilate_mask_zero_is_noop():
    mask = np.zeros((20, 20), np.uint8)
    mask[5:10, 5:10] = 255
    assert np.array_equal(inpaint.dilate_mask(mask, 0), mask)


def test_mask_bbox_none_for_empty():
    assert inpaint._mask_bbox(np.zeros((10, 10), np.uint8)) is None


def test_mask_bbox_tight_bounds():
    mask = np.zeros((100, 100), np.uint8)
    mask[30:41, 20:51] = 255  # rows 30..40, cols 20..50
    assert inpaint._mask_bbox(mask) == (20, 30, 51, 41)


def test_crop_box_small_for_small_mask_in_large_image():
    # The HD property: a small object in a big frame yields a small crop.
    mask = np.zeros((1800, 2600), np.uint8)
    cv2.circle(mask, (1400, 1000), 60, 255, -1)
    mdil = inpaint.dilate_mask(mask, 8)
    box = inpaint.compute_crop_box(mdil, mask.shape, inpaint.MARGIN_FRAC, inpaint.MARGIN_MIN)
    area = (box[2] - box[0]) * (box[3] - box[1])
    assert area < 0.05 * (2600 * 1800)


def test_crop_box_clamps_to_frame_for_full_mask():
    mask = np.full((300, 400), 255, np.uint8)
    mdil = inpaint.dilate_mask(mask, 8)
    box = inpaint.compute_crop_box(mdil, mask.shape, inpaint.MARGIN_FRAC, inpaint.MARGIN_MIN)
    assert box == (0, 0, 400, 300)


def test_composite_is_byte_identical_outside_the_feathered_mask():
    rng = np.random.RandomState(0)
    original = rng.randint(0, 256, (200, 200, 3), np.uint8)
    box = (50, 50, 150, 150)
    # a small dilated mask in the middle of the crop
    mask_dil_native = np.zeros((100, 100), np.uint8)
    cv2.circle(mask_dil_native, (50, 50), 20, 255, -1)
    inpainted_crop = np.full((100, 100, 3), 255, np.uint8)  # obvious fill
    out = inpaint.composite(original, inpainted_crop, mask_dil_native, box, feather=3)
    # far from the mask -> untouched original, exactly
    assert np.array_equal(out[0:40, 0:40], original[0:40, 0:40])
    # mask core -> replaced by the fill
    assert out[100, 100, 0] > 200


def _scene(w=600, h=400, cx=300, cy=200, r=60):
    """A teal disc (anti-aliased edge) on a smooth gradient. Returns img, mask, bg."""
    yy, xx = np.mgrid[0:h, 0:w]
    bg = np.stack(
        [120 + 60 * xx / w, 100 + 50 * yy / h, 150 - 40 * xx / w], axis=-1
    ).astype(np.uint8)
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    alpha = np.clip((r - dist + 1.5) / 3.0, 0, 1)[..., None]
    obj = np.array([20, 200, 180], np.float32)
    img = (bg * (1 - alpha) + obj[None, None, :] * alpha).astype(np.uint8)
    mask = (dist <= r).astype(np.uint8) * 255
    return img, mask, bg


def _fake_run_model(crop_img, crop_mask):
    """Stand-in for LaMa: fill masked pixels with the mean of the unmasked crop."""
    out = crop_img.copy()
    m = crop_mask > 127
    if m.any() and (~m).any():
        out[m] = crop_img[~m].reshape(-1, 3).mean(axis=0).astype(np.uint8)
    return out


def test_inpaint_array_removes_the_object_ghost():
    img, mask, bg = _scene()
    out = inpaint.inpaint_array(img, mask, _fake_run_model)
    core = mask > 127
    err_before = np.abs(img[core].astype(np.float32) - bg[core].astype(np.float32)).mean()
    err_after = np.abs(out[core].astype(np.float32) - bg[core].astype(np.float32)).mean()
    # the object was very different from bg; after erasing, the core is close to bg
    assert err_after < err_before * 0.5
    assert err_after < 25
    # and the fill is NOT the object's green (200) -> no ghost
    assert out[core][:, 1].mean() < 175


def test_inpaint_array_byte_identical_far_from_mask():
    img, mask, _ = _scene()
    out = inpaint.inpaint_array(img, mask, _fake_run_model)
    yy, xx = np.mgrid[0:400, 0:600]
    far = np.sqrt((xx - 300) ** 2 + (yy - 200) ** 2) > 120
    assert np.array_equal(out[far], img[far])


def test_inpaint_array_empty_mask_returns_original():
    img, _, _ = _scene()
    mask = np.zeros(img.shape[:2], np.uint8)
    assert np.array_equal(inpaint.inpaint_array(img, mask, _fake_run_model), img)


def test_inpaint_array_tiny_image_returns_original():
    img = np.random.RandomState(2).randint(0, 256, (4, 4, 3), np.uint8)
    mask = np.full((4, 4), 255, np.uint8)
    assert np.array_equal(inpaint.inpaint_array(img, mask, _fake_run_model), img)


def test_inpaint_array_full_mask_does_not_crash():
    img = np.random.RandomState(3).randint(0, 256, (120, 160, 3), np.uint8)
    mask = np.full((120, 160), 255, np.uint8)
    out = inpaint.inpaint_array(img, mask, _fake_run_model)
    assert out.shape == img.shape
