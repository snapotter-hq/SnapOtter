"""Offline PP-OCRv6 adapter for SnapOtter's isolated OCR runtime.

This module deliberately has no import-time dependency on RapidOCR, OpenCV, or
ONNX Runtime.  Model and provider validation happens first; the pinned runtime
libraries are imported only when an OCR session is actually created.
"""

from __future__ import annotations

import importlib.metadata
import json
import math
import os
import re
import tempfile
import unicodedata
from dataclasses import dataclass, replace
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Mapping, MutableMapping, Protocol, Sequence


MAX_BOXES = 1_000
# Auto language reuses unified-recognizer crops for the Korean second pass.
# Bound their retained RGB footprint to roughly 48 MiB before any crop is made.
MAX_AUTO_KOREAN_CROP_PIXELS = 16_000_000
AUTO_KOREAN_RECOGNITION_BATCH_SIZE = 16
MAX_IMAGE_OCR_OUTPUT_BYTES = 1_000_000
# Kept in lockstep with packages/ai/src/tesseract-pdf.ts. This byte budget
# includes page headings and separators for both Fast and accurate PDF OCR.
MAX_PDF_OCR_OUTPUT_BYTES = 1_000_000
MAX_OUTPUT_BYTES_PER_MEGAPIXEL = 200_000
MIN_IMAGE_OUTPUT_BYTES = 10_000
MAX_VARIANT_PIXELS = 40_000_000
MAX_INPUT_SIDE = 40_000
MAX_DETECTOR_TILES = 64
MAX_ROTATION_CANDIDATES = 2
MAX_DETECTOR_TILE_SIDE = 1_536
MIN_DETECTOR_TILE_SIDE = 32
DETECTOR_TILE_OVERLAP = 256
MAX_ONNX_INTRA_OP_THREADS = 4
ONNX_INTER_OP_THREADS = 1
EXPECTED_RAPIDOCR_VERSION = "3.9.1"
EXPECTED_ONNXRUNTIME_VERSION = "1.20.1"

SUPPORTED_QUALITIES = frozenset(("balanced", "best"))
SUPPORTED_LANGUAGES = frozenset(("auto", "en", "de", "fr", "es", "zh", "ja", "ko"))
RASTER_SUFFIXES = frozenset((".bmp", ".jpeg", ".jpg", ".png", ".tif", ".tiff", ".webp"))

MODEL_FILENAMES: Mapping[str, str] = {
    "small_det": "PP-OCRv6_det_small.onnx",
    "small_rec": "PP-OCRv6_rec_small.onnx",
    "medium_det": "PP-OCRv6_det_medium.onnx",
    "medium_rec": "PP-OCRv6_rec_medium.onnx",
    "korean_rec": "korean_PP-OCRv5_mobile_rec.onnx",
    "textline_orientation": "PP-LCNet_x0_25_textline_ori.onnx",
    "document_orientation": "PP-LCNet_x1_0_doc_ori.onnx",
    "unified_dict": "ppocrv6_dict.txt",
    "korean_dict": "korean_dict.txt",
}

