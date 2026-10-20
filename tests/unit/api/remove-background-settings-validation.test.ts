import { readFileSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { load } from "js-yaml";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import {
  effectsSchema,
  phase1SettingsSchema,
  registerRemoveBackground,
} from "../../../apps/api/src/routes/tools/remove-background.js";
import { pairwise } from "../../helpers/pairwise.js";
import {
  defaultSettingsFor,
  pairwiseSettingsFor,
  TOOL_SETTINGS_OVERRIDES,
} from "../../helpers/tool-default-settings.js";
import { compactCase, deriveAxes } from "../../helpers/zod-pict.js";

const mocks = vi.hoisted(() => ({
  removeBackground: vi.fn(),
  isToolInstalled: vi.fn(() => true),
  receiveUpload: vi.fn(),
  getObjectBuffer: vi.fn(),
  putObject: vi.fn(),
  discardUnenqueuedUploads: vi.fn(),
  enqueueToolJob: vi.fn(),
}));

vi.mock("@snapotter/ai", () => ({ removeBackground: mocks.removeBackground }));
vi.mock("../../../apps/api/src/lib/feature-status.js", () => ({
  isToolInstalled: mocks.isToolInstalled,
}));
vi.mock("../../../apps/api/src/lib/upload-stream.js", () => ({
  receiveUpload: mocks.receiveUpload,
}));
vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    getObjectBuffer: mocks.getObjectBuffer,
    putObject: mocks.putObject,
  };
});
vi.mock("../../../apps/api/src/lib/upload-cleanup.js", () => ({
  discardUnenqueuedUploads: mocks.discardUnenqueuedUploads,
  hasPersistedJobRow: vi.fn(async () => false),
}));
vi.mock("../../../apps/api/src/jobs/enqueue.js", () => ({
  enqueueToolJob: mocks.enqueueToolJob,
  insertToolJobAlias: vi.fn(),
}));

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

// The registry schema is what pipelines and batch runs validate against (#2075).
let accepts: (settings: unknown) => boolean;
let phase1Handler: ((req: unknown, reply: unknown) => Promise<unknown>) | undefined;
let validPng: Buffer;

beforeAll(async () => {
  validPng = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();

  const post = vi.fn((url: string, handler: (req: unknown, reply: unknown) => Promise<unknown>) => {
    if (url === "/api/v1/tools/image/remove-background") {
      phase1Handler = handler;
    }
  });
  registerRemoveBackground({ post } as unknown as FastifyInstance);
  const schema = getToolConfig("remove-background")?.settingsSchema;
  if (!schema) throw new Error("remove-background is not registered");
  accepts = (settings) => schema.safeParse(settings).success;
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isToolInstalled.mockReturnValue(true);
  mocks.receiveUpload.mockImplementation(async (_part: unknown, jobId: string) => ({
    key: `uploads/${jobId}/photo.png`,
    filename: "photo.png",
    size: validPng.length,
  }));
  mocks.getObjectBuffer.mockResolvedValue(validPng);
  mocks.putObject.mockResolvedValue(undefined);
  mocks.discardUnenqueuedUploads.mockResolvedValue(undefined);
  mocks.enqueueToolJob.mockResolvedValue(undefined);
});

async function callPhase1Route(settings: Record<string, unknown>) {
  if (!phase1Handler) throw new Error("Phase 1 route handler was not registered");
  const reply = {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(body: unknown) {
      this.payload = body;
      return this;
    },
  };
  const request = {
    headers: {},
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    parts: async function* () {
      yield { type: "file", fieldname: "file", filename: "photo.png", file: {} };
      yield { type: "field", fieldname: "settings", value: JSON.stringify(settings) };
    },
  };
  await phase1Handler(request, reply);
  return {
    statusCode: reply.statusCode,
    body: reply.payload as { error?: string; details?: string; jobId?: string },
  };
}

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

