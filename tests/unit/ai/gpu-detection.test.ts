import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { dirname, resolve } from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasPython, pythonBin } from "../../helpers/python-gate.js";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: vi.fn(),
}));

vi.mock("sharp", () => ({
  default: vi.fn(),
}));

function createMockProcess(): {
  process: ChildProcess;
  stdin: Writable;
  stdout: EventEmitter;
  stderr: EventEmitter;
  emitEvent: (event: string, ...args: unknown[]) => void;
  stdinWrites: string[];
} {
  const stdinWrites: string[] = [];
  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      stdinWrites.push(chunk.toString());
      callback();
    },
  });
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();

  const proc = new EventEmitter() as unknown as ChildProcess;
  Object.assign(proc, {
    stdin,
    stdout,
    stderr,
    pid: 12345,
    killed: false,
    kill: vi.fn(() => {
      (proc as { killed: boolean }).killed = true;
      return true;
    }),
  });

  return {
    process: proc,
    stdin,
    stdout,
    stderr,
    emitEvent: (event: string, ...args: unknown[]) => proc.emit(event, ...args),
    stdinWrites,
  };
}

describe("buildMinimalEnv - env passthrough", () => {
  let runPythonWithProgress: (
    scriptName: string,
    args: string[],
    options?: { onProgress?: (p: number, s: string) => void; timeout?: number },
  ) => Promise<{ stdout: string; stderr: string }>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../../../packages/ai/src/bridge.js");
    runPythonWithProgress = mod.runPythonWithProgress;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DATA_DIR;
    delete process.env.SNAPOTTER_GPU;
    delete process.env.MODELS_PATH;
    delete process.env.MODELS_DIR;
  });

  function getSpawnEnv(): Record<string, string> | undefined {
    const allCalls = vi.mocked(spawn).mock.calls;
    const lastCall = allCalls[allCalls.length - 1];
    return (lastCall?.[2] as { env?: Record<string, string> })?.env;
  }

  it("passes SNAPOTTER_GPU to Python subprocess", async () => {
    process.env.SNAPOTTER_GPU = "1";

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const env = getSpawnEnv();
    expect(env).toBeDefined();
    expect(env?.SNAPOTTER_GPU).toBe("1");
  });

  it("passes MODELS_PATH to Python subprocess", async () => {
    process.env.MODELS_PATH = "/data/ai/models";

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const env = getSpawnEnv();
    expect(env).toBeDefined();
    expect(env?.MODELS_PATH).toBe("/data/ai/models");
  });

  it("sets matching native DATA_DIR and MODELS_PATH defaults", async () => {
    delete process.env.DATA_DIR;
    delete process.env.MODELS_PATH;

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const env = getSpawnEnv();
    expect(env).toBeDefined();
    expect(env?.DATA_DIR).toBe("./data");
    expect(env?.MODELS_PATH).toBe("./data/ai/models");
  });

  it("does not pass MODELS_DIR (removed dead entry)", async () => {
    process.env.MODELS_DIR = "/some/path";

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const env = getSpawnEnv();
    expect(env).toBeDefined();
    expect(env?.MODELS_DIR).toBeUndefined();
  });

  it("does not include SNAPOTTER_GPU when not set in parent env", async () => {
    delete process.env.SNAPOTTER_GPU;

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const env = getSpawnEnv();
    expect(env).toBeDefined();
    expect(env?.SNAPOTTER_GPU).toBeUndefined();
  });

  it("always includes PYTHONUNBUFFERED=1", async () => {
    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const env = getSpawnEnv();
    expect(env).toBeDefined();
    expect(env?.PYTHONUNBUFFERED).toBe("1");
  });

  it("passes LD_LIBRARY_PATH when set", async () => {
    process.env.LD_LIBRARY_PATH = "/usr/local/nvidia/lib64";

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const env = getSpawnEnv();
    expect(env?.LD_LIBRARY_PATH).toBe("/usr/local/nvidia/lib64");

    delete process.env.LD_LIBRARY_PATH;
  });

  it("passes CUDA_VISIBLE_DEVICES when set", async () => {
    process.env.CUDA_VISIBLE_DEVICES = "0,1";

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const env = getSpawnEnv();
    expect(env?.CUDA_VISIBLE_DEVICES).toBe("0,1");

    delete process.env.CUDA_VISIBLE_DEVICES;
  });

  it("does not leak unrelated env vars to Python subprocess", async () => {
    process.env.SECRET_API_KEY = "should-not-leak";
    process.env.DATABASE_URL = "sqlite://secret.db";

    const mock = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mock.process);

    const promise = runPythonWithProgress("test.py", []);
    mock.stdout.emit("data", Buffer.from('{"ok": true}\n'));
    mock.emitEvent("close", 0, null);
    await promise;

    const env = getSpawnEnv();
    expect(env?.SECRET_API_KEY).toBeUndefined();
    expect(env?.DATABASE_URL).toBeUndefined();

    delete process.env.SECRET_API_KEY;
    delete process.env.DATABASE_URL;
  });
});