_SMOKE_GLYPHS: Mapping[str, tuple[str, ...]] = {
    " ": ("00000",) * 7,
    "0": ("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
    "5": ("11111", "10000", "11110", "00001", "00001", "10001", "01110"),
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
}


def _functional_smoke_fixture() -> bytes:
    """Return a dependency-free, text-bearing PGM used for activation inference."""

    width, height, scale = 1024, 192, 12
    pixels = bytearray([255]) * (width * height)
    left, top = 40, 48
    for character in "SNAPOTTER 505":
        glyph = _SMOKE_GLYPHS[character]
        for row, values in enumerate(glyph):
            for column, value in enumerate(values):
                if value != "1":
                    continue
                x_start = left + column * scale
                y_start = top + row * scale
                for y in range(y_start, y_start + scale):
                    offset = y * width + x_start
                    pixels[offset : offset + scale] = b"\x00" * scale
        left += 6 * scale
    return f"P5\n{width} {height}\n255\n".encode("ascii") + pixels


class OcrLimitError(RuntimeError):
    """The OCR engine produced output beyond a configured safety ceiling."""


@dataclass(frozen=True)
class RawLine:
    text: str
    confidence: float
    polygon: tuple[tuple[float, float], ...]


@dataclass(frozen=True)
class RawRecognition:
    text: str
    confidence: float


@dataclass(frozen=True)
class RawCandidate:
    lines: tuple[RawLine, ...]
    width: int
    height: int
    crops: tuple[Any, ...] = ()


@dataclass(frozen=True)
class OrientationPrediction:
    angle: int
    confidence: float


class OrientationClassifier(Protocol):
    def initialize(self) -> None: ...

    def classify(self, image_path: Path) -> OrientationPrediction: ...


class ImageVariants(Protocol):
    def rotate(self, source: Any, angle: int) -> Any: ...

    def enhance(self, source: Any) -> Any: ...


class OcrBackend(Protocol):
    def recognize(self, image_input: Any, *, retain_crops: bool = False) -> RawCandidate: ...

    def recognize_crops(self, crops: tuple[Any, ...]) -> tuple[RawRecognition, ...]: ...


class BackendFactory(Protocol):
    def create(
        self,
        *,
        tier: str,
        recognizer: str,
        paths: Mapping[str, Path],
    ) -> OcrBackend: ...


@dataclass(frozen=True)
class SelectorCalibration:
    confidence_coverage: float
    mean_confidence: float
    polygon_coherence: float
    reading_order_coherence: float
    variant_policy: "VariantPolicy | None" = None


@dataclass(frozen=True)
class VariantPolicy:
    orientation_min_confidence: float
    orientation_min_score_gain: float
    preprocess_min_score_gain: float


@dataclass(frozen=True)
class CandidateChoice:
    candidate: RawCandidate
    source: Any
    source_label: str
    warnings: tuple[str, ...] = ()


@dataclass
class _VariantPlan:
    rotations_ready: bool = False
    rotations: tuple[tuple[int, Any], ...] = ()
    enhanced: dict[str, Any] | None = None

    def __post_init__(self) -> None:
        if self.enhanced is None:
            self.enhanced = {}


def _onnx_thread_counts() -> tuple[int, int]:
    affinity = getattr(os, "sched_getaffinity", None)
    if affinity is not None:
        try:
            available_cpus = len(affinity(0))
        except (OSError, NotImplementedError):
            pass
        else:
            if available_cpus > 0:
                return min(available_cpus, MAX_ONNX_INTRA_OP_THREADS), ONNX_INTER_OP_THREADS

    available_cpus = os.cpu_count() or 1
    intra_op_threads = min(max(available_cpus, 1), MAX_ONNX_INTRA_OP_THREADS)
    return intra_op_threads, ONNX_INTER_OP_THREADS


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _normalize_polygon(value: Any) -> tuple[tuple[float, float], ...]:
    try:
        points = tuple((float(point[0]), float(point[1])) for point in value)
    except (TypeError, ValueError, IndexError) as error:
        raise RuntimeError("RapidOCR returned a malformed text polygon") from error
    if len(points) != 4 or not all(math.isfinite(v) for point in points for v in point):
        raise RuntimeError("RapidOCR returned a malformed text polygon")
    return points


def _shared_crop_pixels(polygon: tuple[tuple[float, float], ...]) -> int:
    top_width = math.hypot(
        polygon[1][0] - polygon[0][0],
        polygon[1][1] - polygon[0][1],
    )
    bottom_width = math.hypot(
        polygon[2][0] - polygon[3][0],
        polygon[2][1] - polygon[3][1],
    )
    left_height = math.hypot(
        polygon[3][0] - polygon[0][0],
        polygon[3][1] - polygon[0][1],
    )
    right_height = math.hypot(
        polygon[2][0] - polygon[1][0],
        polygon[2][1] - polygon[1][1],
    )
    width = max(1, math.ceil(max(top_width, bottom_width)))
    height = max(1, math.ceil(max(left_height, right_height)))
    return width * height


def _candidate_from_rapidocr(
    result: Any,
    cropper: Any,
    source: Any = None,
    *,
    retain_crops: bool = False,
) -> RawCandidate:
    raw_boxes = getattr(result, "boxes", None)
    raw_texts = getattr(result, "txts", None)
    raw_scores = getattr(result, "scores", None)
    image = getattr(result, "img", None)
    shape = getattr(image, "shape", None)
    if shape is None or len(shape) < 2:
        # RapidOCR 3.9.1 deliberately returns img/boxes/txts/scores=None when
        # detection finds no text. Recover only that documented empty shape
        # from the bounded source decoder; malformed non-empty output remains
        # a hard failure.
        if raw_boxes is None and raw_texts is None and raw_scores is None and source is not None:
            fallback_shape = getattr(source, "shape", None)
            fallback = (
                source
                if fallback_shape is not None and len(fallback_shape) >= 2
                else CvImageVariants._load(source)
            )
            height, width = int(fallback.shape[0]), int(fallback.shape[1])
            return RawCandidate(lines=(), width=width, height=height, crops=())
        raise RuntimeError("RapidOCR did not return source image dimensions")
    height, width = int(shape[0]), int(shape[1])
    if width <= 0 or height <= 0:
        raise RuntimeError("RapidOCR returned invalid source image dimensions")

    if raw_boxes is None and raw_texts is None and raw_scores is None:
        return RawCandidate(lines=(), width=width, height=height, crops=())
    if raw_boxes is None or raw_texts is None or raw_scores is None:
        raise RuntimeError("RapidOCR returned an incomplete OCR result")
    if not (len(raw_boxes) == len(raw_texts) == len(raw_scores)):
        raise RuntimeError("RapidOCR returned mismatched OCR result lengths")
    if len(raw_boxes) > MAX_BOXES:
        raise OcrLimitError(f"OCR output exceeded the {MAX_BOXES} boxes limit")

    lines = []
    crops = []
    retained_crop_pixels = 0
    for raw_box, raw_text, raw_score in zip(raw_boxes, raw_texts, raw_scores):
        if not isinstance(raw_text, str) or not _is_number(raw_score):
            raise RuntimeError("RapidOCR returned malformed recognition output")
        polygon = _normalize_polygon(raw_box)
        lines.append(RawLine(raw_text, float(raw_score), polygon))
        if retain_crops:
            crop_pixels = _shared_crop_pixels(polygon)
            if retained_crop_pixels + crop_pixels > MAX_AUTO_KOREAN_CROP_PIXELS:
                raise OcrLimitError(
                    "OCR shared Korean crop pixels exceeded the "
                    f"{MAX_AUTO_KOREAN_CROP_PIXELS} pixels limit"
                )
            crops.append(cropper(image, raw_box))
            retained_crop_pixels += crop_pixels
    return RawCandidate(tuple(lines), width, height, tuple(crops))


@dataclass(frozen=True)
class _TileAxis:
    start: int
    stop: int
    owned_start: float
    owned_stop: float


@dataclass(frozen=True)
class _TiledLine:
    line: RawLine
    crop: Any
    crop_pixels: int
    tile_id: tuple[int, int]
    owned: bool
    interior_margin: float


def _tile_axis(length: int) -> tuple[_TileAxis, ...]:
    if length <= MAX_DETECTOR_TILE_SIDE:
        return (_TileAxis(0, length, 0.0, float(length)),)
    stride = MAX_DETECTOR_TILE_SIDE - DETECTOR_TILE_OVERLAP
    starts = list(range(0, length - MAX_DETECTOR_TILE_SIDE + 1, stride))
    final_start = length - MAX_DETECTOR_TILE_SIDE
    if starts[-1] != final_start:
        starts.append(final_start)
    axes = []
    for index, start in enumerate(starts):
        stop = min(start + MAX_DETECTOR_TILE_SIDE, length)
        owned_start = (
            0.0
            if index == 0
            else (start + min(starts[index - 1] + MAX_DETECTOR_TILE_SIDE, length)) / 2
        )
        owned_stop = (
            float(length)
            if index == len(starts) - 1
            else (stop + starts[index + 1]) / 2
        )
        axes.append(_TileAxis(start, stop, owned_start, owned_stop))
    return tuple(axes)


def _pad_detector_input(image: Any) -> Any:
    """Pad tiny dimensions without scaling so RapidOCR never expands the long side."""
    height, width = int(image.shape[0]), int(image.shape[1])
    pad_bottom = max(0, MIN_DETECTOR_TILE_SIDE - height)
    pad_right = max(0, MIN_DETECTOR_TILE_SIDE - width)
    if pad_bottom == 0 and pad_right == 0:
        return image
    import cv2

    padded = cv2.copyMakeBorder(
        image,
        0,
        pad_bottom,
        0,
        pad_right,
        cv2.BORDER_REPLICATE,
    )
    expected_shape = (height + pad_bottom, width + pad_right)
    if tuple(int(value) for value in padded.shape[:2]) != expected_shape:
        raise RuntimeError("OCR detector padding returned unexpected dimensions")
    return padded


def _restore_detector_extent(candidate: RawCandidate, width: int, height: int) -> RawCandidate:
    """Remove padding-only detections and restore the native tile dimensions."""
    if candidate.width == width and candidate.height == height:
        return candidate
    lines = []
    crops = []
    has_crops = bool(candidate.crops)
    for index, line in enumerate(candidate.lines):
        left, top, right, bottom = _bounds(line)
        center_x = (left + right) / 2
        center_y = (top + bottom) / 2
        if not (0 <= center_x < width and 0 <= center_y < height):
            continue
        lines.append(
            replace(
                line,
                polygon=tuple(
                    (
                        min(max(x, 0.0), float(width)),
                        min(max(y, 0.0), float(height)),
                    )
                    for x, y in line.polygon
                ),
            )
        )
        if has_crops:
            crops.append(candidate.crops[index])
    return RawCandidate(tuple(lines), width, height, tuple(crops))


def _translate_line(line: RawLine, left: int, top: int) -> RawLine:
    return replace(
        line,
        polygon=tuple((x + left, y + top) for x, y in line.polygon),
    )


def _normalized_line_text(text: str) -> str:
    return re.sub(r"[^\w]+", "", text.casefold(), flags=re.UNICODE)


def _cross_tile_duplicate(left: _TiledLine, right: _TiledLine) -> bool:
    left_bounds = _bounds(left.line)
    right_bounds = _bounds(right.line)
    overlap_width = max(
        0.0, min(left_bounds[2], right_bounds[2]) - max(left_bounds[0], right_bounds[0])
    )
    overlap_height = max(
        0.0, min(left_bounds[3], right_bounds[3]) - max(left_bounds[1], right_bounds[1])
    )
    left_area = max(
        (left_bounds[2] - left_bounds[0]) * (left_bounds[3] - left_bounds[1]), 1.0
    )
    right_area = max(
        (right_bounds[2] - right_bounds[0]) * (right_bounds[3] - right_bounds[1]), 1.0
    )
    overlap_ratio = overlap_width * overlap_height / min(left_area, right_area)
    if overlap_ratio < 0.5:
        return False
    left_text = _normalized_line_text(left.line.text)
    right_text = _normalized_line_text(right.line.text)
    if not left_text or not right_text:
        return False
    shorter, longer = sorted((left_text, right_text), key=len)
    similarity = SequenceMatcher(None, left_text, right_text, autojunk=False)
    longest_match = max((block.size for block in similarity.get_matching_blocks()), default=0)
    return (
        left_text == right_text
        or (len(shorter) >= 3 and shorter in longer)
        or similarity.ratio() >= 0.72
        or (
            overlap_ratio >= 0.8
            and min(left.interior_margin, right.interior_margin) <= 2
            and longest_match >= 3
            and longest_match / len(shorter) >= 0.4
        )
    )


def _tiled_line_priority(entry: _TiledLine) -> tuple[bool, int, float, float]:
    return (
        entry.owned,
        len(_normalized_line_text(entry.line.text)),
        min(max(entry.line.confidence, 0.0), 1.0),
        entry.interior_margin,
    )


class _RapidOcrBackend:
    def __init__(self, engine: Any, cropper: Any, recognition_input_type: Any):
        self._engine = engine
        self._cropper = cropper
        self._recognition_input_type = recognition_input_type

    def _recognize_extent(
        self,
        image: Any,
        width: int,
        height: int,
        *,
        retain_crops: bool,
    ) -> RawCandidate:
        detector_input = _pad_detector_input(image)
        detector_height, detector_width = (
            int(detector_input.shape[0]),
            int(detector_input.shape[1]),
        )
        if (
            detector_height < MIN_DETECTOR_TILE_SIDE
            or detector_width < MIN_DETECTOR_TILE_SIDE
            or detector_height > MAX_DETECTOR_TILE_SIDE
            or detector_width > MAX_DETECTOR_TILE_SIDE
        ):
            raise OcrLimitError("OCR detector input dimensions escaped the bounded tile range")
        candidate = _candidate_from_rapidocr(
            self._engine(detector_input),
            self._cropper,
            detector_input,
            retain_crops=retain_crops,
        )
        if candidate.width != detector_width or candidate.height != detector_height:
            raise RuntimeError("RapidOCR returned dimensions that do not match its detector input")
        return _restore_detector_extent(candidate, width, height)

    def recognize(self, image_input: Any, *, retain_crops: bool = False) -> RawCandidate:
        image = CvImageVariants._load(image_input)
        height, width = int(image.shape[0]), int(image.shape[1])
        if width <= 0 or height <= 0:
            raise OcrLimitError("OCR input has invalid image dimensions")
        if width > MAX_INPUT_SIDE or height > MAX_INPUT_SIDE:
            raise OcrLimitError(
                f"OCR input exceeds the {MAX_INPUT_SIDE:,} pixel dimension safety limit"
            )
        if width * height > MAX_VARIANT_PIXELS:
            raise OcrLimitError(
                f"OCR input exceeds the {MAX_VARIANT_PIXELS:,} pixel safety limit"
            )
        x_axes = _tile_axis(width)
        y_axes = _tile_axis(height)
        tile_count = len(x_axes) * len(y_axes)
        if tile_count > MAX_DETECTOR_TILES:
            raise OcrLimitError(
                f"OCR detector tiling exceeded the {MAX_DETECTOR_TILES} tile safety limit"
            )
        if len(x_axes) == 1 and len(y_axes) == 1:
            return self._recognize_extent(
                image,
                width,
                height,
                retain_crops=retain_crops,
            )

        merged: list[_TiledLine] = []
        retained_crop_pixels = 0
        for y_index, y_axis in enumerate(y_axes):
            for x_index, x_axis in enumerate(x_axes):
                tile = image[y_axis.start : y_axis.stop, x_axis.start : x_axis.stop]
                tile_height = y_axis.stop - y_axis.start
                tile_width = x_axis.stop - x_axis.start
                candidate = self._recognize_extent(
                    tile,
                    tile_width,
                    tile_height,
                    retain_crops=retain_crops,
                )
                for line_index, line in enumerate(candidate.lines):
                    local_left, local_top, local_right, local_bottom = _bounds(line)
                    center_x = x_axis.start + (local_left + local_right) / 2
                    center_y = y_axis.start + (local_top + local_bottom) / 2
                    entry = _TiledLine(
                        line=_translate_line(line, x_axis.start, y_axis.start),
                        crop=(candidate.crops[line_index] if retain_crops else None),
                        crop_pixels=(_shared_crop_pixels(line.polygon) if retain_crops else 0),
                        tile_id=(x_index, y_index),
                        owned=(
                            x_axis.owned_start <= center_x < x_axis.owned_stop
                            and y_axis.owned_start <= center_y < y_axis.owned_stop
                        ),
                        interior_margin=min(
                            local_left,
                            tile_width - local_right,
                            local_top,
                            tile_height - local_bottom,
                        ),
                    )
                    duplicate_index = next(
                        (
                            index
                            for index, existing in enumerate(merged)
                            if existing.tile_id != entry.tile_id
                            and _cross_tile_duplicate(existing, entry)
                        ),
                        None,
                    )
                    if duplicate_index is None:
                        if (
                            retained_crop_pixels + entry.crop_pixels
                            > MAX_AUTO_KOREAN_CROP_PIXELS
                        ):
                            raise OcrLimitError(
                                "OCR shared Korean crop pixels exceeded the "
                                f"{MAX_AUTO_KOREAN_CROP_PIXELS} pixels limit"
                            )
                        merged.append(entry)
                        retained_crop_pixels += entry.crop_pixels
                        if len(merged) > MAX_BOXES:
                            raise OcrLimitError(f"OCR output exceeded the {MAX_BOXES} boxes limit")
                    elif _tiled_line_priority(entry) > _tiled_line_priority(
                        merged[duplicate_index]
                    ):
                        next_crop_pixels = (
                            retained_crop_pixels
                            - merged[duplicate_index].crop_pixels
                            + entry.crop_pixels
                        )
                        if next_crop_pixels > MAX_AUTO_KOREAN_CROP_PIXELS:
                            raise OcrLimitError(
                                "OCR shared Korean crop pixels exceeded the "
                                f"{MAX_AUTO_KOREAN_CROP_PIXELS} pixels limit"
                            )
                        merged[duplicate_index] = entry
                        retained_crop_pixels = next_crop_pixels

        merged.sort(key=lambda entry: _position(entry.line))
        return RawCandidate(
            lines=tuple(entry.line for entry in merged),
            width=width,
            height=height,
            crops=tuple(entry.crop for entry in merged) if retain_crops else (),
        )

    def recognize_crops(self, crops: tuple[Any, ...]) -> tuple[RawRecognition, ...]:
        if not crops:
            return ()
        output = []
        for start in range(0, len(crops), AUTO_KOREAN_RECOGNITION_BATCH_SIZE):
            batch = crops[start : start + AUTO_KOREAN_RECOGNITION_BATCH_SIZE]
            classified = self._engine.text_cls(list(batch))
            oriented_crops = getattr(classified, "img_list", None)
            if oriented_crops is None or len(oriented_crops) != len(batch):
                raise RuntimeError("RapidOCR returned mismatched shared-crop orientation output")
            result = self._engine.text_rec(
                self._recognition_input_type(img=oriented_crops, return_word_box=False)
            )
            texts = getattr(result, "txts", None)
            scores = getattr(result, "scores", None)
            if (
                texts is None
                or scores is None
                or len(texts) != len(batch)
                or len(scores) != len(batch)
            ):
                raise RuntimeError("RapidOCR returned mismatched shared-crop recognition output")
            for text, score in zip(texts, scores):
                if not isinstance(text, str) or not _is_number(score):
                    raise RuntimeError(
                        "RapidOCR returned malformed shared-crop recognition output"
                    )
                output.append(RawRecognition(text, float(score)))
        return tuple(output)


class RapidOcrBackendFactory:
    """Construct RapidOCR 3.9.1 CPU sessions with only explicit local models."""

    def __init__(self, environ: Mapping[str, str]):
        self._environ = environ
        self._libraries: tuple[Any, Any, Any, Any] | None = None

    def _load_libraries(self) -> tuple[Any, Any, Any, Any]:
        if self._libraries is not None:
            return self._libraries

        expected_rapidocr = self._environ.get(
            "SNAPOTTER_OCR_EXPECTED_RAPIDOCR_VERSION", EXPECTED_RAPIDOCR_VERSION
        )
        expected_ort = self._environ.get(
            "SNAPOTTER_OCR_EXPECTED_ONNXRUNTIME_VERSION", EXPECTED_ONNXRUNTIME_VERSION
        )
        rapidocr_version = importlib.metadata.version("rapidocr")
        ort_version = importlib.metadata.version("onnxruntime")
        if rapidocr_version != expected_rapidocr:
            raise RuntimeError(
                f"Unsupported RapidOCR version {rapidocr_version}; expected {expected_rapidocr}"
            )
        if ort_version != expected_ort:
            raise RuntimeError(
                f"Unsupported ONNX Runtime version {ort_version}; expected {expected_ort}"
            )

        from rapidocr import RapidOCR
        from rapidocr.ch_ppocr_rec.typings import TextRecInput
        from rapidocr.utils.download_file import DownloadFile
        from rapidocr.utils.process_img import get_rotate_crop_image
        from rapidocr.utils.typings import OCRVersion

        def blocked_download(_class: Any, *_args: Any, **_kwargs: Any) -> None:
            raise RuntimeError("OCR runtime model downloads are disabled")

        # Explicit model paths below mean this should never be called.  Replacing
        # the downloader makes that invariant fail closed if RapidOCR regresses.
        DownloadFile.run = classmethod(blocked_download)
        self._libraries = (RapidOCR, TextRecInput, get_rotate_crop_image, OCRVersion)
        return self._libraries

    def create(
        self,
        *,
        tier: str,
        recognizer: str,
        paths: Mapping[str, Path],
    ) -> OcrBackend:
        if tier not in ("small", "medium") or recognizer not in ("unified", "korean"):
            raise ValueError("Unsupported RapidOCR backend profile")
        RapidOCR, recognition_input_type, cropper, ocr_version = self._load_libraries()
        rec_path = paths["korean_rec"] if recognizer == "korean" else paths[f"{tier}_rec"]
        rec_dict = paths["korean_dict"] if recognizer == "korean" else paths["unified_dict"]
        intra_op_threads, inter_op_threads = _onnx_thread_counts()

        params = {
            "Global.log_level": "critical",
            "Global.model_root_dir": str(paths["model_root"]),
            # The backend tiles before inference. This remains an independent
            # defense if a future call path accidentally bypasses tiling.
            "Global.max_side_len": MAX_DETECTOR_TILE_SIDE,
            "Global.min_side_len": MIN_DETECTOR_TILE_SIDE,
            "Global.use_det": True,
            "Global.use_cls": True,
            "Global.use_rec": True,
            "EngineConfig.onnxruntime.use_cuda": False,
            "EngineConfig.onnxruntime.use_dml": False,
            "EngineConfig.onnxruntime.use_cann": False,
            "EngineConfig.onnxruntime.use_coreml": False,
            "EngineConfig.onnxruntime.intra_op_num_threads": intra_op_threads,
            "EngineConfig.onnxruntime.inter_op_num_threads": inter_op_threads,
            "Det.model_path": str(paths[f"{tier}_det"]),
            "Det.limit_type": "max",
            "Det.limit_side_len": MAX_DETECTOR_TILE_SIDE,
            "Det.max_candidates": MAX_BOXES,
            "Cls.ocr_version": ocr_version.PPOCRV5,
            "Cls.model_path": str(paths["textline_orientation"]),
            "Rec.model_path": str(rec_path),
            "Rec.rec_keys_path": str(rec_dict),
        }
        return _RapidOcrBackend(RapidOCR(params=params), cropper, recognition_input_type)


class OnnxDocumentOrientation:
    """Bounded CPU inference for the official four-way document orientation model."""

    def __init__(self, model_path: Path):
        self._model_path = model_path
        self._session: Any | None = None

    def _get_session(self) -> Any:
        if self._session is not None:
            return self._session
        import onnxruntime

        intra_op_threads, inter_op_threads = _onnx_thread_counts()
        session_options = onnxruntime.SessionOptions()
        session_options.intra_op_num_threads = intra_op_threads
        session_options.inter_op_num_threads = inter_op_threads
        session = onnxruntime.InferenceSession(
            str(self._model_path),
            sess_options=session_options,
            providers=["CPUExecutionProvider"],
        )
        if not session.get_providers() or session.get_providers()[0] != "CPUExecutionProvider":
            raise RuntimeError("Document orientation model did not initialize on the CPU provider")
        inputs = session.get_inputs()
        outputs = session.get_outputs()
        if len(inputs) != 1 or len(outputs) < 1:
            raise RuntimeError("Document orientation model has an unsupported ONNX signature")
        self._session = session
        return session

    def initialize(self) -> None:
        """Eagerly validate the lazy ONNX session during activation smoke tests."""
        self._get_session()

    @staticmethod
    def _preprocess(image_path: Path) -> Any:
        import cv2
        import numpy as np

        encoded = np.fromfile(str(image_path), dtype=np.uint8)
        image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
        if image is None or image.ndim != 3 or image.shape[2] != 3:
            raise RuntimeError("Document orientation model could not decode the input image")
        height, width = image.shape[:2]
        if height <= 0 or width <= 0 or height * width > MAX_VARIANT_PIXELS:
            raise OcrLimitError(
                f"Document orientation candidates are limited to {MAX_VARIANT_PIXELS} pixels"
            )

        # The model's original pipeline scales the short side to 256 and then
        # takes a 224px center crop. Crop the equivalent source square first,
        # so an extreme long side is never materialized at the 256x scale.
        crop_side = max(1, min(min(height, width), round(min(height, width) * 224 / 256)))
        left = (width - crop_side) // 2
        top = (height - crop_side) // 2
        center_crop = image[top : top + crop_side, left : left + crop_side]
        center_crop = cv2.cvtColor(center_crop, cv2.COLOR_BGR2RGB)
        resized = cv2.resize(center_crop, (224, 224), interpolation=cv2.INTER_LINEAR)
        normalized = resized.astype("float32") * (1.0 / 255.0)
        normalized -= np.asarray((0.485, 0.456, 0.406), dtype="float32")
        normalized /= np.asarray((0.229, 0.224, 0.225), dtype="float32")
        return np.transpose(normalized, (2, 0, 1))[None, ...]

    def classify(self, image_path: Path) -> OrientationPrediction:
        import numpy as np

        session = self._get_session()
        values = np.asarray(
            session.run(None, {session.get_inputs()[0].name: self._preprocess(image_path)})[0]
        ).reshape(-1)
        if values.size != 4 or not np.all(np.isfinite(values)):
            raise RuntimeError("Document orientation model returned malformed scores")
        if np.all(values >= 0) and math.isclose(float(values.sum()), 1.0, abs_tol=1e-3):
            probabilities = values
        else:
            shifted = values - np.max(values)
            exponentials = np.exp(shifted)
            probabilities = exponentials / exponentials.sum()
        index = int(np.argmax(probabilities))
        return OrientationPrediction((0, 90, 180, 270)[index], float(probabilities[index]))


class CvImageVariants:
    """Create bounded in-memory variants; the source file is never modified."""

    @staticmethod
    def _load(source: Any) -> Any:
        import cv2
        import numpy as np

        if isinstance(source, (str, Path)):
            encoded = np.fromfile(str(source), dtype=np.uint8)
            image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
        else:
            image = np.asarray(source)
        if image is None or image.ndim != 3 or image.shape[2] != 3:
            raise RuntimeError("OCR variant processing requires a three-channel image")
        height, width = image.shape[:2]
        if height <= 0 or width <= 0 or height * width > MAX_VARIANT_PIXELS:
            raise OcrLimitError(f"OCR image variants are limited to {MAX_VARIANT_PIXELS} pixels")
        return image

    def rotate(self, source: Any, angle: int) -> Any:
        import cv2

        image = self._load(source)
        rotation_codes = {
            90: cv2.ROTATE_90_CLOCKWISE,
            180: cv2.ROTATE_180,
            270: cv2.ROTATE_90_COUNTERCLOCKWISE,
        }
        if angle not in rotation_codes:
            raise ValueError("OCR rotation candidate must be 90, 180, or 270 degrees")
        return cv2.rotate(image, rotation_codes[angle])

    def enhance(self, source: Any) -> Any:
        import cv2

        image = self._load(source)
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        lightness, channel_a, channel_b = cv2.split(lab)
        enhanced_lightness = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8)).apply(lightness)
        return cv2.cvtColor(
            cv2.merge((enhanced_lightness, channel_a, channel_b)),
            cv2.COLOR_LAB2BGR,
        )


