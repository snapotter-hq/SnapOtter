"""Contract tests for the isolated, offline OCR ONNX runtime."""

from __future__ import annotations

import json
import io
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from packages.ai.python import ocr_runtime
from packages.ai.python import ocr_runtime_entrypoint


MODEL_FILES = {
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


def box(x: int, y: int, width: int = 60, height: int = 18):
    return ((x, y), (x + width, y), (x + width, y + height), (x, y + height))


def detector_stride():
    return ocr_runtime.MAX_DETECTOR_TILE_SIDE - ocr_runtime.DETECTOR_TILE_OVERLAP


class FakeBackend:
    def __init__(self, result, crop_result=None):
        self.result = result
        self.crop_result = crop_result
        self.shared_crop_calls = []
        self.retain_crops_calls = []

    def recognize(self, image_path, *, retain_crops=False):
        self.retain_crops_calls.append(retain_crops)
        return self.result(image_path) if callable(self.result) else self.result

    def recognize_crops(self, crops):
        self.shared_crop_calls.append(crops)
        if self.crop_result is None:
            raise AssertionError("unexpected shared-crop recognition")
        return self.crop_result


class RecordingFactory:
    def __init__(self, backends):
        self.backends = backends
        self.calls = []

    def create(self, *, tier, recognizer, paths):
        self.calls.append((tier, recognizer, paths))
        return self.backends[(tier, recognizer)]


class FakeOrientationClassifier:
    def __init__(self, prediction=None, error=None):
        self.prediction = prediction
        self.error = error
        self.calls = []
        self.initialize_calls = 0

    def initialize(self):
        self.initialize_calls += 1
        if self.error is not None:
            raise self.error

    def classify(self, image_path):
        self.calls.append(image_path)
        if self.error is not None:
            raise self.error
        return self.prediction


class FakeImageVariants:
    def __init__(self):
        self.rotation_calls = []
        self.enhance_calls = []

    def rotate(self, source, angle):
        self.rotation_calls.append((source, angle))
        return ("rotated", angle)

    def enhance(self, source):
        self.enhance_calls.append(source)
        return ("enhanced", source)


class FakeRaster:
    """Minimal NumPy-like raster that records native page coordinates."""

    def __init__(self, width, height, *, left=0, top=0):
        self.shape = (height, width, 3)
        self.left = left
        self.top = top

    def __getitem__(self, key):
        y_slice, x_slice = key[:2]
        y_start = y_slice.start or 0
        y_stop = y_slice.stop or self.shape[0]
        x_start = x_slice.start or 0
        x_stop = x_slice.stop or self.shape[1]
        return FakeRaster(
            x_stop - x_start,
            y_stop - y_start,
            left=self.left + x_start,
            top=self.top + y_start,
        )


class FakeTiledEngine:
    def __init__(self, targets):
        self.targets = targets
        self.calls = []

    def __call__(self, image):
        self.calls.append(image)
        tile_height, tile_width = image.shape[:2]
        raw_boxes = []
        raw_texts = []
        raw_scores = []
        for text, confidence, polygon in self.targets:
            xs = [point[0] for point in polygon]
            ys = [point[1] for point in polygon]
            if (
                image.left <= min(xs)
                and max(xs) <= image.left + tile_width
                and image.top <= min(ys)
                and max(ys) <= image.top + tile_height
            ):
                raw_boxes.append(
                    tuple((x - image.left, y - image.top) for x, y in polygon)
                )
                raw_texts.append(text)
                raw_scores.append(confidence)
        if not raw_boxes:
            raw_boxes = raw_texts = raw_scores = None
        return SimpleNamespace(
            img=image,
            boxes=raw_boxes,
            txts=raw_texts,
            scores=raw_scores,
        )


def candidate(lines, *, width=1000, height=1000, crops=None):
    return ocr_runtime.RawCandidate(
        lines=tuple(
            ocr_runtime.RawLine(text=text, confidence=confidence, polygon=polygon)
            for text, confidence, polygon in lines
        ),
        width=width,
        height=height,
        crops=tuple(crops if crops is not None else [object() for _ in lines]),
    )


class OcrRuntimeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.models = self.root / "models"
        self.models.mkdir()
        for filename in MODEL_FILES.values():
            (self.models / filename).write_bytes(b"model")
        self.image = self.root / "input.png"
        self.image.write_bytes(b"not-decoded-by-the-fake-backend")
        self.environment = {
            "SNAPOTTER_RUNTIME_ROOT": str(self.root),
            "SNAPOTTER_OCR_PROVIDERS_JSON": '["CPUExecutionProvider"]',
            "SNAPOTTER_OCR_ARTIFACT_VERSION": "3.0.0",
            "SNAPOTTER_OCR_RUNTIME_TARGET": "linux-amd64-cpu-py312",
        }

    def tearDown(self):
        self.temp.cleanup()

    def runtime(self, factory, **kwargs):
        return ocr_runtime.OcrRuntime(
            root=self.root,
            backend_factory=factory,
            environ=self.environment,
            **kwargs,
        )

    def write_variant_calibration(
        self,
        *,
        orientation_confidence=0.75,
        orientation_gain=0.04,
        preprocess_gain=0.06,
    ):
        (self.models / "best-v1-calibration.json").write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "selectorVersion": "best-v1",
                    "weights": {
                        "confidenceCoverage": 0.65,
                        "meanConfidence": 0.15,
                        "polygonCoherence": 0.1,
                        "readingOrderCoherence": 0.1,
                    },
                    "variantPolicy": {
                        "orientationMinConfidence": orientation_confidence,
                        "orientationMinScoreGain": orientation_gain,
                        "preprocessMinScoreGain": preprocess_gain,
                    },
                }
            )
        )

    def recording_rapidocr_factory(self):
        captured_params = []

        class RecordingRapidOCR:
            def __init__(self, *, params):
                captured_params.append(params)

        factory = ocr_runtime.RapidOcrBackendFactory(self.environment)
        factory._libraries = (
            RecordingRapidOCR,
            mock.Mock(),
            mock.Mock(),
            mock.Mock(PPOCRV5="ppocr-v5"),
        )
        return factory, captured_params

    def rapidocr_paths(self):
        return {
            "model_root": self.models,
            **{key: self.models / filename for key, filename in MODEL_FILES.items()},
        }

    def test_rapidocr_blank_result_uses_bounded_source_dimensions(self):
        raw_blank = SimpleNamespace(img=None, boxes=None, txts=None, scores=None)
        backend = ocr_runtime._RapidOcrBackend(
            lambda _input: raw_blank,
            mock.Mock(),
            mock.Mock(),
        )
        decoded = SimpleNamespace(shape=(240, 800, 3))

        with mock.patch.object(
            ocr_runtime.CvImageVariants,
            "_load",
            return_value=decoded,
        ) as load:
            result = backend.recognize(self.image)

        self.assertEqual(result, candidate([], width=800, height=240, crops=()))
        load.assert_called_once_with(self.image)

    def test_explicit_languages_do_not_materialize_shared_crops(self):
        decoded = FakeRaster(800, 240)
        raw_result = SimpleNamespace(
            img=decoded,
            boxes=(box(10, 10, 200, 30),),
            txts=("invoice total",),
            scores=(0.97,),
        )
        cropper = mock.Mock(side_effect=AssertionError("crop must remain lazy"))
        backend = ocr_runtime._RapidOcrBackend(
            lambda _input: raw_result,
            cropper,
            mock.Mock(),
        )

        with mock.patch.object(ocr_runtime.CvImageVariants, "_load", return_value=decoded):
            result = backend.recognize(self.image, retain_crops=False)

        self.assertEqual([line.text for line in result.lines], ["invoice total"])
        self.assertEqual(result.crops, ())
        cropper.assert_not_called()

    def test_auto_rejects_excess_detector_boxes_before_materializing_crops(self):
        decoded = FakeRaster(800, 240)
        box_count = ocr_runtime.MAX_BOXES + 1
        raw_result = SimpleNamespace(
            img=decoded,
            boxes=tuple(box(10, 10, 200, 30) for _ in range(box_count)),
            txts=tuple("noise" for _ in range(box_count)),
            scores=tuple(0.97 for _ in range(box_count)),
        )
        cropper = mock.Mock(return_value=object())
        backend = ocr_runtime._RapidOcrBackend(
            lambda _input: raw_result,
            cropper,
            mock.Mock(),
        )

        with (
            mock.patch.object(ocr_runtime.CvImageVariants, "_load", return_value=decoded),
            self.assertRaisesRegex(ocr_runtime.OcrLimitError, "boxes"),
        ):
            backend.recognize(self.image, retain_crops=True)

        cropper.assert_not_called()

    def test_auto_bounds_cumulative_shared_crop_pixels_on_dense_noise(self):
        decoded = FakeRaster(800, 240)
        raw_result = SimpleNamespace(
            img=decoded,
            boxes=tuple(box(0, 0, 800, 240) for _ in range(ocr_runtime.MAX_BOXES)),
            txts=tuple("noise" for _ in range(ocr_runtime.MAX_BOXES)),
            scores=tuple(0.97 for _ in range(ocr_runtime.MAX_BOXES)),
        )
        cropper = mock.Mock(return_value=object())
        backend = ocr_runtime._RapidOcrBackend(
            lambda _input: raw_result,
            cropper,
            mock.Mock(),
        )

        with (
            mock.patch.object(ocr_runtime.CvImageVariants, "_load", return_value=decoded),
            self.assertRaisesRegex(ocr_runtime.OcrLimitError, "shared Korean crop pixels"),
        ):
            backend.recognize(self.image, retain_crops=True)

        self.assertLess(cropper.call_count, ocr_runtime.MAX_BOXES)

    def test_auto_bounds_shared_crop_pixels_across_detector_tiles(self):
        raster = FakeRaster(5000, 5000)

        def dense_tile_result(image):
            return SimpleNamespace(
                img=image,
                boxes=(box(100, 100, 1800, 1100),),
                txts=(f"tile-{image.left}-{image.top}",),
                scores=(0.97,),
            )

        backend = ocr_runtime._RapidOcrBackend(
            dense_tile_result,
            mock.Mock(return_value=object()),
            mock.Mock(),
        )

        with (
            mock.patch.object(ocr_runtime.CvImageVariants, "_load", return_value=raster),
            self.assertRaisesRegex(ocr_runtime.OcrLimitError, "shared Korean crop pixels"),
        ):
            backend.recognize(self.image, retain_crops=True)

    def test_korean_second_pass_processes_shared_crops_in_bounded_chunks(self):
        class ChunkRecordingEngine:
            def __init__(self):
                self.classifier_batches = []
                self.recognizer_batches = []

            def text_cls(self, crops):
                self.classifier_batches.append(tuple(crops))
                return SimpleNamespace(img_list=tuple(crops))

            def text_rec(self, inputs):
                self.recognizer_batches.append(tuple(inputs.img))
                count = len(inputs.img)
                return SimpleNamespace(
                    txts=tuple("recognized" for _ in range(count)),
                    scores=tuple(0.98 for _ in range(count)),
                )

        engine = ChunkRecordingEngine()
        backend = ocr_runtime._RapidOcrBackend(
            engine,
            mock.Mock(),
            lambda **values: SimpleNamespace(**values),
        )
        crops = tuple(object() for _ in range(37))

        results = backend.recognize_crops(crops)

        self.assertEqual(len(results), len(crops))
        self.assertEqual(
            [len(batch) for batch in engine.classifier_batches],
            [16, 16, 5],
        )
        self.assertEqual(
            [len(batch) for batch in engine.recognizer_batches],
            [16, 16, 5],
        )

    def test_rapidocr_nonempty_result_without_dimensions_still_fails_closed(self):
        malformed = SimpleNamespace(
            img=None,
            boxes=(box(0, 0),),
            txts=("text",),
            scores=(0.9,),
        )
        backend = ocr_runtime._RapidOcrBackend(
            lambda _input: malformed,
            mock.Mock(),
            mock.Mock(),
        )

        with (
            mock.patch.object(
                ocr_runtime.CvImageVariants,
                "_load",
                return_value=FakeRaster(800, 240),
            ),
            self.assertRaisesRegex(RuntimeError, "source image dimensions"),
        ):
            backend.recognize(self.image)

    def test_rapidocr_uses_exact_affinity_bounded_onnxruntime_thread_keys(self):
        factory, captured_params = self.recording_rapidocr_factory()

        with (
            mock.patch.object(
                ocr_runtime.os,
                "sched_getaffinity",
                return_value=set(range(64)),
                create=True,
            ),
            mock.patch.object(
                ocr_runtime.os,
                "cpu_count",
                side_effect=AssertionError("affinity must take precedence"),
            ),
        ):
            factory.create(tier="small", recognizer="unified", paths=self.rapidocr_paths())

        thread_params = {
            key: value for key, value in captured_params[0].items() if key.endswith("_threads")
        }
        self.assertEqual(
            thread_params,
            {
                "EngineConfig.onnxruntime.intra_op_num_threads": 4,
                "EngineConfig.onnxruntime.inter_op_num_threads": 1,
            },
        )
        self.assertEqual(
            captured_params[0]["Global.max_side_len"],
            ocr_runtime.MAX_DETECTOR_TILE_SIDE,
        )
        self.assertEqual(
            captured_params[0]["Global.min_side_len"],
            ocr_runtime.MIN_DETECTOR_TILE_SIDE,
        )
        self.assertEqual(captured_params[0]["Det.limit_type"], "max")
        self.assertEqual(
            captured_params[0]["Det.limit_side_len"],
            ocr_runtime.MAX_DETECTOR_TILE_SIDE,
        )

    def test_rapidocr_thread_bound_falls_back_to_cpu_count_without_affinity(self):
        factory, captured_params = self.recording_rapidocr_factory()

        with (
            mock.patch.object(
                ocr_runtime.os,
                "sched_getaffinity",
                side_effect=OSError("affinity unavailable"),
                create=True,
            ),
            mock.patch.object(ocr_runtime.os, "cpu_count", return_value=2),
        ):
            factory.create(tier="small", recognizer="unified", paths=self.rapidocr_paths())

        self.assertEqual(
            captured_params[0]["EngineConfig.onnxruntime.intra_op_num_threads"],
            2,
        )
        self.assertEqual(
            captured_params[0]["EngineConfig.onnxruntime.inter_op_num_threads"],
            1,
        )

    def test_rapidocr_thread_bound_uses_one_when_cpu_count_is_unknown(self):
        factory, captured_params = self.recording_rapidocr_factory()

        with (
            mock.patch.object(
                ocr_runtime.os,
                "sched_getaffinity",
                return_value=set(),
                create=True,
            ),
            mock.patch.object(ocr_runtime.os, "cpu_count", return_value=None),
        ):
            factory.create(tier="small", recognizer="unified", paths=self.rapidocr_paths())

        self.assertEqual(
            captured_params[0]["EngineConfig.onnxruntime.intra_op_num_threads"],
            1,
        )

    def test_document_orientation_session_uses_the_same_bounded_thread_options(self):
        class FakeSessionOptions:
            pass

        session_options = FakeSessionOptions()
        session = mock.Mock()
        session.get_providers.return_value = ["CPUExecutionProvider"]
        session.get_inputs.return_value = [mock.Mock()]
        session.get_outputs.return_value = [mock.Mock()]
        onnxruntime = mock.Mock()
        onnxruntime.SessionOptions.return_value = session_options
        onnxruntime.InferenceSession.return_value = session
        classifier = ocr_runtime.OnnxDocumentOrientation(
            self.models / MODEL_FILES["document_orientation"]
        )

        with (
            mock.patch.dict("sys.modules", {"onnxruntime": onnxruntime}),
            mock.patch.object(
                ocr_runtime.os,
                "sched_getaffinity",
                return_value=set(range(12)),
                create=True,
            ),
            mock.patch.object(
                ocr_runtime.os,
                "cpu_count",
                side_effect=AssertionError("affinity must take precedence"),
            ),
        ):
            self.assertIs(classifier._get_session(), session)

        self.assertEqual(session_options.intra_op_num_threads, 4)
        self.assertEqual(session_options.inter_op_num_threads, 1)
        onnxruntime.InferenceSession.assert_called_once_with(
            str(self.models / MODEL_FILES["document_orientation"]),
            sess_options=session_options,
            providers=["CPUExecutionProvider"],
        )

    def test_document_orientation_converts_opencv_bgr_pixels_to_rgb(self):
        class FakeImage:
            ndim = 3
            shape = (224, 224, 3)

            def __getitem__(self, _key):
                return self

            def astype(self, _dtype):
                return self

            def __mul__(self, _value):
                return self

            def __isub__(self, _value):
                return self

            def __itruediv__(self, _value):
                return self

        bgr_image = FakeImage()
        rgb_image = FakeImage()
        cv2 = mock.Mock()
        cv2.IMREAD_COLOR = 1
        cv2.COLOR_BGR2RGB = 4
        cv2.INTER_LINEAR = 1
        cv2.imdecode.return_value = bgr_image
        cv2.cvtColor.return_value = rgb_image
        cv2.resize.side_effect = lambda image, *_args, **_kwargs: (
            rgb_image
            if image is rgb_image
            else (_ for _ in ()).throw(AssertionError("resize received BGR pixels"))
        )
        numpy = mock.Mock()
        numpy.uint8 = "uint8"
        numpy.fromfile.return_value = b"encoded"
        numpy.asarray.return_value = object()
        numpy.transpose.side_effect = lambda image, _axes: image

        with mock.patch.dict("sys.modules", {"cv2": cv2, "numpy": numpy}):
            ocr_runtime.OnnxDocumentOrientation._preprocess(self.image)

        cv2.cvtColor.assert_called_once_with(bgr_image, cv2.COLOR_BGR2RGB)

    def test_document_orientation_center_crops_before_resizing_an_extreme_aspect_ratio(self):
        class FakeImage:
            ndim = 3

            def __init__(self, shape):
                self.shape = shape
                self.crop_key = None
                self.crop_result = self

            def __getitem__(self, key):
                self.crop_key = key
                return self.crop_result

            def astype(self, _dtype):
                return self

            def __mul__(self, _value):
                return self

            def __isub__(self, _value):
                return self

            def __itruediv__(self, _value):
                return self

        source = FakeImage((1, 40_000_000, 3))
        center_crop = FakeImage((1, 1, 3))
        source.crop_result = center_crop
        full_rgb = FakeImage(source.shape)
        crop_rgb = FakeImage(center_crop.shape)
        resized = FakeImage((224, 224, 3))
        cv2 = mock.Mock()
        cv2.IMREAD_COLOR = 1
        cv2.COLOR_BGR2RGB = 4
        cv2.INTER_LINEAR = 1
        cv2.imdecode.return_value = source
        cv2.cvtColor.side_effect = lambda image, _conversion: (
            crop_rgb if image is center_crop else full_rgb
        )
        cv2.resize.return_value = resized
        numpy = mock.Mock()
        numpy.uint8 = "uint8"
        numpy.fromfile.return_value = b"encoded"
        numpy.asarray.return_value = object()
        numpy.transpose.side_effect = lambda image, _axes: image

        with mock.patch.dict("sys.modules", {"cv2": cv2, "numpy": numpy}):
            ocr_runtime.OnnxDocumentOrientation._preprocess(self.image)

        self.assertEqual(source.crop_key[0], slice(0, 1))
        self.assertEqual(source.crop_key[1], slice(19_999_999, 20_000_000))
        self.assertIs(cv2.resize.call_args.args[0], crop_rgb)
        self.assertEqual(cv2.resize.call_args.args[1], (224, 224))

    def test_balanced_uses_only_small_and_returns_truthful_metadata(self):
        small = FakeBackend(
            candidate(
                [
                    ("second", 0.88, box(10, 100)),
                    ("first", 0.93, box(10, 10)),
                ]
            )
        )
        factory = RecordingFactory({("small", "unified"): small})

        result = self.runtime(factory).recognize_image(
            self.image, {"quality": "balanced", "language": "en"}
        )

        self.assertEqual(result["text"], "first\nsecond")
        self.assertEqual(
            factory.calls,
            [("small", "unified", mock.ANY)],
        )
        self.assertEqual(result["engine"], "rapidocr-onnx")
        self.assertEqual(result["requestedQuality"], "balanced")
        self.assertEqual(result["actualQuality"], "balanced")
        self.assertEqual(result["provider"], "CPUExecutionProvider")
        self.assertEqual(result["device"], "cpu")
        self.assertEqual(result["runtimeVersion"], "3.0.0")
        self.assertEqual(result["modelVersion"], "PP-OCRv6-small")
        self.assertFalse(result["degraded"])

    def test_reading_order_groups_overlapping_boxes_before_sorting_left_to_right(self):
        small = FakeBackend(
            candidate(
                [
                    ("world", 0.95, box(220, 10, 100, 24)),
                    ("Hello", 0.96, box(10, 14, 100, 24)),
                    ("next line", 0.93, box(10, 80, 180, 24)),
                ]
            )
        )
        factory = RecordingFactory({("small", "unified"): small})

        result = self.runtime(factory).recognize_image(
            self.image, {"quality": "balanced", "language": "en"}
        )

        self.assertEqual(result["text"], "Hello world\nnext line")

    def test_reading_order_finishes_each_ltr_column_before_the_next(self):
        small = FakeBackend(
            candidate(
                [
                    ("right first", 0.96, box(620, 10, 220, 24)),
                    ("left second", 0.96, box(20, 80, 220, 24)),
                    ("right second", 0.96, box(620, 80, 220, 24)),
                    ("left first", 0.96, box(20, 10, 220, 24)),
                ]
            )
        )
        factory = RecordingFactory({("small", "unified"): small})

        result = self.runtime(factory).recognize_image(
            self.image, {"quality": "balanced", "language": "en"}
        )

        self.assertEqual(
            result["text"],
            "left first\nleft second\nright first\nright second",
        )

    def test_ltr_column_order_preserves_full_width_header_and_footer(self):
        small = FakeBackend(
            candidate(
                [
                    ("Document title", 0.98, box(20, 10, 900, 30)),
                    ("right first", 0.96, box(620, 80, 220, 24)),
                    ("left second", 0.96, box(20, 140, 220, 24)),
                    ("right second", 0.96, box(620, 140, 220, 24)),
                    ("left first", 0.96, box(20, 80, 220, 24)),
                    ("Page footer", 0.97, box(20, 220, 900, 24)),
                ]
            )
        )
        factory = RecordingFactory({("small", "unified"): small})

        result = self.runtime(factory).recognize_image(
            self.image, {"quality": "balanced", "language": "en"}
        )

        self.assertEqual(
            result["text"],
            "Document title\nleft first\nleft second\nright first\nright second\nPage footer",
        )

    def test_vertical_japanese_reads_columns_right_to_left_and_fragments_top_to_bottom(self):
        small = FakeBackend(
            candidate(
                [
                    ("本語", 0.96, box(500, 110, 24, 80)),
                    ("縦", 0.96, box(700, 10, 24, 80)),
                    ("日", 0.96, box(500, 10, 24, 80)),
                    ("書き", 0.96, box(700, 110, 24, 80)),
                ]
            )
        )
        factory = RecordingFactory({("small", "unified"): small})

        result = self.runtime(factory).recognize_image(
            self.image, {"quality": "balanced", "language": "ja"}
        )

        self.assertEqual(result["text"], "縦書き\n日本語")

    def test_vertical_japanese_preserves_a_horizontal_title_before_columns(self):
        small = FakeBackend(
            candidate(
                [
                    ("見出し", 0.98, box(300, 10, 420, 24)),
                    ("本語", 0.96, box(500, 150, 24, 80)),
                    ("縦", 0.96, box(700, 50, 24, 80)),
                    ("日", 0.96, box(500, 50, 24, 80)),
                    ("書き", 0.96, box(700, 150, 24, 80)),
                ]
            )
        )
        factory = RecordingFactory({("small", "unified"): small})

        result = self.runtime(factory).recognize_image(
            self.image, {"quality": "balanced", "language": "ja"}
        )

        self.assertEqual(result["text"], "見出し\n縦書き\n日本語")

    def test_overlapping_detector_boxes_do_not_duplicate_boundary_text(self):
        small = FakeBackend(
            candidate(
                [
                    ("SnapOtter", 0.99, box(10, 10, 200, 30)),
                    ("r OCR works", 0.98, box(195, 9, 240, 30)),
                ]
            )
        )
        factory = RecordingFactory({("small", "unified"): small})

        result = self.runtime(factory).recognize_image(
            self.image, {"quality": "balanced", "language": "en"}
        )

        self.assertEqual(result["text"], "SnapOtter OCR works")

    def test_balanced_tiles_a_40_megapixel_input_and_deduplicates_overlap(self):
        raster = FakeRaster(8000, 5000)
        tile_side = ocr_runtime.MAX_DETECTOR_TILE_SIDE
        targets = [
            ("Boundary", 0.98, box(tile_side - 168, 100, 100, 24)),
            ("tiny", 0.99, box(tile_side - 28, 100, 20, 24)),
        ]
        engine = FakeTiledEngine(targets)
        backend = ocr_runtime._RapidOcrBackend(engine, lambda _image, box: box, mock.Mock())
        factory = RecordingFactory({("small", "unified"): backend})

        with mock.patch.object(ocr_runtime.CvImageVariants, "_load", return_value=raster):
            result = self.runtime(factory).recognize_image(
                self.image, {"quality": "balanced", "language": "en"}
            )

        self.assertEqual(result["text"], "Boundary tiny")
        self.assertGreater(len(engine.calls), 1)
        self.assertLessEqual(
            max(max(image.shape[:2]) for image in engine.calls),
            1_536,
        )
        self.assertTrue(
            all(
                height <= ocr_runtime.MAX_DETECTOR_TILE_SIDE
                and width <= ocr_runtime.MAX_DETECTOR_TILE_SIDE
                for height, width, _channels in (image.shape for image in engine.calls)
            )
        )

    def test_extreme_aspect_ratio_is_rejected_before_detector_tiling(self):
        raster = FakeRaster(40_001, 1)

        class ShapeRecordingEngine:
            def __init__(self):
                self.call_count = 0
                self.minimum_side = 40_000_000
                self.maximum_side = 0

            def __call__(self, image):
                self.call_count += 1
                height, width = image.shape[:2]
                self.minimum_side = min(self.minimum_side, height, width)
                self.maximum_side = max(self.maximum_side, height, width)
                return SimpleNamespace(img=image, boxes=None, txts=None, scores=None)

        engine = ShapeRecordingEngine()
        backend = ocr_runtime._RapidOcrBackend(engine, mock.Mock(), mock.Mock())
        cv2 = mock.Mock()
        cv2.BORDER_REPLICATE = 1
        cv2.copyMakeBorder.side_effect = lambda image, top, bottom, left, right, _mode: (
            FakeRaster(
                image.shape[1] + left + right,
                image.shape[0] + top + bottom,
                left=image.left,
                top=image.top,
            )
        )

        with (
            mock.patch.object(ocr_runtime.CvImageVariants, "_load", return_value=raster),
            mock.patch.dict("sys.modules", {"cv2": cv2}),
            self.assertRaisesRegex(ocr_runtime.OcrLimitError, "dimension safety limit"),
        ):
            backend.recognize(self.image)

        self.assertEqual(engine.call_count, 0)

    def test_tile_merge_prefers_full_text_over_an_edge_clipped_misrecognition(self):
        raster = FakeRaster(5000, 5000)
        tile_side = ocr_runtime.MAX_DETECTOR_TILE_SIDE
        stride = detector_stride()

        class BoundaryFragmentEngine:
            def __call__(self, image):
                if image.top != 0 or image.left not in (0, stride):
                    return SimpleNamespace(img=image, boxes=None, txts=None, scores=None)
                if image.left == 0:
                    polygon = box(tile_side - 279, 225, 278, 105)
                    text = "BOUNDAF"
                    confidence = 0.951
                else:
                    polygon = box(0, 205, 662, 145)
                    text = "BOUNDARY OCR 505"
                    confidence = 0.999
                return SimpleNamespace(
                    img=image,
                    boxes=(polygon,),
                    txts=(text,),
                    scores=(confidence,),
                )

        backend = ocr_runtime._RapidOcrBackend(
            BoundaryFragmentEngine(), lambda _image, box: box, mock.Mock()
        )

        with mock.patch.object(ocr_runtime.CvImageVariants, "_load", return_value=raster):
            result = backend.recognize(self.image)

        self.assertEqual([line.text for line in result.lines], ["BOUNDARY OCR 505"])

    def test_best_tiles_both_calibrated_tiers_at_the_40_megapixel_boundary(self):
        (self.models / "best-v1-calibration.json").write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "selectorVersion": "best-v1",
                    "weights": {
                        "confidenceCoverage": 0.65,
                        "meanConfidence": 0.15,
                        "polygonCoherence": 0.1,
                        "readingOrderCoherence": 0.1,
                    },
                }
            )
        )
        raster = FakeRaster(8000, 5000)
        targets = [
            (
                "small type",
                0.98,
                box(ocr_runtime.MAX_DETECTOR_TILE_SIDE - 168, 100, 100, 18),
            )
        ]
        small_engine = FakeTiledEngine(targets)
        medium_engine = FakeTiledEngine(targets)
        factory = RecordingFactory(
            {
                ("small", "unified"): ocr_runtime._RapidOcrBackend(
                    small_engine, lambda _image, box: box, mock.Mock()
                ),
                ("medium", "unified"): ocr_runtime._RapidOcrBackend(
                    medium_engine, lambda _image, box: box, mock.Mock()
                ),
            }
        )

        with mock.patch.object(ocr_runtime.CvImageVariants, "_load", return_value=raster):
            result = self.runtime(factory).recognize_image(
                self.image, {"quality": "best", "language": "en"}
            )

        self.assertEqual(result["text"], "small type")
        self.assertEqual(result["modelVersion"], "PP-OCRv6-best-v1-medium")
        self.assertGreater(len(small_engine.calls), 1)
        self.assertGreater(len(medium_engine.calls), 1)
        self.assertTrue(
            all(
                max(image.shape[:2]) <= ocr_runtime.MAX_DETECTOR_TILE_SIDE
                for image in small_engine.calls + medium_engine.calls
            )
        )

    def test_best_without_valid_calibration_fails_closed(self):
        medium = FakeBackend(candidate([("medium text", 0.91, box(0, 0))]))
        small = FakeBackend(candidate([("small text", 0.99, box(0, 0))]))
        factory = RecordingFactory(
            {
                ("small", "unified"): small,
                ("medium", "unified"): medium,
            }
        )

        with self.assertRaisesRegex(RuntimeError, "Best selector calibration"):
            self.runtime(factory).recognize_image(
                self.image, {"quality": "best", "language": "en"}
            )

        self.assertEqual(factory.calls, [])

    def test_best_runs_both_calibrated_tiers_and_selects_the_stronger_candidate(self):
        calibration = self.models / "best-v1-calibration.json"
        calibration.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "selectorVersion": "best-v1",
                    "weights": {
                        "confidenceCoverage": 0.65,
                        "meanConfidence": 0.15,
                        "polygonCoherence": 0.1,
                        "readingOrderCoherence": 0.1,
                    },
                }
            )
        )
        small = FakeBackend(candidate([("the complete high confidence text", 0.97, box(0, 0))]))
        medium = FakeBackend(candidate([("fragment", 0.51, box(0, 0))]))
        factory = RecordingFactory(
            {
                ("small", "unified"): small,
                ("medium", "unified"): medium,
            }
        )

        result = self.runtime(factory).recognize_image(
            self.image, {"quality": "best", "language": "en"}
        )

        self.assertEqual(
            [call[:2] for call in factory.calls],
            [("small", "unified"), ("medium", "unified")],
        )
        self.assertEqual(result["text"], "the complete high confidence text")
        self.assertEqual(result["modelVersion"], "PP-OCRv6-best-v1-small")
        self.assertIn(
            "Selected calibrated Best OCR tier small",
            " ".join(result["warnings"]),
        )

    def test_ambiguous_quarter_turn_scores_both_directions_and_selects_the_better_one(self):
        self.write_variant_calibration()
        small = FakeBackend(
            lambda source: {
                self.image: candidate([("wrong orientation", 0.55, box(0, 0))]),
                ("rotated", 90): candidate([("fragment", 0.42, box(0, 0))]),
                ("rotated", 270): candidate(
                    [("Complete correctly oriented document text", 0.98, box(0, 0))]
                ),
            }[source]
        )
        factory = RecordingFactory({("small", "unified"): small})
        orientation = FakeOrientationClassifier(ocr_runtime.OrientationPrediction(90, 0.99))
        variants = FakeImageVariants()

        result = self.runtime(
            factory,
            orientation_classifier=orientation,
            image_variants=variants,
        ).recognize_image(self.image, {"quality": "balanced", "language": "en"})

        self.assertEqual(result["text"], "Complete correctly oriented document text")
        self.assertEqual([angle for _source, angle in variants.rotation_calls], [90, 270])
        self.assertIn("270", " ".join(result["warnings"]))

    def test_half_turn_is_accepted_only_when_ocr_score_materially_improves(self):
        self.write_variant_calibration(orientation_gain=0.05)
        small = FakeBackend(
            lambda source: {
                self.image: candidate([("upside", 0.48, box(0, 0))]),
                ("rotated", 180): candidate(
                    [("Readable after the half turn", 0.97, box(0, 0))]
                ),
            }[source]
        )
        factory = RecordingFactory({("small", "unified"): small})
        orientation = FakeOrientationClassifier(ocr_runtime.OrientationPrediction(180, 0.98))
        variants = FakeImageVariants()

        result = self.runtime(
            factory,
            orientation_classifier=orientation,
            image_variants=variants,
        ).recognize_image(self.image, {"quality": "balanced", "language": "en"})

        self.assertEqual(result["text"], "Readable after the half turn")
        self.assertEqual([angle for _source, angle in variants.rotation_calls], [180])

    def test_vertical_japanese_is_not_rotated_for_a_merely_larger_fragmented_candidate(self):
        self.write_variant_calibration(orientation_gain=0.02)
        original = candidate(
            [("縦書き日本語", 0.90, box(10, 10, width=18, height=120))]
        )
        rotated = candidate(
            [("縦 書 き 日 本 語 fragmented noise", 0.93, box(10, 10, width=300, height=18))]
        )
        small = FakeBackend(
            lambda source: original if source == self.image else rotated
        )
        factory = RecordingFactory({("small", "unified"): small})
        orientation = FakeOrientationClassifier(ocr_runtime.OrientationPrediction(90, 0.99))
        variants = FakeImageVariants()

        result = self.runtime(
            factory,
            orientation_classifier=orientation,
            image_variants=variants,
        ).recognize_image(self.image, {"quality": "balanced", "language": "ja"})

        self.assertEqual(result["text"], "縦書き日本語")
        self.assertNotIn("Selected document rotation", " ".join(result["warnings"]))

    def test_orientation_failure_and_missing_variant_calibration_fail_closed_to_original(self):
        small = FakeBackend(candidate([("original", 0.9, box(0, 0))]))
        factory = RecordingFactory({("small", "unified"): small})
        orientation = FakeOrientationClassifier(
            error=RuntimeError("orientation session rejected the model")
        )
        variants = FakeImageVariants()

        result = self.runtime(
            factory,
            orientation_classifier=orientation,
            image_variants=variants,
        ).recognize_image(self.image, {"quality": "balanced", "language": "en"})

        self.assertEqual(result["text"], "original")
        self.assertEqual(orientation.calls, [])
        self.assertEqual(variants.rotation_calls, [])

        self.write_variant_calibration()
        runtime = self.runtime(
            factory,
            orientation_classifier=orientation,
            image_variants=variants,
        )
        result = runtime.recognize_image(
            self.image, {"quality": "balanced", "language": "en"}
        )
        self.assertEqual(result["text"], "original")
        self.assertIn("orientation", " ".join(result["warnings"]).lower())

    def test_scored_preprocessing_is_conservative_and_never_replaces_the_original_in_place(self):
        self.write_variant_calibration(preprocess_gain=0.08)
        original = candidate([("faint", 0.45, box(0, 0))])
        enhanced = candidate([("faint text recovered clearly", 0.97, box(0, 0))])
        small = FakeBackend(
            lambda source: enhanced if isinstance(source, tuple) and source[0] == "enhanced" else original
        )
        factory = RecordingFactory({("small", "unified"): small})
        orientation = FakeOrientationClassifier(ocr_runtime.OrientationPrediction(0, 0.99))
        variants = FakeImageVariants()

        result = self.runtime(
            factory,
            orientation_classifier=orientation,
            image_variants=variants,
        ).recognize_image(
            self.image,
            {"quality": "balanced", "language": "en", "enhance": True},
        )

        self.assertEqual(result["text"], "faint text recovered clearly")
        self.assertEqual(variants.enhance_calls, [self.image])
        self.assertEqual(self.image.read_bytes(), b"not-decoded-by-the-fake-backend")
        self.assertIn("preprocessing", " ".join(result["warnings"]).lower())

    def test_preprocessing_candidate_is_rejected_without_material_score_gain(self):
        self.write_variant_calibration(preprocess_gain=0.08)
        original = candidate([("already clear", 0.94, box(0, 0))])
        enhanced = candidate([("already clear", 0.96, box(0, 0))])
        small = FakeBackend(
            lambda source: enhanced if isinstance(source, tuple) and source[0] == "enhanced" else original
        )
        factory = RecordingFactory({("small", "unified"): small})
        variants = FakeImageVariants()

        result = self.runtime(
            factory,
            orientation_classifier=FakeOrientationClassifier(
                ocr_runtime.OrientationPrediction(0, 0.99)
            ),
            image_variants=variants,
        ).recognize_image(
            self.image,
            {"quality": "balanced", "language": "en", "enhance": True},
        )

        self.assertEqual(result["text"], "already clear")
        self.assertEqual(len(variants.enhance_calls), 1)

    def test_explicit_korean_uses_the_dedicated_recognizer(self):
        korean = FakeBackend(candidate([("안녕하세요", 0.96, box(0, 0))]))
        factory = RecordingFactory({("small", "korean"): korean})

        result = self.runtime(factory).recognize_image(
            self.image, {"quality": "balanced", "language": "ko"}
        )

        self.assertEqual(result["text"], "안녕하세요")
        self.assertEqual([call[:2] for call in factory.calls], [("small", "korean")])
        self.assertEqual(result["modelVersion"], "PP-OCRv6-small+korean-PP-OCRv5")

    def test_auto_reuses_unified_crops_and_rejects_single_false_hangul(self):
        shared_crops = (object(), object())
        unified = FakeBackend(
            candidate(
                [
                    ("invoice total", 0.92, box(0, 0)),
                    ("hello world", 0.90, box(0, 30)),
                ],
                crops=shared_crops,
            )
        )
        korean = FakeBackend(
            candidate([]),
            crop_result=(
                ocr_runtime.RawRecognition("청구서 합계", 0.96),
                ocr_runtime.RawRecognition("hello 가 world", 0.99),
            ),
        )
        factory = RecordingFactory(
            {
                ("small", "unified"): unified,
                ("small", "korean"): korean,
            }
        )

        result = self.runtime(factory).recognize_image(
            self.image, {"quality": "balanced", "language": "auto"}
        )

        self.assertEqual(result["text"], "청구서 합계\nhello world")
        self.assertIs(korean.shared_crop_calls[0], unified.result.crops)

    def test_auto_recovers_high_confidence_korean_omitted_from_a_mixed_line(self):
        shared_crops = (object(),)
        unified = FakeBackend(
            candidate(
                [("SnapOtter OCR 505", 0.90, box(0, 0))],
                crops=shared_crops,
            )
        )
        korean = FakeBackend(
            candidate([]),
            crop_result=(
                ocr_runtime.RawRecognition("SnapOtter OCR 505한글테스트", 0.92),
            ),
        )
        factory = RecordingFactory(
            {
                ("small", "unified"): unified,
                ("small", "korean"): korean,
            }
        )

        result = self.runtime(factory).recognize_image(
            self.image, {"quality": "balanced", "language": "auto"}
        )

        self.assertEqual(result["text"], "SnapOtter OCR 505 한글테스트")
        self.assertIs(korean.shared_crop_calls[0], unified.result.crops)

    def test_auto_rejects_a_short_high_confidence_hangul_insertion(self):
        shared_crops = (object(),)
        unified = FakeBackend(
            candidate([("hello world", 0.90, box(0, 0))], crops=shared_crops)
        )
        korean = FakeBackend(
            candidate([]),
            crop_result=(ocr_runtime.RawRecognition("hello 세계 world", 0.99),),
        )
        factory = RecordingFactory(
            {
                ("small", "unified"): unified,
                ("small", "korean"): korean,
            }
        )

        result = self.runtime(factory).recognize_image(
            self.image, {"quality": "balanced", "language": "auto"}
        )

        self.assertEqual(result["text"], "hello world")

    def test_auto_intentionally_leaves_a_short_ambiguous_korean_token_unmerged(self):
        shared_crops = (object(),)
        unified = FakeBackend(
            candidate([("ticket 505", 0.90, box(0, 0))], crops=shared_crops)
        )
        korean = FakeBackend(
            candidate([]),
            crop_result=(ocr_runtime.RawRecognition("ticket 505한글", 0.99),),
        )
        factory = RecordingFactory(
            {
                ("small", "unified"): unified,
                ("small", "korean"): korean,
            }
        )

        result = self.runtime(factory).recognize_image(
            self.image, {"quality": "balanced", "language": "auto"}
        )

        self.assertEqual(result["text"], "ticket 505")

    def test_mixed_korean_prefix_repair_preserves_spacing_without_duplicates(self):
        self.assertEqual(
            ocr_runtime._preserve_unified_prefix(
                "SnapOtter OCR 505  三 ¬",
                "SnapOtter OcR505한글테스트",
            ),
            "SnapOtter OCR 505 한글테스트",
        )
        self.assertEqual(
            ocr_runtime._preserve_unified_prefix(
                "SnapOtter OCR 505",
                "SnapOtter OCR 505 한글테스트",
            ),
            "SnapOtter OCR 505 한글테스트",
        )

    def test_auto_releases_shared_crops_immediately_after_korean_merge(self):
        unified = candidate(
            [("invoice total", 0.92, box(0, 0))],
            crops=(object(),),
        )

        merged = ocr_runtime._merge_auto_korean(
            unified,
            (ocr_runtime.RawRecognition("청구서 합계", 0.96),),
        )

        self.assertEqual(merged.crops, ())

    def test_decomposed_jamo_is_treated_as_korean_when_confident(self):
        crops = (object(),)
        unified = FakeBackend(candidate([("test", 0.55, box(0, 0))], crops=crops))
        korean = FakeBackend(
            candidate([]),
            crop_result=(ocr_runtime.RawRecognition("한글 test", 0.93),),
        )
        factory = RecordingFactory(
            {
                ("small", "unified"): unified,
                ("small", "korean"): korean,
            }
        )

        result = self.runtime(factory).recognize_image(
            self.image, {"quality": "balanced", "language": "auto"}
        )

        self.assertEqual(result["text"], "한글 test")

    def test_rejects_model_output_above_box_and_utf8_byte_limits(self):
        too_many_boxes = FakeBackend(
            candidate([("x", 0.9, box(i, 0)) for i in range(ocr_runtime.MAX_BOXES + 1)])
        )
        factory = RecordingFactory({("small", "unified"): too_many_boxes})
        with self.assertRaisesRegex(ocr_runtime.OcrLimitError, "boxes"):
            self.runtime(factory).recognize_image(
                self.image, {"quality": "balanced", "language": "en"}
            )

        too_many_chars = FakeBackend(
            candidate([("x" * 10_001, 0.9, box(0, 0))], width=100, height=100)
        )
        factory = RecordingFactory({("small", "unified"): too_many_chars})
        with self.assertRaisesRegex(ocr_runtime.OcrLimitError, "bytes"):
            self.runtime(factory).recognize_image(
                self.image, {"quality": "balanced", "language": "en"}
            )

        multibyte_boundary = FakeBackend(
            candidate([("界" * 3_333, 0.9, box(0, 0))], width=100, height=100)
        )
        factory = RecordingFactory({("small", "unified"): multibyte_boundary})
        result = self.runtime(factory).recognize_image(
            self.image, {"quality": "balanced", "language": "en"}
        )
        self.assertEqual(len(result["text"].encode("utf-8")), 9_999)

        multibyte_overflow = FakeBackend(
            candidate([("界" * 3_334, 0.9, box(0, 0))], width=100, height=100)
        )
        factory = RecordingFactory({("small", "unified"): multibyte_overflow})
        with self.assertRaisesRegex(ocr_runtime.OcrLimitError, "10000 bytes"):
            self.runtime(factory).recognize_image(
                self.image, {"quality": "balanced", "language": "en"}
            )

    def test_pdf_mode_accepts_only_rasterized_page_images(self):
        first = self.root / "page-1.png"
        second = self.root / "page-2.png"
        first.write_bytes(b"page")
        second.write_bytes(b"page")
        small = FakeBackend(
            lambda path: candidate([(Path(path).stem, 0.9, box(0, 0))])
        )
        factory = RecordingFactory({("small", "unified"): small})
        runtime = self.runtime(factory)

        result = runtime.recognize_pages(
            ((5, second), (2, first)),
            {"quality": "balanced", "language": "en"},
        )

        self.assertEqual(result["pages"], 2)
        self.assertEqual(result["text"], "--- Page 2 ---\n\npage-1\n\n--- Page 5 ---\n\npage-2")
        pdf = self.root / "input.pdf"
        pdf.write_bytes(b"%PDF")
        with self.assertRaisesRegex(ValueError, "rasterized"):
            runtime.recognize_pages(((1, pdf),), {"quality": "balanced"})

    def test_pdf_mixed_balanced_provenance_never_claims_best(self):
        first = self.root / "page-1.png"
        second = self.root / "page-2.png"
        first.write_bytes(b"page")
        second.write_bytes(b"page")
        runtime = self.runtime(RecordingFactory({}))
        common = {
            "success": True,
            "engine": "rapidocr-onnx",
            "requestedQuality": "balanced",
            "actualQuality": "balanced",
            "device": "cpu",
            "provider": "CPUExecutionProvider",
            "runtimeVersion": "3.0.0",
            "degraded": False,
            "warnings": [],
        }
        runtime.recognize_image = mock.Mock(
            side_effect=(
                {**common, "text": "first", "modelVersion": "PP-OCRv6-small"},
                {
                    **common,
                    "text": "second",
                    "modelVersion": "PP-OCRv6-small+korean-PP-OCRv5",
                },
            )
        )

        result = runtime.recognize_pages(
            ((1, first), (2, second)),
            {"quality": "balanced", "language": "auto"},
        )

        self.assertEqual(
            result["modelVersion"],
            "PP-OCRv6-balanced-mixed[PP-OCRv6-small,PP-OCRv6-small+korean-PP-OCRv5]",
        )

    def test_pdf_mode_enforces_one_incremental_byte_budget_across_50_pages(self):
        calls = []

        def repeated_page(path):
            calls.append(path)
            return candidate(
                [("x" * 20_000, 0.9, box(0, 0))],
                width=1_000,
                height=1_000,
            )

        small = FakeBackend(repeated_page)
        factory = RecordingFactory({("small", "unified"): small})

        with self.assertRaisesRegex(ocr_runtime.OcrLimitError, "aggregate output limit"):
            self.runtime(factory).recognize_pages(
                tuple((page, self.image) for page in range(1, 51)),
                {"quality": "balanced", "language": "en"},
            )

        self.assertEqual(len(calls), 50)

    def test_rejects_missing_models_and_non_cpu_provider_before_import(self):
        (self.models / MODEL_FILES["medium_rec"]).unlink()
        factory = RecordingFactory({})
        with self.assertRaisesRegex(FileNotFoundError, "medium_rec"):
            self.runtime(factory)
        self.assertEqual(factory.calls, [])

        (self.models / MODEL_FILES["medium_rec"]).write_bytes(b"model")
        environment = dict(self.environment)
        environment["SNAPOTTER_OCR_PROVIDERS_JSON"] = '["CUDAExecutionProvider"]'
        with self.assertRaisesRegex(ValueError, "CPUExecutionProvider"):
            ocr_runtime.OcrRuntime(
                root=self.root,
                backend_factory=factory,
                environ=environment,
            )

    def test_smoke_initializes_every_lazy_cpu_model_family(self):
        self.write_variant_calibration()
        smoke_candidate = candidate([("SNAPOTTER 505", 0.99, box(10, 10))])
        small = FakeBackend(smoke_candidate)
        medium = FakeBackend(smoke_candidate)
        small_korean = FakeBackend(smoke_candidate)
        medium_korean = FakeBackend(smoke_candidate)
        orientation = FakeOrientationClassifier(ocr_runtime.OrientationPrediction(0, 1.0))
        factory = RecordingFactory(
            {
                ("small", "unified"): small,
                ("medium", "unified"): medium,
                ("small", "korean"): small_korean,
                ("medium", "korean"): medium_korean,
            }
        )

        result = self.runtime(factory, orientation_classifier=orientation).smoke()

        self.assertEqual(
            [call[:2] for call in factory.calls],
            [
                ("small", "unified"),
                ("medium", "unified"),
                ("small", "korean"),
                ("medium", "korean"),
            ],
        )
        self.assertEqual(orientation.initialize_calls, 1)
        self.assertEqual(len(orientation.calls), 1)
        self.assertFalse(orientation.calls[0].exists())
        for backend in (small, medium, small_korean, medium_korean):
            self.assertEqual(backend.retain_crops_calls, [False])
        self.assertEqual(result["provider"], "CPUExecutionProvider")
        self.assertEqual(
            result["representativeModel"],
            "PP-OCRv6-small+medium+both-korean-pipelines+document-orientation",
        )

    def test_smoke_rejects_a_backend_that_cannot_infer_the_fixture(self):
        self.write_variant_calibration()
        valid = FakeBackend(candidate([("SNAPOTTER 505", 0.99, box(10, 10))]))
        empty = FakeBackend(candidate([]))
        factory = RecordingFactory(
            {
                ("small", "unified"): valid,
                ("medium", "unified"): empty,
                ("small", "korean"): valid,
                ("medium", "korean"): valid,
            }
        )

        with self.assertRaisesRegex(RuntimeError, "medium/unified.*no text"):
            self.runtime(
                factory,
                orientation_classifier=FakeOrientationClassifier(
                    ocr_runtime.OrientationPrediction(0, 1.0)
                ),
            ).smoke()

    def test_smoke_rejects_missing_best_selector_calibration(self):
        factory = RecordingFactory({})

        with self.assertRaisesRegex(RuntimeError, "Best selector calibration"):
            self.runtime(factory).smoke()

        self.assertEqual(factory.calls, [])


