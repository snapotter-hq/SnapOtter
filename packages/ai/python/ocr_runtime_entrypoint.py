"""Persistent JSON-line entrypoint for the isolated OCR runtime."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, BinaryIO, Callable, Mapping, TextIO

try:
    # Direct execution inside the immutable runtime generation.
    from ocr_runtime import OcrRuntime
except ModuleNotFoundError:  # pragma: no cover - exercised by package imports in tooling
    from .ocr_runtime import OcrRuntime


PROTOCOL_VERSION = 1
MAX_REQUEST_BYTES = 64 * 1024
MAX_ERROR_CHARS = 400


def configure_offline_environment() -> None:
    """Set offline switches before importing any optional model libraries."""
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["SNAPOTTER_OCR_OFFLINE"] = "1"
    os.environ["NO_PROXY"] = "*"
    os.environ["no_proxy"] = "*"


def _request_id(request: Any) -> str:
    if isinstance(request, Mapping):
        value = request.get("requestId")
        if isinstance(value, str) and 0 < len(value) <= 128:
            return value
    return "unknown"


def _failure(request_id: str, code: str, message: str) -> dict[str, Any]:
    bounded = " ".join(str(message).split())[:MAX_ERROR_CHARS] or "OCR runtime request failed"
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "requestId": request_id,
        "ok": False,
        "error": {"code": code, "message": bounded},
    }


def _parse_settings(value: str) -> dict[str, Any]:
    try:
        settings = json.loads(value)
    except json.JSONDecodeError as error:
        raise ValueError("OCR settings are not valid JSON") from error
    if not isinstance(settings, dict):
        raise ValueError("OCR settings must be a JSON object")
    return settings


def _parse_pages(value: str) -> tuple[tuple[int, Path], ...]:
    try:
        raw_pages = json.loads(value)
    except json.JSONDecodeError as error:
        raise ValueError("Rasterized pages are not valid JSON") from error
    if not isinstance(raw_pages, list) or not raw_pages:
        raise ValueError("Rasterized pages must be a non-empty JSON list")
    pages = []
    for index, item in enumerate(raw_pages):
        if isinstance(item, str):
            pages.append((index + 1, Path(item)))
            continue
        if (
            isinstance(item, dict)
            and isinstance(item.get("page"), int)
            and not isinstance(item.get("page"), bool)
            and isinstance(item.get("path"), str)
        ):
            pages.append((item["page"], Path(item["path"])))
            continue
        raise ValueError("Each rasterized page must be a path or {page, path} object")
    return tuple(pages)


def _validate_request(request: Any) -> tuple[str, str, list[str]]:
    if not isinstance(request, dict):
        raise ValueError("OCR runtime request must be an object")
    request_id = _request_id(request)
    if request_id == "unknown":
        raise ValueError("OCR runtime requestId is missing or invalid")
    protocol_version = request.get("protocolVersion")
    if type(protocol_version) is not int or protocol_version != PROTOCOL_VERSION:
        raise ValueError(f"Unsupported OCR runtime protocol version; expected {PROTOCOL_VERSION}")
    script = request.get("script")
    if script not in ("ocr", "ocr_pdf", "smoke"):
        raise ValueError("OCR runtime script must be ocr, ocr_pdf, or smoke")
    args = request.get("args")
    if not isinstance(args, list) or not all(isinstance(arg, str) for arg in args):
        raise ValueError("OCR runtime args must be a list of strings")
    if script == "smoke" and args:
        raise ValueError("OCR runtime smoke requires no arguments")
    if script != "smoke" and len(args) != 2:
        raise ValueError("OCR runtime scripts require exactly two arguments")
    return request_id, script, args


def _prepare_request(request: Any) -> tuple[str, str, tuple[Any, ...]]:
    """Validate and decode a frame without constructing model sessions."""
    request_id, script, args = _validate_request(request)
    if script == "smoke":
        return request_id, script, ()
    settings = _parse_settings(args[1])
    if script == "ocr":
        return request_id, script, (Path(args[0]), settings)
    return request_id, script, (_parse_pages(args[0]), settings)


def _process_prepared_request(
    prepared: tuple[str, str, tuple[Any, ...]], runtime: OcrRuntime
) -> dict[str, Any]:
    request_id, script, arguments = prepared
    try:
        if script == "smoke":
            result = runtime.smoke()
        elif script == "ocr":
            result = runtime.recognize_image(*arguments)
        else:
            result = runtime.recognize_pages(*arguments)
        return {
            "protocolVersion": PROTOCOL_VERSION,
            "requestId": request_id,
            "ok": True,
            "result": result,
        }
    except ValueError as error:
        return _failure(request_id, "invalid-request", str(error))
    except FileNotFoundError as error:
        return _failure(request_id, "file-not-found", str(error))
    except Exception as error:
        return _failure(request_id, "ocr-runtime-failed", str(error))


def process_request(
    request: Any,
    *,
    runtime: OcrRuntime | None = None,
    runtime_factory: Callable[[], OcrRuntime] = OcrRuntime,
) -> dict[str, Any]:
    request_id = _request_id(request)
    try:
        prepared = _prepare_request(request)
        request_id = prepared[0]
        active_runtime = runtime or runtime_factory()
        return _process_prepared_request(prepared, active_runtime)
    except ValueError as error:
        return _failure(request_id, "invalid-request", str(error))
    except FileNotFoundError as error:
        return _failure(request_id, "file-not-found", str(error))
    except Exception as error:
        return _failure(request_id, "ocr-runtime-failed", str(error))


def main(
    argv: list[str] | None = None,
    *,
    runtime_factory: Callable[[], OcrRuntime] = OcrRuntime,
    stdin: BinaryIO | None = None,
    stdout: TextIO | None = None,
    stderr: TextIO | None = None,
) -> int:
    configure_offline_environment()
    arguments = list(sys.argv[1:] if argv is None else argv)
    input_stream = sys.stdin.buffer if stdin is None else stdin
    output_stream = sys.stdout if stdout is None else stdout
    error_stream = sys.stderr if stderr is None else stderr

    if arguments == ["--smoke"]:
        try:
            smoke_result = runtime_factory().smoke()
        except Exception as error:
            error_stream.write(f"OCR runtime smoke failed: {error}\n")
            error_stream.flush()
            return 1
        output_stream.write(
            json.dumps(
                {"smoke": True, **smoke_result},
                ensure_ascii=False,
                separators=(",", ":"),
            )
            + "\n"
        )
        output_stream.flush()
        return 0
    if arguments:
        error_stream.write("Usage: ocr_runner.py [--smoke]\n")
        error_stream.flush()
        return 2

    runtime: OcrRuntime | None = None
    handled_requests = 0

    while True:
        raw = input_stream.readline(MAX_REQUEST_BYTES + 1)
        if not raw:
            if handled_requests == 0:
                response = _failure(
                    "unknown", "invalid-request", "OCR runtime request is empty"
                )
                output_stream.write(
                    json.dumps(response, ensure_ascii=False, separators=(",", ":"))
                    + "\n"
                )
                output_stream.flush()
                return 1
            return 0

        exit_after_response = False
        if len(raw) > MAX_REQUEST_BYTES:
            response = _failure(
                "unknown", "invalid-request", "OCR runtime request is too large"
            )
            # readline() leaves the rest of an oversized unterminated frame in
            # the stream. Exit after the bounded error instead of interpreting
            # the tail as another request and losing frame synchronization.
            exit_after_response = not raw.endswith(b"\n")
        else:
            try:
                request = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                response = _failure(
                    "unknown", "invalid-request", f"Malformed JSON request: {error}"
                )
            else:
                try:
                    prepared = _prepare_request(request)
                except ValueError as error:
                    response = _failure(
                        _request_id(request), "invalid-request", str(error)
                    )
                else:
                    if runtime is None:
                        try:
                            runtime = runtime_factory()
                        except Exception as error:
                            response = _failure(
                                _request_id(request), "ocr-runtime-failed", str(error)
                            )
                            exit_after_response = True
                        else:
                            response = _process_prepared_request(prepared, runtime)
                    else:
                        response = _process_prepared_request(prepared, runtime)

        output_stream.write(
            json.dumps(response, ensure_ascii=False, separators=(",", ":")) + "\n"
        )
        output_stream.flush()
        handled_requests += 1
        if exit_after_response:
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
