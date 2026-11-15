import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { isMemoryAllocError } from "../../../packages/ai/src/background-removal.js";
import { hasPython, pythonBin } from "../../helpers/python-gate.js";

const here = dirname(fileURLToPath(import.meta.url));
const pyDir = resolve(here, "../../../packages/ai/python");

// birefnet-hr-matting needs more VRAM than a 12 GB card has (#4744). It used to
// be loaded anyway: ONNX Runtime's arena ran out mid-inference, the dispatcher
// read "[ONNXRuntimeError]" as a poisoned CUDA context and restarted, and the
// route retried on a lighter model. remove_bg.py now checks free VRAM before
// loading it, and the dispatcher no longer restarts on an allocation failure.
//
// rembg, gpu and model_paths are stubbed, so this needs only python3 and runs
// in CI. The VRAM probes are patched on the real session_cache module.
const HARNESS = `
import io, json, os, sys, tempfile, types
sys.path.insert(0, ${JSON.stringify(pyDir)})
import remove_bg, session_cache, dispatcher

GB = 1024 ** 3
CUDA = ["CUDAExecutionProvider", "CPUExecutionProvider"]
CPU = ["CPUExecutionProvider"]
loaded = []
info = []

def new_session(model, providers=None):
    loaded.append(model)
    return object()

rembg = types.ModuleType("rembg")
rembg.new_session = new_session
rembg.remove = lambda data, session=None, **kw: b"png"
sessions = types.ModuleType("rembg.sessions")
sessions.sessions_class = []
gpu = types.ModuleType("gpu")
gpu.emit_info = info.append
model_paths = types.ModuleType("model_paths")
model_paths.ensure_rembg_model_home = lambda: None
for name, mod in (("rembg", rembg), ("rembg.sessions", sessions), ("gpu", gpu), ("model_paths", model_paths)):
    sys.modules[name] = mod
remove_bg._matting_registered = True
remove_bg._hr_matting_registered = True

home = tempfile.mkdtemp()
for m in ("birefnet-hr-matting", "birefnet-general"):
    open(os.path.join(home, m + ".onnx"), "wb").write(b"x" * 1024)
os.environ["U2NET_HOME"] = home
os.environ["AI_SESSION_CACHE_BYTES"] = str(1024 * 1024 * 1024)
src = os.path.join(home, "in.png")
open(src, "wb").write(b"img")

def run(model, providers, total_gb, free_gb, free_after_evict_gb=None):
    gpu.onnx_providers = lambda: (providers, "cuda" if "CUDAExecutionProvider" in providers else "cpu")
    frees = [free_gb, free_after_evict_gb if free_after_evict_gb is not None else free_gb]
    session_cache._total_vram_bytes = lambda: int(total_gb * GB)
    session_cache.free_vram_bytes = lambda: int((frees.pop(0) if len(frees) > 1 else frees[0]) * GB)
    loaded.clear(); info.clear()
    out = io.StringIO()
    saved = sys.stdout
    sys.argv = ["remove_bg.py", src, os.path.join(home, "out.png"), json.dumps({"model": model})]
    sys.stdout = out
    try:
        remove_bg.main()
    finally:
        sys.stdout = saved
    result = json.loads(out.getvalue().strip().splitlines()[-1])
    return {"result": result, "loaded": list(loaded), "info": list(info),
            "cached": [k[0] for k in session_cache._entries]}

report = {}
report["card12"] = run("birefnet-hr-matting", CUDA, 12, 11.5)
report["card12_light"] = run("birefnet-general", CUDA, 12, 11.5)
session_cache._entries.clear()
session_cache.get_session("birefnet-general", CUDA, lambda: object(), 8 * 1024)
report["card24_evicts"] = run("birefnet-hr-matting", CUDA, 24, 10, 22)
session_cache._entries.clear()
session_cache.get_session("birefnet-general", CUDA, lambda: object(), 8 * 1024)
report["card24_busy"] = run("birefnet-hr-matting", CUDA, 24, 10, 12)
session_cache._entries.clear()
report["card24_free"] = run("birefnet-hr-matting", CUDA, 24, 22)
session_cache._entries.clear()
report["unknown_vram"] = run("birefnet-hr-matting", CUDA, 0, 0)
session_cache._entries.clear()
report["cpu"] = run("birefnet-hr-matting", CPU, 12, 11.5)

arena = ("[ONNXRuntimeError] : 6 : RUNTIME_EXCEPTION : Non-zero status code returned while running "
         "BiasGelu node. Name:'BiasGelu_token_660' Status Message: /onnxruntime_src/onnxruntime/core/"
         "framework/bfc_arena.cc:376 void* onnxruntime::BFCArena::AllocateRawInternal(size_t, bool, "
         "onnxruntime::Stream*, bool, onnxruntime::WaitNotificationFn) Failed to allocate memory for "
         "requested buffer of size 805306368")
report["poison"] = {
    "arena_oom": dispatcher._is_cuda_poison_error(arena),
    "cuda_oom": dispatcher._is_cuda_poison_error("CUDA failure 2: out of memory"),
    "shortfall": dispatcher._is_cuda_poison_error(report["card12"]["result"].get("error", "")),
    "cuda_999": dispatcher._is_cuda_poison_error("[ONNXRuntimeError] : 1 : FAIL : CUDA failure 999: unknown error"),
    "illegal": dispatcher._is_cuda_poison_error("CUDA error: an illegal memory access was encountered"),
}
print("REPORT " + json.dumps(report))
`;