def _read_calibration(path: Path) -> SelectorCalibration | None:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(raw, dict) or raw.get("schemaVersion") != 1:
        return None
    if raw.get("selectorVersion") != "best-v1" or not isinstance(raw.get("weights"), dict):
        return None
    weights = raw["weights"]
    keys = (
        "confidenceCoverage",
        "meanConfidence",
        "polygonCoherence",
        "readingOrderCoherence",
    )
    if set(weights) != set(keys) or not all(_is_number(weights.get(key)) for key in keys):
        return None
    values = [float(weights[key]) for key in keys]
    if any(value < 0 or value > 1 for value in values) or not math.isclose(
        sum(values), 1.0, abs_tol=1e-6
    ):
        return None
    variant_policy = None
    raw_policy = raw.get("variantPolicy")
    if raw_policy is not None:
        policy_keys = (
            "orientationMinConfidence",
            "orientationMinScoreGain",
            "preprocessMinScoreGain",
        )
        if (
            not isinstance(raw_policy, dict)
            or set(raw_policy) != set(policy_keys)
            or not all(_is_number(raw_policy.get(key)) for key in policy_keys)
        ):
            return None
        policy_values = [float(raw_policy[key]) for key in policy_keys]
        if any(value < 0 or value > 1 for value in policy_values):
            return None
        variant_policy = VariantPolicy(*policy_values)
    return SelectorCalibration(*values, variant_policy)


