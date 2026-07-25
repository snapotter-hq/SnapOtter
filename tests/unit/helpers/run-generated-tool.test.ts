import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";
import type { AnyToolRouteConfig } from "../../../apps/api/src/routes/tool-factory.js";
import type { GeneratedFixture } from "../../helpers/generated-fixtures.js";
import {
  buildGeneratedProcessInputs,
  findMissingGeneratedPrerequisite,
  isExpectedGeneratedRejection,
  runGeneratedTool,
} from "../../helpers/run-generated-tool.js";

const schema = {
  safeParse: (data: unknown) => ({ success: true as const, data }),
  parse: (data: unknown) => data,
};

function config(
  processV2: NonNullable<AnyToolRouteConfig["processV2"]>,
  overrides: Partial<AnyToolRouteConfig> = {},
): AnyToolRouteConfig {
  return {
    toolId: "generated-test",
    settingsSchema: schema as never,
    process: async () => {
      throw new Error("legacy process must not run");
    },
    processV2,
    ...overrides,
  };
}

describe("generated tool process harness", () => {
  it("executes v2-only tools and returns their buffered output", async () => {
    const processV2 = vi.fn(async () => ({
      buffer: Buffer.from("result"),
      filename: "result.bin",
      contentType: "application/octet-stream",
    }));

    const output = await runGeneratedTool(
      config(processV2),
      [{ buffer: Buffer.from("input"), filename: "input.bin", ref: "generated/input.bin" }],
      { quality: 80 },
    );

    expect(output.equals(Buffer.from("result"))).toBe(true);
    expect(processV2).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: [expect.objectContaining({ filename: "input.bin", ref: "generated/input.bin" })],
        settings: { quality: 80 },
        signal: expect.any(AbortSignal),
        report: expect.any(Function),
      }),
    );
  });

  it("forwards a caller-provided watchdog signal to the resolved process", async () => {
    const processV2 = vi.fn(async () => ({
      buffer: Buffer.from("result"),
      filename: "result.bin",
      contentType: "application/octet-stream",
    }));
    const controller = new AbortController();

    await runGeneratedTool(
      config(processV2),
      [{ buffer: Buffer.from("input"), filename: "input.bin", ref: "generated/input.bin" }],
      { quality: 80 },
      controller.signal,
    );

    expect(processV2).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }));
  });

  it("reads scratch-path output before deleting the isolated scratch directory", async () => {
    let scratchPath = "";
    const output = await runGeneratedTool(
      config(async ({ scratchDir }) => {
        scratchPath = join(scratchDir, "result.bin");
        await writeFile(scratchPath, "scratch-result");
        return {
          scratchPath,
          filename: "result.bin",
          contentType: "application/octet-stream",
        };
      }),
      [{ buffer: Buffer.from("input"), filename: "input.bin", ref: "generated/input.bin" }],
      {},
    );

    expect(output.equals(Buffer.from("scratch-result"))).toBe(true);
    await expect(readFile(scratchPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("builds the configured minimum cardinality and honors mixed input kinds", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "snapotter-generated-fixtures-"));
    const fixtures: GeneratedFixture[] = [
      { dir: fixtureRoot, filename: "tiny.mp4", ext: ".mp4" },
      { dir: fixtureRoot, filename: "tiny.wav", ext: ".wav" },
    ];
    try {
      await Promise.all(
        fixtures.map((fixture) => writeFile(join(fixture.dir, fixture.filename), fixture.ext)),
      );

      const inputs = await buildGeneratedProcessInputs(fixtures, {
        minInputs: 2,
        inputKinds: ["video", "audio"],
      });

      expect(inputs).toHaveLength(2);
      expect(inputs.map(({ filename }) => filename)).toEqual(["tiny.mp4", "tiny.wav"]);
      expect(inputs.every(({ ref }) => ref.startsWith("generated/"))).toBe(true);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("fails closed when a tool has no resolved v2 process", async () => {
    const unresolved = config(async () => ({
      buffer: Buffer.from("unused"),
      filename: "unused",
      contentType: "application/octet-stream",
    }));
    unresolved.processV2 = undefined;

    await expect(
      runGeneratedTool(
        unresolved,
        [{ buffer: Buffer.from("input"), filename: "input.bin", ref: "generated/input.bin" }],
        {},
      ),
    ).rejects.toThrow(/no processV2/i);
  });

  it("only classifies typed input failures as clean generated-case rejections", () => {
    expect(isExpectedGeneratedRejection(new InputValidationError("bad upload"))).toBe(true);
    expect(
      isExpectedGeneratedRejection(
        Object.assign(new Error("bad tool input"), {
          isToolInputError: true,
        }),
      ),
    ).toBe(true);
    expect(isExpectedGeneratedRejection(new TypeError("bug"))).toBe(false);
    expect(isExpectedGeneratedRejection(new Error("untyped operational failure"))).toBe(false);
    expect(isExpectedGeneratedRejection("not an error")).toBe(false);
  });

  it("classifies the content-aware resize native binary prerequisite explicitly", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "snapotter-caire-prerequisite-"));
    const executable = join(fixtureRoot, "caire");
    try {
      expect(
        await findMissingGeneratedPrerequisite("content-aware-resize", {
          cairePath: join(fixtureRoot, "missing-caire"),
          path: "",
        }),
      ).toMatch(/caire binary/i);

      await writeFile(executable, "#!/bin/sh\nexit 0\n");
      await chmod(executable, 0o755);
      expect(
        await findMissingGeneratedPrerequisite("content-aware-resize", {
          cairePath: executable,
          path: "",
        }),
      ).toBeUndefined();
      expect(await findMissingGeneratedPrerequisite("resize", { path: "" })).toBeUndefined();
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
