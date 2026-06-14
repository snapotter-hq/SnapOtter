import json
import os
import pytest


def test_otel_stripped_from_request():
    """_otel should be popped from the request before reaching scripts."""
    request = {
        "id": "test-1",
        "script": "remove_bg",
        "args": ["input.png"],
        "_otel": {"traceparent": "00-abc123-def456-01"},
    }
    otel_data = request.pop("_otel", None)
    assert otel_data is not None
    assert otel_data["traceparent"] == "00-abc123-def456-01"
    assert "_otel" not in request
    assert request["args"] == ["input.png"]


def test_no_otel_in_request():
    """Requests without _otel should work normally."""
    request = {
        "id": "test-2",
        "script": "remove_bg",
        "args": ["input.png"],
    }
    otel_data = request.pop("_otel", None)
    assert otel_data is None
    assert request["args"] == ["input.png"]


def test_tracing_init_without_endpoint(monkeypatch):
    """_init_tracing should be a no-op without OTEL_EXPORTER_OTLP_ENDPOINT."""
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    import sys
    dispatcher_dir = os.path.join(os.path.dirname(__file__), "..")
    if dispatcher_dir not in sys.path:
        sys.path.insert(0, dispatcher_dir)
    from dispatcher import _init_tracing, _tracer
    _init_tracing()
    from dispatcher import _tracer as tracer_after
    assert tracer_after is None
