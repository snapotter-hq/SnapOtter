import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { load } from "js-yaml";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerCompress } from "../../../apps/api/src/routes/tools/compress.js";

const app = { post: () => undefined } as unknown as FastifyInstance;
registerCompress(app);

const root = join(__dirname, "../../..");
const spec = load(readFileSync(join(root, "apps/api/src/openapi.yaml"), "utf8")) as {
  paths: Record<string, Record<string, { deprecated?: boolean; description?: string }>>;
};

const DEPRECATED_SIZES = [20, 50, 100, 200, 500];

describe("compress-to-size replacement (#4389)", () => {
  it("serves target-size compression from the compress route", () => {
    expect(getToolConfig("compress")?.processV2).toBeDefined();
  });

  it("rejects a target-size request without targetSizeKb", async () => {
    const config = getToolConfig("compress");
    const input = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#336699" },
    })
      .jpeg()
      .toBuffer();
    await expect(
      config?.processV2?.({
        inputs: [{ buffer: input, filename: "a.jpg", ref: "uploads/t/a.jpg" }],
        settings: { mode: "targetSize" },
        scratchDir: "/tmp",
        signal: new AbortController().signal,
        report: () => undefined,
      }),
    ).rejects.toThrow();
  });

  it.each([0, -5])("rejects a non-positive targetSizeKb (%s)", async (targetSizeKb) => {
    const config = getToolConfig("compress");
    const input = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#336699" },
    })
      .jpeg()
      .toBuffer();
    await expect(
      config?.processV2?.({
        inputs: [{ buffer: input, filename: "a.jpg", ref: "uploads/t/a.jpg" }],
        settings: { mode: "targetSize", targetSizeKb },
        scratchDir: "/tmp",
        signal: new AbortController().signal,
        report: () => undefined,
      }),
    ).rejects.toThrow();
  });

  it.each(DEPRECATED_SIZES)(
    "marks the %skb path deprecated and points at the replacement",
    (size) => {
      const op = spec.paths[`/api/v1/tools/image/compress-image-to-${size}kb`]?.post;
      expect(op?.deprecated).toBe(true);
      expect(op?.description).toContain("POST /api/v1/tools/image/compress");
      expect(op?.description).toContain(`targetSizeKb\` set to ${size}`);
    },
  );

  it("documents the replacement on the compress operation", () => {
    const op = spec.paths["/api/v1/tools/image/compress"]?.post;
    expect(op?.deprecated).toBeUndefined();
    expect(op?.description).toContain("compress-image-to-");
  });
});
