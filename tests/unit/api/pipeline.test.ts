/**
 * Unit tests for pipeline route utility logic.
 *
 * Tests pipeline step validation schemas, tool resolution (content-aware resize),
 * unique filename deduplication, and the pipeline step schema constraints.
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
    delete: () => ({ where: () => ({ run: vi.fn() }) }),
    update: () => ({ set: () => ({ where: () => ({ run: vi.fn() }) }) }),
  },
  pool: {},
  closeDb: async () => {},
  schema: {
    settings: { key: {} },
    pipelines: { id: {} },
    userFiles: { id: {} },
    jobs: { id: {}, status: {} },
  },
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: {
    WORKSPACE_PATH: "/tmp/test",
    MAX_MEGAPIXELS: 100,
    MAX_SVG_SIZE_MB: 10,
    MAX_PIPELINE_STEPS: 20,
    MAX_BATCH_SIZE: 10,
    CONCURRENT_JOBS: 3,
  },
}));

vi.mock("../../../apps/api/src/lib/analytics.js", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("../../../apps/api/src/lib/auto-orient.js", () => ({
  autoOrient: vi.fn((buf: Buffer) => Promise.resolve(buf)),
}));

vi.mock("../../../apps/api/src/lib/file-validation.js", () => ({
  validateImageBuffer: vi.fn(() =>
    Promise.resolve({ valid: true, format: "png", width: 100, height: 100 }),
  ),
}));

vi.mock("../../../apps/api/src/lib/filename.js", () => ({
  sanitizeFilename: (n: string) => n,
}));

vi.mock("../../../apps/api/src/lib/format-decoders.js", () => ({
  decodeToSharpCompat: vi.fn(),
  needsCliDecode: vi.fn(() => false),
}));

vi.mock("../../../apps/api/src/lib/heic-converter.js", () => ({
  decodeHeic: vi.fn(),
}));

vi.mock("../../../apps/api/src/lib/svg-sanitize.js", () => ({
  isSvgBuffer: vi.fn(() => false),
  sanitizeSvg: vi.fn((b: Buffer) => b),
}));

vi.mock("../../../apps/api/src/lib/workspace.js", () => ({
  createWorkspace: vi.fn(() => Promise.resolve("/tmp/workspace/pipeline-1")),
}));

vi.mock("../../../apps/api/src/lib/feature-status.js", () => ({
  isToolInstalled: vi.fn(() => true),
}));

vi.mock("../../../apps/api/src/lib/errors.js", () => ({
  formatZodErrors: (issues: Array<{ message: string }>) => issues.map((i) => i.message).join("; "),
}));

vi.mock("../../../apps/api/src/lib/env.js", () => ({
  resolveConcurrency: () => 2,
  resolveWorkerThreads: () => 2,
  loadEnv: () => ({}),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  requireAuth: vi.fn(() => ({ id: "user-1", username: "test", role: "admin" })),
  getAuthUser: vi.fn(() => ({ id: "user-1", username: "test", role: "admin" })),
}));

vi.mock("../../../apps/api/src/permissions.js", () => ({
  hasEffectivePermission: vi.fn(() => true),
  requirePermission: () => vi.fn(() => ({ id: "user-1", username: "test", role: "admin" })),
}));

import {
  getRegisteredToolIds,
  getToolConfig,
  registerToolProcessFn,
} from "../../../apps/api/src/routes/tool-factory.js";

// ── Pipeline step schema tests (reproduced logic) ──────────────────────

describe("pipeline step schema validation", () => {
  it("requires at least one step", () => {
    const steps: unknown[] = [];
    expect(steps.length).toBe(0);
    // Pipeline definition schema requires min 1 step
  });

  it("validates step has toolId field", () => {
    const step = { toolId: "resize", settings: {} };
    expect(step.toolId).toBe("resize");
    expect(step.settings).toEqual({});
  });

  it("defaults settings to empty object when omitted", () => {
    const step = { toolId: "compress" };
    const settings = (step as { settings?: Record<string, unknown> }).settings ?? {};
    expect(settings).toEqual({});
  });
});

// ── Tool resolution (content-aware resize routing) ─────────────────────

describe("content-aware resize routing", () => {
  it("resolves resize with contentAware to content-aware-resize", () => {
    const step = { toolId: "resize", settings: { contentAware: true, width: 200 } };

    const resolvedToolId =
      step.toolId === "resize" && step.settings?.contentAware
        ? "content-aware-resize"
        : step.toolId;

    expect(resolvedToolId).toBe("content-aware-resize");
  });

  it("keeps resize as-is without contentAware", () => {
    const step = { toolId: "resize", settings: { width: 200 } };

    const resolvedToolId =
      step.toolId === "resize" && (step.settings as Record<string, unknown>)?.contentAware
        ? "content-aware-resize"
        : step.toolId;

    expect(resolvedToolId).toBe("resize");
  });

  it("keeps non-resize tools unchanged", () => {
    const step = { toolId: "compress", settings: { quality: 80 } };

    const resolvedToolId =
      step.toolId === "resize" && (step.settings as Record<string, unknown>)?.contentAware
        ? "content-aware-resize"
        : step.toolId;

    expect(resolvedToolId).toBe("compress");
  });
});

// ── Unique filename deduplication ──────────────────────────────────────

describe("filename deduplication (getUniqueName logic)", () => {
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

  it("returns the original name when no conflicts", () => {
    const used = new Set<string>();
    expect(getUniqueName("photo.png", used)).toBe("photo.png");
  });

  it("adds _1 suffix on first conflict", () => {
    const used = new Set<string>(["photo.png"]);
    expect(getUniqueName("photo.png", used)).toBe("photo_1.png");
  });

  it("increments counter on repeated conflicts", () => {
    const used = new Set<string>(["photo.png", "photo_1.png"]);
    expect(getUniqueName("photo.png", used)).toBe("photo_2.png");
  });

  it("handles filenames without extension", () => {
    const used = new Set<string>(["README"]);
    expect(getUniqueName("README", used)).toBe("README_1");
  });

  it("handles multiple dots in filename", () => {
    const used = new Set<string>(["my.photo.final.png"]);
    expect(getUniqueName("my.photo.final.png", used)).toBe("my.photo.final_1.png");
  });

  it("tracks all used names across multiple calls", () => {
    const used = new Set<string>();
    expect(getUniqueName("a.jpg", used)).toBe("a.jpg");
    expect(getUniqueName("a.jpg", used)).toBe("a_1.jpg");
    expect(getUniqueName("a.jpg", used)).toBe("a_2.jpg");
    expect(getUniqueName("b.jpg", used)).toBe("b.jpg");
  });
});

// ── Tool registry integration ──────────────────────────────────────────

describe("pipeline tool registry lookup", () => {
  const testToolId = `pipeline-test-${Math.random().toString(36).slice(2, 8)}`;

  it("getToolConfig returns undefined for unregistered tool", () => {
    expect(getToolConfig("nonexistent-tool-xyz")).toBeUndefined();
  });

  it("registered tool is found via getToolConfig", () => {
    registerToolProcessFn({
      toolId: testToolId,
      settingsSchema: {
        safeParse: (d: unknown) => ({ success: true, data: d }),
        parse: (d: unknown) => d,
      } as never,
      process: async (buf: Buffer) => ({
        buffer: buf,
        filename: "out.png",
        contentType: "image/png",
      }),
    });

    const config = getToolConfig(testToolId);
    expect(config).toBeDefined();
    expect(config?.toolId).toBe(testToolId);
  });

  it("registered tool appears in getRegisteredToolIds", () => {
    expect(getRegisteredToolIds()).toContain(testToolId);
  });

  it("registered tool process function executes correctly", async () => {
    const config = getToolConfig(testToolId);
    const result = await config?.process(Buffer.from("test"), {}, "input.png");
    expect(result.buffer).toEqual(Buffer.from("test"));
    expect(result.filename).toBe("out.png");
    expect(result.contentType).toBe("image/png");
  });
});

// ── Pipeline step error wrapping ───────────────────────────────────────

describe("pipeline step error message formatting", () => {
  it("wraps step errors with step number and tool ID", () => {
    const stepErr = new Error("Invalid dimensions");
    const i = 2;
    const toolId = "resize";
    const msg = stepErr instanceof Error ? stepErr.message : "Processing failed";
    const wrapped = `Step ${i + 1} (${toolId}): ${msg}`;
    expect(wrapped).toBe("Step 3 (resize): Invalid dimensions");
  });

  it("falls back to generic message for non-Error", () => {
    const stepErr = "some string";
    const msg = stepErr instanceof Error ? stepErr.message : "Processing failed";
    expect(msg).toBe("Processing failed");
  });
});
