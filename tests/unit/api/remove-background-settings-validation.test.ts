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
import { SUPPORTED_LOCALES } from "../../../packages/shared/src/i18n/index.js";
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
  settleUnenqueuedAlias: vi.fn(async () => {}),
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

    const installCompleteSource = readFileSync(
      path.join(REPO_ROOT, "tests/qa/verify-ai-install-complete.mts"),
      "utf8",
    );
    const installCompleteMatch = installCompleteSource.match(
      /\{\s*toolId:\s*"remove-background"[^}]*?settings:\s*(\{[^}]*\})/,
    );
    expect(installCompleteMatch).not.toBeNull();
    const installCompleteSettings = parseObjectLiteral(installCompleteMatch?.[1] ?? "");
    expect(phase1SettingsSchema.safeParse(installCompleteSettings)).toEqual({
      success: true,
      data: {},
    });
  });

  it("verify-ai-install-complete runOneTool sets process.exitCode = 1 when a smoke run fails or returns an unexpected status (#2985)", async () => {
    const mod = (await import("../../qa/verify-ai-install-complete.mjs")) as {
      ONE_TOOL_PER_BUNDLE?: Record<string, { toolId: string; file: string; settings: object }>;
      runOneTool?: (token: string, bundleId: string) => Promise<void>;
    };
    expect(mod.ONE_TOOL_PER_BUNDLE?.["background-removal"]?.settings).toEqual({});
    expect(typeof mod.runOneTool).toBe("function");
    if (!mod.runOneTool) return;

    const prevExitCode = process.exitCode;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      // 1. Unexpected HTTP status (e.g. 400) sets process.exitCode = 1 and posts Phase 1 settings
      process.exitCode = undefined;
      let postedUrl = "";
      let postedSettings = "";
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          postedUrl = String(input);
          const form = init?.body as FormData;
          postedSettings = String(form.get("settings") ?? "");
          return new Response(JSON.stringify({ error: "Invalid settings" }), { status: 400 });
        }),
      );
      await mod.runOneTool("tok", "background-removal");
      expect(postedUrl).toMatch(/\/api\/v1\/tools\/image\/remove-background$/);
      expect(postedSettings).toBe("{}");
      expect(process.exitCode).toBe(1);

      // 2. Async 202 followed by SSE failure event sets process.exitCode = 1
      process.exitCode = undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith("/progress")) {
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    'data: {"phase":"failed","error":"sidecar crashed"}\n\n',
                  ),
                );
                controller.close();
              },
            });
            return new Response(stream, { status: 200 });
          }
          return new Response(JSON.stringify({ jobId: "job-fail" }), { status: 202 });
        }),
      );
      await mod.runOneTool("tok", "background-removal");
      expect(process.exitCode).toBe(1);

      // 3. Async 202 followed by SSE stream closing without completion (timeout) sets process.exitCode = 1
      process.exitCode = undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith("/progress")) {
            const stream = new ReadableStream({
              start(controller) {
                controller.close();
              },
            });
            return new Response(stream, { status: 200 });
          }
          return new Response(JSON.stringify({ jobId: "job-timeout" }), { status: 202 });
        }),
      );
      await mod.runOneTool("tok", "background-removal");
      expect(process.exitCode).toBe(1);

      // 4. Async 202 followed by SSE response with null body (done.error) sets process.exitCode = 1
      process.exitCode = undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith("/progress")) {
            return new Response(null, { status: 200 });
          }
          return new Response(JSON.stringify({ jobId: "job-no-body" }), { status: 202 });
        }),
      );
      await mod.runOneTool("tok", "background-removal");
      expect(process.exitCode).toBe(1);

      // 5. Sync 200 without downloadUrl sets process.exitCode = 1
      process.exitCode = undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
      );
      await mod.runOneTool("tok", "background-removal");
      expect(process.exitCode).toBe(1);

      // 6. Sync 200 with downloadUrl leaves process.exitCode unset
      process.exitCode = undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({ downloadUrl: "/dl" }), { status: 200 })),
      );
      await mod.runOneTool("tok", "background-removal");
      expect(process.exitCode).toBeUndefined();

      // 7. Async 202 followed by SSE complete event leaves process.exitCode unset
      process.exitCode = undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith("/progress")) {
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode('data: {"phase":"complete","downloadUrl":"/dl"}\n\n'),
                );
                controller.close();
              },
            });
            return new Response(stream, { status: 200 });
          }
          return new Response(JSON.stringify({ jobId: "job-ok" }), { status: 202 });
        }),
      );
      await mod.runOneTool("tok", "background-removal");
      expect(process.exitCode).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
      logSpy.mockRestore();
      process.exitCode = prevExitCode;
    }
  });

  it("bench-ai.sh passes Phase 1 settings to single-file remove-background and posts batch runs to /batch (#2976)", async () => {
    const benchAi = readFileSync(path.join(REPO_ROOT, "tests/benchmark/bench-ai.sh"), "utf8");

    const allSingleInvocations = [
      ...benchAi.matchAll(/bench_ai_tool\s+"image\/remove-background"/g),
    ];
    const singleMatches = [
      ...benchAi.matchAll(
        /bench_ai_tool\s+"image\/remove-background"\s+"([^"]+)"\s+"[^"]+"\s+'([^']*)'/g,
      ),
    ];
    expect(singleMatches.length).toBeGreaterThanOrEqual(3);
    expect(singleMatches.length).toBe(allSingleInvocations.length);
    for (const match of singleMatches) {
      const rawSettings = match[2];
      const parsed = (rawSettings ? JSON.parse(rawSettings) : {}) as Record<string, unknown>;
      expect(phase1SettingsSchema.safeParse(parsed).success).toBe(true);
      const res = await callPhase1Route(parsed);
      expect(res.statusCode).toBe(202);
    }

    const tier3Start = benchAi.indexOf("=== TIER 3: AI Batch Processing ===");
    const sustainedStart = benchAi.indexOf("=== Sustained AI Load");
    expect(tier3Start).toBeGreaterThanOrEqual(0);
    expect(sustainedStart).toBeGreaterThan(tier3Start);
    const batchBlock = benchAi.slice(tier3Start, sustainedStart);
    expect(batchBlock).toMatch(/\/api\/v1\/tools\/image\/remove-background\/batch"/);
    expect(batchBlock).not.toMatch(/\/api\/v1\/tools\/image\/remove-background"/);
    expect(batchBlock).toMatch(/"application\/zip"\s+"\$batch_size"/);

    const batchSettingsMatches = [...batchBlock.matchAll(/-F\s+'settings=(\{[^']*\})'/g)];
    expect(batchSettingsMatches.length).toBeGreaterThan(0);
    for (const match of batchSettingsMatches) {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>;
      expect(accepts(parsed)).toBe(true);
    }
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

    const expectedPhase2DocKeys = expectedPhase2Keys.filter(
      (k) => k !== "jobId" && k !== "filename",
    );
    const docsRoot = path.join(REPO_ROOT, "apps/docs");
    const localeCodes = SUPPORTED_LOCALES.map((l) => l.code).filter((c) => c !== "en");
    for (const relPath of [
      "api/rest.md",
      ...localeCodes.map((locale) => `${locale}/api/rest.md`),
    ]) {
      const restDoc = readFileSync(path.join(docsRoot, relPath), "utf8");
      const removeBgRow = restDoc
        .split("\n")
        .find((line) => line.startsWith("| `remove-background` |"));
      expect(removeBgRow, relPath).toBeDefined();
      const keySettingsCell = removeBgRow?.split("|")[4] ?? "";
      const phaseParts = keySettingsCell.split("`/api/v1/tools/image/remove-background/effects`");
      expect(phaseParts, relPath).toHaveLength(2);
      const [restPhase1, restPhase2] = phaseParts;
      const restPhase1Keys = [...(restPhase1?.matchAll(/`([a-zA-Z]\w*)`/g) ?? [])].map((m) => m[1]);
      const restPhase2Keys = [...(restPhase2?.matchAll(/`([a-zA-Z]\w*)`/g) ?? [])].map((m) => m[1]);
      expect(restPhase1Keys, relPath).toEqual(expectedPhase1Keys);
      expect(restPhase2Keys, relPath).toEqual(expectedPhase2DocKeys);
      expect(restPhase1, relPath).toMatch(/[（(]0-3[）)]/);
      expect(restPhase2, relPath).not.toContain("transparent/color/gradient/blur/image");
      expect(restPhase2, relPath).toMatch(/[（(]png\/webp\/avif[）)]/);
    }
  });
});
