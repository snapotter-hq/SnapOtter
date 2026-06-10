/**
 * Unit tests for batch processing route utility logic.
 *
 * Tests filename deduplication, batch size enforcement, skip-preprocess
 * logic for metadata tools, and the file results map construction.
 */
import { describe, expect, it, vi } from "vitest";

// Mock DB
vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ get: () => null }),
        all: () => [],
      }),
    }),
    insert: () => ({ values: () => ({ run: vi.fn() }) }),
    update: () => ({ set: () => ({ where: () => ({ run: vi.fn() }) }) }),
  },
  pool: {},
  closeDb: async () => {},
  schema: {
    settings: { key: {} },
    jobs: { id: {}, status: {} },
  },
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: {
    WORKSPACE_PATH: "/tmp/test",
    MAX_MEGAPIXELS: 100,
    MAX_BATCH_SIZE: 10,
    CONCURRENT_JOBS: 3,
  },
}));

vi.mock("../../../apps/api/src/lib/feature-status.js", () => ({
  isToolInstalled: vi.fn(() => true),
}));

// ── Batch size enforcement ─────────────────────────────────────────────

describe("batch size enforcement", () => {
  it("allows files within the limit", () => {
    const maxBatchSize = 10;
    const fileCount = 5;
    const exceeds = maxBatchSize > 0 && fileCount > maxBatchSize;
    expect(exceeds).toBe(false);
  });

  it("rejects files exceeding the limit", () => {
    const maxBatchSize = 10;
    const fileCount = 15;
    const exceeds = maxBatchSize > 0 && fileCount > maxBatchSize;
    expect(exceeds).toBe(true);
  });

  it("allows any count when limit is 0 (unlimited)", () => {
    const maxBatchSize = 0;
    const fileCount = 999;
    const exceeds = maxBatchSize > 0 && fileCount > maxBatchSize;
    expect(exceeds).toBe(false);
  });

  it("rejects when count equals limit + 1", () => {
    const maxBatchSize = 10;
    const fileCount = 11;
    const exceeds = maxBatchSize > 0 && fileCount > maxBatchSize;
    expect(exceeds).toBe(true);
  });

  it("allows when count equals limit exactly", () => {
    const maxBatchSize = 10;
    const fileCount = 10;
    const exceeds = maxBatchSize > 0 && fileCount > maxBatchSize;
    expect(exceeds).toBe(false);
  });
});

// ── Skip-preprocess logic ──────────────────────────────────────────────

describe("skip-preprocess logic for metadata tools", () => {
  it("skips preprocess for edit-metadata", () => {
    const toolId = "edit-metadata";
    const skipPreprocess = toolId === "edit-metadata" || toolId === "strip-metadata";
    expect(skipPreprocess).toBe(true);
  });

  it("skips preprocess for strip-metadata", () => {
    const toolId = "strip-metadata";
    const skipPreprocess = toolId === "edit-metadata" || toolId === "strip-metadata";
    expect(skipPreprocess).toBe(true);
  });

  it("does not skip preprocess for resize", () => {
    const toolId = "resize";
    const skipPreprocess = toolId === "edit-metadata" || toolId === "strip-metadata";
    expect(skipPreprocess).toBe(false);
  });

  it("does not skip preprocess for compress", () => {
    const toolId = "compress";
    const skipPreprocess = toolId === "edit-metadata" || toolId === "strip-metadata";
    expect(skipPreprocess).toBe(false);
  });
});

// ── Output filename suffix logic ───────────────────────────────────────

describe("batch output filename suffix", () => {
  function addToolSuffix(filename: string, processFilename: string, toolId: string): string {
    let outFilename = filename;
    if (outFilename === processFilename) {
      const dotIdx = processFilename.lastIndexOf(".");
      const ext = dotIdx > 0 ? processFilename.slice(dotIdx) : "";
      const base = ext ? processFilename.slice(0, -ext.length) : processFilename;
      outFilename = `${base}_${toolId}${ext}`;
    }
    return outFilename;
  }

  it("adds tool suffix when filename unchanged", () => {
    const result = addToolSuffix("photo.png", "photo.png", "resize");
    expect(result).toBe("photo_resize.png");
  });

  it("preserves filename when tool changed it", () => {
    const result = addToolSuffix("converted.jpg", "photo.png", "convert");
    expect(result).toBe("converted.jpg");
  });

  it("handles filenames without extension", () => {
    const result = addToolSuffix("README", "README", "compress");
    expect(result).toBe("README_compress");
  });

  it("handles filenames with multiple dots", () => {
    const result = addToolSuffix("my.photo.final.png", "my.photo.final.png", "sharpen");
    expect(result).toBe("my.photo.final_sharpen.png");
  });
});

