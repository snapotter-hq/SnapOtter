import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import session_cache  # noqa: E402


@pytest.fixture(autouse=True)
def isolate_session_cache(monkeypatch):
    """Keep sessions from leaking between tests.

    A GPU host has a non-zero automatic budget, so tests that fake a model file
    would otherwise start caching it. Tests that exercise the cache set their
    own budget.
    """
    monkeypatch.setenv("AI_SESSION_CACHE_BYTES", "1")
    session_cache._entries.clear()
    session_cache._used_this_request.clear()
    session_cache._busy = False
    yield
    session_cache._entries.clear()
    session_cache._busy = False
