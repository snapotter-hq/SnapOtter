import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installedAiCapabilityGate } from "../../helpers/installed-ai-capability-gate.js";

const INTEGRATION_ROOT = join(process.cwd(), "tests/integration");
const INSTALLED_AI_SUITES = [
  {
    path: "tools/audio/transcribe-audio.test.ts",
    toolId: "transcribe-audio",
    oracles: ["expectKnownTranscript"],
  },
  {
    path: "tools/video/auto-subtitles.test.ts",
    toolId: "auto-subtitles",
    oracles: ["expectKnownTranscript"],
  },
  {
    path: "tools/image/blur-background.test.ts",
    toolId: "blur-background",
    oracles: ["expectObservablePixelChange", "expectForegroundPreserved"],
  },
  {
    path: "tools/image/background-replace.test.ts",
    toolId: "background-replace",
    oracles: [
      "expectObservablePixelChange",
      "expectConfiguredBackground",
      "expectForegroundPreserved",
    ],
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

  it.each(INSTALLED_AI_SUITES)(
    "$toolId settles every installed 202 and applies a tool-specific output oracle",
    ({ path, oracles }) => {
      const source = readFileSync(join(INTEGRATION_ROOT, path), "utf8");
      const installedContract = source.slice(
        source.indexOf("// -- Installed/required capability contract --"),
      );
      const admissionPattern = /expect\(res\.statusCode\)\.toBe\(202\)/g;
      const settlementPattern = /await waitForDownloadedJobArtifact\(/g;
      const admissions = [...installedContract.matchAll(admissionPattern)];
      const settlements = [...installedContract.matchAll(settlementPattern)];
      const oracleMatches = oracles.map(
        (oracle) =>
          [oracle, [...installedContract.matchAll(new RegExp(`${oracle}\\(`, "g"))]] as const,
      );

      expect(admissions.length).toBeGreaterThan(0);
      expect(settlements).toHaveLength(admissions.length);
      for (const [, matches] of oracleMatches) expect(matches).toHaveLength(admissions.length);
      for (const [index, admission] of admissions.entries()) {
        const start = admission.index ?? -1;
        const end = admissions[index + 1]?.index ?? Number.MAX_VALUE;
        expect(settlements[index].index).toBeGreaterThan(start);
        expect(settlements[index].index).toBeLessThan(end);
        for (const [, matches] of oracleMatches) {
          expect(matches[index].index).toBeGreaterThan(settlements[index].index ?? start);
          expect(matches[index].index).toBeLessThan(end);
        }
      }
      expect(installedContract).not.toContain("just verify job was accepted");
    },
  );
});