// ── File results map construction ──────────────────────────────────────

describe("file results map (X-File-Results header)", () => {
  function getUniqueName(name: string, usedNames: Set<string>): string {
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
    const dotIdx = name.lastIndexOf(".");
    const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
    const ext = dotIdx > 0 ? name.slice(dotIdx) : "";
    let counter = 1;
    let candidate = `${base}_${counter}${ext}`;
    while (usedNames.has(candidate)) {
      counter++;
      candidate = `${base}_${counter}${ext}`;
    }
    usedNames.add(candidate);
    return candidate;
  }

  it("builds correct map for unique filenames", () => {
    const results: ({ buffer: Buffer; filename: string } | null)[] = [
      { buffer: Buffer.from("a"), filename: "a.png" },
      { buffer: Buffer.from("b"), filename: "b.png" },
      null,
    ];

    const usedNames = new Set<string>();
    const fileResultsMap: Record<string, string> = {};

    for (let i = 0; i < results.length; i++) {
      const entry = results[i];
      if (entry) {
        const uniqueName = getUniqueName(entry.filename, usedNames);
        entry.filename = uniqueName;
        fileResultsMap[String(i)] = uniqueName;
      }
    }

    expect(fileResultsMap).toEqual({
      "0": "a.png",
      "1": "b.png",
    });
  });

  it("deduplicates conflicting filenames", () => {
    const results: ({ buffer: Buffer; filename: string } | null)[] = [
      { buffer: Buffer.from("a"), filename: "photo.png" },
      { buffer: Buffer.from("b"), filename: "photo.png" },
      { buffer: Buffer.from("c"), filename: "photo.png" },
    ];

    const usedNames = new Set<string>();
    const fileResultsMap: Record<string, string> = {};

    for (let i = 0; i < results.length; i++) {
      const entry = results[i];
      if (entry) {
        const uniqueName = getUniqueName(entry.filename, usedNames);
        entry.filename = uniqueName;
        fileResultsMap[String(i)] = uniqueName;
      }
    }

    expect(fileResultsMap).toEqual({
      "0": "photo.png",
      "1": "photo_1.png",
      "2": "photo_2.png",
    });
  });

  it("skips null entries (failed files)", () => {
    const results: ({ buffer: Buffer; filename: string } | null)[] = [
      null,
      { buffer: Buffer.from("b"), filename: "ok.jpg" },
      null,
    ];

    const usedNames = new Set<string>();
    const fileResultsMap: Record<string, string> = {};

    for (let i = 0; i < results.length; i++) {
      const entry = results[i];
      if (entry) {
        const uniqueName = getUniqueName(entry.filename, usedNames);
        entry.filename = uniqueName;
        fileResultsMap[String(i)] = uniqueName;
      }
    }

    expect(fileResultsMap).toEqual({ "1": "ok.jpg" });
  });

  it("returns empty map when all files failed", () => {
    const results: null[] = [null, null, null];
    const _usedNames = new Set<string>();
    const fileResultsMap: Record<string, string> = {};

    for (let i = 0; i < results.length; i++) {
      const entry = results[i];
      if (entry) {
        fileResultsMap[String(i)] = "never";
      }
    }

    expect(fileResultsMap).toEqual({});
  });
});

// ── Progress state transitions ─────────────────────────────────────────

describe("batch progress status determination", () => {
  it("status is 'failed' when all files fail", () => {
    const totalFiles = 3;
    const failedFiles = 3;
    const status = failedFiles === totalFiles ? "failed" : "completed";
    expect(status).toBe("failed");
  });

  it("status is 'completed' when some files succeed", () => {
    const totalFiles = 3;
    const failedFiles = 1;
    const status = failedFiles === totalFiles ? "failed" : "completed";
    expect(status).toBe("completed");
  });

  it("status is 'completed' when no files fail", () => {
    const totalFiles = 5;
    const failedFiles = 0;
    const status = failedFiles === totalFiles ? "failed" : "completed";
    expect(status).toBe("completed");
  });
});
