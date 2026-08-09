"""Content-adaptive gating for photo restoration (#723).

The restoration pipeline used to denoise and inpaint every image, degrading
clean photos. These tests pin the two pure-CV decisions that make it adaptive:
the noise estimate that gates denoise, and the scratch detector's absolute
response floor that stops it flagging an undamaged photo. Skips cleanly where
the AI env (numpy/cv2) is absent, as on CI integration shards.
"""
import os
import sys

import pytest

np = pytest.importorskip("numpy")
cv2 = pytest.importorskip("cv2")
pytest.importorskip("PIL")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import restore  # noqa: E402


def _smooth_scene(seed=0):
    """A detailed-but-noise-free image: a low-frequency gradient plus content
    edges, the kind of clean photo the pipeline must leave alone."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:256, 0:256].astype(np.float32)
    base = (xx + yy) / 2.0  # smooth ramp, 0..255
    img = np.stack([base, base * 0.9, base * 0.8], axis=-1)
    # A few hard content edges (rectangles): high-contrast structure, no noise.
    img[40:80, 60:200] = 220
    img[150:210, 30:90] = 30
    return np.clip(img, 0, 255).astype(np.uint8)


# ── noise estimate gates denoise ──────────────────────────────────────

def test_noise_estimate_is_low_for_a_clean_image():
    sigma = restore.estimate_noise_sigma(_smooth_scene())
    assert sigma < restore.NOISE_GATE_SIGMA


def test_noise_estimate_rises_with_added_noise():
    clean = _smooth_scene()
    rng = np.random.default_rng(1)
    noisy = np.clip(clean.astype(np.float32) + rng.normal(0, 20, clean.shape), 0, 255).astype(np.uint8)
    assert restore.estimate_noise_sigma(noisy) > restore.NOISE_GATE_SIGMA
    # And it tracks the injected level, not just "bigger".
    assert restore.estimate_noise_sigma(noisy) > restore.estimate_noise_sigma(clean) + 5


def test_noise_estimate_handles_a_tiny_image():
    assert restore.estimate_noise_sigma(np.zeros((2, 2, 3), np.uint8)) == 0.0


# ── scratch floor stops false positives, keeps real damage ────────────

def test_clean_image_yields_no_scratch_mask():
    # Content edges must not be inpainted: an undamaged photo returns an empty
    # mask so no detail is lost (the pre-fix detector flagged ~12% of pixels).
    mask = restore.detect_scratches(_smooth_scene())
    assert np.count_nonzero(mask) == 0


def test_strong_high_contrast_scratch_is_detected():
    img = _smooth_scene()
    # A bright thin diagonal crease over the scene: genuine high-contrast damage.
    cv2.line(img, (20, 230), (230, 25), (252, 252, 252), 2)
    mask = restore.detect_scratches(img)
    assert np.count_nonzero(mask) > 0


def test_the_floor_gates_detection():
    # The floor, not some other step, decides what counts as damage: push it
    # above the response range and even a real high-contrast crease vanishes.
    # (End-to-end, dropping it to the old level takes a real photo from 0% to
    # ~12% flagged; that is verified against the portrait fixture, not here.)
    img = _smooth_scene()
    cv2.line(img, (20, 230), (230, 25), (252, 252, 252), 2)
    assert np.count_nonzero(restore.detect_scratches(img)) > 0

    original = restore.SCRATCH_RESPONSE_FLOOR
    try:
        restore.SCRATCH_RESPONSE_FLOOR = 300  # above the 0..255 response range
        assert np.count_nonzero(restore.detect_scratches(img)) == 0
    finally:
        restore.SCRATCH_RESPONSE_FLOOR = original
