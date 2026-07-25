import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

interface DependabotUpdate {
  "package-ecosystem": string;
  directory: string;
  cooldown?: {
    "default-days"?: number;
  };
}

interface DependabotConfig {
  updates: DependabotUpdate[];
}

function dependabotConfig(): DependabotConfig {
  return load(readFileSync(resolve(root, ".github/dependabot.yml"), "utf8")) as DependabotConfig;
}

describe("Dependabot update policy", () => {
  it("sets an explicit seven-day cooldown on every configured ecosystem", () => {
    const updates = dependabotConfig().updates;

    expect(
      updates.map(({ directory, "package-ecosystem": ecosystem }) => [ecosystem, directory]),
    ).toEqual([
      ["npm", "/"],
      ["pip", "/packages/ai/python"],
      ["docker", "/docker"],
      ["github-actions", "/"],
    ]);
    expect(updates.map((update) => update.cooldown?.["default-days"])).toEqual([7, 7, 7, 7]);
  });
});