describe.skipIf(!hasPython)("gpu.safe_onnx_session host OOM handling (issue #3439)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const pyDir = resolve(here, "../../../packages/ai/python");

  it("re-raises host-memory OOMs during CUDA init without retrying on CPUExecutionProvider", () => {
    const res = spawnSync(
      pythonBin as string,
      [
        "-c",
        `
import io, json, sys, types

sys.path.insert(0, ${JSON.stringify(pyDir)})
import gpu

calls = []
active_err = [None]

def fake_inference_session(model_path, providers=None):
    calls.append((model_path, list(providers) if providers is not None else None))
    if active_err[0] is not None and providers is not None and "CUDAExecutionProvider" in providers:
        raise active_err[0]
    return f"session:{model_path}:{providers[0] if providers else 'default'}"

fake_ort = types.ModuleType("onnxruntime")
fake_ort.InferenceSession = fake_inference_session
sys.modules["onnxruntime"] = fake_ort

cuda_providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]

# 1. Host-memory OOMs must re-raise immediately without a second CPUExecutionProvider call.
for host_oom_exc in (
    MemoryError(),
    RuntimeError("MemoryError"),
    RuntimeError("std::bad_alloc"),
    RuntimeError("[enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes."),
    RuntimeError("DefaultCPUAllocator: can't allocate memory: you tried to allocate 104857600 bytes."),
    RuntimeError("DefaultCPUAllocator: out of memory"),
    RuntimeError("DefaultCPUAllocator: failed to allocate memory"),
    RuntimeError("DefaultCPUAllocator: NOT ENOUGH MEMORY"),
    RuntimeError("DefaultCPUAllocator: CAN'T ALLOCATE MEMORY"),
    RuntimeError("OSError: [Errno 12] Cannot allocate memory"),
    OSError(12, "Cannot allocate memory"),
    OSError(12, "Nicht genügend Hauptspeicher verfügbar"),
    RuntimeError("Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32"),
):
    for explicit_providers in (cuda_providers, None):
        calls.clear()
        active_err[0] = host_oom_exc
        gpu.onnx_providers = lambda: (list(cuda_providers), "cuda")
        err_buf = io.StringIO()
        saved_stderr = sys.stderr
        sys.stderr = err_buf
        try:
            gpu.safe_onnx_session("/tmp/model.onnx", providers=explicit_providers)
            raise AssertionError(f"Expected safe_onnx_session to re-raise {host_oom_exc!r}")
        except Exception as caught:
            assert caught is host_oom_exc, (caught, host_oom_exc)
        finally:
            sys.stderr = saved_stderr
        assert calls == [("/tmp/model.onnx", cuda_providers)], (
            f"safe_onnx_session must not retry on CPU for host OOM {host_oom_exc!r}, got {calls!r}"
        )
        assert "falling back to CPU" not in err_buf.getvalue(), err_buf.getvalue()

# 1b. Model-load / file I/O / protobuf / download errors must re-raise immediately without a second CPUExecutionProvider call (#3443).
class InvalidProtobuf(RuntimeError):
    pass

class InvalidGraph(RuntimeError):
    pass

class NoSuchFile(RuntimeError):
    pass

for model_load_exc in (
    FileNotFoundError(2, "No such file or directory", "/tmp/model.onnx"),
    PermissionError(13, "Permission denied", "/tmp/model.onnx"),
    IsADirectoryError(21, "Is a directory", "/tmp/model.onnx"),
    OSError(5, "Input/output error"),
    ConnectionError("Connection reset by peer"),
    EOFError("Unexpected end of file"),
    InvalidProtobuf("Load model from /tmp/model.onnx failed"),
    InvalidGraph("Load model from /tmp/model.onnx failed"),
    NoSuchFile("/tmp/model.onnx"),
    RuntimeError("[ONNXRuntimeError] : 7 : INVALID_PROTOBUF : Load model from /tmp/model.onnx failed:Protobuf parsing failed."),
    RuntimeError("[ONNXRuntimeError] : 3 : NO_SUCHFILE : Load model from /tmp/model.onnx failed:File doesn't exist"),
    RuntimeError("[ONNXRuntimeError] : 10 : INVALID_GRAPH : Load model from /tmp/model.onnx failed:This is an invalid model. Error: ModelProto does not have a graph."),
    RuntimeError("[ONNXRuntimeError] : 10 : INVALID_GRAPH : Load model from /tmp/model.onnx failed:This is an invalid model. Type Error: Type 'tensor(float)' of input parameter is invalid."),
    ValueError("SHA256 hash of downloaded file (model.onnx) does not match the known hash"),
    ValueError("Checksum mismatch for model.onnx"),
    RuntimeError("Offline mode is enabled (SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0); cannot download model"),
):
    for explicit_providers in (cuda_providers, None):
        calls.clear()
        active_err[0] = model_load_exc
        gpu.onnx_providers = lambda: (list(cuda_providers), "cuda")
        err_buf = io.StringIO()
        saved_stderr = sys.stderr
        sys.stderr = err_buf
        try:
            gpu.safe_onnx_session("/tmp/model.onnx", providers=explicit_providers)
            raise AssertionError(f"Expected safe_onnx_session to re-raise {model_load_exc!r}")
        except Exception as caught:
            assert caught is model_load_exc, (caught, model_load_exc)
        finally:
            sys.stderr = saved_stderr
        assert calls == [("/tmp/model.onnx", cuda_providers)], (
            f"safe_onnx_session must not retry on CPU for model-load error {model_load_exc!r}, got {calls!r}"
        )
        assert "falling back to CPU" not in err_buf.getvalue(), err_buf.getvalue()

# 2. Non-host-OOM CUDA / VRAM / driver errors still fall back to CPUExecutionProvider.
for cuda_exc in (
    RuntimeError("CUDA out of memory"),
    RuntimeError("Failed to allocate memory for requested buffer"),
    RuntimeError("cudaErrorMemoryAllocation: out of memory"),
    RuntimeError("CUBLAS_STATUS_ALLOC_FAILED"),
    RuntimeError("CUDA driver version is insufficient for CUDA runtime version"),
    RuntimeError("[ONNXRuntimeError] : 1 : FAIL : Failed to load library libonnxruntime_providers_cuda.so with error: libcudnn.so.8: cannot open shared object file: No such file or directory"),
):
    for explicit_providers in (cuda_providers, None):
        calls.clear()
        active_err[0] = cuda_exc
        gpu.onnx_providers = lambda: (list(cuda_providers), "cuda")
        err_buf = io.StringIO()
        saved_stderr = sys.stderr
        sys.stderr = err_buf
        try:
            sess, dev = gpu.safe_onnx_session("/tmp/model.onnx", providers=explicit_providers)
        finally:
            sys.stderr = saved_stderr
        assert sess == "session:/tmp/model.onnx:CPUExecutionProvider", sess
        assert dev == "cpu", dev
        assert calls == [
            ("/tmp/model.onnx", cuda_providers),
            ("/tmp/model.onnx", ["CPUExecutionProvider"]),
        ], calls
        info_event = json.loads(err_buf.getvalue().strip())
        assert "CUDA init failed" in info_event["info"] and "falling back to CPU" in info_event["info"], info_event

# 3. Successful CUDA init returns session and device without fallback (default and explicit providers, #3611).
for explicit_providers in (None, list(cuda_providers)):
    calls.clear()
    active_err[0] = None
    if explicit_providers is None:
        gpu.onnx_providers = lambda: (list(cuda_providers), "cuda")
    else:
        gpu.onnx_providers = lambda: (_ for _ in ()).throw(
            AssertionError("onnx_providers() must not be called when providers is explicit")
        )
    sess_ok, dev_ok = gpu.safe_onnx_session("/tmp/model.onnx", providers=explicit_providers)
    assert sess_ok == "session:/tmp/model.onnx:CUDAExecutionProvider", sess_ok
    assert dev_ok == "cuda", (explicit_providers, dev_ok)
    assert calls == [("/tmp/model.onnx", cuda_providers)], calls

# 3b. When session exposes get_providers() and ONNX Runtime dropped CUDAExecutionProvider, device is "cpu" (#3611).
class _DroppedCudaSession:
    def get_providers(self):
        return ["CPUExecutionProvider"]

fake_ort.InferenceSession = lambda _path, providers=None: _DroppedCudaSession()
_, dev_dropped = gpu.safe_onnx_session("/tmp/model.onnx", providers=list(cuda_providers))
assert dev_dropped == "cpu", dev_dropped

# 3c. Explicit CPU-only providers return device="cpu" (#3611).
fake_ort.InferenceSession = fake_inference_session
sess_cpu, dev_cpu = gpu.safe_onnx_session("/tmp/model.onnx", providers=["CPUExecutionProvider"])
assert sess_cpu == "session:/tmp/model.onnx:CPUExecutionProvider", sess_cpu
assert dev_cpu == "cpu", dev_cpu

# 4. CPU-only providers re-raise any error without retrying.
calls.clear()
cpu_err = RuntimeError("corrupt model graph")
def fake_cpu_fail(model_path, providers=None):
    calls.append((model_path, list(providers) if providers is not None else None))
    raise cpu_err
fake_ort.InferenceSession = fake_cpu_fail
try:
    gpu.safe_onnx_session("/tmp/model.onnx", providers=["CPUExecutionProvider"])
    raise AssertionError("Expected safe_onnx_session to re-raise CPU error")
except RuntimeError as caught_cpu:
    assert caught_cpu is cpu_err, caught_cpu
assert calls == [("/tmp/model.onnx", ["CPUExecutionProvider"])], calls

print("SAFE_ONNX_SESSION_3439_OK")
`,
      ],
      { encoding: "utf8", timeout: 30_000 },
    );
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain("SAFE_ONNX_SESSION_3439_OK");
  });
});
