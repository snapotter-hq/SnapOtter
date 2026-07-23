"""Contract tests for progress_heartbeat.run_with_heartbeat: it advances a
rising progress bar from a background thread while an opaque model call runs,
caps below ``end``, returns the call's value, and propagates its exception.
Pure (threading), deterministic via events rather than sleep races."""
import os
import sys
import threading
import time

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import progress_heartbeat  # noqa: E402


def test_returns_fn_value_without_beats_when_interval_long():
    emitted = []
    result = progress_heartbeat.run_with_heartbeat(
        lambda: 42,
        lambda pct, stage: emitted.append((pct, stage)),
        start=0,
        end=100,
        stage="work",
        interval=100,
    )
    assert result == 42
    assert emitted == []  # fn returned long before the first (100s) beat


def test_propagates_fn_exception():
    emitted = []

    def boom():
        raise ValueError("nope")

    with pytest.raises(ValueError, match="nope"):
        progress_heartbeat.run_with_heartbeat(
            boom,
            lambda pct, stage: emitted.append((pct, stage)),
            start=0,
            end=100,
            stage="work",
            interval=100,
        )
    assert emitted == []


def test_emits_rising_progress_capped_below_end():
    emitted = []
    reached_two = threading.Event()

    def emit(pct, stage):
        emitted.append((pct, stage))
        if len(emitted) >= 2:
            reached_two.set()

    def fn():
        reached_two.wait(timeout=2.0)  # block until two heartbeats fire
        return "done"

    result = progress_heartbeat.run_with_heartbeat(
        fn, emit, start=10, end=13, stage="infer", interval=0.01
    )
    assert result == "done"
    pcts = [p for p, _ in emitted]
    # start+1 .. end-1, monotonically rising, never reaching end.
    assert pcts == [11, 12]
    assert all(stage == "infer" for _, stage in emitted)
    assert max(pcts) <= 13 - 1


def test_no_emit_when_start_at_cap():
    emitted = []

    def fn():
        time.sleep(0.05)  # give the beat thread room to attempt an emit
        return "x"

    result = progress_heartbeat.run_with_heartbeat(
        fn, lambda pct, stage: emitted.append(pct), start=12, end=13, stage="s", interval=0.01
    )
    assert result == "x"
    assert emitted == []  # pct=12 is not < end-1=12, so nothing is emitted


def test_stops_emitting_after_fn_returns():
    emitted = []
    reached_one = threading.Event()

    def emit(pct, stage):
        emitted.append(pct)
        reached_one.set()

    def fn():
        reached_one.wait(timeout=2.0)
        return None

    progress_heartbeat.run_with_heartbeat(
        fn, emit, start=0, end=100, stage="s", interval=0.01
    )
    count = len(emitted)
    time.sleep(0.05)  # a still-alive beat thread would push more emits here
    assert len(emitted) == count  # the heartbeat stopped on return
