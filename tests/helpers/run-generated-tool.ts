import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, sep } from "node:path";
import { isToolInputError, type Modality } from "@snapotter/shared";
import { InputValidationError } from "../../apps/api/src/modality/contract.js";
import { inputHandlerFor } from "../../apps/api/src/modality/input-handler.js";
import { MediaInputHandler } from "../../apps/api/src/modality/media-input.js";
import type {
  AnyToolRouteConfig,
  ToolProcessInputV2,
} from "../../apps/api/src/routes/tool-factory.js";
import type { GeneratedFixture } from "./generated-fixtures.js";

type InputKind = NonNullable<AnyToolRouteConfig["inputKinds"]>[number];

const EXTENSIONS_BY_KIND: Record<InputKind, ReadonlySet<string>> = {
  image: new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".bmp",
    ".tiff",
    ".tif",
    ".avif",
    ".heic",
    ".heif",
    ".svg",
  ]),
  video: new Set([".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v", ".mpg", ".mpeg"]),
  audio: new Set([".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg", ".opus"]),
  subtitle: new Set([".srt", ".vtt", ".ass", ".ssa"]),
};

interface GeneratedInputConfig {
  minInputs?: number;
  inputKinds?: readonly InputKind[];
}

interface GeneratedPrerequisiteEnvironment {
  cairePath?: string;
  path?: string;
}

/** Only user/input validation failures are safe rejections in generated campaigns. */
export function isExpectedGeneratedRejection(error: unknown): boolean {
  return error instanceof InputValidationError || isToolInputError(error);
}

/** Return a named source-lane prerequisite failure; artifact lanes must provide it. */
export async function findMissingGeneratedPrerequisite(
  toolId: string,
  environment: GeneratedPrerequisiteEnvironment = {
    cairePath: process.env.CAIRE_PATH,
    path: process.env.PATH,
  },
): Promise<string | undefined> {
  if (toolId !== "content-aware-resize") return undefined;

  const command = environment.cairePath ?? "caire";
  const candidates = command.includes(sep)
    ? [command]
    : (environment.path ?? "")
        .split(delimiter)
        .filter(Boolean)
        .map((directory) => join(directory, command));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return undefined;
    } catch {
      // Check the next PATH entry.
    }
  }
  return "caire binary is unavailable in this source environment";
}

/**
 * Build deterministic processV2 inputs from compatible fixture candidates.
 * Mixed-input routes select by position; same-kind multi-input routes use a
 * second distinct fixture when available and otherwise reuse the first.
 */
export async function buildGeneratedProcessInputs(
  fixtures: readonly GeneratedFixture[],
  config: GeneratedInputConfig,
  modality?: Modality,
): Promise<ToolProcessInputV2[]> {
  const requiredInputs = Math.max(config.minInputs ?? 1, config.inputKinds?.length ?? 1);
  const selected: GeneratedFixture[] = [];

  for (let index = 0; index < requiredInputs; index++) {
    const kind = config.inputKinds?.[Math.min(index, config.inputKinds.length - 1)];
    const compatible = kind
      ? fixtures.filter((fixture) => EXTENSIONS_BY_KIND[kind].has(fixture.ext))
      : [...fixtures];
    if (compatible.length === 0) {
      throw new Error(
        `No generated fixture is compatible with input ${index + 1}${kind ? ` (${kind})` : ""}`,
      );
    }
    selected.push(compatible[index % compatible.length]);
  }

  const preparationDir = modality
    ? await mkdtemp(join(tmpdir(), "snapotter-generated-prepare-"))
    : undefined;
  try {
    const inputs: ToolProcessInputV2[] = [];
    for (let index = 0; index < selected.length; index++) {
      const fixture = selected[index];
      let buffer = await readFile(join(fixture.dir, fixture.filename));
      let filename = fixture.filename;
      if (modality && preparationDir) {
        const kind = config.inputKinds?.[Math.min(index, config.inputKinds.length - 1)];
        const handler = kind
          ? kind === "image"
            ? inputHandlerFor("image")
            : new MediaInputHandler(kind)
          : inputHandlerFor(modality);
        const prepared = await handler.prepare(buffer, filename, { scratchDir: preparationDir });
        buffer = prepared.buffer;
        filename = prepared.filename;
      }
      inputs.push({
        buffer,
        filename,
        ref: `generated/${index}-${filename}`,
      });
    }
    return inputs;
  } finally {
    if (preparationDir) await rm(preparationDir, { recursive: true, force: true });
  }
}

/** Execute a generated case through the same resolved processV2 contract as the worker. */
export async function runGeneratedTool(
  config: AnyToolRouteConfig,
  inputs: ToolProcessInputV2[],
  settings: unknown,
  signal: AbortSignal = new AbortController().signal,
): Promise<Buffer> {
  if (!config.processV2) throw new Error(`No processV2 for ${config.toolId}`);
  if (inputs.length === 0) throw new Error(`No generated inputs for ${config.toolId}`);

  const scratchDir = await mkdtemp(join(tmpdir(), "snapotter-generated-"));
  try {
    const result = await config.processV2({
      inputs,
      settings,
      scratchDir,
      signal,
      report: () => {},
    });
    if (result.buffer) return result.buffer;
    // Await inside the try block so cleanup cannot remove the scratch tree
    // before the asynchronous read has opened and consumed the output.
    if (result.scratchPath) return await readFile(result.scratchPath);
    throw new Error(`Tool ${config.toolId} returned neither buffer nor scratchPath`);
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}
