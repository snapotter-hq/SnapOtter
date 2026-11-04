import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");

function readYaml<T>(relative: string): T {
  return load(readFileSync(path.join(root, relative), "utf8")) as T;
}

const defined = new Set(
  readYaml<{ name: string }[]>(".github/labels.yml").map((label) => label.name),
);

describe("label references", () => {
  // GitHub drops a label that doesn't exist without any error, so a typo or a
  // label missing from labels.yml leaves new issues and PRs unlabeled.
  it("every label an issue template applies is defined in labels.yml", () => {
    const dir = ".github/ISSUE_TEMPLATE";
    const used = readdirSync(path.join(root, dir))
      .filter((file) => file !== "config.yml" && file.endsWith(".yml"))
      .flatMap((file) => readYaml<{ labels?: string[] }>(`${dir}/${file}`).labels ?? []);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((label) => !defined.has(label))).toEqual([]);
  });

  it("every label Dependabot applies is defined in labels.yml", () => {
    const { updates } = readYaml<{ updates: { labels?: string[] }[] }>(".github/dependabot.yml");
    for (const update of updates) expect(update.labels?.length).toBeGreaterThan(0);
    const used = updates.flatMap((update) => update.labels ?? []);
    expect(used.filter((label) => !defined.has(label))).toEqual([]);
  });
});
