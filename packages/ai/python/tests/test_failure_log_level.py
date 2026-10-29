"""Real failures and fallbacks reach the bridge as {"warning": ...}, not plain lines (#1657).

A plain `[tag] ...` stderr line is logged at info by bridge.ts, so LOG_LEVEL=warn
hides it. Only the JSON warning shape is logged at warn.

Stdlib unittest, because CI runs sidecar suites with `python3 -m unittest` and
has no pytest.
"""

import io
import json
import os
import re
import sys
import types
import unittest
from contextlib import redirect_stderr
from unittest import mock

PYTHON_DIR = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, PYTHON_DIR)
import gpu  # noqa: E402


def _stderr_json_objects(text):
    objects = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("{"):
            try:
                objects.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return objects


# Matches a print() of a "[tag] ... failed" line straight to stderr. Those are
# the lines that used to bypass the warning shape. Module-not-available and
# redirect-unavailable breadcrumbs don't match "failed", so they stay at info.
_PLAIN_FAILURE_PRINT = re.compile(
    r'print\(\s*f?"\[[^\]"]+\][^"\n]*\b(?:failed|fails)\b[^"\n]*"[^\n]*file=sys\.stderr'
)


class CudaProbeFailureTest(unittest.TestCase):
    def test_cuda_probe_failure_is_emitted_as_a_warning(self):
        def broken_is_available():
            raise RuntimeError("driver mismatch")

        fake_torch = types.SimpleNamespace(
            cuda=types.SimpleNamespace(is_available=broken_is_available)
        )
        stderr = io.StringIO()
        with mock.patch.dict(sys.modules, {"torch": fake_torch}), redirect_stderr(stderr):
            self.assertFalse(gpu._try_torch_cuda())

        warnings = [m["warning"] for m in _stderr_json_objects(stderr.getvalue()) if "warning" in m]
        self.assertEqual(warnings, ["[gpu] torch CUDA probe failed: driver mismatch"])


class NoPlainFailurePrintTest(unittest.TestCase):
    def test_no_sidecar_script_prints_a_failure_as_a_plain_stderr_line(self):
        offenders = []
        for name in sorted(os.listdir(PYTHON_DIR)):
            if not name.endswith(".py"):
                continue
            with open(os.path.join(PYTHON_DIR, name), encoding="utf-8") as fh:
                for lineno, line in enumerate(fh, start=1):
                    if _PLAIN_FAILURE_PRINT.search(line):
                        offenders.append(f"{name}:{lineno}: {line.strip()}")
        self.assertEqual(offenders, [])


if __name__ == "__main__":
    unittest.main()
