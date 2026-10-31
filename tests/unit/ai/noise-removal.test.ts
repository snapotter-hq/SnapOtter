import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasPython, pythonBin } from "../../helpers/python-gate.js";

vi.mock("sharp", () => {
  const mockSharp = vi.fn(() => ({
    png: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
  }));
  return { default: mockSharp };
});

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from("mock-output-data")),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../packages/ai/src/bridge.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../packages/ai/src/bridge.js")>()),
  runPythonWithProgress: vi.fn(),
  parseStdoutJson: vi.fn(),
}));

import sharp from "sharp";
import { parseStdoutJson, runPythonWithProgress } from "../../../packages/ai/src/bridge.js";
import { noiseRemoval } from "../../../packages/ai/src/noise-removal.js";

const FAKE_INPUT = Buffer.from("fake-noisy-image");
const FAKE_OUTPUT_DIR = "/tmp/test-denoise";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFile).mockResolvedValue(Buffer.from("mock-output-data"));
  vi.mocked(writeFile).mockResolvedValue(undefined);
  vi.mocked(runPythonWithProgress).mockResolvedValue({
    stdout: '{"success": true}',
    stderr: "",
  });
  vi.mocked(parseStdoutJson).mockReturnValue({
    success: true,
    width: 800,
    height: 600,
    format: "png",
    tier: "balanced",
  });
  vi.mocked(sharp).mockImplementation(
    () =>
      ({
        png: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
        metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
      }) as unknown as ReturnType<typeof sharp>,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("noiseRemoval", () => {
  describe("request serialization", () => {
    it("calls noise_removal.py with correct file paths", async () => {
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "noise_removal.py",
        [`${FAKE_OUTPUT_DIR}/input_denoise.png`, `${FAKE_OUTPUT_DIR}/output_denoise.png`, "{}"],
        expect.any(Object),
      );
    });

    it("serializes tier option", async () => {
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, { tier: "aggressive" });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ tier: "aggressive" });
    });

    it("serializes strength option", async () => {
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, { strength: 0.8 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ strength: 0.8 });
    });

    it("serializes detailPreservation option", async () => {
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, { detailPreservation: 0.6 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ detailPreservation: 0.6 });
    });

    it("serializes colorNoise option", async () => {
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, { colorNoise: 0.4 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ colorNoise: 0.4 });
    });

    it("serializes format and quality options", async () => {
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, { format: "webp", quality: 90 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ format: "webp", quality: 90 });
    });

    it("serializes all options together", async () => {
      const allOptions = {
        tier: "aggressive",
        strength: 0.9,
        detailPreservation: 0.5,
        colorNoise: 0.3,
        format: "jpeg",
        quality: 85,
      };
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, allOptions);

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual(allOptions);
    });

    it("converts input to PNG before writing", async () => {
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(sharp).toHaveBeenCalledWith(FAKE_INPUT);
    });
  });

  describe("response parsing", () => {
    it("returns NoiseRemovalResult with all fields", async () => {
      const result = await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(result).toEqual({
        buffer: expect.any(Buffer),
        width: 800,
        height: 600,
        format: "png",
        tier: "balanced",
      });
    });

    it("reads from default output path when output_path not in response", async () => {
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(readFile).toHaveBeenCalledWith(`${FAKE_OUTPUT_DIR}/output_denoise.png`);
    });

    it("reads from alternate output_path when provided", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
        output_path: "/tmp/alt-denoise.webp",
      });

      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(readFile).toHaveBeenCalledWith("/tmp/alt-denoise.webp");
    });

    it("defaults format to 'png' when absent from response", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
      });

      const result = await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.format).toBe("png");
    });

    it("defaults tier from Python response when present", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
        tier: "gentle",
      });

      const result = await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.tier).toBe("gentle");
    });

    it("falls back to options tier when Python omits it", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
      });

      const result = await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, { tier: "aggressive" });
      expect(result.tier).toBe("aggressive");
    });

    it("falls back to 'balanced' when both Python and options omit tier", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
      });

      const result = await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.tier).toBe("balanced");
    });
  });

  describe("error handling", () => {
    it("throws with custom error from Python", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
        error: "NAFNet model loading failed",
      });

      await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "NAFNet model loading failed",
      );
    });

    it("throws fallback error when success: false without error string", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Noise removal failed",
      );
    });

    it("propagates bridge timeout", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

      await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("timed out");
    });

    it("propagates OOM errors from bridge", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process killed (out of memory)"),
      );

      await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
    });
  });

  describe("onProgress forwarding", () => {
    it("passes onProgress to bridge", async () => {
      const onProgress = vi.fn();
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "noise_removal.py",
        expect.any(Array),
        expect.objectContaining({ onProgress }),
      );
    });

    it("omits onProgress when not provided", async () => {
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.onProgress).toBeUndefined();
    });

    it("hands the abort signal to the sidecar call", async () => {
      const { signal } = new AbortController();
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR, { signal });

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "noise_removal.py",
        expect.any(Array),
        expect.objectContaining({ signal }),
      );
      expect(vi.mocked(runPythonWithProgress).mock.calls[0][1][2]).toBe("{}");
    });
  });

  describe("timeout calculation", () => {
    it("uses minimum 300000ms timeout for small images", async () => {
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);

      // 800x600 = 0.48 MP, 0.48 * 120000 = 57600 < 300000
      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.timeout).toBe(300000);
    });

    it("scales timeout for large images using megapixels * 120000", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: 4000, height: 3000 }),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);

      // 4000x3000 = 12 MP, 12 * 120000 = 1440000 > 300000
      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.timeout).toBe(1440000);
    });

    it("uses metadata from the PNG-converted buffer for timeout", async () => {
      // The second sharp() call reads metadata from the PNG buffer
      let callCount = 0;
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi
              .fn()
              .mockResolvedValue(
                callCount++ === 0 ? { width: 800, height: 600 } : { width: 2000, height: 2000 },
              ),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);

      // Timeout is based on the metadata call, which returns dimensions
      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.timeout).toBeGreaterThanOrEqual(300000);
    });
  });

  describe("parseStdoutJson error propagation", () => {
    it("propagates parseStdoutJson errors", async () => {
      vi.mocked(parseStdoutJson).mockImplementation(() => {
        throw new Error("No JSON response from Python script");
      });

      await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "No JSON response from Python script",
      );
    });
  });

  describe("sharp conversion", () => {
    it("converts input to PNG and writes to outputDir", async () => {
      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(sharp).toHaveBeenCalledWith(FAKE_INPUT);
      expect(writeFile).toHaveBeenCalledWith(
        `${FAKE_OUTPUT_DIR}/input_denoise.png`,
        Buffer.from("mock-png-data"),
      );
    });

    it("propagates sharp toBuffer error", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockRejectedValue(new Error("Image decode failed")),
            metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Image decode failed",
      );
    });
  });

  describe("edge cases", () => {
    it("handles zero dimensions from metadata", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
            metadata: vi.fn().mockResolvedValue({ width: undefined, height: undefined }),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR);

      // Should not throw; dimensions default to 0
      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.timeout).toBe(300000); // min timeout since megapixels = 0
    });

    it("propagates segfault from bridge", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process crashed (segmentation fault)"),
      );

      await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("segmentation fault");
    });

    it("propagates readFile error after successful Python run", async () => {
      vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT: output missing"));

      await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("output missing");
    });

    it("propagates writeFile error", async () => {
      vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC: disk full"));

      await expect(noiseRemoval(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("disk full");
    });
  });

  describe.skipIf(!hasPython)("noise_removal.py tile blending weights (issue #1085)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const pyDir = resolve(here, "../../../packages/ai/python");

    function runPy(code: string) {
      return spawnSync(pythonBin as string, ["-c", code], {
        encoding: "utf8",
        timeout: 30_000,
      });
    }

    it("builds a partition-of-unity weight map across borders, corners, and overlaps on a fixed grid", () => {
      const res = runPy(`
import importlib.util, os, sys

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)
spec = importlib.util.spec_from_file_location("noise_removal_mod", os.path.join(py_dir, "noise_removal.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

for h, w in [(400, 400), (512, 512), (513, 513), (992, 992), (993, 993), (1100, 1100), (2049, 1500)]:
    for ov in (0, 32, 64, 256):
        weights = mod._build_tile_weight_map(h, w, 512, ov)
        assert len(weights) == h and len(weights[0]) == w, (h, w, len(weights), len(weights[0]))
        flat = [v for row in weights for v in row]
        w_min, w_max = min(flat), max(flat)
        assert w_min > 0.5 and w_max < 2.5, (h, w, ov, w_min, w_max)
        assert abs(w_min - 1.0) < 1e-9 and abs(w_max - 1.0) < 1e-9, (h, w, ov, w_min, w_max)
        # Corners and borders must not fade below 1.0
        for cy, cx in [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)]:
            assert abs(weights[cy][cx] - 1.0) < 1e-9, (h, w, ov, cy, cx, weights[cy][cx])

# Fixed grid: adjacent tiles along an axis overlap by exactly overlap pixels, never shifted back
tiles = mod._tile_grid(1100, 1100, 512, 32)
ys = sorted({(y0, y1) for y0, y1, _, _ in tiles})
assert ys == [(0, 512), (480, 992), (960, 1100)], ys
for (_, prev_end), (next_start, _) in zip(ys, ys[1:]):
    assert prev_end - next_start == 32, (prev_end, next_start)

# Reject invalid geometry
for bad_args in [(0, 100, 512, 32), (100, 0, 512, 32), (100, 100, 0, 0), (100, 100, 64, -1), (100, 100, 64, 33)]:
    try:
        mod._build_tile_weight_map(*bad_args)
    except ValueError:
        pass
    else:
        raise AssertionError(f"Expected ValueError for {bad_args}")

print("WEIGHT_MAP_OK")
`);
      expect(res.stderr).toBe("");
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("WEIGHT_MAP_OK");
    });

    it("runs _tile_process with reflect-padded final tiles, preserves flat images without seams, and enforces weight bounds", () => {
      const res = runPy(`
import importlib.util, os, sys, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)
spec = importlib.util.spec_from_file_location("noise_removal_mod", os.path.join(py_dir, "noise_removal.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class FakeTensor:
    def __init__(self, data):
        # data is 2D list [h][w] representing (1, 1, h, w)
        self.data = [list(row) for row in data]

    @property
    def shape(self):
        return (1, 1, len(self.data), len(self.data[0]) if self.data else 0)

    @property
    def dtype(self):
        return "float32"

    def view(self, b, c, h, w):
        if w == 1:
            return FakeTensor([[self.data[0][r]] for r in range(h)])
        if h == 1:
            return FakeTensor([[self.data[0][col] for col in range(w)]])
        return self

    def __getitem__(self, idx):
        _, _, ys, xs = idx
        rows = self.data[ys] if isinstance(ys, slice) else [self.data[ys]]
        return FakeTensor([r[xs] if isinstance(xs, slice) else [r[xs]] for r in rows])

    def __setitem__(self, idx, val):
        _, _, ys, xs = idx
        h_idx = range(*ys.indices(len(self.data)))
        w_idx = range(*xs.indices(len(self.data[0])))
        for i, r in enumerate(h_idx):
            for j, c in enumerate(w_idx):
                self.data[r][c] = val.data[i][j]

    def __mul__(self, other):
        h = max(len(self.data), len(other.data))
        w = max(len(self.data[0]), len(other.data[0]))
        out = []
        for r in range(h):
            sv = self.data[r if len(self.data) > 1 else 0]
            ov = other.data[r if len(other.data) > 1 else 0]
            out.append([
                sv[c if len(sv) > 1 else 0] * ov[c if len(ov) > 1 else 0]
                for c in range(w)
            ])
        return FakeTensor(out)

    def __add__(self, other):
        h, w = len(self.data), len(self.data[0])
        return FakeTensor([[self.data[r][c] + other.data[r][c] for c in range(w)] for r in range(h)])

    def __iadd__(self, other):
        for r in range(len(self.data)):
            for c in range(len(self.data[0])):
                self.data[r][c] += other.data[r][c]
        return self

    def __truediv__(self, other):
        h, w = len(self.data), len(self.data[0])
        return FakeTensor([[self.data[r][c] / other.data[r][c] for c in range(w)] for r in range(h)])

    def min(self):
        return min(v for row in self.data for v in row)

    def max(self):
        return max(v for row in self.data for v in row)

torch_mod = types.ModuleType("torch")
torch_mod.zeros = lambda shape, device=None, dtype=None: FakeTensor([[0.0] * shape[3] for _ in range(shape[2])])
torch_mod.zeros_like = lambda t: FakeTensor([[0.0] * t.shape[3] for _ in range(t.shape[2])])
torch_mod.tensor = lambda seq, dtype=None, device=None: FakeTensor([list(seq)])
torch_mod.clamp = lambda t, min=None, max=None: FakeTensor([
    [
        (min if min is not None and v < min else (max if max is not None and v > max else v))
        for v in row
    ]
    for row in t.data
])

nn_mod = types.ModuleType("torch.nn")
F_mod = types.ModuleType("torch.nn.functional")

def fake_pad(t, pad, mode="constant"):
    pad_l, pad_r, pad_t, pad_b = pad
    _, _, h, w = t.shape
    if mode == "reflect":
        if pad_r >= w or pad_b >= h or pad_l >= w or pad_t >= h:
            raise RuntimeError(f"Padding size should be less than input dimension: pad={pad} shape={(h, w)}")
        rows = [list(r) for r in t.data]
        for i in range(pad_b):
            rows.append(list(rows[h - 2 - i]))
        out = []
        for r in rows:
            out.append(r + [r[w - 2 - j] for j in range(pad_r)])
        return FakeTensor(out)
    if mode == "replicate":
        rows = [list(r) for r in t.data]
        for _ in range(pad_b):
            rows.append(list(rows[-1]))
        out = [r + [r[-1]] * pad_r for r in rows]
        return FakeTensor(out)
    raise ValueError(mode)

F_mod.pad = fake_pad
nn_mod.functional = F_mod
torch_mod.nn = nn_mod
sys.modules["torch"] = torch_mod
sys.modules["torch.nn"] = nn_mod
sys.modules["torch.nn.functional"] = F_mod

# Direct reflect-padding check on a 2x3 non-uniform tensor padded to 5x6 (multi-step reflect)
small = FakeTensor([[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]])
padded = mod._reflect_pad_bottom_right(small, 3, 3)
assert padded.shape == (1, 1, 5, 6), padded.shape
assert padded.data[0] == [1.0, 2.0, 3.0, 2.0, 1.0, 2.0], padded.data[0]
assert padded.data[2] == [1.0, 2.0, 3.0, 2.0, 1.0, 2.0], padded.data[2]

for bad_pad in [(-1, 0), (0, -1)]:
    try:
        mod._reflect_pad_bottom_right(small, *bad_pad)
    except ValueError:
        pass
    else:
        raise AssertionError(f"Expected ValueError for negative pad {bad_pad}")

seen_shapes = []
def identity_model(tile):
    seen_shapes.append(tile.shape)
    return FakeTensor([[v + 0.05 for v in row] for row in tile.data])

# 125x136 with tile_size=64, overlap=8 (step=56) -> 3x3 = 9 tiles where final row has
# th=13 (pad_h=51 > th, multi-step vertical reflect) and final col has tw=24 (pad_w=40 > tw)
inp = FakeTensor([[r * 0.001 + c * 0.0001 for c in range(136)] for r in range(125)])
out = mod._tile_process(identity_model, inp, tile_size=64, overlap=8)
assert len(seen_shapes) == 9 and all(s == (1, 1, 64, 64) for s in seen_shapes), seen_shapes
for r in range(125):
    for c in range(136):
        expected = inp.data[r][c] + 0.05
        assert abs(out.data[r][c] - expected) < 1e-9, (r, c, out.data[r][c], expected)

# 1px height (1x70) and 1px width (70x1) exercise replicate fallback before reflect
inp_1h = FakeTensor([[0.25 + c * 0.001 for c in range(70)]])
out_1h = mod._tile_process(identity_model, inp_1h, tile_size=64, overlap=8)
assert max(abs(out_1h.data[0][c] - (inp_1h.data[0][c] + 0.05)) for c in range(70)) < 1e-9

inp_1w = FakeTensor([[0.25 + r * 0.001] for r in range(70)])
out_1w = mod._tile_process(identity_model, inp_1w, tile_size=64, overlap=8)
assert max(abs(out_1w.data[r][0] - (inp_1w.data[r][0] + 0.05)) for r in range(70)) < 1e-9

# Invariant guard: if a ramp returns malformed weights (<=0.5 or >=2.5), _tile_process raises RuntimeError
orig_ramps = mod._tile_edge_ramps
for bad_factor in (0.1, 2.0):
    mod._tile_edge_ramps = lambda y0, y1, x0, x1, h, w, ov, f=bad_factor: ([f] * (y1 - y0), [f] * (x1 - x0))
    try:
        mod._tile_process(identity_model, inp, tile_size=64, overlap=8)
    except RuntimeError:
        pass
    else:
        raise AssertionError(f"Expected RuntimeError for bad_factor={bad_factor}")
    finally:
        mod._tile_edge_ramps = orig_ramps

print("TILE_PROCESS_OK")
`);
      expect(res.status, res.stderr).toBe(0);
      expect(res.stderr).toContain('"stage": "Processing tile 9/9"');
      expect(res.stdout).toContain("TILE_PROCESS_OK");
    });
  });
});
