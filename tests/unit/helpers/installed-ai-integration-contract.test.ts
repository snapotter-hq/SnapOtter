import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installedAiCapabilityGate } from "../../helpers/installed-ai-capability-gate.js";

const INTEGRATION_ROOT = join(process.cwd(), "tests/integration");
const INSTALLED_AI_SUITES = [
  {
    path: "tools/audio/transcribe-audio.test.ts",
    toolId: "transcribe-audio",
  },
  {
    path: "tools/video/auto-subtitles.test.ts",
    toolId: "auto-subtitles",
  },
  {
    path: "tools/image/blur-background.test.ts",
    toolId: "blur-background",
  },
  {
    path: "tools/image/background-replace.test.ts",
    toolId: "background-replace",
  },
] as const;

describe("installed AI integration capability gate", () => {
  it.each([
    {
      installed: false,
      required: false,
      runInstalledContract: false,
      runUnavailableContract: true,
    },
    {
      installed: false,
      required: true,
      runInstalledContract: true,
      runUnavailableContract: true,
    },
    {
      installed: true,
      required: false,
      runInstalledContract: true,
      runUnavailableContract: false,
    },
    {
      installed: true,
      required: true,
      runInstalledContract: true,
      runUnavailableContract: false,
    },
  ])(
    "installed=$installed required=$required selects the correct contract lanes",
    ({ installed, required, runInstalledContract, runUnavailableContract }) => {
      expect(installedAiCapabilityGate("transcribe-audio", required, () => installed)).toEqual({
        installed,
        runInstalledContract,
        runUnavailableContract,
      });
    },
  );

  it.each(INSTALLED_AI_SUITES)(
    "$toolId has no unconditional suite disable and accounts for both capability lanes",
    ({ path, toolId }) => {
      const source = readFileSync(join(INTEGRATION_ROOT, path), "utf8");
      expect(source).not.toContain("describe.skip(");
      expect(source).toContain("REQUIRE_AI_FEATURES");
      expect(source).toContain("isToolInstalled");
      expect(source).toMatch(new RegExp(`installedAiCapabilityGate\\(\\s*"${toolId}"`));
      expect(source).toContain("describe.skipIf(!AI_CAPABILITY.runInstalledContract)");
      expect(source).toContain("it.skipIf(!AI_CAPABILITY.runUnavailableContract)");
    },
  );
});