class EntrypointTest(unittest.TestCase):
    def test_protocol_smoke_request_loads_the_persistent_runtime(self):
        runtime = mock.Mock()
        runtime.smoke.return_value = {
            "provider": "CPUExecutionProvider",
            "representativeModel": "PP-OCRv6-small+medium",
        }

        response = ocr_runtime_entrypoint.process_request(
            {
                "protocolVersion": 1,
                "requestId": "readiness-1",
                "script": "smoke",
                "args": [],
            },
            runtime=runtime,
        )

        self.assertTrue(response["ok"])
        self.assertEqual(response["requestId"], "readiness-1")
        self.assertEqual(response["result"]["provider"], "CPUExecutionProvider")
        runtime.smoke.assert_called_once_with()

    def test_protocol_loop_reuses_one_runtime_for_multiple_requests(self):
        runtime = mock.Mock()
        runtime.recognize_image.side_effect = [
            {"success": True, "text": "first"},
            {"success": True, "text": "second"},
        ]
        runtime_factory = mock.Mock(return_value=runtime)
        requests = [
            {
                "protocolVersion": 1,
                "requestId": "request-1",
                "script": "ocr",
                "args": ["/tmp/first.png", json.dumps({"quality": "balanced"})],
            },
            {
                "protocolVersion": 1,
                "requestId": "request-2",
                "script": "ocr",
                "args": ["/tmp/second.png", json.dumps({"quality": "best"})],
            },
        ]
        stdin = io.BytesIO(
            b"".join(
                json.dumps(request, separators=(",", ":")).encode("utf-8") + b"\n"
                for request in requests
            )
        )
        stdout = io.StringIO()

        exit_code = ocr_runtime_entrypoint.main(
            [],
            runtime_factory=runtime_factory,
            stdin=stdin,
            stdout=stdout,
            stderr=io.StringIO(),
        )

        self.assertEqual(exit_code, 0)
        runtime_factory.assert_called_once_with()
        responses = [json.loads(line) for line in stdout.getvalue().splitlines()]
        self.assertEqual(
            [(response["requestId"], response["result"]["text"]) for response in responses],
            [("request-1", "first"), ("request-2", "second")],
        )
        self.assertEqual(runtime.recognize_image.call_count, 2)

    def test_invalid_frame_is_rejected_before_runtime_construction(self):
        requests = (
            {
                "protocolVersion": 1,
                "requestId": "invalid-script",
                "script": "../../ocr",
                "args": ["/tmp/input.png", "{}"],
            },
            {
                "protocolVersion": 1,
                "requestId": "invalid-settings",
                "script": "ocr",
                "args": ["/tmp/input.png", "not-json"],
            },
            {
                "protocolVersion": 1,
                "requestId": "invalid-pages",
                "script": "ocr_pdf",
                "args": ["[]", "{}"],
            },
        )

        for request in requests:
            with self.subTest(request_id=request["requestId"]):
                runtime_factory = mock.Mock(
                    side_effect=AssertionError(
                        "invalid frames must not load model sessions"
                    )
                )
                stdout = io.StringIO()
                exit_code = ocr_runtime_entrypoint.main(
                    [],
                    runtime_factory=runtime_factory,
                    stdin=io.BytesIO(json.dumps(request).encode("utf-8") + b"\n"),
                    stdout=stdout,
                    stderr=io.StringIO(),
                )

                self.assertEqual(exit_code, 0)
                runtime_factory.assert_not_called()
                response = json.loads(stdout.getvalue())
                self.assertEqual(response["requestId"], request["requestId"])
                self.assertEqual(response["error"]["code"], "invalid-request")

    def test_protocol_envelope_and_pdf_page_argument_contract(self):
        runtime = mock.Mock()
        runtime.recognize_pages.return_value = {"success": True, "text": "page", "pages": 1}
        request = {
            "protocolVersion": 1,
            "requestId": "request-1",
            "script": "ocr_pdf",
            "args": [
                json.dumps([{"page": 3, "path": "/tmp/page-3.png"}]),
                json.dumps({"quality": "best", "language": "ja"}),
            ],
        }

        response = ocr_runtime_entrypoint.process_request(request, runtime=runtime)

        self.assertEqual(
            response,
            {
                "protocolVersion": 1,
                "requestId": "request-1",
                "ok": True,
                "result": {"success": True, "text": "page", "pages": 1},
            },
        )
        runtime.recognize_pages.assert_called_once_with(
            ((3, Path("/tmp/page-3.png")),),
            {"quality": "best", "language": "ja"},
        )

    def test_malformed_requests_are_bounded_well_formed_failures(self):
        malformed = ocr_runtime_entrypoint.process_request(
            {
                "protocolVersion": 2,
                "requestId": "request-2",
                "script": "../../ocr",
                "args": ["https://example.com/input.png", "{}"],
            },
            runtime=mock.Mock(),
        )

        self.assertEqual(malformed["protocolVersion"], 1)
        self.assertEqual(malformed["requestId"], "request-2")
        self.assertFalse(malformed["ok"])
        self.assertEqual(malformed["error"]["code"], "invalid-request")
        self.assertLess(len(malformed["error"]["message"]), 512)

        runtime = mock.Mock()
        boolean_version = ocr_runtime_entrypoint.process_request(
            {
                "protocolVersion": True,
                "requestId": "request-boolean-version",
                "script": "smoke",
                "args": [],
            },
            runtime=runtime,
        )
        self.assertFalse(boolean_version["ok"])
        self.assertEqual(boolean_version["error"]["code"], "invalid-request")
        runtime.smoke.assert_not_called()

    def test_entrypoint_sets_offline_guards_before_constructing_runtime(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            ocr_runtime_entrypoint.configure_offline_environment()
            self.assertEqual(os.environ["HF_HUB_OFFLINE"], "1")
            self.assertEqual(os.environ["TRANSFORMERS_OFFLINE"], "1")
            self.assertEqual(os.environ["SNAPOTTER_OCR_OFFLINE"], "1")

    def test_smoke_mode_loads_the_runtime_and_returns_nonzero_on_failure(self):
        runtime = mock.Mock()
        runtime.smoke.return_value = {
            "provider": "CPUExecutionProvider",
            "representativeModel": "PP-OCRv6-small",
        }
        output = io.StringIO()
        error = io.StringIO()

        exit_code = ocr_runtime_entrypoint.main(
            ["--smoke"],
            runtime_factory=lambda: runtime,
            stdout=output,
            stderr=error,
        )

        self.assertEqual(exit_code, 0)
        runtime.smoke.assert_called_once_with()
        self.assertEqual(json.loads(output.getvalue())["smoke"], True)
        self.assertEqual(error.getvalue(), "")

        failing = mock.Mock()
        failing.smoke.side_effect = RuntimeError("CPU session failed")
        self.assertNotEqual(
            ocr_runtime_entrypoint.main(
                ["--smoke"],
                runtime_factory=lambda: failing,
                stdout=io.StringIO(),
                stderr=error,
            ),
            0,
        )
        self.assertIn("CPU session failed", error.getvalue())

    def test_empty_stdin_is_not_a_successful_implicit_smoke(self):
        output = io.StringIO()

        exit_code = ocr_runtime_entrypoint.main(
            [],
            runtime_factory=mock.Mock,
            stdin=io.BytesIO(b""),
            stdout=output,
            stderr=io.StringIO(),
        )

        self.assertNotEqual(exit_code, 0)
        self.assertFalse(json.loads(output.getvalue())["ok"])


if __name__ == "__main__":
    unittest.main()
