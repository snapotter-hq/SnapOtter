/**
 * smart-crop handed padColor to Sharp as three hex slices with no check in
 * front of them. "white" or "" made the worker fail with a bare "Expected
 * number for background.red but received NaN" ("background.blue" for "#fff",
 * whose first two slices parse), and "#1z2y3x" quietly painted rgb(1, 2, 3)
 * with a 200 (#2201). The schema now takes only #rrggbb, the same pattern
 * border and image-pad use.
 */

import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerSmartCrop } from "../../../apps/api/src/routes/tools/smart-crop.js";

vi.mock("@snapotter/ai", () => ({ detectFaces: vi.fn() }));

type Parsed = {
  success: boolean;
  data?: { padColor: string };
  error?: { issues: { path: (string | number)[]; message: string }[] };
};
let schema: { safeParse: (v: unknown) => Parsed };
let config: NonNullable<ReturnType<typeof getToolConfig>>;

beforeAll(() => {
  registerSmartCrop({ post: vi.fn() } as unknown as FastifyInstance);
  const registered = getToolConfig("smart-crop");
  if (!registered) throw new Error("smart-crop was not registered");
  config = registered;
  schema = registered.settingsSchema as unknown as typeof schema;
});

describe("smart-crop padColor (#2201)", () => {
  it.each([
    "#fff",
    "white",
    "",
    "rgb(255,255,255)",
    "#ff00",
    "#1z2y3x",
    "#00ff00ff",
    "ffffff",
    " #ffffff",
    "#ffffff ",
  ])("refuses %j and names the field", (value) => {
    const result = schema.safeParse({ mode: "trim", padToSquare: true, padColor: value });
    expect(result.success).toBe(false);
    // The factory joins path and message into the 400's details, so the path
    // names the setting to fix and the message says what shape it wants.
    expect(result.error?.issues.map((i) => i.path)).toEqual([["padColor"]]);
    expect(result.error?.issues[0]?.message).toMatch(/six-digit hex color/);
  });

  it.each(["#ffffff", "#000000", "#FFAA00", "#1a2B3c"])("accepts %s", (value) => {
    const result = schema.safeParse({ padColor: value });
    expect(result.success).toBe(true);
    expect(result.data?.padColor).toBe(value);
  });

  it("keeps white as the default", () => {
    expect(schema.safeParse({}).data?.padColor).toBe("#ffffff");
  });

  it("refuses a bad colour whichever mode is set, so a saved pipeline fails when it runs", () => {
    for (const mode of ["subject", "face", "trim", "attention", "content"]) {
      expect(schema.safeParse({ mode, padColor: "#fff" }).success).toBe(false);
    }
  });

  it("paints the padding with the colour it was given", async () => {
    const input = await sharp({
      create: { width: 120, height: 40, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    // Three distinct channel values, so swapped slice offsets would show.
    const settings = schema.safeParse({
      mode: "trim",
      padToSquare: true,
      padColor: "#102030",
    }).data;
    const out = await config.process(input, settings, "wide.png", {} as ToolProcessCtx);
    const { data, info } = await sharp(out.buffer).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([120, 120]);
    // The strip sits in the middle of the square, so the top-left pixel is padding
    // and the centre is still the strip (a flat fill would fail here).
    expect([data[0], data[1], data[2]]).toEqual([16, 32, 48]);
    const centre = (60 * info.width + 60) * info.channels;
    expect([data[centre], data[centre + 1], data[centre + 2]]).toEqual([255, 0, 0]);
  });
});
