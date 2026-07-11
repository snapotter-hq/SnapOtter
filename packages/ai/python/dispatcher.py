"""
Persistent Python sidecar dispatcher.

Runs as a long-lived process. Reads JSON requests from stdin (one per line),
dispatches to the appropriate AI handler, writes JSON responses to stdout.
Progress emissions continue via stderr (unchanged from the standalone scripts).

Request format:  {"id": "uuid", "script": "remove_bg", "args": [...]}
Response format: {"id": "uuid", "stdout": "...", "exitCode": 0}

Pre-imports heavy libraries at startup to eliminate cold-start latency.

Security boundary
-----------------
Scripts run in the dispatcher process space via dynamic module loading (exec()).
There is NO process-level isolation between scripts. The security boundary is the
ALLOWED_SCRIPTS allowlist below -- only filenames present in that set can be
loaded and executed. The allowlist is validated against a strict regex that
forbids path separators, dots (except the .py suffix added internally), and
non-alphanumeric characters other than underscores.
"""
import re
import sys
import json
import gc
import io
import os
import traceback


# ── Optional OpenTelemetry tracing (enterprise only) ─────────────
_tracer = None
_tracer_provider = None

def _init_tracing():
    """Initialize OTel tracing if OTEL_EXPORTER_OTLP_ENDPOINT is set."""
    global _tracer, _tracer_provider
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        return
    try:
        from opentelemetry import trace as otel_trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource

        resource = Resource.create({"service.name": "snapotter-sidecar"})
        _tracer_provider = TracerProvider(resource=resource)
        _tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
        otel_trace.set_tracer_provider(_tracer_provider)
        _tracer = otel_trace.get_tracer("snapotter-sidecar")
    except ImportError:
        pass


# ── Script allowlist ───────────────────────────────────────────────────
# Only these script names (without .py) may be dispatched. This is the
# primary security gate -- no path traversal, no arbitrary file execution.
ALLOWED_SCRIPTS = {
    "colorize",
    "detect_faces",
    "enhance_faces",
    "face_landmarks",
    "gif_remove_bg",
    "inpaint",
    "install_feature",
    "noise_removal",
    "ocr",
    "ocr_pdf",
    "ocr_preprocess",
    "outpaint",
    "red_eye_removal",
    "remove_bg",
    "restore",
    "transcribe",
    "upscale",
}

# Strict pattern: lowercase alphanumeric and underscores only.
# No path separators, no dots, no spaces, no special characters.
_SCRIPT_NAME_RE = re.compile(r"^[a-z0-9_]+$")

# ── Dispatcher profiles ───────────────────────────────────────────────
# The "ai" profile (default) uses ALLOWED_SCRIPTS for the full AI tool set
# and pre-imports heavy ML libraries. The "docs" profile replaces the
# allowlist with a lean set of document-processing scripts and skips all
# heavy AI imports so the instance starts fast.

DISPATCHER_PROFILE = os.environ.get("DISPATCHER_PROFILE", "ai")

DOCS_SCRIPTS = {
    "doc_pagecount",
    "doc_health",
    "doc_flatten",
    "doc_redact",
    "doc_text",
    "doc_to_word",
    "doc_metadata",
    "doc_html_pdf",
    "doc_sign",
    "doc_scrub_meta",
}

if DISPATCHER_PROFILE == "docs":
    ALLOWED_SCRIPTS = DOCS_SCRIPTS


INSTALLED_PATH = os.path.join(os.environ.get("DATA_DIR", "/data"), "ai", "installed.json")
MODELS_DIR = os.path.join(os.environ.get("DATA_DIR", "/data"), "ai", "models")

TOOL_BUNDLE_MAP = {
    "remove_bg": "background-removal",
    "gif_remove_bg": "background-removal",
    "detect_faces": "face-detection",
    "face_landmarks": "face-detection",
    "red_eye_removal": "face-detection",
    "inpaint": "object-eraser-colorize",
    "outpaint": "object-eraser-colorize",
    "colorize": "object-eraser-colorize",
    "upscale": "upscale-enhance",
    "enhance_faces": "upscale-enhance",
    "noise_removal": "upscale-enhance",
    "restore": "photo-restoration",
    "ocr": "ocr",
    "ocr_pdf": "ocr",
    "transcribe": "transcription",
}


def _get_installed_bundles():
    try:
        with open(INSTALLED_PATH) as f:
            data = json.load(f)
            return set(data.get("bundles", {}).keys())
    except (FileNotFoundError, json.JSONDecodeError):
        return set()


