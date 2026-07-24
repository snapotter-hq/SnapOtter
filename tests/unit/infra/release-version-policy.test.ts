import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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

  it("commits every manifest changed by the release sync script", () => {
    const releaseConfig = JSON.parse(readFileSync(path.resolve(root, ".releaserc.json"), "utf8"));
    const gitPlugin = releaseConfig.plugins.find(
      (plugin: unknown) => Array.isArray(plugin) && plugin[0] === "@semantic-release/git",
    );
    expect(gitPlugin, "@semantic-release/git configuration is missing").toBeDefined();
    const assets = new Set<string>(gitPlugin[1].assets);

    for (const manifest of workspaceManifests()) {
      expect(assets.has(manifest), `${manifest} is missing from release commit assets`).toBe(true);
    }
  });

  it("keeps published release commands synchronized and commits their source pages", () => {
    const releaseConfig = JSON.parse(readFileSync(path.resolve(root, ".releaserc.json"), "utf8"));
    const gitPlugin = releaseConfig.plugins.find(
      (plugin: unknown) => Array.isArray(plugin) && plugin[0] === "@semantic-release/git",
    );
    const assets = new Set<string>(gitPlugin[1].assets);
    expect(assets).toContain("apps/docs/**/guide/getting-started.md");
    expect(assets).toContain("apps/docs/**/guide/security.md");

    const syncScript = readFileSync(path.resolve(root, "scripts/sync-version.sh"), "utf8");
    expect(syncScript).toContain('node "$ROOT/scripts/sync-published-docs-version.mjs" "$VERSION"');

    const releasePages = ["apps/docs/guide/getting-started.md", "apps/docs/guide/security.md"];
    for (const locale of readdirSync(path.resolve(root, "apps/docs"))) {
      for (const page of ["getting-started.md", "security.md"]) {
        const candidate = path.join("apps/docs", locale, "guide", page);
        if (existsSync(path.resolve(root, candidate))) releasePages.push(candidate);
      }
    }
    for (const page of releasePages) {
      const source = readFileSync(path.resolve(root, page), "utf8");
      const versions = [
        ...source.matchAll(/SnapOtter\/(?:blob\/)?v([^/]+)\/docker\/docker-compose\.yml/g),
        ...source.matchAll(
          /snapotter-v([0-9][0-9A-Za-z.+-]*?)-(?:release-subjects|image-linux-amd64-sbom)/g,
        ),
        ...source.matchAll(/snapotter\/snapotter:([0-9][0-9A-Za-z.+-]*)/g),
      ].map((match) => match[1]);
      expect(versions.length, `${page} must contain release-coupled examples`).toBeGreaterThan(0);
      expect(new Set(versions), `${page} has a stale release example`).toEqual(
        new Set([rootPackage.version]),
      );
    }
  });

  it("rewrites every published release-reference shape for the next version", () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), "snapotter-docs-version-"));
    const guide = path.join(fixtureRoot, "apps/docs/guide");
    mkdirSync(guide, { recursive: true });
    const fixture = [
      "https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v1.9.0/docker/docker-compose.yml",
      "https://github.com/snapotter-hq/SnapOtter/blob/v1.9.0/docker/docker-compose.yml",
      "snapotter-v1.9.0-release-subjects.json",
      "snapotter-v1.9.0-image-linux-amd64-sbom.cdx.json",
      "snapotter-v1.9.0-image-linux-amd64-sbom.spdx.json",
      "snapotter/snapotter:1.9.0",
    ].join("\n");
    try {
      writeFileSync(path.join(guide, "getting-started.md"), fixture);
      writeFileSync(path.join(guide, "security.md"), fixture);
      execFileSync(
        process.execPath,
        [
          path.resolve(root, "scripts/sync-published-docs-version.mjs"),
          "3.0.0-rc.1",
          "--root",
          fixtureRoot,
        ],
        { encoding: "utf8" },
      );
      for (const page of ["getting-started.md", "security.md"]) {
        const source = readFileSync(path.join(guide, page), "utf8");
        expect(source).not.toContain("1.9.0");
        expect(source.match(/3\.0\.0-rc\.1/g)).toHaveLength(6);
      }
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
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
