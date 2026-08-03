"""U2NET_HOME resolution for rembg-based scripts (Sentry NODE-4W).

The Docker image bakes U2NET_HOME and the dispatcher setdefaults it, but the
per-request fallback on native installs has neither, so rembg fell back to
~/.u2net: unwritable for service users (Errno 13 on /root/.u2net) and blind
to the models the feature bundle installed. The scripts must derive the model
home from MODELS_PATH (always set by the Node bridge) themselves.
"""

import ast
import importlib.util
import os


def load_model_paths():
    script_path = os.path.join(os.path.dirname(__file__), "..", "model_paths.py")
    spec = importlib.util.spec_from_file_location("model_paths_under_test", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_sets_u2net_home_from_models_path(monkeypatch):
    module = load_model_paths()
    monkeypatch.delenv("U2NET_HOME", raising=False)
    monkeypatch.setenv("MODELS_PATH", "/data/ai/models")

    module.ensure_rembg_model_home()

    assert os.environ["U2NET_HOME"] == os.path.join("/data/ai/models", "rembg")


def test_explicit_u2net_home_wins(monkeypatch):
    module = load_model_paths()
    monkeypatch.setenv("U2NET_HOME", "/custom/u2net")
    monkeypatch.setenv("MODELS_PATH", "/data/ai/models")

    module.ensure_rembg_model_home()

    assert os.environ["U2NET_HOME"] == "/custom/u2net"


def test_without_models_path_leaves_env_untouched_but_warns(monkeypatch, capsys):
    # A missing MODELS_PATH means rembg will fall back to ~/.u2net, the exact
    # NODE-4W failure. That must not happen silently.
    module = load_model_paths()
    monkeypatch.delenv("U2NET_HOME", raising=False)
    monkeypatch.delenv("MODELS_PATH", raising=False)

    module.ensure_rembg_model_home()

    assert "U2NET_HOME" not in os.environ
    err = capsys.readouterr().err
    assert "MODELS_PATH" in err and "u2net" in err.lower()


def test_with_models_path_set_no_warning(monkeypatch, capsys):
    module = load_model_paths()
    monkeypatch.delenv("U2NET_HOME", raising=False)
    monkeypatch.setenv("MODELS_PATH", "/data/ai/models")

    module.ensure_rembg_model_home()

    assert capsys.readouterr().err == ""


def _call_name(node):
    func = node.func
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return None


def test_remove_bg_and_gif_remove_bg_wire_the_helper():
    # Wiring guard: both rembg entry points must call the helper inside main()
    # before any rembg session resolution, otherwise the fallback-path bug
    # returns. Checked via ast, scoped to main's body, because source position
    # of helper definitions does not reflect execution order.
    base = os.path.join(os.path.dirname(__file__), "..")
    for script in ("remove_bg.py", "gif_remove_bg.py"):
        with open(os.path.join(base, script)) as f:
            tree = ast.parse(f.read())
        main_fn = next(
            n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "main"
        )
        calls = [n for n in ast.walk(main_fn) if isinstance(n, ast.Call)]
        helper_lines = [c.lineno for c in calls if _call_name(c) == "ensure_rembg_model_home"]
        session_lines = [
            c.lineno for c in calls if _call_name(c) in ("new_session", "_create_session")
        ]
        assert helper_lines, f"{script} main() must call ensure_rembg_model_home"
        assert not session_lines or min(helper_lines) < min(session_lines), (
            f"{script} must call ensure_rembg_model_home before creating a rembg session"
        )