def _polygon_area(polygon: tuple[tuple[float, float], ...]) -> float:
    return abs(
        sum(
            polygon[index][0] * polygon[(index + 1) % 4][1]
            - polygon[(index + 1) % 4][0] * polygon[index][1]
            for index in range(4)
        )
        / 2
    )


def _position(line: RawLine) -> tuple[float, float]:
    return (min(point[1] for point in line.polygon), min(point[0] for point in line.polygon))


def _bounds(line: RawLine) -> tuple[float, float, float, float]:
    xs = [point[0] for point in line.polygon]
    ys = [point[1] for point in line.polygon]
    return min(xs), min(ys), max(xs), max(ys)


def _rows(lines: Sequence[RawLine]) -> list[list[RawLine]]:
    """Group overlapping polygons into rows, then order each row left-to-right."""
    groups: list[dict[str, Any]] = []
    for line in sorted(lines, key=lambda value: (_bounds(value)[1], _bounds(value)[0])):
        left, top, right, bottom = _bounds(line)
        height = max(bottom - top, 1.0)
        best_group = None
        best_overlap = 0.0
        for group in groups:
            overlap = max(0.0, min(bottom, group["bottom"]) - max(top, group["top"]))
            overlap_ratio = overlap / min(height, max(group["bottom"] - group["top"], 1.0))
            center_distance = abs((top + bottom) / 2 - group["center"])
            if overlap_ratio >= 0.35 or center_distance <= max(height, group["height"]) * 0.45:
                if overlap_ratio >= best_overlap:
                    best_group, best_overlap = group, overlap_ratio
        if best_group is None:
            groups.append(
                {
                    "lines": [line],
                    "top": top,
                    "bottom": bottom,
                    "center": (top + bottom) / 2,
                    "height": height,
                    "left": left,
                    "right": right,
                }
            )
            continue
        best_group["lines"].append(line)
        best_group["top"] = min(best_group["top"], top)
        best_group["bottom"] = max(best_group["bottom"], bottom)
        best_group["center"] = (best_group["top"] + best_group["bottom"]) / 2
        best_group["height"] = best_group["bottom"] - best_group["top"]
        best_group["left"] = min(best_group["left"], left)
        best_group["right"] = max(best_group["right"], right)

    groups.sort(key=lambda group: (group["top"], group["left"]))
    return [sorted(group["lines"], key=lambda line: _bounds(line)[0]) for group in groups]


