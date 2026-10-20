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
    },
  );
});
