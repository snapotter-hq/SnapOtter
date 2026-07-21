"""Slowly-rising progress heartbeat for opaque model calls.

RealESRGAN and rembg run the model in a single call with no per-step
callback, so the progress bar would otherwise sit frozen for the whole
inference. run_with_heartbeat advances the bar in a background thread while
the call runs, purely to show the job is still alive, and stops the moment
the call returns (or raises). It never reaches ``end``; the caller emits the
real completion value once the work is done.
"""
import threading


def run_with_heartbeat(fn, emit, start, end, stage, interval=2.0):
    """Run ``fn()`` while emitting rising progress via ``emit(pct, stage)``.

    Advances one percent every ``interval`` seconds from ``start`` toward
    ``end`` (never past ``end - 1``). Returns ``fn()``'s value and propagates
    any exception unchanged.
    """
    stop = threading.Event()

    def beat():
        pct = start
        while not stop.wait(interval):
            if pct < end - 1:
                pct += 1
                emit(pct, stage)

    thread = threading.Thread(target=beat, daemon=True)
    thread.start()
    try:
        return fn()
    finally:
        stop.set()
        thread.join(timeout=1.0)