def _median_line_height(lines: Sequence[RawLine]) -> float:
    heights = sorted(max(_bounds(line)[3] - _bounds(line)[1], 1.0) for line in lines)
    middle = len(heights) // 2
    if len(heights) % 2:
        return heights[middle]
    return (heights[middle - 1] + heights[middle]) / 2


def _column_split(
    lines: Sequence[RawLine], page_width: int
) -> tuple[list[RawLine], list[RawLine]] | None:
    """Find a conservative full-height gutter between multi-line text columns."""
    if len(lines) < 4:
        return None
    ordered = sorted(lines, key=lambda line: (_bounds(line)[0], _bounds(line)[1]))
    minimum_gap = max(_median_line_height(ordered) * 2, page_width * 0.04)
    prefix_right = -math.inf
    best: tuple[float, list[RawLine], list[RawLine]] | None = None
    for index, line in enumerate(ordered[:-1], start=1):
        prefix_right = max(prefix_right, _bounds(line)[2])
        if index < 2 or len(ordered) - index < 2:
            continue
        next_left = _bounds(ordered[index])[0]
        gap = next_left - prefix_right
        if gap < minimum_gap:
            continue
        left_lines = ordered[:index]
        right_lines = ordered[index:]
        left_top = min(_bounds(value)[1] for value in left_lines)
        left_bottom = max(_bounds(value)[3] for value in left_lines)
        right_top = min(_bounds(value)[1] for value in right_lines)
        right_bottom = max(_bounds(value)[3] for value in right_lines)
        vertical_overlap = max(0.0, min(left_bottom, right_bottom) - max(left_top, right_top))
        smaller_span = max(min(left_bottom - left_top, right_bottom - right_top), 1.0)
        if vertical_overlap < max(_median_line_height(ordered), smaller_span * 0.25):
            continue
        if best is None or gap > best[0]:
            best = (gap, left_lines, right_lines)
    return None if best is None else (best[1], best[2])


def _horizontal_columns(lines: Sequence[RawLine], page_width: int) -> list[list[RawLine]]:
    split = _column_split(lines, page_width)
    if split is not None:
        left, right = split
        return _horizontal_columns(left, page_width) + _horizontal_columns(right, page_width)

    # A title or footer may bridge an otherwise unambiguous gutter. Only set
    # those wide lines aside when every one sits wholly outside the body.
    wide_lines = [
        line
        for line in lines
        if _bounds(line)[2] - _bounds(line)[0] >= page_width * 0.6
    ]
    body_lines = [line for line in lines if line not in wide_lines]
    if wide_lines and _column_split(body_lines, page_width) is not None:
        body_top = min(_bounds(line)[1] for line in body_lines)
        body_bottom = max(_bounds(line)[3] for line in body_lines)
        before = [line for line in wide_lines if _bounds(line)[3] <= body_top]
        after = [line for line in wide_lines if _bounds(line)[1] >= body_bottom]
        if len(before) + len(after) == len(wide_lines):
            groups: list[list[RawLine]] = []
            if before:
                groups.append(before)
            groups.extend(_horizontal_columns(body_lines, page_width))
            if after:
                groups.append(after)
            return groups
    return [list(lines)]


def _vertical_columns(lines: Sequence[RawLine]) -> list[list[RawLine]]:
    """Group vertical fragments by x, ordered in Japanese right-to-left flow."""
    groups: list[dict[str, Any]] = []
    for line in sorted(lines, key=lambda value: (-_bounds(value)[2], _bounds(value)[1])):
        left, top, right, bottom = _bounds(line)
        width = max(right - left, 1.0)
        best_group = None
        best_overlap = 0.0
        for group in groups:
            overlap = max(0.0, min(right, group["right"]) - max(left, group["left"]))
            overlap_ratio = overlap / min(width, max(group["right"] - group["left"], 1.0))
            center_distance = abs((left + right) / 2 - group["center"])
            if overlap_ratio >= 0.35 or center_distance <= max(width, group["width"]) * 0.45:
                if overlap_ratio >= best_overlap:
                    best_group, best_overlap = group, overlap_ratio
        if best_group is None:
            groups.append(
                {
                    "lines": [line],
                    "left": left,
                    "right": right,
                    "center": (left + right) / 2,
                    "width": width,
                }
            )
            continue
        best_group["lines"].append(line)
        best_group["left"] = min(best_group["left"], left)
        best_group["right"] = max(best_group["right"], right)
        best_group["center"] = (best_group["left"] + best_group["right"]) / 2
        best_group["width"] = best_group["right"] - best_group["left"]

    groups.sort(key=lambda group: (-group["right"], group["left"]))
    return [sorted(group["lines"], key=lambda line: _bounds(line)[1]) for group in groups]


