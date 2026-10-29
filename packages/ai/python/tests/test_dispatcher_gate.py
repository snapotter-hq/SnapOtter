"""Contract tests for the dispatcher security gate and installed-bundle reader.

_run_script_main's allowlist + feature gate is the sidecar's PRIMARY security
boundary (there is no process isolation between scripts). These tests exercise
the three reject branches that return BEFORE any script is exec'd, plus the
installed-bundle reader and progress emitter. The "docs" profile is selected so
importing the dispatcher skips all heavy ML imports."""
import json
import os
import sys

import pytest

# Select the lean profile before import so no heavy ML libraries are pulled in.
os.environ["DISPATCHER_PROFILE"] = "docs"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import dispatcher  # noqa: E402


# --- _run_script_main security gate (returns before exec) -------------------


def test_rejects_invalid_script_name_with_path_separator():
    out, code = dispatcher._run_script_main("../evil", ["x"])
    assert code == 1
    payload = json.loads(out)
    assert payload["success"] is False
    assert payload["error"] == "invalid_script_name"


@pytest.mark.parametrize("bad", ["Evil", "has space", "dots.py", "semi;colon", ""])
def test_rejects_names_failing_the_strict_regex(bad):
    out, code = dispatcher._run_script_main(bad, [])
    assert code == 1
    assert json.loads(out)["error"] == "invalid_script_name"


def test_rejects_valid_format_name_not_on_allowlist():
    # Well-formed but not an allowed script -> script_not_allowed (not exec'd).
    out, code = dispatcher._run_script_main("definitely_not_a_real_script", [])
    assert code == 1
    payload = json.loads(out)
    assert payload["error"] == "script_not_allowed"


def test_rejects_allowed_script_whose_bundle_is_not_installed(monkeypatch):
    # Allow an AI script that maps to a bundle, but report nothing installed.
    monkeypatch.setattr(dispatcher, "ALLOWED_SCRIPTS", {"remove_bg"})
    monkeypatch.setattr(dispatcher, "_get_installed_bundles", lambda: set())
    out, code = dispatcher._run_script_main("remove_bg", ["in.png"])
    assert code == 1
    payload = json.loads(out)
    assert payload["error"] == "feature_not_installed"
    assert payload["feature"] == "background-removal"


# --- _get_installed_bundles -------------------------------------------------


def test_installed_bundles_empty_when_file_missing(monkeypatch, tmp_path):
    monkeypatch.setattr(dispatcher, "INSTALLED_PATH", str(tmp_path / "nope.json"))
    assert dispatcher._get_installed_bundles() == set()


def test_installed_bundles_reads_bundle_keys(monkeypatch, tmp_path):
    p = tmp_path / "installed.json"
    p.write_text(json.dumps({"bundles": {"ocr": {}, "transcription": {}}}))
    monkeypatch.setattr(dispatcher, "INSTALLED_PATH", str(p))
    assert dispatcher._get_installed_bundles() == {"ocr", "transcription"}


def test_installed_bundles_empty_on_malformed_json(monkeypatch, tmp_path):
    p = tmp_path / "installed.json"
    p.write_text("{ not valid json")
    monkeypatch.setattr(dispatcher, "INSTALLED_PATH", str(p))
    assert dispatcher._get_installed_bundles() == set()


@pytest.mark.parametrize(
    "shape",
    [
        "[]",
        "null",
        "123",
        '"str"',
        "true",
        "{}",
        '{"bundles": null}',
        '{"bundles": []}',
        '{"bundles": ["face-detection"]}',
        '{"bundles": "not-a-dict"}',
        '{"bundles": 42}',
        '{"bundles": true}',
    ],
)
def test_installed_bundles_empty_on_non_dict_shapes_and_gates_script(monkeypatch, tmp_path, shape):
    p = tmp_path / "installed.json"
    p.write_text(shape)
    monkeypatch.setattr(dispatcher, "INSTALLED_PATH", str(p))
    assert dispatcher._get_installed_bundles() == set()

    monkeypatch.setattr(dispatcher, "ALLOWED_SCRIPTS", {"remove_bg"})
    out, code = dispatcher._run_script_main("remove_bg", ["in.png"])
    assert code == 1
    assert json.loads(out) == {
        "success": False,
        "error": "feature_not_installed",
        "feature": "background-removal",
        "message": "Feature bundle 'background-removal' is not installed",
    }


def test_installed_bundles_empty_on_os_and_unicode_errors(monkeypatch, tmp_path):
    # Directory at INSTALLED_PATH raises IsADirectoryError (an OSError subclass).
    dir_path = tmp_path / "installed_dir"
    dir_path.mkdir()
    monkeypatch.setattr(dispatcher, "INSTALLED_PATH", str(dir_path))
    assert dispatcher._get_installed_bundles() == set()

    # Invalid UTF-8 bytes raise UnicodeDecodeError.
    bad_utf8 = tmp_path / "bad_utf8.json"
    bad_utf8.write_bytes(b"\xff\xfe\x00")
    monkeypatch.setattr(dispatcher, "INSTALLED_PATH", str(bad_utf8))
    assert dispatcher._get_installed_bundles() == set()