describe("remove-background Phase 1 settings validation (#2281)", () => {
  it("accepts empty settings and Phase 1 model/refinement fields", async () => {
    expect(phase1SettingsSchema.safeParse({}).success).toBe(true);
    expect(
      phase1SettingsSchema.safeParse({
        model: "u2net",
        edgeRefine: 2,
        decontaminate: true,
      }),
    ).toEqual({
      success: true,
      data: {
        model: "u2net",
        edgeRefine: 2,
        decontaminate: true,
      },
    });

    const res = await callPhase1Route({
      model: "birefnet-portrait",
      edgeRefine: 1,
      decontaminate: false,
    });
    expect(res.statusCode).toBe(202);
    expect(mocks.enqueueToolJob).toHaveBeenCalledWith(
      expect.objectContaining({
        toolId: "remove-background",
        kind: "ai-tool",
        settings: {
          model: "birefnet-portrait",
          edgeRefine: 1,
          decontaminate: false,
        },
      }),
    );
  });

  it.each([
    ["backgroundType (color)", { backgroundType: "color", backgroundColor: "#FF0000" }],
    ["backgroundType (transparent)", { backgroundType: "transparent" }],
    [
      "backgroundType (gradient)",
      { backgroundType: "gradient", gradientColor1: "#000", gradientColor2: "#fff" },
    ],
    ["backgroundType (blur)", { backgroundType: "blur" }],
    ["backgroundType (image)", { backgroundType: "image" }],
    ["backgroundColor", { backgroundColor: "#FF0000" }],
    ["gradientColor1", { gradientColor1: "#FF0000" }],
    ["gradientColor2", { gradientColor2: "#0000FF" }],
    ["gradientAngle", { gradientAngle: 90 }],
    ["blurEnabled", { blurEnabled: true }],
    ["blurIntensity", { blurIntensity: 50 }],
    ["shadowEnabled", { shadowEnabled: true }],
    ["shadowOpacity", { shadowOpacity: 35 }],
    ["outputFormat", { outputFormat: "webp" }],
    [
      "mixed Phase 1 and Phase 2 fields",
      { backgroundType: "transparent", edgeRefine: 2, outputFormat: "png" },
    ],
  ])("rejects %s on Phase 1 with a 400 naming /effects", async (_label, settings) => {
    const parsed = phase1SettingsSchema.safeParse(settings);
    expect(parsed.success).toBe(false);

    const res = await callPhase1Route(settings);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid settings");
    expect(res.body.details).toMatch(/\/api\/v1\/tools\/image\/remove-background\/effects/);
    expect(mocks.putObject).not.toHaveBeenCalled();
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
    expect(mocks.discardUnenqueuedUploads).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid model or out-of-range edgeRefine on Phase 1", async () => {
    const badModel = await callPhase1Route({ model: "not-a-model" });
    expect(badModel.statusCode).toBe(400);
    expect(badModel.body.error).toBe("Invalid settings");

    const badEdge = await callPhase1Route({ edgeRefine: 5 });
    expect(badEdge.statusCode).toBe(400);
    expect(badEdge.body.error).toBe("Invalid settings");
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
  });

  it("lists Phase 1 and Phase 2 parameters separately in the docs (#2281)", () => {
    const doc = readFileSync(
      path.join(REPO_ROOT, "apps/docs/tools/image/remove-background.md"),
      "utf8",
    );
    const [phase1Section, phase2Section] = doc.split("## Effects Endpoint (Phase 2)");
    expect(phase1Section).toBeDefined();
    expect(phase2Section).toBeDefined();

    // Phase 1 parameter rows only cover file, model, edgeRefine, decontaminate.
    for (const field of [
      "backgroundType",
      "backgroundColor",
      "gradientColor1",
      "gradientColor2",
      "gradientAngle",
      "blurEnabled",
      "blurIntensity",
      "shadowEnabled",
      "shadowOpacity",
      "outputFormat",
    ]) {
      expect(phase1Section).not.toMatch(new RegExp(`^\\|\\s*${field}\\s*\\|`, "m"));
      expect(phase2Section).toMatch(new RegExp(`^\\|\\s*${field}\\s*\\|`, "m"));
    }

    // The Phase 1 curl example must pass phase1SettingsSchema validation.
    const phase1CurlSettings = [...phase1Section.matchAll(/-F 'settings=(\{[^']*\})'/g)];
    expect(phase1CurlSettings.length).toBeGreaterThan(0);
    for (const match of phase1CurlSettings) {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>;
      expect(phase1SettingsSchema.safeParse(parsed).success).toBe(true);
    }
  });

  it("defaultSettingsFor('remove-background') is valid for both Phase 1 HTTP and pipeline schemas (#2978)", async () => {
    const defaults = defaultSettingsFor("remove-background") as Record<string, unknown>;
    expect(TOOL_SETTINGS_OVERRIDES["remove-background"]).toBeUndefined();
    expect(phase1SettingsSchema.safeParse(defaults)).toEqual({
      success: true,
      data: {},
    });
    expect(accepts(defaults)).toBe(true);

    const res = await callPhase1Route(defaults);
    expect(res.statusCode).toBe(202);
    expect(mocks.enqueueToolJob).toHaveBeenCalledWith(
      expect.objectContaining({
        toolId: "remove-background",
        kind: "ai-tool",
        settings: {},
      }),
    );
  });

  it("pairwiseSettingsFor('remove-background') keeps color and gradient background types reachable in pairwise sampling (#2978)", () => {
    const schema = getToolConfig("remove-background")?.settingsSchema;
    if (!schema) throw new Error("remove-background is not registered");

    const axes = deriveAxes(schema);
    const base = pairwiseSettingsFor("remove-background");
    const cases = pairwise(axes)
      .map((combo) => ({ ...base, ...compactCase(combo) }))
      .map((combo) => schema.safeParse(combo))
      .filter(
        (parsed): parsed is { success: true; data: { backgroundType?: string } } => parsed.success,
      );

    const backgroundTypes = new Set(cases.map((c) => c.data.backgroundType));
    expect(backgroundTypes.has("transparent")).toBe(true);
    expect(backgroundTypes.has("color")).toBe(true);
    expect(backgroundTypes.has("gradient")).toBe(true);
    expect(backgroundTypes.has("blur")).toBe(true);
  });

  it("QA verify-ai scripts pass Phase 1-valid settings to remove-background (#2978)", () => {
    const parseObjectLiteral = (literal: string): Record<string, unknown> =>
      JSON.parse(
        literal.replace(/([a-zA-Z_$][\w$]*)\s*:/g, '"$1":').replace(/,\s*\}/g, "}"),
      ) as Record<string, unknown>;

    const matrixSource = readFileSync(
      path.join(REPO_ROOT, "tests/qa/verify-ai-tool-matrix.mts"),
      "utf8",
    );
    const matrixMatch = matrixSource.match(
      /\{\s*toolId:\s*"remove-background"[^}]*?settings:\s*(\{[^}]*\})/,
    );
    expect(matrixMatch).not.toBeNull();
    const matrixSettings = parseObjectLiteral(matrixMatch?.[1] ?? "");
    expect(phase1SettingsSchema.safeParse(matrixSettings).success).toBe(true);

    const verifyAiSource = readFileSync(path.join(REPO_ROOT, "tests/qa/verify-ai.mts"), "utf8");
    const verifyAiMatch = verifyAiSource.match(
      /run\(\s*"remove-background"\s*,\s*[^,]+,\s*(\{[^}]*\})\s*\)/,
    );
    expect(verifyAiMatch).not.toBeNull();
    const verifyAiSettings = parseObjectLiteral(verifyAiMatch?.[1] ?? "");
    expect(phase1SettingsSchema.safeParse(verifyAiSettings).success).toBe(true);
  });

  it("pins Phase 1 and Phase 2 settings in openapi.yaml and apps/docs/api/rest.md (#2975)", () => {
    const openapi = load(
      readFileSync(path.join(REPO_ROOT, "apps/api/src/openapi.yaml"), "utf8"),
    ) as {
      paths: Record<
        string,
        {
          post?: {
            requestBody?: {
              content?: {
                "multipart/form-data"?: {
                  schema?: { properties?: { settings?: { description?: string } } };
                };
              };
            };
          };
        }
      >;
    };

    const expectedPhase2Keys = Object.keys(effectsSchema._def.schema.shape);
    const expectedPhase1Keys = Object.keys(
      phase1SettingsSchema._def.schema._def.schema.shape,
    ).filter((k) => !expectedPhase2Keys.includes(k));

    const phase1Desc =
      openapi.paths["/api/v1/tools/image/remove-background"]?.post?.requestBody?.content?.[
        "multipart/form-data"
      ]?.schema?.properties?.settings?.description ?? "";
    const phase1Bullets = [...phase1Desc.matchAll(/^- `(\w+)`/gm)].map((m) => m[1]);
    expect(phase1Bullets).toEqual(expectedPhase1Keys);
    expect(phase1Desc).toContain("- `edgeRefine` (integer 0-3, optional)");
    expect(phase1Desc).toContain("- `decontaminate` (boolean, optional)");
    expect(phase1Desc).toContain("/api/v1/tools/image/remove-background/effects");

    const phase1Probes: Record<string, unknown> = {
      model: "u2net",
      edgeRefine: 2,
      decontaminate: true,
    };
    for (const key of phase1Bullets) {
      expect(phase1SettingsSchema.safeParse({ [key]: phase1Probes[key] })).toEqual({
        success: true,
        data: { [key]: phase1Probes[key] },
      });
    }

    const phase2Desc =
      openapi.paths["/api/v1/tools/image/remove-background/effects"]?.post?.requestBody?.content?.[
        "multipart/form-data"
      ]?.schema?.properties?.settings?.description ?? "";
    const phase2Bullets = [...phase2Desc.matchAll(/^- `(\w+)`/gm)].map((m) => m[1]);
    expect(phase2Bullets).toEqual(expectedPhase2Keys);
    expect(phase2Desc).toContain("- `outputFormat` (string, optional) - One of: png, webp, avif");
    for (const fmt of ["png", "webp", "avif"] as const) {
      expect(
        effectsSchema.safeParse({ jobId: "j1", filename: "photo.png", outputFormat: fmt }).success,
      ).toBe(true);
    }

    const restDoc = readFileSync(path.join(REPO_ROOT, "apps/docs/api/rest.md"), "utf8");
    const removeBgRow = restDoc
      .split("\n")
      .find((line) => line.startsWith("| `remove-background` |"));
    expect(removeBgRow).toBeDefined();
    const keySettingsCell = removeBgRow?.split("|")[4] ?? "";
    const [restPhase1, restPhase2] = keySettingsCell.split("Phase 2");
    expect(restPhase1).toBeDefined();
    expect(restPhase2).toBeDefined();
    const restPhase1Keys = [...(restPhase1?.matchAll(/`([a-zA-Z]\w*)`/g) ?? [])].map((m) => m[1]);
    const restPhase2Keys = [...(restPhase2?.matchAll(/`([a-zA-Z]\w*)`/g) ?? [])].map((m) => m[1]);
    expect(restPhase1Keys).toEqual(expectedPhase1Keys);
    expect(restPhase2Keys).toEqual(
      expectedPhase2Keys.filter((k) => k !== "jobId" && k !== "filename"),
    );
    expect(restPhase2).toContain("`/api/v1/tools/image/remove-background/effects`");
  });
});