def emit_progress(percent, stage):
    """Emit structured progress to stderr."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


# ── Pre-import heavy libraries ──────────────────────────────────────
# These imports are the main source of cold-start latency.
# By importing once at startup, subsequent requests skip the import cost.
# The docs profile skips all of these so it starts lean and fast.

available_modules = {}


def _try_import(name, import_fn):
    try:
        available_modules[name] = import_fn()
    except ImportError as e:
        print(f"[dispatcher] Module '{name}' not available: {e}", file=sys.stderr, flush=True)


if DISPATCHER_PROFILE == "ai":
    # ── basicsr / torchvision compatibility shim ──────────────────
    # basicsr 1.4.2 (pulled in by realesrgan) does:
    #   from torchvision.transforms.functional_tensor import rgb_to_grayscale
    # but torchvision >= 0.17 removed the functional_tensor submodule,
    # merging everything into torchvision.transforms.functional.
    # We install a shim module ONCE here so every script in this process
    # benefits, rather than relying on each script to patch individually.
    try:
        import torchvision.transforms.functional_tensor  # noqa: F401
    except (ImportError, ModuleNotFoundError):
        try:
            import types
            import torchvision.transforms.functional as _F
            import torchvision.transforms

            _shim = types.ModuleType("torchvision.transforms.functional_tensor")
            _shim.__getattr__ = lambda name: getattr(_F, name)
            _shim.rgb_to_grayscale = _F.rgb_to_grayscale
            sys.modules["torchvision.transforms.functional_tensor"] = _shim
            torchvision.transforms.functional_tensor = _shim
            print("[dispatcher] Installed torchvision.transforms.functional_tensor shim",
                  file=sys.stderr, flush=True)
        except (ImportError, AttributeError):
            # torchvision not installed yet -- shim not needed until
            # the upscale-enhance bundle is installed.
            pass
    except Exception:
        # Catch-all so dispatcher startup is never blocked.
        pass

    _try_import("PIL", lambda: __import__("PIL"))
    _try_import("mediapipe", lambda: __import__("mediapipe"))
    _try_import("numpy", lambda: __import__("numpy"))
    _try_import("gpu", lambda: __import__("gpu"))

    # Heavy ML libraries - import but don't fail if unavailable
    _try_import("rembg", lambda: __import__("rembg"))

    # Point rembg at the bundled model directory if it exists
    if os.path.isdir(MODELS_DIR):
        os.environ.setdefault("U2NET_HOME", os.path.join(MODELS_DIR, "rembg"))


# ── Script handlers ─────────────────────────────────────────────────
# Each handler sets sys.argv and calls the script's main() function,
# capturing stdout. The scripts remain unchanged.


def _run_script_main(script_name, args):
    """
    Import and run a script's main() function, capturing its stdout output.

    Since some scripts (like remove_bg.py) manipulate file descriptors directly
    (os.dup2), we use a pipe at the fd level rather than StringIO.

    A drain thread reads the pipe concurrently to prevent deadlock when
    scripts produce more than 64 KB of stdout (e.g. ONNX runtime logging).
    """
    import threading

    # ── Security gate: validate script name against allowlist ──
    if not _SCRIPT_NAME_RE.match(script_name):
        return (json.dumps({
            "success": False,
            "error": "invalid_script_name",
            "message": f"Script name contains invalid characters: {script_name!r}"
        }), 1)

    if script_name not in ALLOWED_SCRIPTS:
        return (json.dumps({
            "success": False,
            "error": "script_not_allowed",
            "message": f"Script '{script_name}' is not in the allowed scripts list"
        }), 1)

    script_dir = os.path.dirname(os.path.abspath(__file__))

    # ── Feature gate: reject scripts whose bundle is not installed ──
    bundle_id = TOOL_BUNDLE_MAP.get(script_name)
    if bundle_id:
        installed = _get_installed_bundles()
        if bundle_id not in installed:
            return (json.dumps({
                "success": False,
                "error": "feature_not_installed",
                "feature": bundle_id,
                "message": f"Feature bundle '{bundle_id}' is not installed"
            }), 1)

    # Save original state
    old_argv = sys.argv

    # Create a pipe to capture stdout at the fd level
    read_fd, write_fd = os.pipe()

    # Save the real stdout fd
    real_stdout_fd = os.dup(1)

    # Redirect fd 1 to our pipe's write end
    os.dup2(write_fd, 1)
    os.close(write_fd)

    # Also redirect sys.stdout to the same fd
    old_sys_stdout = sys.stdout
    sys.stdout = os.fdopen(1, "w", closefd=False)

    # Drain the pipe in a background thread so the pipe buffer never fills.
    captured_chunks = []

    def _drain():
        with os.fdopen(read_fd, "r") as f:
            while True:
                chunk = f.read(8192)
                if not chunk:
                    break
                captured_chunks.append(chunk)

    drain_thread = threading.Thread(target=_drain, daemon=True)
    drain_thread.start()

    exit_code = 0
    try:
        sys.argv = ["script.py"] + args

        # Load and run the script
        script_path = os.path.join(script_dir, script_name + ".py")

        module_globals = {"__name__": "__main__", "__file__": script_path}

        with open(script_path) as f:
            code = compile(f.read(), script_path, "exec")

        # Run the compiled script in its own namespace
        exec(code, module_globals)  # noqa: S102 - trusted internal scripts only

    except SystemExit as e:
        exit_code = e.code if isinstance(e.code, int) else 1
    except Exception as e:
        # Log full traceback to stderr for diagnostics
        traceback.print_exc(file=sys.stderr)
        # Write error to the captured stdout
        sys.stdout.write(json.dumps({"success": False, "error": str(e)}) + "\n")
        sys.stdout.flush()
        exit_code = 1
    finally:
        # Flush before restoring
        sys.stdout.flush()

        # Restore stdout fd (closes the pipe write end, unblocking the drain thread)
        os.dup2(real_stdout_fd, 1)
        os.close(real_stdout_fd)

        # Restore sys.stdout
        sys.stdout = old_sys_stdout

        # Restore sys.argv
        sys.argv = old_argv

    drain_thread.join(timeout=10)
    captured = "".join(captured_chunks)

    return captured.strip(), exit_code


# ── Main loop ───────────────────────────────────────────────────────


MAX_REQUESTS = int(os.environ.get("DISPATCHER_MAX_REQUESTS", "50"))


def _cleanup_after_request():
    """Free unreferenced objects and GPU memory after each request."""
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except ImportError:
        pass


def main():
    # Signal readiness with GPU status
    gpu = False
    try:
        from gpu import gpu_available
        gpu = gpu_available()
    except ImportError as e:
        print(f"[dispatcher] GPU detection failed: {e}", file=sys.stderr, flush=True)
    print(json.dumps({"ready": True, "gpu": gpu}), file=sys.stderr, flush=True)
    print(f"[dispatcher] Ready. GPU: {gpu}. Max requests: {MAX_REQUESTS}. Modules: {list(available_modules.keys())}", file=sys.stderr, flush=True)

    _init_tracing()

    request_count = 0

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue

        request_id = request.get("id", "unknown")
        script_name = request.get("script", "")
        args = request.get("args", [])

        otel_data = request.pop("_otel", None)
        otel_ctx = None
        if otel_data and _tracer:
            from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
            from opentelemetry import context as otel_context
            propagator = TraceContextTextMapPropagator()
            otel_ctx = propagator.extract(carrier=otel_data)

        try:
            if otel_ctx and _tracer:
                from opentelemetry import trace as otel_trace
                from opentelemetry.trace import StatusCode
                from opentelemetry import context as otel_context
                token = otel_context.attach(otel_ctx)
                span = _tracer.start_span(f"sidecar.{script_name}", context=otel_ctx)
                try:
                    stdout_output, exit_code = _run_script_main(script_name, args)
                    if exit_code != 0:
                        span.set_status(StatusCode.ERROR, f"exit code {exit_code}")
                except Exception as exc:
                    span.set_status(StatusCode.ERROR, str(exc))
                    span.record_exception(exc)
                    raise
                finally:
                    span.end()
                    otel_context.detach(token)
                    try:
                        _tracer_provider.force_flush()
                    except Exception:
                        pass
            else:
                stdout_output, exit_code = _run_script_main(script_name, args)
            response = {
                "id": request_id,
                "stdout": stdout_output,
                "exitCode": exit_code,
            }
        except Exception as e:
            response = {
                "id": request_id,
                "stdout": json.dumps({"success": False, "error": str(e)}),
                "exitCode": 1,
            }

        # Write response as a single JSON line to stdout
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()

        _cleanup_after_request()
        request_count += 1

        if request_count >= MAX_REQUESTS:
            print(f"[dispatcher] Reached max requests ({MAX_REQUESTS}), shutting down for restart",
                  file=sys.stderr, flush=True)
            break

    if _tracer_provider:
        try:
            _tracer_provider.shutdown()
        except Exception:
            pass


if __name__ == "__main__":
    main()
