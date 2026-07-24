import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const rootPackage = JSON.parse(readFileSync(path.resolve(root, "package.json"), "utf8"));
const releaseVersionPolicyPath = path.resolve(root, "config/release-version-policy.json");

function releaseVersionPolicy(): {
  legacyBundleImageVersion: string;
  openapiVersion: string;
} {
  expect(existsSync(releaseVersionPolicyPath), "release version policy is missing").toBe(true);
  return JSON.parse(readFileSync(releaseVersionPolicyPath, "utf8"));
}

function workspaceManifests(): string[] {
  return ["apps", "packages"].flatMap((group) =>
    readdirSync(path.resolve(root, group))
      .map((name) => path.join(group, name, "package.json"))
      .filter((manifest) => existsSync(path.resolve(root, manifest))),
  );
}

describe("release version domains", () => {
  it("keeps every private workspace package on the root release version", () => {
    for (const manifest of workspaceManifests()) {
      const packageJson = JSON.parse(readFileSync(path.resolve(root, manifest), "utf8"));
      expect(packageJson.private, `${manifest} must remain private`).toBe(true);
      expect(packageJson.version, `${manifest} must match the root release`).toBe(
        rootPackage.version,
      );
    }
  });

  it("makes the release sync script own every workspace manifest", () => {
    const syncScript = readFileSync(path.resolve(root, "scripts/sync-version.sh"), "utf8");

    for (const manifest of workspaceManifests()) {
      expect(syncScript, `${manifest} is missing from sync-version.sh`).toContain(`"${manifest}"`);
    }
  });

  it("rejects non-semver input before mutating release metadata", () => {
    const syncScript = readFileSync(path.resolve(root, "scripts/sync-version.sh"), "utf8");
    const validation = syncScript.indexOf('if [[ ! "$VERSION" =~');
    const firstMutation = syncScript.indexOf("PACKAGES=(");

    expect(validation, "sync-version.sh must validate semantic versions").toBeGreaterThan(0);
    expect(validation, "version validation must run before the mutation list").toBeLessThan(
      firstMutation,
    );
    expect(syncScript).toContain("Invalid semantic version");
  });

  it("keeps the OpenAPI version on the stable API-major domain", () => {
    const { openapiVersion } = releaseVersionPolicy();
    expect(openapiVersion).toMatch(/^[1-9]\d*\.0\.0$/);
    const specs = readdirSync(path.resolve(root, "apps/api/src"))
      .filter((name) => /^openapi(?:\.[A-Za-z-]+)?\.yaml$/.test(name))
      .sort();

    expect(specs).toHaveLength(21);
    for (const spec of specs) {
      const source = readFileSync(path.resolve(root, "apps/api/src", spec), "utf8");
      expect(source, `${spec} must publish API major ${openapiVersion}`).toMatch(
        new RegExp(`^  version: ${openapiVersion.replaceAll(".", "\\.")}$`, "m"),
      );
    }
  });

  it("documents the independent app, API-major, and legacy-bundle epochs", () => {
    const policy = releaseVersionPolicy();
    const developerGuide = readFileSync(path.resolve(root, "apps/docs/guide/developer.md"), "utf8");
    const manifest = JSON.parse(
      readFileSync(path.resolve(root, "docker/feature-manifest.json"), "utf8"),
    );

    expect(developerGuide).toContain("## Release version domains");
    expect(developerGuide).toContain("workspace packages and `APP_VERSION`");
    expect(developerGuide).toContain("OpenAPI `info.version`");
    expect(developerGuide).toContain("legacy feature-bundle storage epoch");
    expect(developerGuide).toContain("config/release-version-policy.json");
    expect(manifest.imageVersion).toBe(policy.legacyBundleImageVersion);
    expect(manifest.bundles.ocr.runtimeFormatVersion).toBe(3);
  });
});
