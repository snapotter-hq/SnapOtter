import { isSafeMessageError, isToolInputError, type SafeError } from "@snapotter/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock sharp
vi.mock("sharp", () => {
  const mockSharp = vi.fn(() => ({
    png: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
  }));
  return { default: mockSharp };
});

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from("mock-output-data")),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

// Mock node:util to control the promisified execFile
const mockExecFileAsync = vi.fn();
vi.mock("node:util", () => ({
  promisify: () => mockExecFileAsync,
}));

import { readFile, rm, writeFile } from "node:fs/promises";
import sharp from "sharp";

const FAKE_INPUT = Buffer.from("fake-image-data");
const FAKE_OUTPUT_DIR = "/tmp/test-output";

beforeEach(() => {
  vi.clearAllMocks();

  // Re-establish defaults after clearAllMocks
  vi.mocked(readFile).mockResolvedValue(Buffer.from("mock-output-data"));
  vi.mocked(writeFile).mockResolvedValue(undefined);
  vi.mocked(rm).mockResolvedValue(undefined);

  // Reset sharp mock
  vi.mocked(sharp).mockImplementation(
    () =>
      ({
        png: vi.fn().mockReturnThis(),
        jpeg: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
        metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
      }) as unknown as ReturnType<typeof sharp>,
  );

  // Default: both caire -help discovery and actual caire command succeed
  mockExecFileAsync.mockResolvedValue({ stdout: "", stderr: "" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("seamCarve", () => {
  // Dynamic import needed because the module caches the caire binary path
  async function importFresh() {
    vi.resetModules();
    // Re-apply mocks that resetModules wipes
    vi.mocked(readFile).mockResolvedValue(Buffer.from("mock-output-data"));
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(rm).mockResolvedValue(undefined);
    mockExecFileAsync.mockResolvedValue({ stdout: "", stderr: "" });
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    const mod = await import("../../../packages/ai/src/seam-carving.js");
    return mod;
  }

  it("writes JPEG input and reads PNG output", async () => {
    const { seamCarve } = await importFresh();
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR);

    // writeFile called with the jpeg buffer
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining("caire-in-"),
      expect.any(Buffer),
    );
    // readFile called for the output
    expect(readFile).toHaveBeenCalledWith(expect.stringContaining("caire-out-"));
  });

  it("passes width and height args to caire", async () => {
    const { seamCarve } = await importFresh();
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { width: 400, height: 300 });

    const calls = mockExecFileAsync.mock.calls;
    const caireCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && c[1].includes("-width"));
    expect(caireCall).toBeDefined();
    expect(caireCall?.[1]).toContain("-width");
    expect(caireCall?.[1]).toContain("400");
    expect(caireCall?.[1]).toContain("-height");
    expect(caireCall?.[1]).toContain("300");
  });

  it("uses square mode with shortest side", async () => {
    const { seamCarve } = await importFresh();
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { square: true });

    const calls = mockExecFileAsync.mock.calls;
    const caireCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && c[1].includes("-square"));
    expect(caireCall).toBeDefined();
    // shortest side of 800x600 is 600
    expect(caireCall?.[1]).toContain("-width");
    expect(caireCall?.[1]).toContain("600");
    expect(caireCall?.[1]).toContain("-height");
    expect(caireCall?.[1]).toContain("600");
  });

  it("passes protectFaces option as -face flag", async () => {
    const { seamCarve } = await importFresh();
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { protectFaces: true });

    const calls = mockExecFileAsync.mock.calls;
    const caireCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && c[1].includes("-face"));
    expect(caireCall).toBeDefined();
  });

  it("passes blurRadius and sobelThreshold options", async () => {
    const { seamCarve } = await importFresh();
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { blurRadius: 5, sobelThreshold: 10 });

    const calls = mockExecFileAsync.mock.calls;
    const caireCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && c[1].includes("-blur"));
    expect(caireCall).toBeDefined();
    expect(caireCall?.[1]).toContain("-blur");
    expect(caireCall?.[1]).toContain("5");
    expect(caireCall?.[1]).toContain("-sobel");
    expect(caireCall?.[1]).toContain("10");
  });

  it("returns SeamCarveResult with output dimensions", async () => {
    const { seamCarve } = await importFresh();
    const result = await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR);

    expect(result).toEqual({
      buffer: expect.any(Buffer),
      width: 800,
      height: 600,
    });
  });

  it("cleans up temp files on success", async () => {
    const { seamCarve } = await importFresh();
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR);

    // rm called for both input and output
    expect(rm).toHaveBeenCalledTimes(2);
    expect(rm).toHaveBeenCalledWith(expect.stringContaining("caire-in-"), { force: true });
    expect(rm).toHaveBeenCalledWith(expect.stringContaining("caire-out-"), { force: true });
  });

  it("cleans up temp files on failure", async () => {
    // First call succeeds (caire -help), second call fails (actual caire run)
    mockExecFileAsync
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockRejectedValueOnce(new Error("caire process failed"));

    const { seamCarve } = await importFresh();
    await expect(seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("caire process failed");

    // rm still called for cleanup even on failure
    expect(rm).toHaveBeenCalledTimes(2);
  });

  it("throws operational 503 ENGINE_UNAVAILABLE SafeError when caire binary is not found (#3858)", async () => {
    const origCairePath = process.env.CAIRE_PATH;
    delete process.env.CAIRE_PATH;

    try {
      const { seamCarve } = await importFresh();
      const spawnErr = new Error("spawn caire ENOENT");
      mockExecFileAsync.mockRejectedValue(spawnErr);
      const err = await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR).then(
        () => null,
        (e: unknown) => e,
      );
      expect(isSafeMessageError(err)).toBe(true);
      expect((err as SafeError).name).toBe("SafeError");
      expect((err as SafeError).kind).toBe("operational");
      expect((err as SafeError).code).toBe("ENGINE_UNAVAILABLE");
      expect((err as SafeError).statusCode).toBe(503);
      expect((err as SafeError).message).toContain("caire binary not found");
      expect((err as SafeError).cause).toBe(spawnErr);
    } finally {
      if (origCairePath) process.env.CAIRE_PATH = origCairePath;
    }
  });

  it("preserves the CAIRE_PATH error as cause when both CAIRE_PATH and PATH fallback fail (#3858)", async () => {
    const origCairePath = process.env.CAIRE_PATH;
    process.env.CAIRE_PATH = "/custom/broken/caire";

    try {
      const { seamCarve } = await importFresh();
      const customErr = Object.assign(new Error("spawn /custom/broken/caire EACCES"), {
        code: "EACCES",
        syscall: "spawn /custom/broken/caire",
      });
      const fallbackErr = Object.assign(new Error("spawn caire ENOENT"), {
        code: "ENOENT",
        syscall: "spawn caire",
      });
      mockExecFileAsync.mockRejectedValueOnce(customErr).mockRejectedValueOnce(fallbackErr);

      const err = await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR).then(
        () => null,
        (e: unknown) => e,
      );
      expect(isSafeMessageError(err)).toBe(true);
      expect((err as SafeError).code).toBe("ENGINE_UNAVAILABLE");
      expect((err as SafeError).statusCode).toBe(503);
      expect((err as SafeError).cause).toBe(customErr);
    } finally {
      if (origCairePath) process.env.CAIRE_PATH = origCairePath;
      else delete process.env.CAIRE_PATH;
    }
  });

  it("classifies a spawn failure on cached cairePath during execution as 503 ENGINE_UNAVAILABLE and clears cache (#3858)", async () => {
    const origCairePath = process.env.CAIRE_PATH;
    delete process.env.CAIRE_PATH;

    try {
      const { seamCarve } = await importFresh();
      const spawnErr = Object.assign(new Error("spawn caire ENOENT"), {
        code: "ENOENT",
        syscall: "spawn caire",
      });
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: "", stderr: "" })
        .mockRejectedValueOnce(spawnErr)
        .mockResolvedValue({ stdout: "", stderr: "" });

      const err = await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { width: 400 }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(isSafeMessageError(err)).toBe(true);
      expect((err as SafeError).kind).toBe("operational");
      expect((err as SafeError).code).toBe("ENGINE_UNAVAILABLE");
      expect((err as SafeError).statusCode).toBe(503);
      expect((err as SafeError).cause).toBe(spawnErr);

      // Next call must re-run the -help discovery probe because cache was cleared
      await expect(seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { width: 400 })).resolves.toBeDefined();
      const helpCalls = mockExecFileAsync.mock.calls.filter(
        (c: unknown[]) => Array.isArray(c[1]) && c[1].includes("-help"),
      );
      expect(helpCalls).toHaveLength(2);

      // Mutating CAIRE_PATH on the same module instance also invalidates the cache
      process.env.CAIRE_PATH = "/updated/path/caire";
      await expect(seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { width: 400 })).resolves.toBeDefined();
      const updatedHelpCalls = mockExecFileAsync.mock.calls.filter(
        (c: unknown[]) =>
          c[0] === "/updated/path/caire" && Array.isArray(c[1]) && c[1].includes("-help"),
      );
      expect(updatedHelpCalls).toHaveLength(1);
    } finally {
      if (origCairePath) process.env.CAIRE_PATH = origCairePath;
      else delete process.env.CAIRE_PATH;
    }
  });

  it("uses CAIRE_PATH env var when set", async () => {
    const origCairePath = process.env.CAIRE_PATH;
    process.env.CAIRE_PATH = "/custom/path/caire";

    const { seamCarve } = await importFresh();
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR);

    // First call should try the custom path
    expect(mockExecFileAsync.mock.calls[0][0]).toBe("/custom/path/caire");

    // Restore
    if (origCairePath) {
      process.env.CAIRE_PATH = origCairePath;
    } else {
      delete process.env.CAIRE_PATH;
    }
  });

  it("always passes -preview=false", async () => {
    const { seamCarve } = await importFresh();
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR);

    const calls = mockExecFileAsync.mock.calls;
    const caireCall = calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && c[1].includes("-preview=false"),
    );
    expect(caireCall).toBeDefined();
  });

  it("scales timeout based on megapixels", async () => {
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          // 4000x3000 = 12MP, should give timeout > 120s
          metadata: vi.fn().mockResolvedValue({ width: 4000, height: 3000 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    const { seamCarve } = await importFresh();
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR);

    const calls = mockExecFileAsync.mock.calls;
    const caireCall = calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && c[1].includes("-preview=false"),
    );
    // timeout = max(120_000, 12 * 10 * 1000) = 120_000
    expect(caireCall?.[2]).toEqual(expect.objectContaining({ timeout: expect.any(Number) }));
  });

  it("does not pass width/height args when not specified", async () => {
    const { seamCarve } = await importFresh();
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR);

    const calls = mockExecFileAsync.mock.calls;
    const caireCall = calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && c[1].includes("-preview=false"),
    );
    expect(caireCall?.[1]).not.toContain("-width");
    expect(caireCall?.[1]).not.toContain("-height");
  });

  it("handles zero dimensions from metadata gracefully", async () => {
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          metadata: vi.fn().mockResolvedValue({ width: undefined, height: undefined }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    const { seamCarve } = await importFresh();
    // Should not throw; width/height default to 0
    const result = await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR);
    expect(result).toBeDefined();
  });

  it("throws ToolInputError when image exceeds 25 MP and allows exactly 25 MP (#2543)", async () => {
    const { seamCarve } = await importFresh();
    // 5000x5000 = 25.0 MP (exact boundary, allowed)
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          metadata: vi.fn().mockResolvedValue({ width: 5000, height: 5000 }),
        }) as unknown as ReturnType<typeof sharp>,
    );
    await expect(seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR)).resolves.toBeDefined();

    // 6000x5000 = 30 MP, exceeds 25 MP limit even when caire is absent
    mockExecFileAsync.mockClear();
    mockExecFileAsync.mockRejectedValue(new Error("spawn caire ENOENT"));
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          metadata: vi.fn().mockResolvedValue({ width: 6000, height: 5000 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    const rejected = seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR);
    await expect(rejected).rejects.toSatisfy(isToolInputError);
    await expect(rejected).rejects.toThrow("Image is too large for content-aware resize");
    expect(mockExecFileAsync).not.toHaveBeenCalled();
  });

  it("pre-resizes when width reduction exceeds 75%", async () => {
    let callCount = 0;
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          metadata: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount <= 1) return Promise.resolve({ width: 800, height: 600 });
            return Promise.resolve({ width: 200, height: 150 });
          }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    const { seamCarve } = await importFresh();
    await expect(seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { width: 100 })).resolves.toBeDefined();
  });

  it("pre-resizes when height reduction exceeds 75%", async () => {
    let callCount = 0;
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          metadata: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount <= 1) return Promise.resolve({ width: 800, height: 600 });
            return Promise.resolve({ width: 200, height: 150 });
          }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    const { seamCarve } = await importFresh();
    await expect(seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { height: 100 })).resolves.toBeDefined();
  });

  it("pre-resizes large image for square mode with small target", async () => {
    let callCount = 0;
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          metadata: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount <= 1) return Promise.resolve({ width: 3775, height: 5662 });
            return Promise.resolve({ width: 944, height: 1416 });
          }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    const { seamCarve } = await importFresh();
    await expect(
      seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { width: 500, height: 500, square: true }),
    ).resolves.toBeDefined();

    const calls = mockExecFileAsync.mock.calls;
    const caireCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && c[1].includes("-square"));
    expect(caireCall).toBeDefined();
  });

  it("passes only width when height is not specified", async () => {
    const { seamCarve } = await importFresh();
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { width: 600 });

    const calls = mockExecFileAsync.mock.calls;
    const caireCall = calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && c[1].includes("-preview=false"),
    );
    expect(caireCall).toBeDefined();
    expect(caireCall?.[1]).toContain("-width");
    expect(caireCall?.[1]).toContain("600");
    expect(caireCall?.[1]).not.toContain("-height");
  });

  it("passes only height when width is not specified", async () => {
    const { seamCarve } = await importFresh();
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { height: 400 });

    const calls = mockExecFileAsync.mock.calls;
    const caireCall = calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && c[1].includes("-preview=false"),
    );
    expect(caireCall).toBeDefined();
    expect(caireCall?.[1]).not.toContain("-width");
    expect(caireCall?.[1]).toContain("-height");
    expect(caireCall?.[1]).toContain("400");
  });

  it("does not pass -face when protectFaces is false or absent", async () => {
    const { seamCarve } = await importFresh();
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { protectFaces: false });

    const calls = mockExecFileAsync.mock.calls;
    const caireCall = calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && c[1].includes("-preview=false"),
    );
    expect(caireCall).toBeDefined();
    expect(caireCall?.[1]).not.toContain("-face");
  });

  it("does not pass -blur and -sobel when not specified", async () => {
    const { seamCarve } = await importFresh();
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR);

    const calls = mockExecFileAsync.mock.calls;
    const caireCall = calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && c[1].includes("-preview=false"),
    );
    expect(caireCall).toBeDefined();
    expect(caireCall?.[1]).not.toContain("-blur");
    expect(caireCall?.[1]).not.toContain("-sobel");
  });

  it("includes megapixels in the too-large error message", async () => {
    const { seamCarve } = await importFresh();
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          metadata: vi.fn().mockResolvedValue({ width: 6000, height: 5000 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    await expect(seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("30.0 MP");
  });

  it("formats near-boundary exceeded megapixels with 2 decimal places (#3032)", async () => {
    const { seamCarve } = await importFresh();
    // 5001x5000 = 25.005 MP, where toFixed(1) would round down to "25.0"
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          metadata: vi.fn().mockResolvedValue({ width: 5001, height: 5000 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    const rejected = seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR);
    await expect(rejected).rejects.toSatisfy(isToolInputError);
    await expect(rejected).rejects.toThrow(
      "Image is too large for content-aware resize (25.01 MP, max 25 MP). Resize the image to a smaller size first.",
    );

    // 5004x5000 = 25.02 MP
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          metadata: vi.fn().mockResolvedValue({ width: 5004, height: 5000 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    await expect(seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Image is too large for content-aware resize (25.02 MP, max 25 MP). Resize the image to a smaller size first.",
    );

    // 25,000,001 pixels (25.000001 MP) never rounds down to 25.00 MP
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          metadata: vi.fn().mockResolvedValue({ width: 25_000_001, height: 1 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    await expect(seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Image is too large for content-aware resize (25.01 MP, max 25 MP). Resize the image to a smaller size first.",
    );

    // 5009x5000 = 25.045 MP -> 25.05 MP (2-decimal upper boundary) vs 5010x5000 = 25.05 MP -> 25.1 MP (1-decimal)
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          metadata: vi.fn().mockResolvedValue({ width: 5009, height: 5000 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    await expect(seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Image is too large for content-aware resize (25.05 MP, max 25 MP). Resize the image to a smaller size first.",
    );

    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          metadata: vi.fn().mockResolvedValue({ width: 5010, height: 5000 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    await expect(seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow(
      "Image is too large for content-aware resize (25.1 MP, max 25 MP). Resize the image to a smaller size first.",
    );
  });

  it("cleans up temp files even when image is too large", async () => {
    const { seamCarve } = await importFresh();
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          metadata: vi.fn().mockResolvedValue({ width: 6000, height: 5000 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    await expect(seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow();

    // rm is called for cleanup in finally block
    expect(rm).toHaveBeenCalledTimes(2);
  });

  it("caches the caire binary path after first discovery", async () => {
    const { seamCarve } = await importFresh();
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR);
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR);

    // caire -help should only be called once (path is cached)
    const helpCalls = mockExecFileAsync.mock.calls.filter(
      (c: unknown[]) => Array.isArray(c[1]) && c[1].includes("-help"),
    );
    expect(helpCalls).toHaveLength(1);
  });

  it("falls back to default caire when CAIRE_PATH is not set and caire is in PATH", async () => {
    const origCairePath = process.env.CAIRE_PATH;
    delete process.env.CAIRE_PATH;

    const { seamCarve } = await importFresh();
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR);

    // First call should try "caire" (the default PATH lookup)
    expect(mockExecFileAsync.mock.calls[0][0]).toBe("caire");

    if (origCairePath) process.env.CAIRE_PATH = origCairePath;
  });

  it("square mode uses shortest dimension for both width and height", async () => {
    const { seamCarve } = await importFresh();
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          metadata: vi.fn().mockResolvedValue({ width: 1200, height: 400 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { square: true });

    const calls = mockExecFileAsync.mock.calls;
    const caireCall = calls.find((c: unknown[]) => Array.isArray(c[1]) && c[1].includes("-square"));
    expect(caireCall).toBeDefined();
    // shortest side is 400
    expect(caireCall?.[1]).toContain("400");
  });

  it("propagates sharp metadata error", async () => {
    const { seamCarve } = await importFresh();
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          metadata: vi.fn().mockRejectedValue(new Error("Corrupt file header")),
        }) as unknown as ReturnType<typeof sharp>,
    );

    await expect(seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("Corrupt file header");
  });

  it("propagates sharp jpeg conversion error", async () => {
    const { seamCarve } = await importFresh();
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockRejectedValue(new Error("JPEG encode failed")),
          metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    await expect(seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("JPEG encode failed");
  });

  it("propagates readFile error when reading caire output", async () => {
    const { seamCarve } = await importFresh();
    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT: caire output missing"));

    await expect(seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("caire output missing");
  });

  it("propagates writeFile error when writing input", async () => {
    const { seamCarve } = await importFresh();
    vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC: disk full"));

    await expect(seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR)).rejects.toThrow("disk full");
  });

  it("uses default width and height when no options are specified", async () => {
    const { seamCarve } = await importFresh();
    // With 800x600, no width/height options, targetW = 800, targetH = 600
    // wRatio = 1, hRatio = 1, so no 75% check triggers
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR);

    const calls = mockExecFileAsync.mock.calls;
    const caireCall = calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && c[1].includes("-preview=false"),
    );
    expect(caireCall).toBeDefined();
    // No -width or -height when defaults match original
    expect(caireCall?.[1]).not.toContain("-width");
    expect(caireCall?.[1]).not.toContain("-height");
  });

  it("accepts 75% reduction exactly (ratio = 0.25)", async () => {
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    const { seamCarve } = await importFresh();
    // 200/800 = 0.25, exactly at boundary -- should NOT throw
    await expect(seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { width: 200 })).resolves.toBeDefined();
  });

  it("timeout is always an integer", async () => {
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          // 3775x5662 = 21.37 MP -- produces a float if not rounded
          metadata: vi.fn().mockResolvedValue({ width: 3775, height: 5662 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    const { seamCarve } = await importFresh();
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR);

    const calls = mockExecFileAsync.mock.calls;
    const caireCall = calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && c[1].includes("-preview=false"),
    );
    expect(caireCall).toBeDefined();
    const timeout = caireCall?.[2]?.timeout;
    expect(Number.isInteger(timeout)).toBe(true);
  });

  it("uses unique UUID in temp file names to prevent collisions", async () => {
    const { seamCarve } = await importFresh();

    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR);
    await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR);

    const writeCalls = vi.mocked(writeFile).mock.calls;
    const paths = writeCalls.map((c) => c[0] as string);
    // Each call generates a different UUID in the filename
    expect(paths[0]).not.toBe(paths[1]);
  });

  it("rejects target pixel count exceeding 25 MP with ToolInputError before spawning caire (#2997)", async () => {
    const { seamCarve } = await importFresh();
    vi.mocked(sharp).mockImplementation(
      () =>
        ({
          png: vi.fn().mockReturnThis(),
          jpeg: vi.fn().mockReturnThis(),
          resize: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-jpeg-data")),
          // 5000x4000 = 20 MP input: width 6250 (1.25x) gives 25,000,000 pixels (exact limit),
          // while width 6251 gives 25,004,000 pixels and width 8000 gives 32,000,000 pixels.
          metadata: vi.fn().mockResolvedValue({ width: 5000, height: 4000 }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    await expect(seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { width: 6250 })).resolves.toBeDefined();

    mockExecFileAsync.mockClear();
    const overBoundary = seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { width: 6251 });
    await expect(overBoundary).rejects.toSatisfy(isToolInputError);
    await expect(overBoundary).rejects.toThrow(/6251 x 4000.*25000000/);

    const run = seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { width: 8000 });
    await expect(run).rejects.toSatisfy(isToolInputError);
    await expect(run).rejects.toThrow(/8000 x 4000.*25000000/);

    const caireCalls = mockExecFileAsync.mock.calls.filter(
      (c: unknown[]) => Array.isArray(c[1]) && c[1].includes("-preview=false"),
    );
    expect(caireCalls).toHaveLength(0);
  });

  it("rejects seam-insertion enlargement beyond 2x on either axis with ToolInputError (#2997)", async () => {
    const { seamCarve } = await importFresh();
    // Default metadata is 800x600: 1600x1200 (2x) is allowed, 1601 width or 1201 height is rejected
    await expect(
      seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { width: 1600, height: 1200 }),
    ).resolves.toBeDefined();

    mockExecFileAsync.mockClear();
    const overWidth = seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { width: 1601 });
    await expect(overWidth).rejects.toSatisfy(isToolInputError);
    await expect(overWidth).rejects.toThrow(/at most 2x.*1601 x 600.*800 x 600/);

    const overHeight = seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { height: 1201 });
    await expect(overHeight).rejects.toSatisfy(isToolInputError);
    await expect(overHeight).rejects.toThrow(/at most 2x.*800 x 1201.*800 x 600/);

    const caireCalls = mockExecFileAsync.mock.calls.filter(
      (c: unknown[]) => Array.isArray(c[1]) && c[1].includes("-preview=false"),
    );
    expect(caireCalls).toHaveLength(0);
  });

  it("throws an operational SafeError when caire is killed on timeout (#2997)", async () => {
    const { seamCarve } = await importFresh();
    const killedErr = Object.assign(new Error("Command failed: caire"), { killed: true });
    mockExecFileAsync
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockRejectedValueOnce(killedErr);

    const err = await seamCarve(FAKE_INPUT, FAKE_OUTPUT_DIR, { width: 400 }).then(
      () => null,
      (e: unknown) => e,
    );

    expect(isSafeMessageError(err)).toBe(true);
    expect((err as SafeError).name).toBe("SafeError");
    expect((err as SafeError).kind).toBe("operational");
    expect((err as SafeError).code).toBe("PROCESSING_TIMEOUT");
    expect((err as SafeError).statusCode).toBe(422);
    expect((err as SafeError).message).toBe(
      "Content-aware resize timed out on this image. Try a smaller image or a larger target size.",
    );
    expect((err as SafeError).cause).toBe(killedErr);
  });
});