type Run = {
  result: { success: boolean; error?: string; model?: string; device?: string };
  loaded: string[];
  info: string[];
  cached: string[];
};

function runHarness(): Record<string, Run> & { poison: Record<string, boolean> } {
  const proc = spawnSync(pythonBin as string, ["-c", HARNESS], {
    encoding: "utf8",
    timeout: 60_000,
  });
  const line = proc.stdout.split("\n").find((l) => l.startsWith("REPORT "));
  if (!line) throw new Error(`harness failed:\n${proc.stdout}\n${proc.stderr}`);
  return JSON.parse(line.slice("REPORT ".length));
}

describe.runIf(hasPython)("remove_bg VRAM gate for birefnet-hr-matting (#4744)", () => {
  let report: ReturnType<typeof runHarness>;
  beforeAll(() => {
    report = runHarness();
  });

  it("refuses HR matting on a 12 GB card without loading it", () => {
    const run = report.card12;
    expect(run.loaded).toEqual([]);
    expect(run.result.success).toBe(false);
    expect(run.result.error).toMatch(/birefnet-hr-matting needs about 16 GB of free VRAM/);
    expect(run.info.join("\n")).toContain("[remove-bg] GPU out of memory");
  });

  it("words the refusal so the API's lighter-model retry picks it up", () => {
    expect(isMemoryAllocError(new Error(report.card12.result.error))).toBe(true);
  });

  it("still loads lighter models on the same card", () => {
    expect(report.card12_light.loaded).toEqual(["birefnet-general"]);
    expect(report.card12_light.result).toMatchObject({ success: true, device: "cuda" });
  });

  it("evicts cached sessions when that frees enough VRAM, then loads the HR model", () => {
    expect(report.card24_evicts.loaded).toEqual(["birefnet-hr-matting"]);
    expect(report.card24_evicts.result.success).toBe(true);
  });

  it("refuses when eviction still leaves too little VRAM", () => {
    expect(report.card24_busy.loaded).toEqual([]);
    expect(report.card24_busy.result.error).toMatch(/12\.0 GB is available/);
  });

  it("loads the HR model when the card has room, and when VRAM can't be read", () => {
    expect(report.card24_free.loaded).toEqual(["birefnet-hr-matting"]);
    expect(report.unknown_vram.loaded).toEqual(["birefnet-hr-matting"]);
  });

  it("does not gate CPU runs", () => {
    expect(report.cpu.loaded).toEqual(["birefnet-hr-matting"]);
    expect(report.cpu.result).toMatchObject({ success: true, device: "cpu" });
  });

  it("does not treat an allocation failure as a poisoned CUDA context", () => {
    expect(report.poison).toEqual({
      arena_oom: false,
      cuda_oom: false,
      shortfall: false,
      cuda_999: true,
      illegal: true,
    });
  });
});
