import type { FastifyInstance } from "fastify";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerRemoveBackground } from "../../../apps/api/src/routes/tools/remove-background.js";

vi.mock("@snapotter/ai", () => ({ removeBackground: vi.fn() }));

// The registry schema is what pipelines and batch runs validate against (#2075).
let accepts: (settings: unknown) => boolean;

beforeAll(() => {
  registerRemoveBackground({ post: vi.fn() } as unknown as FastifyInstance);
  const schema = getToolConfig("remove-background")?.settingsSchema;
  if (!schema) throw new Error("remove-background is not registered");
  accepts = (settings) => schema.safeParse(settings).success;
});

describe("remove-background settings validation (#2075)", () => {
  it.each(["#FF0000", "#ff0000", "#F00", "#f00", "ff0000", "f00"])("accepts the color %s", (c) => {
    expect(accepts({ backgroundType: "color", backgroundColor: c })).toBe(true);
    expect(accepts({ backgroundType: "gradient", gradientColor1: c, gradientColor2: "#000" })).toBe(
      true,
    );
  });

  it.each(["red", "#FF", "#FF00", "#GGGGGG", "#FF00000", "", 'red"/><x'])(
    "rejects the malformed color %j everywhere a color is read",
    (c) => {
      expect(accepts({ backgroundType: "color", backgroundColor: c })).toBe(false);
      expect(
        accepts({ backgroundType: "gradient", gradientColor1: c, gradientColor2: "#000000" }),
      ).toBe(false);
      expect(
        accepts({ backgroundType: "gradient", gradientColor1: "#000000", gradientColor2: c }),
      ).toBe(false);
    },
  );

  it("trims whitespace around a typed color", () => {
    expect(accepts({ backgroundType: "color", backgroundColor: " #FF0000 " })).toBe(true);
  });

  it("requires a color for a color background", () => {
    expect(accepts({ backgroundType: "color" })).toBe(false);
  });

  it("requires both stops for a gradient background", () => {
    expect(accepts({ backgroundType: "gradient" })).toBe(false);
    expect(accepts({ backgroundType: "gradient", gradientColor1: "#000000" })).toBe(false);
    expect(accepts({ backgroundType: "gradient", gradientColor2: "#000000" })).toBe(false);
  });

  it("still accepts settings that name no background, or a type that needs no color", () => {
    expect(accepts({})).toBe(true);
    expect(accepts({ backgroundType: "transparent" })).toBe(true);
    expect(accepts({ backgroundType: "blur" })).toBe(true);
    expect(accepts({ backgroundType: "blur", blurEnabled: true, blurIntensity: 40 })).toBe(true);
    expect(accepts({ shadowEnabled: true })).toBe(true);
  });

  it("does not demand colors the chosen background type doesn't use", () => {
    // A stale colour left over from switching tabs in the UI must not fail the run.
    expect(accepts({ backgroundType: "transparent", backgroundColor: "#FF0000" })).toBe(true);
  });
});
