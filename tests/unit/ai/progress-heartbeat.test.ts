import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hasPython, pythonBin } from "../../helpers/python-gate.js";

const here = dirname(fileURLToPath(import.meta.url));
const pyDir = resolve(here, "../../../packages/ai/python");

// The heartbeat is pure stdlib (threading), so this runs anywhere python3 is
// present, no AI bundle required. It guards the contract the upscale / remove-bg
// scripts rely on: advance the bar during an opaque model call, stop the moment
// it returns, pass the return value through, and propagate exceptions (#591).
const SCRIPT = `
import sys, time
sys.path.insert(0, ${JSON.stringify(pyDir)})
from progress_heartbeat import run_with_heartbeat

emitted = []
def emit(pct, stage): emitted.append(pct)

def slow(): time.sleep(1.6); return "RESULT"
value = run_with_heartbeat(slow, emit, 30, 80, "Working", interval=0.5)
assert value == "RESULT", "must return the wrapped call's value"
assert emitted, "must emit at least one tick during a slow call"
assert emitted[0] == 31, ("first tick is start+1", emitted)
assert emitted == sorted(emitted), ("monotonic", emitted)
assert max(emitted) <= 79, ("never reaches end", emitted)

before = len(emitted)
time.sleep(1.0)
assert len(emitted) == before, "heartbeat must stop once the call returns"

def boom(): raise ValueError("boom")
try:
    run_with_heartbeat(boom, emit, 30, 80, "Working", interval=0.2)
    raise SystemExit("exception was swallowed")
except ValueError:
    pass

print("OK")
`;

describe.skipIf(!hasPython)("progress heartbeat", () => {
  it("advances during a slow call, stops after, returns value, propagates errors", () => {
    const res = spawnSync(pythonBin as string, ["-c", SCRIPT], {
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(res.stderr).toBe("");
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("OK");
  }, 40_000);
});