def _is_cjk_boundary(character: str) -> bool:
    return (
        ("\u3040" <= character <= "\u30ff")
        or ("\u3400" <= character <= "\u9fff")
        or ("\uac00" <= character <= "\ud7af")
        or ("\u1100" <= character <= "\u11ff")
    )


def _join_row(lines: Sequence[RawLine]) -> str:
    output = ""
    previous: RawLine | None = None
    for line in lines:
        text = line.text.strip()
        if not text:
            continue
        if not output or previous is None:
            output = text
            previous = line
            continue
        previous_bounds = _bounds(previous)
        current_bounds = _bounds(line)
        height = max(previous_bounds[3] - previous_bounds[1], current_bounds[3] - current_bounds[1], 1)
        gap = current_bounds[0] - previous_bounds[2]
        if gap < 0:
            for duplicate_count in range(min(8, len(output), len(text)), 0, -1):
                if output.endswith(text[:duplicate_count]):
                    text = text[duplicate_count:]
                    break
            if not text:
                previous = line
                continue
        touches = gap <= height * 0.25
        punctuation = text[0] in ",.;:!?%)]}" or output[-1] in "([{"
        cjk = _is_cjk_boundary(output[-1]) and _is_cjk_boundary(text[0])
        output += ("" if touches or punctuation or cjk else " ") + text
        previous = line
    return output


def _join_vertical_column(lines: Sequence[RawLine]) -> str:
    output = ""
    for line in lines:
        text = line.text.strip()
        if not text:
            continue
        for duplicate_count in range(min(8, len(output), len(text)), 0, -1):
            if output.endswith(text[:duplicate_count]):
                text = text[duplicate_count:]
                break
        output += text
    return output


def _contains_kana(lines: Sequence[RawLine]) -> bool:
    return any(
        "\u3040" <= character <= "\u30ff"
        for line in lines
        for character in line.text
    )


def _reading_order_coherence(lines: Sequence[RawLine]) -> float:
    if len(lines) < 2:
        return 1.0
    positions = [_position(line) for line in lines]
    coherent = 0
    for previous, current in zip(positions, positions[1:]):
        same_row = abs(previous[0] - current[0]) <= 12
        if current[0] >= previous[0] - 12 and (not same_row or current[1] >= previous[1]):
            coherent += 1
    return coherent / (len(lines) - 1)


def _selector_score(candidate: RawCandidate, calibration: SelectorCalibration) -> float:
    if not candidate.lines:
        return 0.0
    megapixels = max((candidate.width * candidate.height) / 1_000_000, 0.01)
    weighted_characters = sum(
        len(re.sub(r"\s+", "", line.text)) * min(max(line.confidence, 0.0), 1.0)
        for line in candidate.lines
    )
    # Coverage is deliberately saturated.  A noisy candidate cannot win merely
    # by emitting unbounded low-confidence text.
    confidence_coverage = min(1.0, weighted_characters / max(64.0, megapixels * 500.0))
    mean_confidence = sum(min(max(line.confidence, 0.0), 1.0) for line in candidate.lines) / len(
        candidate.lines
    )
    polygon_coherence = sum(_polygon_area(line.polygon) > 1.0 for line in candidate.lines) / len(
        candidate.lines
    )
    reading_order = _reading_order_coherence(candidate.lines)
    score = (
        confidence_coverage * calibration.confidence_coverage
        + mean_confidence * calibration.mean_confidence
        + polygon_coherence * calibration.polygon_coherence
        + reading_order * calibration.reading_order_coherence
    )
    return min(max(score, 0.0), 1.0)


def _vertical_text_ratio(candidate: RawCandidate) -> float:
    if not candidate.lines:
        return 0.0
    vertical = 0
    for line in candidate.lines:
        left, top, right, bottom = _bounds(line)
        if bottom - top >= max(right - left, 1.0) * 1.5:
            vertical += 1
    return vertical / len(candidate.lines)


def _hangul_count(text: str) -> int:
    return sum(
        ("\uac00" <= character <= "\ud7af")
        or ("\u1100" <= character <= "\u11ff")
        or ("\u3130" <= character <= "\u318f")
        or ("\ua960" <= character <= "\ua97f")
        or ("\ud7b0" <= character <= "\ud7ff")
        for character in text
    )


def _non_hangul_alnum(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text).casefold()
    return "".join(
        character
        for character in normalized
        if character.isalnum() and _hangul_count(character) == 0
    )


def _prefer_korean(unified: RawLine, korean: RawRecognition) -> bool:
    visible = [character for character in korean.text if not character.isspace()]
    hangul = _hangul_count(korean.text)
    if hangul < 2 or not visible:
        return False
    ratio = hangul / len(visible)
    score = min(max(korean.confidence, 0.0), 1.0)
    unified_score = min(max(unified.confidence, 0.0), 1.0)
    direct_preference = (
        ratio >= 0.35 and score >= 0.60 and score >= unified_score + 0.03
    ) or (ratio >= 0.65 and score >= 0.70 and score >= unified_score - 0.03)
    unified_visible = [character for character in unified.text if not character.isspace()]
    recovered_hangul = hangul - _hangul_count(unified.text)
    non_hangul_similarity = SequenceMatcher(
        None,
        _non_hangul_alnum(unified.text),
        _non_hangul_alnum(korean.text),
        autojunk=False,
    ).ratio()
    mixed_script_recovery = (
        recovered_hangul >= 4
        and ratio >= 0.20
        and len(visible) >= len(unified_visible) + 4
        and non_hangul_similarity >= 0.80
        and score >= 0.80
        and score >= unified_score - 0.02
    )
    return direct_preference or mixed_script_recovery


def _preserve_unified_prefix(unified: str, korean: str) -> str:
    first_hangul = next(
        (index for index, character in enumerate(korean) if _hangul_count(character)),
        None,
    )
    if first_hangul is None:
        return korean
    korean_prefix = _non_hangul_alnum(korean[:first_hangul])
    if not korean_prefix:
        return korean
    for index in range(len(unified)):
        unified_prefix = _non_hangul_alnum(unified[: index + 1])
        if unified_prefix == korean_prefix:
            prefix = unified[: index + 1].rstrip()
            suffix = korean[first_hangul:].lstrip()
            if prefix and suffix:
                return f"{prefix} {suffix}"
            break
        if not korean_prefix.startswith(unified_prefix):
            break
    return korean


def _merge_auto_korean(
    candidate: RawCandidate, recognitions: tuple[RawRecognition, ...]
) -> RawCandidate:
    if len(recognitions) != len(candidate.lines):
        raise RuntimeError("Korean recognizer did not return one result per shared crop")
    merged = []
    for unified, korean in zip(candidate.lines, recognitions):
        if not isinstance(korean.text, str) or not _is_number(korean.confidence):
            raise RuntimeError("Korean recognizer returned malformed output")
        if _prefer_korean(unified, korean):
            merged.append(
                RawLine(
                    _preserve_unified_prefix(unified.text, korean.text),
                    korean.confidence,
                    unified.polygon,
                )
            )
        else:
            merged.append(unified)
    return replace(candidate, lines=tuple(merged), crops=())


