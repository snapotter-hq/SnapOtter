import { describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ get: () => null }) }),
    }),
    insert: () => ({ values: () => ({ run: vi.fn() }) }),
  },
  pool: {},
  closeDb: async () => {},
  schema: { settings: {}, userFiles: {} },
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: {
    WORKSPACE_PATH: "/tmp/test",
    MAX_MEGAPIXELS: 100,
    MAX_SVG_SIZE_MB: 10,
  },
}));

import type { AnyToolRouteConfig } from "../../../apps/api/src/routes/tool-factory.js";
import {
  getRegisteredToolIds,
  getToolConfig,
  registerToolProcessFn,
} from "../../../apps/api/src/routes/tool-factory.js";

const mockSchema = {
  safeParse: (data: unknown) => ({ success: true, data }),
  parse: (data: unknown) => data,
};

const strictSchema = {
  safeParse: (data: unknown) => {
    const obj = data as Record<string, unknown>;
    if (typeof obj?.quality !== "number" || obj.quality < 1 || obj.quality > 100) {
      return { success: false, error: { issues: [{ message: "Invalid" }] } };
    }
    return { success: true, data };
  },
  parse: (data: unknown) => data,
};

function makeMockConfig(toolId: string): AnyToolRouteConfig {
  return {
    toolId,
    settingsSchema: mockSchema as never,
    process: async (buf: Buffer, _settings: unknown, filename: string) => ({
      buffer: buf,
      filename,
      contentType: "image/png",
    }),
  };
}

describe("tool-factory registry functions", () => {
  const uniqueId = () => `test-tool-${Math.random().toString(36).slice(2, 10)}`;

  describe("registerToolProcessFn", () => {
    it("adds a tool to the registry", () => {
      const id = uniqueId();
      registerToolProcessFn(makeMockConfig(id));
      expect(getToolConfig(id)).toBeDefined();
    });

    it("stores the correct config", () => {
      const id = uniqueId();
      const config = makeMockConfig(id);
      registerToolProcessFn(config);
      const stored = getToolConfig(id);
      expect(stored?.toolId).toBe(id);
      expect(stored?.process).toBe(config.process);
      expect(stored?.settingsSchema).toBe(config.settingsSchema);
    });
  });

  describe("getToolConfig", () => {
    it("returns the config for a registered tool", () => {
      const id = uniqueId();
      registerToolProcessFn(makeMockConfig(id));
      const config = getToolConfig(id);
      expect(config).toBeDefined();
      expect(config?.toolId).toBe(id);
    });

    it("returns undefined for an unregistered tool", () => {
      expect(getToolConfig("nonexistent-tool-xyz-999")).toBeUndefined();
    });
  });

  describe("getRegisteredToolIds", () => {
    it("includes a registered tool", () => {
      const id = uniqueId();
      registerToolProcessFn(makeMockConfig(id));
      expect(getRegisteredToolIds()).toContain(id);
    });

    it("includes multiple registered tools", () => {
      const id1 = uniqueId();
      const id2 = uniqueId();
      registerToolProcessFn(makeMockConfig(id1));
      registerToolProcessFn(makeMockConfig(id2));
      const ids = getRegisteredToolIds();
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
    });

    it("returns an array", () => {
      expect(Array.isArray(getRegisteredToolIds())).toBe(true);
    });
  });

  describe("overwrite behavior", () => {
    it("later registration overwrites earlier for the same toolId", async () => {
      const id = uniqueId();
      const original = makeMockConfig(id);
      registerToolProcessFn(original);

      const replacement: AnyToolRouteConfig = {
        toolId: id,
        settingsSchema: strictSchema as never,
        process: async (buf: Buffer, _settings: unknown, filename: string) => ({
          buffer: buf,
          filename: `replaced-${filename}`,
          contentType: "image/jpeg",
        }),
      };
      registerToolProcessFn(replacement);

      const stored = getToolConfig(id);
      expect(stored?.process).toBe(replacement.process);
      expect(stored?.settingsSchema).toBe(replacement.settingsSchema);
      expect(stored?.process).not.toBe(original.process);
    });

    it("overwriting does not change the count for that toolId", () => {
      const id = uniqueId();
      registerToolProcessFn(makeMockConfig(id));
      const countBefore = getRegisteredToolIds().filter((x) => x === id).length;
      registerToolProcessFn(makeMockConfig(id));
      const countAfter = getRegisteredToolIds().filter((x) => x === id).length;
      expect(countBefore).toBe(1);
      expect(countAfter).toBe(1);
    });
  });

  describe("process function execution", () => {
    it("stored process function returns expected output", async () => {
      const id = uniqueId();
      registerToolProcessFn(makeMockConfig(id));
      const config = getToolConfig(id)!;
      const input = Buffer.from("test-data");
      const result = await config.process(input, {}, "photo.png");
      expect(result.buffer).toBe(input);
      expect(result.filename).toBe("photo.png");
      expect(result.contentType).toBe("image/png");
    });

    it("stored process function with custom schema validates correctly", () => {
      const id = uniqueId();
      registerToolProcessFn({
        toolId: id,
        settingsSchema: strictSchema as never,
        process: async (buf, _s, fn) => ({ buffer: buf, filename: fn, contentType: "image/png" }),
      });
      const config = getToolConfig(id)!;
      const valid = config.settingsSchema.safeParse({ quality: 50 });
      expect(valid.success).toBe(true);
      const invalid = config.settingsSchema.safeParse({ quality: 200 });
      expect(invalid.success).toBe(false);
    });
  });
});
