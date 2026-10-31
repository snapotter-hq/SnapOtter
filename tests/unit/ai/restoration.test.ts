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
import { restorePhoto } from "../../../packages/ai/src/restoration.js";

const FAKE_INPUT = Buffer.from("fake-old-photo");
const FAKE_OUTPUT_DIR = "/tmp/test-restore";

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
    steps: ["denoise", "face_enhance"],
    scratchCoverage: 0.15,
    facesEnhanced: 2,
    isGrayscale: true,
    colorized: true,
  });
  vi.mocked(sharp).mockImplementation(
    () =>
      ({
        png: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png-data")),
      }) as unknown as ReturnType<typeof sharp>,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("restorePhoto", () => {
  describe("request serialization", () => {
    it("calls restore.py with correct file paths", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "restore.py",
        [`${FAKE_OUTPUT_DIR}/input_restore.png`, `${FAKE_OUTPUT_DIR}/output_restore.png`, "{}"],
        expect.any(Object),
      );
    });

    it("serializes scratchRemoval option", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, { scratchRemoval: true });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ scratchRemoval: true });
    });

    it("serializes faceEnhancement option", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, { faceEnhancement: true });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ faceEnhancement: true });
    });

    it("serializes fidelity option", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, { fidelity: 0.8 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ fidelity: 0.8 });
    });

    it("serializes denoise and denoiseStrength options", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, { denoise: true, denoiseStrength: 0.5 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ denoise: true, denoiseStrength: 0.5 });
    });

    it("serializes colorize option", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, { colorize: true });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ colorize: true });
    });

    it("serializes colorizeStrength option", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, { colorizeStrength: 60 });

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({ colorizeStrength: 60 });
    });

    it("serializes all options together", async () => {
      const allOptions = {
        scratchRemoval: true,
        faceEnhancement: true,
        fidelity: 0.8,
        denoise: true,
        denoiseStrength: 0.5,
        colorize: true,
        colorizeStrength: 75,
      };
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, allOptions);

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual(allOptions);
    });

    it("converts input to PNG before writing", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(sharp).toHaveBeenCalledWith(FAKE_INPUT);
    });
  });

  describe("response parsing", () => {
    it("returns RestorePhotoResult with all fields populated", async () => {
      const result = await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(result).toEqual({
        buffer: expect.any(Buffer),
        width: 800,
        height: 600,
        steps: ["denoise", "face_enhance"],
        scratchCoverage: 0.15,
        facesEnhanced: 2,
        isGrayscale: true,
        colorized: true,
      });
    });

    it("reads from default output path", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);

      expect(readFile).toHaveBeenCalledWith(`${FAKE_OUTPUT_DIR}/output_restore.png`);
    });

    it("reads from alternate output_path when provided", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
        output_path: "/tmp/alt-restore.webp",
      });

      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(readFile).toHaveBeenCalledWith("/tmp/alt-restore.webp");
    });

    it("defaults steps to empty array when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 400,
        height: 300,
      });

      const result = await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.steps).toEqual([]);
    });

    it("defaults scratchCoverage to 0 when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 400,
        height: 300,
      });

      const result = await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.scratchCoverage).toBe(0);
    });

    it("defaults facesEnhanced to 0 when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 400,
        height: 300,
      });

      const result = await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.facesEnhanced).toBe(0);
    });

    it("defaults isGrayscale to false when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 400,
        height: 300,
      });

      const result = await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.isGrayscale).toBe(false);
    });

    it("defaults colorized to false when absent", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 400,
        height: 300,
      });

      const result = await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.colorized).toBe(false);
    });

    it("preserves multi-step restoration pipeline info", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 800,
        height: 600,
        steps: ["scratch_removal", "denoise", "face_enhance", "colorize"],
        scratchCoverage: 0.3,
        facesEnhanced: 4,
        isGrayscale: true,
        colorized: true,
      });

      const result = await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.steps).toHaveLength(4);
      expect(result.scratchCoverage).toBe(0.3);
      expect(result.facesEnhanced).toBe(4);
    });
  });

  describe("error handling", () => {
    it("throws with custom error from Python", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: false,
        error: "CodeFormer model weights not found",
      });

      await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "CodeFormer model weights not found",
      );
    });

    it("throws fallback error when success: false without error string", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({ success: false });

      await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
        "Photo restoration failed",
      );
    });

    it("propagates bridge timeout", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(new Error("Python script timed out"));

      await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("timed out");
    });

    it("propagates OOM errors", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process killed (out of memory)"),
      );

      await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("out of memory");
    });
  });

  describe("onProgress forwarding", () => {
    it("passes onProgress to bridge", async () => {
      const onProgress = vi.fn();
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, {}, onProgress);

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "restore.py",
        expect.any(Array),
        expect.objectContaining({ onProgress }),
      );
    });

    it("omits onProgress when not provided", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);

      const options = vi.mocked(runPythonWithProgress).mock.calls[0][2];
      expect(options.onProgress).toBeUndefined();
    });

    it("hands the abort signal to the sidecar call", async () => {
      const { signal } = new AbortController();
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR, { signal });

      expect(runPythonWithProgress).toHaveBeenCalledWith(
        "restore.py",
        expect.any(Array),
        expect.objectContaining({ signal }),
      );
      expect(vi.mocked(runPythonWithProgress).mock.calls[0][1][2]).toBe("{}");
    });
  });

  describe("sharp conversion errors", () => {
    it("propagates sharp toBuffer error", async () => {
      vi.mocked(sharp).mockImplementation(
        () =>
          ({
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockRejectedValue(new Error("Damaged TIFF")),
          }) as unknown as ReturnType<typeof sharp>,
      );

      await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Damaged TIFF");
    });
  });

  describe("edge cases", () => {
    it("propagates writeFile error", async () => {
      vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC: disk full"));

      await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("disk full");
    });

    it("propagates readFile error after successful Python run", async () => {
      vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT: output missing"));

      await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("output missing");
    });

    it("passes empty options as empty JSON object", async () => {
      await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);

      const args = vi.mocked(runPythonWithProgress).mock.calls[0][1];
      expect(JSON.parse(args[2])).toEqual({});
    });

    it("handles single-step restoration pipeline", async () => {
      vi.mocked(parseStdoutJson).mockReturnValue({
        success: true,
        width: 400,
        height: 300,
        steps: ["denoise"],
        scratchCoverage: 0,
        facesEnhanced: 0,
        isGrayscale: false,
        colorized: false,
      });

      const result = await restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR);
      expect(result.steps).toEqual(["denoise"]);
    });

    it("propagates segfault from bridge", async () => {
      vi.mocked(runPythonWithProgress).mockRejectedValue(
        new Error("Process crashed (segmentation fault)"),
      );

      await expect(restorePhoto(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("segmentation fault");
    });
  });

  describe.skipIf(!hasPython)(
    "restore.py tile blending weights and _inpaint_tiled (issue #2588)",
    () => {
      const here = dirname(fileURLToPath(import.meta.url));
      const pyDir = resolve(here, "../../../packages/ai/python");

      function runPy(code: string) {
        return spawnSync(pythonBin as string, ["-c", code], {
          encoding: "utf8",
          timeout: 30_000,
        });
      }

      it("builds a partition-of-unity weight map across borders, corners, and 128px overlaps on a fixed grid", () => {
        const res = runPy(`
import importlib.util, os, sys

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)
spec = importlib.util.spec_from_file_location("restore_mod", os.path.join(py_dir, "restore.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

assert mod.LAMA_MODEL_SIZE == 512
assert mod.LAMA_TILE_OVERLAP == 128

for h, w in [
    (400, 400),
    (512, 512),
    (513, 513),
    (896, 896),
    (897, 897),
    (1100, 1100),
    (100, 800),
    (800, 100),
]:
    for ov in (0, 32, 64, 128, 256):
        weights = mod._build_tile_weight_map(h, w, 512, ov)
        assert len(weights) == h and len(weights[0]) == w, (h, w, len(weights), len(weights[0]))
        flat = [v for row in weights for v in row]
        w_min, w_max = min(flat), max(flat)
        assert w_min > 0.5 and w_max < 2.5, (h, w, ov, w_min, w_max)
        assert abs(w_min - 1.0) < 1e-9 and abs(w_max - 1.0) < 1e-9, (h, w, ov, w_min, w_max)
        # Row 0, col 0, row h-1, col w-1, and all corners must stay at 1.0 (never 0.0)
        for cy, cx in [(0, 0), (0, w // 2), (0, w - 1), (h // 2, 0), (h - 1, 0), (h - 1, w - 1)]:
            assert abs(weights[cy][cx] - 1.0) < 1e-9, (h, w, ov, cy, cx, weights[cy][cx])

# Large multi-tile frame at the default 512px tile size and 128px overlap
w_large = mod._build_tile_weight_map(2049, 1500)
flat_large = [v for row in w_large for v in row]
assert abs(min(flat_large) - 1.0) < 1e-9 and abs(max(flat_large) - 1.0) < 1e-9

# Fixed grid at default tile_size=512, overlap=128 (step=384): adjacent tiles overlap by 128px, never shifted backward
tiles = mod._tile_grid(1100, 1100, 512, 128)
ys = sorted({(y0, y1) for y0, y1, _, _ in tiles})
assert ys == [(0, 512), (384, 896), (768, 1100)], ys
for (_, prev_end), (next_start, _) in zip(ys, ys[1:]):
    assert prev_end - next_start == 128, (prev_end, next_start)

# Reject invalid geometry
for bad_args in [(0, 100, 512, 128), (100, 0, 512, 128), (100, 100, 0, 0), (100, 100, 64, -1), (100, 100, 64, 33)]:
    try:
        mod._build_tile_weight_map(*bad_args)
    except ValueError:
        pass
    else:
        raise AssertionError(f"Expected ValueError for {bad_args}")

print("RESTORE_WEIGHT_MAP_OK")
`);
        expect(res.stderr).toBe("");
        expect(res.status).toBe(0);
        expect(res.stdout).toContain("RESTORE_WEIGHT_MAP_OK");
      });

      it("runs _inpaint_tiled without zeroing row 0 or col 0, pads final tiles on a fixed grid, and enforces weight bounds", () => {
        const res = runPy(`
import contextlib, importlib.util, io, json, os, sys, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)
spec = importlib.util.spec_from_file_location("restore_mod", os.path.join(py_dir, "restore.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class FakeArray:
    """Minimal 2D (h, w) or 3D (h, w, c) array supporting _inpaint_tiled without numpy."""
    def __init__(self, data, dtype="float64"):
        self.data = data
        self.dtype = dtype

    @property
    def ndim(self):
        return 3 if (self.data and isinstance(self.data[0][0], list)) else 2

    @property
    def shape(self):
        h = len(self.data)
        w = len(self.data[0]) if h else 0
        if self.ndim == 3:
            c = len(self.data[0][0]) if w else 0
            return (h, w, c)
        return (h, w)

    def astype(self, dtype):
        if self.ndim == 3:
            conv = int if "int" in str(dtype) else float
            return FakeArray(
                [[[conv(v) for v in px] for px in row] for row in self.data],
                dtype=str(dtype),
            )
        conv = int if "int" in str(dtype) else float
        return FakeArray([[conv(v) for v in row] for row in self.data], dtype=str(dtype))

    def __getitem__(self, idx):
        if isinstance(idx, tuple) and len(idx) == 3 and idx[2] == "newaxis":
            ys, xs, _ = idx
            sub = self[ys, xs]
            return FakeArray([[[v] for v in row] for row in sub.data], dtype=self.dtype)
        if isinstance(idx, tuple) and len(idx) == 2:
            ys, xs = idx
            rows = self.data[ys] if isinstance(ys, slice) else [self.data[ys]]
            if self.ndim == 3:
                return FakeArray(
                    [[list(px) for px in (r[xs] if isinstance(xs, slice) else [r[xs]])] for r in rows],
                    dtype=self.dtype,
                )
            return FakeArray(
                [list(r[xs] if isinstance(xs, slice) else [r[xs]]) for r in rows],
                dtype=self.dtype,
            )
        raise IndexError(f"Unsupported index: {idx}")

    def __setitem__(self, idx, val):
        ys, xs = idx
        h_idx = range(*ys.indices(len(self.data)))
        w_idx = range(*xs.indices(len(self.data[0])))
        for i, r in enumerate(h_idx):
            for j, c in enumerate(w_idx):
                if self.ndim == 3:
                    self.data[r][c] = list(val.data[i][j])
                else:
                    self.data[r][c] = val.data[i][j]

    def _binop(self, other, op):
        h, w = self.shape[:2]
        if self.ndim == 3:
            c = self.shape[2]
            out = []
            for r in range(h):
                row = []
                for col in range(w):
                    px_a = self.data[r][col]
                    px_b = other.data[r][col]
                    row.append([
                        op(px_a[k], px_b[k if len(px_b) > 1 else 0])
                        for k in range(c)
                    ])
                out.append(row)
            return FakeArray(out, dtype="float64")
        return FakeArray(
            [[op(self.data[r][col], other.data[r][col]) for col in range(w)] for r in range(h)],
            dtype="float64",
        )

    def __mul__(self, other):
        return self._binop(other, lambda a, b: a * b)

    def __add__(self, other):
        return self._binop(other, lambda a, b: a + b)

    def __iadd__(self, other):
        res = self._binop(other, lambda a, b: a + b)
        self.data = res.data
        return self

    def __truediv__(self, other):
        return self._binop(other, lambda a, b: a / b)

    def min(self):
        if self.ndim == 3:
            return min(v for row in self.data for px in row for v in px)
        return min(v for row in self.data for v in row)

    def max(self):
        if self.ndim == 3:
            return max(v for row in self.data for px in row for v in px)
        return max(v for row in self.data for v in row)

# Match NumPy semantics: clip clamps without rounding, rint rounds to nearest integer, and astype(uint8) truncates via int()
fake_np = types.SimpleNamespace(
    float32="float32",
    float64="float64",
    uint8="uint8",
    newaxis="newaxis",
    zeros=lambda shape, dtype="float64": FakeArray(
        [[[0.0] * shape[2] for _ in range(shape[1])] for _ in range(shape[0])]
        if len(shape) == 3
        else [[0.0] * shape[1] for _ in range(shape[0])],
        dtype=dtype,
    ),
    asarray=lambda seq, dtype="float64": [float(v) for v in seq],
    outer=lambda a, b: FakeArray([[float(y) * float(x) for x in b] for y in a], dtype="float64"),
    count_nonzero=lambda arr: sum(
        1 for row in arr.data for v in row if (any(x != 0 for x in v) if isinstance(v, list) else v != 0)
    ),
    clip=lambda arr, lo, hi: FakeArray(
        [[[max(lo, min(hi, v)) for v in px] for px in row] for row in arr.data]
        if arr.ndim == 3
        else [[max(lo, min(hi, v)) for v in row] for row in arr.data],
        dtype=arr.dtype,
    ),
    rint=lambda arr: FakeArray(
        [[[round(v) for v in px] for px in row] for row in arr.data]
        if arr.ndim == 3
        else [[round(v) for v in row] for row in arr.data],
        dtype=arr.dtype,
    ),
)

def reflect101_idx(i, length):
    if length <= 1:
        return 0
    while i < 0 or i >= length:
        if i < 0:
            i = -i
        if i >= length:
            i = 2 * length - 2 - i
    return i

def fake_copy_make_border(arr, top, bottom, left, right, border_type, value=0):
    assert top == 0 and left == 0
    h, w = arr.shape[:2]
    out_h, out_w = h + bottom, w + right
    if border_type == "REFLECT_101":
        if arr.ndim == 3:
            return FakeArray(
                [
                    [list(arr.data[reflect101_idx(r, h)][reflect101_idx(c, w)]) for c in range(out_w)]
                    for r in range(out_h)
                ],
                dtype=arr.dtype,
            )
        return FakeArray(
            [[arr.data[reflect101_idx(r, h)][reflect101_idx(c, w)] for c in range(out_w)] for r in range(out_h)],
            dtype=arr.dtype,
        )
    if border_type == "CONSTANT":
        return FakeArray(
            [
                [arr.data[r][c] if (r < h and c < w) else value for c in range(out_w)]
                for r in range(out_h)
            ],
            dtype=arr.dtype,
        )
    raise ValueError(border_type)

fake_cv2 = types.SimpleNamespace(
    BORDER_REFLECT_101="REFLECT_101",
    BORDER_CONSTANT="CONSTANT",
    copyMakeBorder=fake_copy_make_border,
)

mod.np = fake_np
mod.cv2 = fake_cv2

seen_tiles = []
def fake_lama_single(_session, tile_img, tile_mask):
    seen_tiles.append((tile_img, tile_mask))
    th, tw, _ = tile_img.shape
    out = []
    for r in range(th):
        row = []
        for c in range(tw):
            if tile_mask.data[r][c] > 0:
                row.append([180, 140, 100])
            else:
                row.append(list(tile_img.data[r][c]))
        out.append(row)
    return FakeArray(out, dtype="uint8")

mod._lama_single = fake_lama_single

# 125x136 image with tile_size=64, overlap=16 (step=48) -> 3x3 = 9 tiles.
# Put damage along full row 0 (top border, reaching final col x=96..136), full col 0 (left border, reaching final row y=96..125),
# across the first seam (y=63..64, x=63..64), and at the bottom-right corner (H-1, W-1) inside the doubly-padded final tile (29x40 -> 64x64).
# Leave middle-right (y=48..112, x=96..136) and bottom-center (y=96..125, x=48..112) unmasked (count_nonzero == 0).
H, W = 125, 136
img_data = [[[180, 140, 100] for _ in range(W)] for _ in range(H)]
mask_data = [[0 for _ in range(W)] for _ in range(H)]
for c in range(W):
    img_data[0][c] = [255, 255, 255]
    mask_data[0][c] = 255
for r in range(H):
    img_data[r][0] = [255, 255, 255]
    mask_data[r][0] = 255
for r in (63, 64):
    for c in (63, 64):
        img_data[r][c] = [255, 255, 255]
        mask_data[r][c] = 255
img_data[H - 1][W - 1] = [250, 20, 10]
mask_data[H - 1][W - 1] = 255

img = FakeArray(img_data, dtype="uint8")
mask = FakeArray(mask_data, dtype="uint8")

res = mod._inpaint_tiled(img, mask, session="fake", tile_size=64, overlap=16)
assert res.shape == (H, W, 3), res.shape
# 7 of the 9 tiles contain mask pixels (including doubly-padded bottom-right 29x40 tile); 2 are unmasked
assert len(seen_tiles) == 7 and all((ti.shape, tm.shape) == ((64, 64, 3), (64, 64)) for ti, tm in seen_tiles)

# Verify the doubly-padded bottom-right tile (th=29, tw=40 -> 64x64):
# - tile_mask in the padded region (r >= 29 or c >= 40) must be 0 (BORDER_CONSTANT, value=0) even though (28, 39) is 255
# - tile_img in the padded region must reflect non-zero image pixels (BORDER_REFLECT_101), not 0
br_img, br_mask = seen_tiles[-1]
assert br_mask.data[28][39] == 255
for r in range(64):
    for c in range(64):
        if r >= 29 or c >= 40:
            assert br_mask.data[r][c] == 0, (r, c, br_mask.data[r][c])
            assert br_img.data[r][c] == [180, 140, 100], (r, c, br_img.data[r][c])

# Every pixel (including row 0, col 0, bottom-right corner, and seam y=63..64) must equal [180, 140, 100], never [0, 0, 0] or truncated 179/139
for r in range(H):
    for c in range(W):
        assert res.data[r][c] == [180, 140, 100], (r, c, res.data[r][c])

# Non-uniform gradient across all 9 tiles: verify exact reconstruction without seam steps
grad_data = [[[(r + c) % 200, (r * 2) % 200, (c * 2) % 200] for c in range(W)] for r in range(H)]
zero_mask = FakeArray([[0 for _ in range(W)] for _ in range(H)], dtype="uint8")
grad_res = mod._inpaint_tiled(FakeArray(grad_data, dtype="uint8"), zero_mask, session="fake", tile_size=64, overlap=16)
for r in range(H):
    for c in range(W):
        assert grad_res.data[r][c] == grad_data[r][c], (r, c, grad_res.data[r][c], grad_data[r][c])

# 1px height (1x70) and 1px width (70x1) boundary shapes
img_1h = FakeArray([[[120, 80, 40] for _ in range(70)]], dtype="uint8")
mask_1h = FakeArray([[255] + [0] * 69], dtype="uint8")
img_1h.data[0][0] = [255, 255, 255]
out_1h = mod._inpaint_tiled(img_1h, mask_1h, session="fake", tile_size=64, overlap=16)
assert out_1h.data[0][0] == [180, 140, 100] and out_1h.data[0][69] == [120, 80, 40]

img_1w = FakeArray([[[120, 80, 40]] for _ in range(70)], dtype="uint8")
mask_1w = FakeArray([[255]] + [[0]] * 69, dtype="uint8")
img_1w.data[0][0] = [255, 255, 255]
out_1w = mod._inpaint_tiled(img_1w, mask_1w, session="fake", tile_size=64, overlap=16)
assert out_1w.data[0][0] == [180, 140, 100] and out_1w.data[69][0] == [120, 80, 40]

# Invariant guard: if _tile_edge_ramps returns malformed weights (<=0.5 or >=2.5), _inpaint_tiled raises RuntimeError
orig_ramps = mod._tile_edge_ramps
for bad_factor in (0.1, 2.0):
    mod._tile_edge_ramps = lambda y0, y1, x0, x1, h, w, ov, f=bad_factor: ([f] * (y1 - y0), [f] * (x1 - x0))
    try:
        mod._inpaint_tiled(img, mask, session="fake", tile_size=64, overlap=16)
    except RuntimeError:
        pass
    else:
        raise AssertionError(f"Expected RuntimeError for bad_factor={bad_factor}")
    finally:
        mod._tile_edge_ramps = orig_ramps

# Missing-dependency guard in main() exits with status 1 and prints expected JSON for both libGL and standard ImportErrors
orig_err = mod._IMPORT_ERROR
for err_msg, expected_hint in [
    ("libGL.so.1: cannot open shared object file", "Fix with: apt-get install -y libgl1"),
    ("No module named 'cv2'", "Install opencv-python-headless, numpy, and Pillow."),
]:
    mod._IMPORT_ERROR = ImportError(err_msg)
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            mod.main()
    except SystemExit as exc:
        assert exc.code == 1
        payload = json.loads(buf.getvalue().strip())
        assert expected_hint in payload["error"], payload
    else:
        raise AssertionError(f"Expected SystemExit(1) for {err_msg}")
    finally:
        mod._IMPORT_ERROR = orig_err

print("RESTORE_INPAINT_TILED_OK")
`);
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("RESTORE_INPAINT_TILED_OK");
      });

      it("gates restore.py device and 2 MP CPU colorization cap on onnx_gpu_available rather than torch_gpu_available (issue #2576)", () => {
        const res = runPy(`
import contextlib, importlib.util, io, json, os, sys, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)
import gpu

spec = importlib.util.spec_from_file_location("restore_mod", os.path.join(py_dir, "restore.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

# Stub cv2, numpy, is_grayscale, and colorize_bw so main() exercises the real
# GPU probe + 2 MP colorization gate on a 5 MP (2000x2500) grayscale image.
class FakeImg:
    shape = (2000, 2500, 3)
    def copy(self):
        return self

mod._IMPORT_ERROR = None
mod.cv2 = types.SimpleNamespace(
    IMREAD_COLOR=1,
    imread=lambda _p, _f: FakeImg(),
    imwrite=lambda _p, _img: True,
)
mod.is_grayscale = lambda _img: True
mod.DDCOLOR_MODEL_PATH = os.path.join(py_dir, "restore.py")
colorize_calls = []
def fake_colorize_bw(img, intensity=0.85):
    colorize_calls.append(intensity)
    return img, True
mod.colorize_bw = fake_colorize_bw

settings = json.dumps({
    "scratchRemoval": False,
    "faceEnhancement": False,
    "denoise": False,
    "colorize": True,
})

# Case 1: Torch has CUDA, but ONNX Runtime is CPU-only (#490).
# restore.py runs all models via ONNX Runtime, so it must treat the host as CPU
# and skip colorizing a 5 MP image (> 2 MP CPU cap).
gpu.torch_gpu_available = lambda: True
gpu.onnx_gpu_available = lambda: False
sys.argv = ["restore.py", "/tmp/in.png", "/tmp/out.png", settings]
out_buf = io.StringIO()
err_buf = io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()

payload_cpu = json.loads(out_buf.getvalue().strip())
assert payload_cpu["success"] is True, payload_cpu
assert payload_cpu["device"] == "cpu", payload_cpu
assert payload_cpu["colorized"] is False, payload_cpu
assert colorize_calls == [], colorize_calls
assert "Colorization skipped: image too large for CPU (5.0MP, max 2MP)" in err_buf.getvalue(), err_buf.getvalue()

# Case 2: Torch is CPU-only, but ONNX Runtime has CUDAExecutionProvider.
# restore.py must detect CUDA via onnx_gpu_available() and colorize the 5 MP image.
gpu.torch_gpu_available = lambda: False
gpu.onnx_gpu_available = lambda: True
out_buf = io.StringIO()
err_buf = io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()

payload_gpu = json.loads(out_buf.getvalue().strip())
assert payload_gpu["success"] is True, payload_gpu
assert payload_gpu["device"] == "cuda", payload_gpu
assert payload_gpu["colorized"] is True, payload_gpu
assert "colorize" in payload_gpu["steps"], payload_gpu
assert len(colorize_calls) == 1, colorize_calls

print("RESTORE_ONNX_GPU_GATE_OK")
`);
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("RESTORE_ONNX_GPU_GATE_OK");
      });

      it("enforces the 8 MP GPU colorization ceiling and emits structured stderr warnings on step skips and failures (issue #3078)", () => {
        const res = runPy(`
import contextlib, importlib.util, io, json, os, sys, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)
import gpu

spec = importlib.util.spec_from_file_location("restore_mod", os.path.join(py_dir, "restore.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

current_shape = (3000, 4000, 3)

class FakeImg:
    def __init__(self, shape):
        self.shape = shape
    def copy(self):
        return self

mod._IMPORT_ERROR = None
mod.cv2 = types.SimpleNamespace(
    IMREAD_COLOR=1,
    imread=lambda _p, _f: FakeImg(current_shape),
    imwrite=lambda _p, _img: True,
)
mod.is_grayscale = lambda _img: True
mod.DDCOLOR_MODEL_PATH = os.path.join(py_dir, "restore.py")

colorize_calls = []
def ok_colorize_bw(img, intensity=0.85):
    colorize_calls.append(intensity)
    return img, True

def parse_stderr_events(raw):
    return [json.loads(line) for line in raw.strip().splitlines() if line.strip()]

# 1. 12 MP (3000x4000) grayscale image on GPU (> 8 MP GPU ceiling): must skip colorization and emit warning + progress
gpu.onnx_gpu_available = lambda: True
mod.colorize_bw = ok_colorize_bw
settings_colorize_only = json.dumps({
    "scratchRemoval": False,
    "faceEnhancement": False,
    "denoise": False,
    "colorize": True,
})
sys.argv = ["restore.py", "/tmp/in.png", "/tmp/out.png", settings_colorize_only]
out_buf, err_buf = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()

payload_12mp = json.loads(out_buf.getvalue().strip())
events_12mp = parse_stderr_events(err_buf.getvalue())
assert payload_12mp["success"] is True, payload_12mp
assert payload_12mp["device"] == "cuda", payload_12mp
assert payload_12mp["colorized"] is False, payload_12mp
assert "colorize" not in payload_12mp["steps"], payload_12mp
assert colorize_calls == [], colorize_calls
assert {"warning": "[restore] Colorization skipped: image too large for GPU (12.0MP, max 8MP)"} in events_12mp, events_12mp
assert {"progress": 92, "stage": "Colorization skipped: image too large for GPU (12.0MP, max 8MP)"} in events_12mp, events_12mp

# 2. Exact 8 MP boundary (2000x4000 = 8,000,000 px) on GPU and exact 2 MP boundary (1000x2000 = 2,000,000 px) on CPU are allowed without warnings
current_shape = (2000, 4000, 3)
out_buf, err_buf = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()
payload_8mp = json.loads(out_buf.getvalue().strip())
events_8mp = parse_stderr_events(err_buf.getvalue())
assert payload_8mp["colorized"] is True, payload_8mp
assert len(colorize_calls) == 1, colorize_calls
assert not any("warning" in e for e in events_8mp), events_8mp

colorize_calls.clear()
current_shape = (1000, 2000, 3)
gpu.onnx_gpu_available = lambda: False
out_buf, err_buf = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()
payload_2mp = json.loads(out_buf.getvalue().strip())
events_2mp = parse_stderr_events(err_buf.getvalue())
assert payload_2mp["colorized"] is True, payload_2mp
assert len(colorize_calls) == 1, colorize_calls
assert not any("warning" in e for e in events_2mp), events_2mp

# 3. 5 MP (2000x2500) on CPU (> 2 MP CPU ceiling) emits structured warning + progress
colorize_calls.clear()
current_shape = (2000, 2500, 3)
gpu.onnx_gpu_available = lambda: False
out_buf, err_buf = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()
events_5mp_cpu = parse_stderr_events(err_buf.getvalue())
assert colorize_calls == [], colorize_calls
assert {"warning": "[restore] Colorization skipped: image too large for CPU (5.0MP, max 2MP)"} in events_5mp_cpu, events_5mp_cpu
assert {"progress": 92, "stage": "Colorization skipped: image too large for CPU (5.0MP, max 2MP)"} in events_5mp_cpu, events_5mp_cpu

# 4. Missing DDCOLOR_MODEL_PATH emits structured warning + progress
current_shape = (1000, 1000, 3)
mod.DDCOLOR_MODEL_PATH = "/tmp/nonexistent-ddcolor-model-3078.onnx"
out_buf, err_buf = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()
events_missing_model = parse_stderr_events(err_buf.getvalue())
assert {"warning": "[restore] Colorization skipped: DDColor model not installed"} in events_missing_model, events_missing_model
assert {"progress": 92, "stage": "Colorization skipped: DDColor model not installed"} in events_missing_model, events_missing_model

# 5. enhance_faces and colorize_bw exceptions emit full detail in structured stderr warnings and truncated detail[:40] in progress
mod.DDCOLOR_MODEL_PATH = os.path.join(py_dir, "restore.py")
long_face_err = "CodeFormer ONNX Runtime execution provider failed on node_42_conv"
long_color_err = "DDColor ONNX Runtime kernel launch error: invalid configuration argument"
def fail_faces(_img, _fidelity=0.7):
    raise RuntimeError(long_face_err)
def fail_colorize(_img, intensity=0.85):
    raise ValueError(long_color_err)
mod.enhance_faces = fail_faces
mod.colorize_bw = fail_colorize

settings_both = json.dumps({
    "scratchRemoval": False,
    "faceEnhancement": True,
    "denoise": False,
    "colorize": True,
})
sys.argv = ["restore.py", "/tmp/in.png", "/tmp/out.png", settings_both]
out_buf, err_buf = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()

payload_err = json.loads(out_buf.getvalue().strip())
events_err = parse_stderr_events(err_buf.getvalue())
assert payload_err["success"] is True, payload_err
assert payload_err["facesEnhanced"] == 0, payload_err
assert payload_err["colorized"] is False, payload_err
assert {"warning": f"[restore] Face enhancement skipped: {long_face_err}"} in events_err, events_err
assert {"progress": 65, "stage": f"Face enhancement skipped: {long_face_err[:40]}"} in events_err, events_err
assert {"warning": f"[restore] Colorization skipped: {long_color_err}"} in events_err, events_err
assert {"progress": 92, "stage": f"Colorization skipped: {long_color_err[:40]}"} in events_err, events_err

# 6. Empty exception messages fall back to exception class name in both warning and progress
mod.enhance_faces = lambda _img, _fidelity=0.7: (_ for _ in ()).throw(RuntimeError())
mod.colorize_bw = lambda _img, intensity=0.85: (_ for _ in ()).throw(KeyError())
out_buf, err_buf = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()
events_empty_err = parse_stderr_events(err_buf.getvalue())
assert {"warning": "[restore] Face enhancement skipped: RuntimeError"} in events_empty_err, events_empty_err
assert {"progress": 65, "stage": "Face enhancement skipped: RuntimeError"} in events_empty_err, events_empty_err
assert {"warning": "[restore] Colorization skipped: KeyError"} in events_empty_err, events_empty_err
assert {"progress": 92, "stage": "Colorization skipped: KeyError"} in events_empty_err, events_empty_err

# 7. colorize_bw returning (img, False) emits structured warning + progress
mod.enhance_faces = lambda img, _fidelity=0.7: (img, 0)
mod.colorize_bw = lambda img, intensity=0.85: (img, False)
out_buf, err_buf = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()
events_not_avail = parse_stderr_events(err_buf.getvalue())
assert {"warning": "[restore] Colorization skipped: Colorization model not available"} in events_not_avail, events_not_avail
assert {"progress": 92, "stage": "Colorization model not available"} in events_not_avail, events_not_avail

# 8. MemoryError, RuntimeError OOMs, and OSError OOMs from enhance_faces or colorize_bw propagate to the outer handler instead of being swallowed (#3078, #3391)
for step_kind in ("faces", "colorize"):
    for oom_exc, expected_err in (
        (MemoryError("ONNX arena OOM") if step_kind == "faces" else MemoryError(), "ONNX arena OOM" if step_kind == "faces" else "MemoryError"),
        (RuntimeError("CUDA out of memory"), "CUDA out of memory"),
        (RuntimeError("Failed to allocate memory for requested buffer"), "Failed to allocate memory for requested buffer"),
        (RuntimeError("[enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes."), "[enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes."),
        (RuntimeError("Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 3)"), "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 3)"),
        (OSError(12, "Cannot allocate memory"), "[Errno 12] Cannot allocate memory"),
        (OSError(12, "Nicht genügend Hauptspeicher verfügbar"), "[Errno 12] Nicht genügend Hauptspeicher verfügbar"),
    ):
        if step_kind == "faces":
            mod.enhance_faces = lambda _img, _fidelity=0.7, _e=oom_exc: (_ for _ in ()).throw(_e)
            mod.colorize_bw = ok_colorize_bw
        else:
            mod.enhance_faces = lambda img, _fidelity=0.7: (img, 0)
            mod.colorize_bw = lambda _img, intensity=0.85, _e=oom_exc: (_ for _ in ()).throw(_e)
        out_buf, err_buf = io.StringIO(), io.StringIO()
        try:
            with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
                mod.main()
        except SystemExit as exc:
            assert exc.code == 1, exc.code
            payload_oom = json.loads(out_buf.getvalue().strip())
            assert payload_oom["success"] is False, payload_oom
            assert payload_oom["error"] == expected_err, payload_oom
            events_oom = parse_stderr_events(err_buf.getvalue())
            assert not any("skipped" in e.get("warning", "").lower() for e in events_oom), events_oom
        else:
            raise AssertionError(f"Expected SystemExit(1) for {oom_exc!r} in {step_kind}")

# Non-ENOMEM OSError (e.g. errno 13 EACCES) is not treated as OOM: logs warning and skips the step
mod.enhance_faces = lambda _img, _fidelity=0.7: (_ for _ in ()).throw(OSError(13, "Permission denied"))
mod.colorize_bw = lambda _img, intensity=0.85: (_ for _ in ()).throw(OSError(13, "Permission denied"))
out_buf, err_buf = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()
payload_eacces = json.loads(out_buf.getvalue().strip())
events_eacces = parse_stderr_events(err_buf.getvalue())
assert payload_eacces["success"] is True, payload_eacces
assert {"warning": "[restore] Face enhancement skipped: [Errno 13] Permission denied"} in events_eacces, events_eacces
assert {"warning": "[restore] Colorization skipped: [Errno 13] Permission denied"} in events_eacces, events_eacces

print("RESTORE_3078_OK")
`);
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("RESTORE_3078_OK");
      });

      it("emits structured warnings on per-face CodeFormer failures and raises when all attempted faces fail (issue #3086)", () => {
        const res = runPy(`
import contextlib, importlib.util, io, json, os, sys, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)
import gpu

spec = importlib.util.spec_from_file_location("restore_mod", os.path.join(py_dir, "restore.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class FakeArr:
    def __init__(self, shape=(200, 200, 3)):
        self.shape = shape
    def copy(self):
        return FakeArr(self.shape)
    def __getitem__(self, _idx):
        return FakeArr((100, 100, 3))
    def __setitem__(self, _idx, _val):
        pass
    def astype(self, _dtype):
        return self
    def clip(self, _lo, _hi):
        return self
    def __truediv__(self, _other):
        return self
    def __sub__(self, _other):
        return self
    def __add__(self, _other):
        return self
    def __rsub__(self, _other):
        return self
    def __mul__(self, _other):
        return self

mod._IMPORT_ERROR = None
mod.cv2 = types.SimpleNamespace(
    IMREAD_COLOR=1,
    COLOR_BGR2RGB=1,
    COLOR_RGB2BGR=2,
    INTER_AREA=3,
    INTER_LANCZOS4=4,
    imread=lambda _p, _f: FakeArr((200, 200, 3)),
    imwrite=lambda _p, _img: True,
    cvtColor=lambda img, _c: img,
    resize=lambda _img, sz, interpolation=None: FakeArr((sz[1], sz[0], 3)),
    ellipse=lambda *args, **kwargs: None,
    GaussianBlur=lambda mask, _ksize, _sigma: mask,
)
mod.np = types.SimpleNamespace(
    float32="float32",
    float64="float64",
    uint8="uint8",
    newaxis=slice(None),
    transpose=lambda a, _axes: a,
    expand_dims=lambda a, _axis: a,
    array=lambda _v: FakeArr((1,)),
    clip=lambda a, _lo, _hi: a,
    zeros=lambda shape, dtype="float32": FakeArr((shape[0], shape[1], 1)),
)
mod._get_codeformer_path = lambda: "/tmp/fake-codeformer-3086.onnx"
mod.is_grayscale = lambda _img: False
gpu.onnx_gpu_available = lambda: False

active_boxes = []
class FakeDetector:
    def __init__(self, model_selection=0, min_detection_confidence=0.4):
        self.ms = model_selection
    def process(self, _img):
        if self.ms != 0:
            return types.SimpleNamespace(detections=[])
        dets = [
            types.SimpleNamespace(
                location_data=types.SimpleNamespace(
                    relative_bounding_box=types.SimpleNamespace(
                        xmin=b["xmin"], ymin=b["ymin"], width=b["w"], height=b["h"]
                    )
                )
            )
            for b in active_boxes
        ]
        return types.SimpleNamespace(detections=dets)
    def close(self):
        pass

sys.modules["mediapipe"] = types.SimpleNamespace(
    solutions=types.SimpleNamespace(
        face_detection=types.SimpleNamespace(FaceDetection=FakeDetector)
    )
)

session_behaviors = []
session_calls = []
class FakeSession:
    def get_inputs(self):
        return [types.SimpleNamespace(name="input"), types.SimpleNamespace(name="weight")]
    def run(self, _out, inp):
        idx = len(session_calls)
        session_calls.append(inp)
        behavior = session_behaviors[idx]
        if isinstance(behavior, BaseException):
            raise behavior
        return [[FakeArr((3, 512, 512))]]

gpu.safe_onnx_session = lambda _p: (FakeSession(), "cpu")

def parse_stderr_events(raw):
    return [json.loads(line) for line in raw.strip().splitlines() if line.strip()]

settings_faces_only = json.dumps({
    "scratchRemoval": False,
    "faceEnhancement": True,
    "denoise": False,
    "colorize": False,
})
sys.argv = ["restore.py", "/tmp/in.png", "/tmp/out.png", settings_faces_only]

# 1. Partial face failure: 2 faces >= 48x48 (100x100 on 200x200 image), face 0 fails with empty RuntimeError(), face 1 succeeds
active_boxes[:] = [
    {"xmin": 0.0, "ymin": 0.0, "w": 0.5, "h": 0.5},
    {"xmin": 0.4, "ymin": 0.4, "w": 0.5, "h": 0.5},
]
session_calls.clear()
session_behaviors[:] = [RuntimeError("   "), "ok"]
out_buf, err_buf = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()

payload_partial = json.loads(out_buf.getvalue().strip())
events_partial = parse_stderr_events(err_buf.getvalue())
assert payload_partial["success"] is True, payload_partial
assert payload_partial["facesEnhanced"] == 1, payload_partial
assert "face_enhancement" in payload_partial["steps"], payload_partial
assert [e["warning"] for e in events_partial if "warning" in e] == [
    "[restore] CodeFormer inference failed for face 0: RuntimeError"
], events_partial
assert {"progress": 65, "stage": "Enhanced 1 face"} in events_partial, events_partial

# 1b. Trailing face failure after an earlier face succeeds ([ok, fail] ordering): must still keep the enhanced face and not raise last_error
session_calls.clear()
session_behaviors[:] = ["ok", RuntimeError("Trailing face failure")]
out_buf, err_buf = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()

payload_trailing = json.loads(out_buf.getvalue().strip())
events_trailing = parse_stderr_events(err_buf.getvalue())
assert payload_trailing["success"] is True, payload_trailing
assert payload_trailing["facesEnhanced"] == 1, payload_trailing
assert "face_enhancement" in payload_trailing["steps"], payload_trailing
assert [e["warning"] for e in events_trailing if "warning" in e] == [
    "[restore] CodeFormer inference failed for face 1: Trailing face failure"
], events_trailing
assert {"progress": 65, "stage": "Enhanced 1 face"} in events_trailing, events_trailing

# 2. Total face failure: 1 small face (< 48x48, skipped) + 2 candidate faces >= 48x48 that both fail inference
# Must emit per-face structured warnings for both attempted faces, raise the last error out of enhance_faces,
# and report "Face enhancement skipped: ..." (never "No faces detected")
active_boxes[:] = [
    {"xmin": 0.0, "ymin": 0.0, "w": 0.1, "h": 0.1},
    {"xmin": 0.1, "ymin": 0.1, "w": 0.4, "h": 0.4},
    {"xmin": 0.3, "ymin": 0.3, "w": 0.5, "h": 0.5},
]
session_calls.clear()
first_err = "First face failed"
long_err = "ONNX execution provider failed on CodeFormer node_17"
session_behaviors[:] = [ValueError(first_err), RuntimeError(long_err)]
out_buf, err_buf = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()

payload_total_fail = json.loads(out_buf.getvalue().strip())
events_total_fail = parse_stderr_events(err_buf.getvalue())
assert payload_total_fail["success"] is True, payload_total_fail
assert payload_total_fail["facesEnhanced"] == 0, payload_total_fail
assert "face_enhancement" not in payload_total_fail["steps"], payload_total_fail
assert {"warning": f"[restore] CodeFormer inference failed for face 1: {first_err}"} in events_total_fail, events_total_fail
assert {"warning": f"[restore] CodeFormer inference failed for face 2: {long_err}"} in events_total_fail, events_total_fail
assert {"warning": f"[restore] Face enhancement skipped: {long_err}"} in events_total_fail, events_total_fail
assert {"progress": 65, "stage": f"Face enhancement skipped: {long_err[:40]}"} in events_total_fail, events_total_fail
assert not any(e.get("stage") == "No faces detected" for e in events_total_fail), events_total_fail

# 3. Only sub-48x48 faces detected: 0 faces attempted -> returns (result, 0) cleanly and emits "No faces detected"
active_boxes[:] = [
    {"xmin": 0.0, "ymin": 0.0, "w": 0.1, "h": 0.1},
]
session_calls.clear()
session_behaviors[:] = []
out_buf, err_buf = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()

payload_small_only = json.loads(out_buf.getvalue().strip())
events_small_only = parse_stderr_events(err_buf.getvalue())
assert payload_small_only["success"] is True, payload_small_only
assert payload_small_only["facesEnhanced"] == 0, payload_small_only
assert session_calls == [], session_calls
assert {"progress": 65, "stage": "No faces detected"} in events_small_only, events_small_only
assert not any("warning" in e for e in events_small_only), events_small_only

# 4. Per-face MemoryError, RuntimeError OOMs, and OSError OOMs re-raise immediately without attempting second face (#3086, #3391)
active_boxes[:] = [
    {"xmin": 0.0, "ymin": 0.0, "w": 0.5, "h": 0.5},
    {"xmin": 0.4, "ymin": 0.4, "w": 0.5, "h": 0.5},
]
for oom_exc, expected_err in (
    (MemoryError("CodeFormer arena OOM"), "CodeFormer arena OOM"),
    (RuntimeError("CUDA out of memory"), "CUDA out of memory"),
    (RuntimeError("Failed to allocate memory for requested buffer"), "Failed to allocate memory for requested buffer"),
    (RuntimeError("DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes."), "DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes."),
    (RuntimeError("Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 3)"), "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 3)"),
    (OSError(12, "Cannot allocate memory"), "[Errno 12] Cannot allocate memory"),
    (OSError(12, "Nicht genügend Hauptspeicher verfügbar"), "[Errno 12] Nicht genügend Hauptspeicher verfügbar"),
):
    session_calls.clear()
    session_behaviors[:] = [oom_exc, "ok"]
    out_buf, err_buf = io.StringIO(), io.StringIO()
    try:
        with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
            mod.main()
    except SystemExit as exc:
        assert exc.code == 1, exc.code
        assert len(session_calls) == 1, session_calls
        payload_oom = json.loads(out_buf.getvalue().strip())
        assert payload_oom == {"success": False, "error": expected_err}, payload_oom
        events_oom = parse_stderr_events(err_buf.getvalue())
        assert not any("warning" in e for e in events_oom), events_oom
    else:
        raise AssertionError(f"Expected SystemExit(1) for per-face {oom_exc!r}")

# Non-ENOMEM OSError on face 0 logs warning and continues to face 1 (#3453)
session_calls.clear()
session_behaviors[:] = [OSError(13, "Permission denied"), "ok"]
out_buf, err_buf = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()
payload_face_eacces = json.loads(out_buf.getvalue().strip())
events_face_eacces = parse_stderr_events(err_buf.getvalue())
assert payload_face_eacces["success"] is True, payload_face_eacces
assert payload_face_eacces["facesEnhanced"] == 1, payload_face_eacces
assert len(session_calls) == 2, session_calls
assert {"warning": "[restore] CodeFormer inference failed for face 0: [Errno 13] Permission denied"} in events_face_eacces, events_face_eacces

# 5. mp.tasks.vision.FaceDetector fallback (AttributeError on mp.solutions) + longest > 1920 downscale
mod._ensure_face_detect_model = lambda: "/tmp/fake-blaze-face.tflite"
class FakeTasksDetector:
    def detect(self, _mp_img):
        # On a 3840x2160 image downscaled by 0.5 (inv_scale=2.0), a 30x30 detection becomes 60x60 (>= 48x48)
        bbox = types.SimpleNamespace(origin_x=10, origin_y=10, width=30, height=30)
        return types.SimpleNamespace(detections=[types.SimpleNamespace(bounding_box=bbox)])
    def close(self):
        pass

sys.modules["mediapipe"] = types.SimpleNamespace(
    ImageFormat=types.SimpleNamespace(SRGB=1),
    Image=lambda image_format, data: data,
    tasks=types.SimpleNamespace(
        BaseOptions=lambda model_asset_path: model_asset_path,
        vision=types.SimpleNamespace(
            RunningMode=types.SimpleNamespace(IMAGE=1),
            FaceDetectorOptions=lambda **kw: kw,
            FaceDetector=types.SimpleNamespace(create_from_options=lambda _opts: FakeTasksDetector()),
        ),
    ),
)
mod.cv2.imread = lambda _p, _f: FakeArr((2160, 3840, 3))
session_calls.clear()
session_behaviors[:] = [RuntimeError("Tasks detector face inference failed")]
out_buf, err_buf = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()

events_tasks_fail = parse_stderr_events(err_buf.getvalue())
assert len(session_calls) == 1, session_calls
assert {"warning": "[restore] CodeFormer inference failed for face 0: Tasks detector face inference failed"} in events_tasks_fail, events_tasks_fail
assert {"warning": "[restore] Face enhancement skipped: Tasks detector face inference failed"} in events_tasks_fail, events_tasks_fail

print("RESTORE_3086_OK")
`);
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("RESTORE_3086_OK");
      });

      it("exits 1 and reports an error when cv2.imwrite returns False (issue #3087)", () => {
        const res = runPy(`
import contextlib, importlib.util, io, json, os, sys, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)
import gpu

spec = importlib.util.spec_from_file_location("restore_mod", os.path.join(py_dir, "restore.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class FakeImg:
    shape = (64, 64, 3)
    def copy(self):
        return self

mod._IMPORT_ERROR = None
mod.cv2 = types.SimpleNamespace(
    IMREAD_COLOR=1,
    imread=lambda _p, _f: FakeImg(),
    imwrite=lambda _p, _img: False,
)
mod.is_grayscale = lambda _img: False
gpu.onnx_gpu_available = lambda: False

settings = json.dumps({
    "scratchRemoval": False,
    "faceEnhancement": False,
    "denoise": False,
    "colorize": False,
})
sys.argv = ["restore.py", "/tmp/in.png", "/tmp/out_restore.png", settings]
out_buf, err_buf = io.StringIO(), io.StringIO()
try:
    with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
        mod.main()
except SystemExit as exc:
    assert exc.code == 1, exc.code
    payload = json.loads(out_buf.getvalue().strip())
    assert payload == {
        "success": False,
        "error": "Failed to write output image: /tmp/out_restore.png",
    }, payload
else:
    raise AssertionError(f"Expected SystemExit(1) when cv2.imwrite returns False, got stdout={out_buf.getvalue()!r}")

print("RESTORE_3087_OK")
`);
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("RESTORE_3087_OK");
      });

      it("scopes except AttributeError in enhance_faces to mp.solutions.face_detection lookup (issue #3626)", () => {
        const res = runPy(`
import contextlib, importlib.util, io, json, os, sys, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)
import gpu
os.environ["SNAPOTTER_ALLOW_MODEL_DOWNLOAD"] = "0"
os.environ["MODELS_PATH"] = "/tmp/nonexistent-models-3626"

spec = importlib.util.spec_from_file_location("restore_mod_3626", os.path.join(py_dir, "restore.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod._IMPORT_ERROR = None
mod._FACE_DETECT_DOCKER_PATH = "/tmp/nonexistent-docker-3626.tflite"
mod._FACE_DETECT_LOCAL_PATH = "/tmp/nonexistent-local-3626.tflite"

class FakeArr:
    shape = (200, 200, 3)
    def copy(self):
        return self

mod.cv2 = types.SimpleNamespace(
    IMREAD_COLOR=1,
    COLOR_BGR2RGB=1,
    imread=lambda _p, _f: FakeArr(),
    imwrite=lambda _p, _img: True,
    cvtColor=lambda img, _c: img,
)
mod.is_grayscale = lambda _img: False
gpu.onnx_gpu_available = lambda: False

ensure_model_calls = []
orig_ensure_model = mod._ensure_face_detect_model
def tracked_ensure_model():
    ensure_model_calls.append(True)
    return orig_ensure_model()
mod._ensure_face_detect_model = tracked_ensure_model

# 1. AttributeError inside FaceDetection() init or detector.process() when mp.solutions.face_detection exists must propagate directly
class InitAttrErrorDetector:
    def __init__(self, **_kwargs):
        raise AttributeError("unexpected NoneType attribute in init")

class ProcessAttrErrorDetector:
    def __init__(self, **_kwargs):
        pass
    def process(self, _img):
        raise AttributeError("unexpected NoneType attribute in process")
    def close(self):
        pass

fake_mp = types.ModuleType("mediapipe")
fake_mp.solutions = types.SimpleNamespace(
    face_detection=types.SimpleNamespace(FaceDetection=InitAttrErrorDetector)
)
sys.modules["mediapipe"] = fake_mp

for det_cls, expected_msg in (
    (InitAttrErrorDetector, "unexpected NoneType attribute in init"),
    (ProcessAttrErrorDetector, "unexpected NoneType attribute in process"),
):
    fake_mp.solutions.face_detection.FaceDetection = det_cls
    try:
        mod.enhance_faces(FakeArr(), 0.7)
    except AttributeError as exc:
        assert str(exc) == expected_msg, exc
        assert ensure_model_calls == [], f"_ensure_face_detect_model must not be called: {ensure_model_calls}"
    else:
        raise AssertionError(f"Expected AttributeError from {det_cls.__name__} to propagate")

# 1b. Through main(), AttributeError in detector.process() emits the AttributeError warning, not the offline model download error
settings_faces_only = json.dumps({
    "scratchRemoval": False,
    "faceEnhancement": True,
    "denoise": False,
    "colorize": False,
})
sys.argv = ["restore.py", "/tmp/in.png", "/tmp/out.png", settings_faces_only]
out_buf, err_buf = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
    mod.main()
events = [json.loads(line) for line in err_buf.getvalue().strip().splitlines() if line.strip()]
assert {"warning": "[restore] Face enhancement skipped: unexpected NoneType attribute in process"} in events, events
assert ensure_model_calls == [], ensure_model_calls

# 2. AttributeError during bbox extraction (location_data is None) must propagate directly
class BadResultDetector:
    def __init__(self, **_kwargs):
        pass
    def process(self, _img):
        return types.SimpleNamespace(detections=[types.SimpleNamespace(location_data=None)])
    def close(self):
        pass

fake_mp.solutions.face_detection.FaceDetection = BadResultDetector
try:
    mod.enhance_faces(FakeArr(), 0.7)
except AttributeError as exc:
    assert "relative_bounding_box" in str(exc), exc
    assert ensure_model_calls == [], ensure_model_calls
else:
    raise AssertionError("Expected AttributeError from bbox parsing to propagate")

# 2b. Positive mp.solutions path with empty detections returns (img_bgr, 0) without calling _ensure_face_detect_model
class EmptySolutionsDetector:
    def __init__(self, **_kwargs):
        pass
    def process(self, _img):
        return types.SimpleNamespace(detections=None)
    def close(self):
        pass

fake_mp.solutions.face_detection.FaceDetection = EmptySolutionsDetector
_, count_empty = mod.enhance_faces(FakeArr(), 0.7)
assert count_empty == 0, count_empty
assert ensure_model_calls == [], ensure_model_calls

# 3. When mp.solutions is missing (or face_detection is missing/None), falls back to mp.tasks
mod._ensure_face_detect_model = lambda: "/tmp/fake-blaze-3626.tflite"
tasks_calls = []
class EmptyTasksDetector:
    def detect(self, _mp_image):
        tasks_calls.append(True)
        return types.SimpleNamespace(detections=[])
    def close(self):
        pass

for missing_solutions in ("no_attr", None, types.SimpleNamespace(), types.SimpleNamespace(face_detection=None)):
    tasks_calls.clear()
    mp_tasks_mod = types.ModuleType("mediapipe")
    if missing_solutions != "no_attr":
        mp_tasks_mod.solutions = missing_solutions
    mp_tasks_mod.ImageFormat = types.SimpleNamespace(SRGB=1)
    mp_tasks_mod.Image = lambda image_format, data: data
    mp_tasks_mod.tasks = types.SimpleNamespace(
        BaseOptions=lambda model_asset_path: model_asset_path,
        vision=types.SimpleNamespace(
            RunningMode=types.SimpleNamespace(IMAGE=1),
            FaceDetectorOptions=lambda **kw: kw,
            FaceDetector=types.SimpleNamespace(create_from_options=lambda _opts: EmptyTasksDetector()),
        ),
    )
    sys.modules["mediapipe"] = mp_tasks_mod
    out_img, count = mod.enhance_faces(FakeArr(), 0.7)
    assert count == 0, (missing_solutions, count)
    assert len(tasks_calls) == 1, (missing_solutions, tasks_calls)

print("RESTORE_3626_OK")
`);
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("RESTORE_3626_OK");
      });

      it("closes MediaPipe detectors in enhance_faces when .process(), mp.Image(), or .detect() raises (issue #3654)", () => {
        const res = runPy(`
import importlib.util, os, sys, types

py_dir = ${JSON.stringify(pyDir)}
sys.path.insert(0, py_dir)
import gpu

spec = importlib.util.spec_from_file_location("restore_mod_3654", os.path.join(py_dir, "restore.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod._IMPORT_ERROR = None

class FakeArr:
    shape = (200, 200, 3)
    def copy(self):
        return self

mod.cv2 = types.SimpleNamespace(
    COLOR_BGR2RGB=1,
    cvtColor=lambda img, _c: img,
)
gpu.onnx_gpu_available = lambda: False

# 1. mp.solutions path: detector.close() is called when detector.process() raises on model_selection=0 or model_selection=1
closed_models = []
fail_on_model = [0]

class RaisingSolutionsDetector:
    def __init__(self, model_selection=0, min_detection_confidence=0.4):
        self.ms = model_selection
    def process(self, _img):
        if self.ms == fail_on_model[0]:
            raise RuntimeError(f"restore solutions process failed on model {self.ms}")
        return types.SimpleNamespace(detections=None)
    def close(self):
        closed_models.append(self.ms)

fake_mp_sol = types.ModuleType("mediapipe")
fake_mp_sol.solutions = types.SimpleNamespace(
    face_detection=types.SimpleNamespace(FaceDetection=RaisingSolutionsDetector)
)
sys.modules["mediapipe"] = fake_mp_sol

for target_ms, expected_closed in ((0, [0]), (1, [0, 1])):
    closed_models.clear()
    fail_on_model[0] = target_ms
    try:
        mod.enhance_faces(FakeArr(), 0.7)
    except RuntimeError as exc:
        assert str(exc) == f"restore solutions process failed on model {target_ms}", exc
        assert closed_models == expected_closed, (target_ms, closed_models)
    else:
        raise AssertionError(f"Expected RuntimeError on model {target_ms}")

closed_models.clear()
fail_on_model[0] = -1
_, count_sol = mod.enhance_faces(FakeArr(), 0.7)
assert count_sol == 0, count_sol
assert closed_models == [0, 1], closed_models

# 2. mp.tasks path: fd.close() is called when mp.Image() raises or when fd.detect() raises
mod._ensure_face_detect_model = lambda: "/tmp/fake-blaze-3654.tflite"
tasks_closed = []
raise_in_image = [False]
raise_in_detect = [False]

class RaisingTasksDetector:
    def detect(self, _mp_image):
        if raise_in_detect[0]:
            raise RuntimeError("restore tasks detect failed")
        return types.SimpleNamespace(detections=[])
    def close(self):
        tasks_closed.append(True)

def fake_mp_image(image_format, data):
    if raise_in_image[0]:
        raise ValueError("restore mp.Image wrap failed")
    return data

fake_mp_tasks = types.ModuleType("mediapipe")
fake_mp_tasks.ImageFormat = types.SimpleNamespace(SRGB=1)
fake_mp_tasks.Image = fake_mp_image
fake_mp_tasks.tasks = types.SimpleNamespace(
    BaseOptions=lambda model_asset_path: model_asset_path,
    vision=types.SimpleNamespace(
        RunningMode=types.SimpleNamespace(IMAGE=1),
        FaceDetectorOptions=lambda **kw: kw,
        FaceDetector=types.SimpleNamespace(create_from_options=lambda _opts: RaisingTasksDetector()),
    ),
)
sys.modules["mediapipe"] = fake_mp_tasks

tasks_closed.clear()
raise_in_image[0] = True
raise_in_detect[0] = False
try:
    mod.enhance_faces(FakeArr(), 0.7)
except ValueError as exc:
    assert str(exc) == "restore mp.Image wrap failed", exc
    assert tasks_closed == [True], tasks_closed
else:
    raise AssertionError("Expected ValueError from mp.Image()")

tasks_closed.clear()
raise_in_image[0] = False
raise_in_detect[0] = True
try:
    mod.enhance_faces(FakeArr(), 0.7)
except RuntimeError as exc:
    assert str(exc) == "restore tasks detect failed", exc
    assert tasks_closed == [True], tasks_closed
else:
    raise AssertionError("Expected RuntimeError from fd.detect()")

tasks_closed.clear()
raise_in_image[0] = False
raise_in_detect[0] = False
_, count_tasks = mod.enhance_faces(FakeArr(), 0.7)
assert count_tasks == 0, count_tasks
assert tasks_closed == [True], tasks_closed

print("RESTORE_3654_OK")
`);
        expect(res.status, res.stderr).toBe(0);
        expect(res.stdout).toContain("RESTORE_3654_OK");
      });
    },
  );
});