# --- emit_progress ----------------------------------------------------------


def test_emit_progress_writes_json_to_stderr(capsys):
    dispatcher.emit_progress(42, "removing background")
    err = capsys.readouterr().err.strip()
    payload = json.loads(err)
    assert payload == {"progress": 42, "stage": "removing background"}


# --- docs profile swaps the allowlist --------------------------------------


def test_docs_profile_allowlist_is_the_docs_script_set():
    # Import-time selected DISPATCHER_PROFILE=docs, so ALLOWED_SCRIPTS is the
    # lean document set, not the AI set.
    assert "doc_health" in dispatcher.ALLOWED_SCRIPTS
    assert "remove_bg" not in dispatcher.ALLOWED_SCRIPTS


def test_main_emits_gpu_frameworks_in_readiness_payload(monkeypatch, capsys):
    import io
    import gpu

    monkeypatch.setattr(gpu, "gpu_available", lambda: True)
    monkeypatch.setattr(
        gpu,
        "gpu_frameworks_available",
        lambda: {"torch": False, "onnx": True, "ctranslate2": False},
        raising=False,
    )
    monkeypatch.setattr(sys, "stdin", io.StringIO(""))
    dispatcher.main()

    stderr_lines = [line.strip() for line in capsys.readouterr().err.splitlines() if line.strip()]
    readiness = json.loads(stderr_lines[0])
    assert readiness == {
        "ready": True,
        "gpu": True,
        "gpuFrameworks": {"torch": False, "onnx": True, "ctranslate2": False},
    }


def test_main_falls_back_to_all_false_gpu_frameworks_when_probe_raises(monkeypatch, capsys):
    import io
    import gpu

    def _boom():
        raise RuntimeError("CUDA driver initialization failed")

    monkeypatch.setattr(gpu, "gpu_available", _boom)
    monkeypatch.setattr(sys, "stdin", io.StringIO(""))
    dispatcher.main()

    stderr_lines = [line.strip() for line in capsys.readouterr().err.splitlines() if line.strip()]
    # The diagnostic is a {"warning": ...} line (#1657), so pick readiness by its key.
    json_lines = [json.loads(line) for line in stderr_lines if line.startswith("{")]
    readiness = next(obj for obj in json_lines if "ready" in obj)
    assert readiness == {
        "ready": True,
        "gpu": False,
        "gpuFrameworks": {"torch": False, "onnx": False, "ctranslate2": False},
    }
    assert {"warning": "[dispatcher] GPU detection failed: CUDA driver initialization failed"} in json_lines


def test_main_recycles_immediately_on_cuda_or_ort_failure(monkeypatch, capsys):
    import io
    import gpu

    monkeypatch.setattr(gpu, "gpu_available", lambda: True)
    monkeypatch.setattr(
        gpu,
        "gpu_frameworks_available",
        lambda: {"torch": False, "onnx": True, "ctranslate2": False},
        raising=False,
    )
    calls = []

    def _fake_run(script_name, args):
        calls.append((script_name, args))
        return (
            json.dumps(
                {
                    "success": False,
                    "error": "[ONNXRuntimeError] : 1 : FAIL : CUDA failure 999: unknown error",
                }
            ),
            0,
        )

    monkeypatch.setattr(dispatcher, "_run_script_main", _fake_run)
    monkeypatch.setattr(
        sys,
        "stdin",
        io.StringIO(
            json.dumps({"id": "1", "script": "remove_bg", "args": ["a"]})
            + "\n"
            + json.dumps({"id": "2", "script": "remove_bg", "args": ["b"]})
            + "\n"
        ),
    )
    dispatcher.main()

    captured = capsys.readouterr()
    assert len(calls) == 1
    stdout_lines = [json.loads(line) for line in captured.out.splitlines() if line.strip()]
    assert len(stdout_lines) == 1
    assert stdout_lines[0]["id"] == "1"
    assert "shutting down for restart" in captured.err


def test_main_recycles_after_consecutive_script_failures(monkeypatch, capsys):
    import io
    import gpu

    monkeypatch.setattr(gpu, "gpu_available", lambda: False)
    calls = []

    def _fake_run(script_name, args):
        calls.append((script_name, args))
        return json.dumps({"success": False, "error": "corrupt input"}), 1

    monkeypatch.setattr(dispatcher, "_run_script_main", _fake_run)
    monkeypatch.setattr(
        sys,
        "stdin",
        io.StringIO(
            "".join(
                json.dumps({"id": str(i), "script": "doc_health", "args": []}) + "\n"
                for i in range(5)
            )
        ),
    )
    dispatcher.main()

    captured = capsys.readouterr()
    assert len(calls) == 3
    stdout_lines = [json.loads(line) for line in captured.out.splitlines() if line.strip()]
    assert [r["id"] for r in stdout_lines] == ["0", "1", "2"]
    assert "shutting down for restart" in captured.err