class OcrRuntime:
    def __init__(
        self,
        *,
        root: Path | str | None = None,
        backend_factory: BackendFactory | None = None,
        environ: Mapping[str, str] | None = None,
        calibration_path: Path | str | None = None,
        orientation_classifier: OrientationClassifier | None = None,
        image_variants: ImageVariants | None = None,
    ):
        self._environ = environ if environ is not None else os.environ
        default_root = Path(__file__).resolve().parent.parent
        self.root = Path(
            root or self._environ.get("SNAPOTTER_RUNTIME_ROOT", str(default_root))
        ).resolve()
        self.model_root = self.root / "models"
        self.paths: MutableMapping[str, Path] = {"model_root": self.model_root}
        for model_id, filename in MODEL_FILENAMES.items():
            path = self.model_root / filename
            if not path.is_file():
                raise FileNotFoundError(f"Required OCR model {model_id} is missing: {path}")
            self.paths[model_id] = path

        self.provider = self._read_provider()
        self.device = "cpu"
        self.runtime_version = self._environ.get("SNAPOTTER_OCR_ARTIFACT_VERSION", "unknown")
        self.target = self._environ.get("SNAPOTTER_OCR_RUNTIME_TARGET", "unknown")
        self.calibration_path = Path(
            calibration_path or (self.model_root / "best-v1-calibration.json")
        )
        self.calibration = _read_calibration(self.calibration_path)
        self._factory = backend_factory or RapidOcrBackendFactory(self._environ)
        self._backends: dict[tuple[str, str], OcrBackend] = {}
        self._orientation = orientation_classifier or OnnxDocumentOrientation(
            self.paths["document_orientation"]
        )
        self._image_variants = image_variants or CvImageVariants()

    def _read_provider(self) -> str:
        raw = self._environ.get("SNAPOTTER_OCR_PROVIDERS_JSON", '["CPUExecutionProvider"]')
        try:
            providers = json.loads(raw)
        except json.JSONDecodeError as error:
            raise ValueError("OCR provider descriptor is not valid JSON") from error
        if providers != ["CPUExecutionProvider"]:
            raise ValueError("This OCR runtime requires exactly CPUExecutionProvider")
        return providers[0]

    def _backend(self, tier: str, recognizer: str) -> OcrBackend:
        key = (tier, recognizer)
        if key not in self._backends:
            self._backends[key] = self._factory.create(
                tier=tier,
                recognizer=recognizer,
                paths=dict(self.paths),
            )
        return self._backends[key]

    def smoke(self) -> dict[str, str]:
        """Run one bounded inference through every model family on the CPU provider."""
        if self.calibration is None:
            raise RuntimeError("Best selector calibration is unavailable or invalid")
        fixture_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="wb", prefix="snapotter-ocr-smoke-", suffix=".pgm", delete=False
            ) as fixture:
                fixture.write(_functional_smoke_fixture())
                fixture.flush()
                os.fsync(fixture.fileno())
                fixture_path = Path(fixture.name)

            for recognizer in ("unified", "korean"):
                for tier in ("small", "medium"):
                    candidate = self._backend(tier, recognizer).recognize(fixture_path)
                    self._validate_candidate(candidate)
                    if not any(line.text.strip() for line in candidate.lines):
                        raise RuntimeError(
                            f"OCR {tier}/{recognizer} activation inference returned no text"
                        )

            self._orientation.initialize()
            orientation = self._orientation.classify(fixture_path)
            if (
                orientation.angle not in (0, 90, 180, 270)
                or not _is_number(orientation.confidence)
                or not 0 <= float(orientation.confidence) <= 1
            ):
                raise RuntimeError("Document orientation activation inference was malformed")
        finally:
            if fixture_path is not None:
                fixture_path.unlink(missing_ok=True)
        return {
            "provider": self.provider,
            "device": self.device,
            "runtimeVersion": self.runtime_version,
            "target": self.target,
            "representativeModel": (
                "PP-OCRv6-small+medium+both-korean-pipelines+document-orientation"
            ),
        }

    @staticmethod
    def _settings(raw: Mapping[str, Any] | None) -> dict[str, Any]:
        if raw is None:
            raw = {}
        if not isinstance(raw, Mapping):
            raise ValueError("OCR settings must be an object")
        quality = raw.get("quality", "balanced")
        language = raw.get("language", "auto")
        enhance = raw.get("enhance", False)
        if quality not in SUPPORTED_QUALITIES:
            raise ValueError("Accurate OCR quality must be balanced or best")
        if language not in SUPPORTED_LANGUAGES:
            raise ValueError(f"Unsupported OCR language: {language}")
        if not isinstance(enhance, bool):
            raise ValueError("OCR enhance setting must be boolean")
        return {"quality": quality, "language": language, "enhance": enhance}

    @staticmethod
    def _image_path(value: Path | str, *, raster_page: bool = False) -> Path:
        text = str(value)
        if "://" in text or text.startswith("data:"):
            raise ValueError("OCR accepts only local image paths")
        path = Path(value)
        if not path.is_file():
            raise FileNotFoundError(f"OCR input image does not exist: {path}")
        if raster_page and path.suffix.lower() not in RASTER_SUFFIXES:
            raise ValueError("PDF OCR runtime accepts rasterized page images, not PDF files")
        return path

    def _run_tier(self, image_input: Any, tier: str, language: str) -> RawCandidate:
        recognizer = "korean" if language == "ko" else "unified"
        candidate = self._backend(tier, recognizer).recognize(
            image_input,
            retain_crops=language == "auto",
        )
        self._validate_candidate(candidate)
        if language == "auto" and candidate.lines:
            korean_backend = self._backend(tier, "korean")
            recognitions = korean_backend.recognize_crops(candidate.crops)
            candidate = _merge_auto_korean(candidate, recognitions)
            self._validate_candidate(candidate)
        return candidate

    def _prepare_rotations(
        self,
        image_path: Path,
        plan: _VariantPlan,
        warnings: list[str],
    ) -> tuple[tuple[int, Any], ...]:
        if plan.rotations_ready:
            return plan.rotations
        plan.rotations_ready = True
        policy = self.calibration.variant_policy if self.calibration else None
        if policy is None:
            return ()
        try:
            prediction = self._orientation.classify(image_path)
            if (
                prediction.angle not in (0, 90, 180, 270)
                or not _is_number(prediction.confidence)
            ):
                raise RuntimeError("Document orientation model returned an invalid prediction")
            if prediction.confidence < policy.orientation_min_confidence or prediction.angle == 0:
                return ()
            angles = (180,) if prediction.angle == 180 else (90, 270)
            rotations = []
            for angle in angles[:MAX_ROTATION_CANDIDATES]:
                try:
                    rotations.append((angle, self._image_variants.rotate(image_path, angle)))
                except Exception as error:
                    warnings.append(f"Document rotation {angle}° candidate skipped: {error}")
            plan.rotations = tuple(rotations)
        except Exception as error:
            warnings.append(f"Document orientation candidate scoring skipped: {error}")
        return plan.rotations

    def _tier_choice(
        self,
        image_path: Path,
        tier: str,
        language: str,
        enhance: bool,
        plan: _VariantPlan,
        warnings: list[str],
    ) -> CandidateChoice:
        original = self._run_tier(image_path, tier, language)
        choice = CandidateChoice(original, image_path, "original")
        calibration = self.calibration
        policy = calibration.variant_policy if calibration else None
        if calibration is None or policy is None:
            return choice

        original_score = _selector_score(original, calibration)
        best_rotation: tuple[int, Any, RawCandidate, float] | None = None
        for angle, source in self._prepare_rotations(image_path, plan, warnings):
            try:
                candidate = self._run_tier(source, tier, language)
                score = _selector_score(candidate, calibration)
            except Exception as error:
                warnings.append(f"Document rotation {angle}° OCR candidate skipped: {error}")
                continue
            if best_rotation is None or score > best_rotation[3]:
                best_rotation = (angle, source, candidate, score)

        if best_rotation is not None:
            required_gain = policy.orientation_min_score_gain
            if language == "ja" and _vertical_text_ratio(original) >= 0.5:
                required_gain = max(required_gain, 0.15)
            if best_rotation[3] >= original_score + required_gain:
                angle, source, candidate, score = best_rotation
                choice = CandidateChoice(
                    candidate,
                    source,
                    f"rotation-{angle}",
                    (
                        f"Selected document rotation {angle}° after calibrated OCR score "
                        f"improved by {score - original_score:.3f}.",
                    ),
                )

        if not enhance:
            return choice
        assert plan.enhanced is not None
        try:
            if choice.source_label not in plan.enhanced:
                plan.enhanced[choice.source_label] = self._image_variants.enhance(choice.source)
            enhanced_source = plan.enhanced[choice.source_label]
            enhanced = self._run_tier(enhanced_source, tier, language)
            selected_score = _selector_score(choice.candidate, calibration)
            enhanced_score = _selector_score(enhanced, calibration)
            if enhanced_score >= selected_score + policy.preprocess_min_score_gain:
                return CandidateChoice(
                    enhanced,
                    enhanced_source,
                    f"enhanced-{choice.source_label}",
                    choice.warnings
                    + (
                        "Selected conservative contrast preprocessing after calibrated OCR "
                        f"score improved by {enhanced_score - selected_score:.3f}.",
                    ),
                )
        except Exception as error:
            warnings.append(f"OCR preprocessing candidate skipped: {error}")
        return choice

    @staticmethod
    def _validate_candidate(candidate: RawCandidate) -> None:
        if not isinstance(candidate, RawCandidate) or candidate.width <= 0 or candidate.height <= 0:
            raise RuntimeError("OCR backend returned an invalid candidate")
        if len(candidate.lines) > MAX_BOXES:
            raise OcrLimitError(f"OCR output exceeded the {MAX_BOXES} boxes limit")
        if candidate.crops and len(candidate.crops) != len(candidate.lines):
            raise RuntimeError("OCR backend returned mismatched crops and lines")
        for line in candidate.lines:
            if not isinstance(line.text, str) or not _is_number(line.confidence):
                raise RuntimeError("OCR backend returned a malformed line")
            _normalize_polygon(line.polygon)

    @staticmethod
    def _validate_text_output(candidate: RawCandidate, text: str) -> None:
        byte_limit = min(
            MAX_IMAGE_OCR_OUTPUT_BYTES,
            max(
                MIN_IMAGE_OUTPUT_BYTES,
                math.ceil(
                    candidate.width
                    * candidate.height
                    / 1_000_000
                    * MAX_OUTPUT_BYTES_PER_MEGAPIXEL
                ),
            ),
        )
        if len(text.encode("utf-8")) > byte_limit:
            raise OcrLimitError(
                f"OCR output exceeded the {byte_limit} bytes limit for this image"
            )

    @staticmethod
    def _text(candidate: RawCandidate, language: str) -> str:
        lines = [line for line in candidate.lines if line.text.strip()]
        if not lines:
            return ""
        if _vertical_text_ratio(candidate) >= 0.5 and (
            language == "ja" or (language == "auto" and _contains_kana(lines))
        ):
            vertical_lines = [
                line
                for line in lines
                if _bounds(line)[3] - _bounds(line)[1]
                >= max(_bounds(line)[2] - _bounds(line)[0], 1.0) * 1.5
            ]
            horizontal_lines = [line for line in lines if line not in vertical_lines]
            body_top = min(_bounds(line)[1] for line in vertical_lines)
            body_bottom = max(_bounds(line)[3] for line in vertical_lines)
            before = [line for line in horizontal_lines if _bounds(line)[3] <= body_top]
            after = [line for line in horizontal_lines if _bounds(line)[1] >= body_bottom]
            if len(before) + len(after) == len(horizontal_lines):
                parts = [text for row in _rows(before) if (text := _join_row(row))]
                parts.extend(
                    text
                    for column in _vertical_columns(vertical_lines)
                    if (text := _join_vertical_column(column))
                )
                parts.extend(text for row in _rows(after) if (text := _join_row(row)))
                return "\n".join(parts)
        return "\n".join(
            text
            for column in _horizontal_columns(lines, candidate.width)
            for row in _rows(column)
            if (text := _join_row(row))
        )

    def recognize_image(
        self, image_path: Path | str, raw_settings: Mapping[str, Any] | None = None
    ) -> dict[str, Any]:
        path = self._image_path(image_path)
        settings = self._settings(raw_settings)
        quality = settings["quality"]
        language = settings["language"]
        warnings: list[str] = []
        plan = _VariantPlan()

        if quality == "balanced":
            selected_tier = "small"
            choice = self._tier_choice(
                path,
                selected_tier,
                language,
                settings["enhance"],
                plan,
                warnings,
            )
            model_version = "PP-OCRv6-small"
        else:
            if self.calibration is None:
                raise RuntimeError("Best selector calibration is unavailable or invalid")
            choices = [
                (
                    tier,
                    self._tier_choice(
                        path,
                        tier,
                        language,
                        settings["enhance"],
                        plan,
                        warnings,
                    ),
                )
                for tier in ("small", "medium")
            ]
            tier_scores = {
                tier: _selector_score(tier_choice.candidate, self.calibration)
                for tier, tier_choice in choices
            }
            selected_tier, choice = max(
                choices,
                key=lambda tier_choice: (
                    tier_scores[tier_choice[0]],
                    tier_choice[0] == "medium",
                ),
            )
            model_version = f"PP-OCRv6-best-v1-{selected_tier}"
            warnings.append(
                f"Selected calibrated Best OCR tier {selected_tier} "
                f"(small={tier_scores['small']:.3f}, medium={tier_scores['medium']:.3f})."
            )

        selected = choice.candidate
        warnings.extend(choice.warnings)
        if language == "ko" or (language == "auto" and selected.lines):
            model_version += "+korean-PP-OCRv5"
        text = self._text(selected, language)
        self._validate_text_output(selected, text)
        return {
            "success": True,
            "text": text,
            "engine": "rapidocr-onnx",
            "requestedQuality": quality,
            "actualQuality": quality,
            "device": self.device,
            "provider": self.provider,
            "runtimeVersion": self.runtime_version,
            "modelVersion": model_version,
            "degraded": False,
            "warnings": list(dict.fromkeys(warnings)),
        }

    def recognize_pages(
        self,
        pages: Sequence[tuple[int, Path | str]],
        raw_settings: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        settings = self._settings(raw_settings)
        if not pages:
            raise ValueError("PDF OCR requires at least one rasterized page")
        if len(pages) > 50:
            raise OcrLimitError("PDF OCR accepts at most 50 rasterized pages")
        validated_pages: list[tuple[int, Path]] = []
        seen_pages: set[int] = set()
        for page_number, raw_path in pages:
            if not isinstance(page_number, int) or isinstance(page_number, bool) or page_number < 1:
                raise ValueError("Rasterized PDF page numbers must be positive integers")
            if page_number in seen_pages:
                raise ValueError("Rasterized PDF page numbers must be unique")
            seen_pages.add(page_number)
            validated_pages.append((page_number, self._image_path(raw_path, raster_page=True)))

        parts: list[str] = []
        retained_output_bytes = 0
        warnings: list[str] = []
        model_versions: set[str] = set()
        for page_number, path in sorted(validated_pages):
            result = self.recognize_image(path, settings)
            part = f"--- Page {page_number} ---\n\n{result['text']}"
            separator = "" if not parts else "\n\n"
            added_bytes = len(f"{separator}{part}".encode("utf-8"))
            if retained_output_bytes + added_bytes > MAX_PDF_OCR_OUTPUT_BYTES:
                raise OcrLimitError(
                    "PDF OCR exceeded the "
                    f"{MAX_PDF_OCR_OUTPUT_BYTES} byte aggregate output limit"
                )
            parts.append(part)
            retained_output_bytes += added_bytes
            warnings.extend(result["warnings"])
            model_versions.add(result["modelVersion"])

        text = "\n\n".join(parts)
        if len(model_versions) == 1:
            model_version = next(iter(model_versions))
        else:
            provenance = ",".join(sorted(model_versions))
            prefix = (
                "PP-OCRv6-best-v1-mixed"
                if settings["quality"] == "best"
                else "PP-OCRv6-balanced-mixed"
            )
            model_version = f"{prefix}[{provenance}]"
        return {
            "success": True,
            "text": text,
            "pages": len(parts),
            "engine": "rapidocr-onnx",
            "requestedQuality": settings["quality"],
            "actualQuality": settings["quality"],
            "device": self.device,
            "provider": self.provider,
            "runtimeVersion": self.runtime_version,
            "modelVersion": model_version,
            "degraded": False,
            "warnings": list(dict.fromkeys(warnings)),
        }
