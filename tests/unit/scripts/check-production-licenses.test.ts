import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const scriptPath = path.resolve(root, "scripts/check-production-licenses.mjs");
const policyPath = path.resolve(root, "config/production-license-policy.json");
const noticesPath = path.resolve(root, "THIRD_PARTY_NOTICES.md");

type Inventory = Record<
  string,
  Array<{ name: string; versions: string[]; license: string; homepage?: string }>
>;

type Policy = {
  allowedExpressions: string[];
  deniedExpressions: string[];
};

async function loadChecker(): Promise<{
  renderNotices: (inventory: Inventory) => string;
  validateInventory: (inventory: Inventory, policy: Policy) => string[];
}> {
  expect(existsSync(scriptPath), "production license checker is missing").toBe(true);
  return import(pathToFileURL(scriptPath).href);
}

describe("production Node dependency license policy", () => {
  it("rejects unknown and explicitly denied license expressions", async () => {
    const { validateInventory } = await loadChecker();
    const policy = { allowedExpressions: ["MIT"], deniedExpressions: ["BUSL-1.1"] };

    expect(
      validateInventory(
        {
          MIT: [{ name: "allowed", versions: ["1.0.0"], license: "MIT" }],
          Unknown: [{ name: "mystery", versions: ["0.1.0"], license: "Unknown" }],
          "BUSL-1.1": [{ name: "denied", versions: ["2.0.0"], license: "BUSL-1.1" }],
        },
        policy,
      ),
    ).toEqual([
      "denied license expression BUSL-1.1: denied@2.0.0",
      "unknown license expression Unknown: mystery@0.1.0",
    ]);
  });

  it("rejects every expression not present in the reviewed allowlist", async () => {
    const { validateInventory } = await loadChecker();

    expect(
      validateInventory(
        {
          MIT: [{ name: "allowed", versions: ["1.0.0"], license: "MIT" }],
          "LicenseRef-Unreviewed": [
            { name: "unreviewed", versions: ["3.0.0"], license: "LicenseRef-Unreviewed" },
          ],
        },
        { allowedExpressions: ["MIT"], deniedExpressions: [] },
      ),
    ).toEqual(["unapproved license expression LicenseRef-Unreviewed: unreviewed@3.0.0"]);
  });

  it("renders deterministic notices without machine-specific install paths", async () => {
    const { renderNotices } = await loadChecker();
    const inventory = {
      MIT: [
        {
          name: "z-package",
          versions: ["2.0.0", "1.0.0"],
          license: "MIT",
          homepage: "https://example.test/z",
        },
        { name: "a-package", versions: ["1.0.0"], license: "MIT" },
      ],
    };

    const notices = renderNotices(inventory);
    expect(notices).toContain("# Third-Party Production Node Dependency Notices");
    expect(notices).toContain("## MIT");
    expect(notices.indexOf("a-package@1.0.0")).toBeLessThan(
      notices.indexOf("z-package@1.0.0,2.0.0"),
    );
    expect(notices).toContain("https://example.test/z");
    expect(notices).not.toContain(root);
  });

  it("keeps the reviewed policy, generated notices, package script, and release gates current", () => {
    expect(existsSync(policyPath), "production license policy is missing").toBe(true);
    expect(existsSync(noticesPath), "production third-party notices are missing").toBe(true);

    const packageJson = JSON.parse(readFileSync(path.resolve(root, "package.json"), "utf8"));
    expect(packageJson.scripts["check:production-node-licenses"]).toBe(
      "node scripts/check-production-licenses.mjs",
    );
    expect(packageJson.scripts["check:production-licenses"]).toContain(
      "check:production-node-licenses",
    );
    expect(packageJson.pnpm.overrides["exceljs>unzipper"]).toBe("0.12.5");

    const ci = readFileSync(path.resolve(root, ".github/workflows/ci.yml"), "utf8");
    const release = readFileSync(path.resolve(root, ".github/workflows/release.yml"), "utf8");
    expect(ci).toContain("pnpm check:production-node-licenses");
    expect(release).toContain("pnpm check:production-node-licenses");
    expect(release.indexOf("pnpm check:production-node-licenses")).toBeLessThan(
      release.indexOf("Run semantic-release"),
    );

    expect(() =>
      execFileSync("pnpm", ["check:production-node-licenses"], {
        cwd: root,
        encoding: "utf8",
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
