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
