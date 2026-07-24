import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";

const root = process.cwd();
const scriptPath = path.resolve(root, "scripts/manage-release-notes.mjs");

test("archives custom release notes byte-for-byte and permits an identical retry", async () => {
  expect(existsSync(scriptPath), "release-note manager is missing").toBe(true);
  const { archiveCustomReleaseNotes } = await import(pathToFileURL(scriptPath).href);
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "snapotter-release-notes-"));
  const source = "# SnapOtter 3.0.0\n\nUnicode: 水獺\n\nTrailing line.\n";

  try {
    writeFileSync(path.join(fixtureRoot, ".release-notes.md"), source);
    expect(archiveCustomReleaseNotes(fixtureRoot, "3.0.0")).toBe(true);
    const archived = path.join(fixtureRoot, ".release-notes/v3.0.0.md");
    expect(readFileSync(archived, "utf8")).toBe(source);
    expect(existsSync(path.join(fixtureRoot, ".release-notes.md"))).toBe(false);

    writeFileSync(path.join(fixtureRoot, ".release-notes.md"), source);
    expect(archiveCustomReleaseNotes(fixtureRoot, "3.0.0")).toBe(true);
    expect(readFileSync(archived, "utf8")).toBe(source);
    expect(existsSync(path.join(fixtureRoot, ".release-notes.md"))).toBe(false);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("materializes archived custom notes byte-for-byte for a retry", async () => {
  expect(existsSync(scriptPath), "release-note manager is missing").toBe(true);
  const releaseNotes = await import(pathToFileURL(scriptPath).href);
  expect(typeof releaseNotes.materializeReleaseNotes).toBe("function");
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "snapotter-release-notes-"));
  const source = "## Highlights\n\nExact custom body.\n";

  try {
    writeFileSync(path.join(fixtureRoot, ".release-notes.md"), source);
    releaseNotes.archiveCustomReleaseNotes(fixtureRoot, "3.0.0");
    const output = path.join(fixtureRoot, "materialized.md");
    expect(releaseNotes.materializeReleaseNotes(fixtureRoot, "3.0.0", output)).toBe(true);
    expect(readFileSync(output, "utf8")).toBe(source);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("recovers generated release notes from the committed changelog", async () => {
  expect(existsSync(scriptPath), "release-note manager is missing").toBe(true);
  const { materializeReleaseNotes } = await import(pathToFileURL(scriptPath).href);
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "snapotter-release-notes-"));
  const expected = "# [3.0.0](https://example.test/v3.0.0)\n\n### Fixes\n\n* repaired retries\n";

  try {
    writeFileSync(
      path.join(fixtureRoot, "CHANGELOG.md"),
      `${expected}\n# [2.9.0](https://example.test/v2.9.0)\n\nOlder notes.\n`,
    );
    const output = path.join(fixtureRoot, "materialized.md");
    expect(materializeReleaseNotes(fixtureRoot, "3.0.0", output)).toBe(false);
    expect(readFileSync(output, "utf8")).toBe(expected);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("inserts an exact custom-note entry after the published changelog heading once", async () => {
  expect(existsSync(scriptPath), "release-note manager is missing").toBe(true);
  const releaseNotes = await import(pathToFileURL(scriptPath).href);
  expect(typeof releaseNotes.syncDocsChangelog).toBe("function");
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "snapotter-release-notes-"));
  const notes = [
    "# SnapOtter 3.0.0",
    "",
    "## Highlights",
    "",
    "Retry-safe release.",
    "",
    "## Upgrade",
    "",
    "Use the new image.",
    "",
    "---",
    "",
  ].join("\n");

  try {
    mkdirSync(path.join(fixtureRoot, ".release-notes"));
    writeFileSync(path.join(fixtureRoot, ".release-notes/v3.0.0.md"), notes);
    writeFileSync(
      path.join(fixtureRoot, "apps-docs-changelog.md"),
      "---\ndescription: History.\n---\n\n# Changelog {#changelog}\n\n## v2.9.0\n\nOlder.\n",
    );
    expect(
      releaseNotes.syncDocsChangelog(fixtureRoot, "3.0.0", "2.9.0", "apps-docs-changelog.md"),
    ).toBe(true);
    expect(
      releaseNotes.syncDocsChangelog(fixtureRoot, "3.0.0", "2.9.0", "apps-docs-changelog.md"),
    ).toBe(false);
    const changelog = readFileSync(path.join(fixtureRoot, "apps-docs-changelog.md"), "utf8");
    expect(changelog.match(/^## v3\.0\.0$/gm)).toHaveLength(1);
    expect(changelog).toContain(
      "# Changelog {#changelog}\n\n## v3.0.0\n\nRetry-safe release.\n\n" +
        "[Full diff on GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.9.0...v3.0.0)\n\n---\n",
    );
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("CLI exposes archive, materialize, and changelog preparation for release automation", () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "snapotter-release-notes-"));
  const notes = "## Highlights\n\nCLI release.\n";

  try {
    mkdirSync(path.join(fixtureRoot, "apps/docs"), { recursive: true });
    writeFileSync(path.join(fixtureRoot, ".release-notes.md"), notes);
    writeFileSync(
      path.join(fixtureRoot, "CHANGELOG.md"),
      "# [3.0.0](https://example.test/v3.0.0)\n\nGenerated.\n",
    );
    writeFileSync(path.join(fixtureRoot, "apps/docs/changelog.md"), "# Changelog {#changelog}\n");

    expect(
      execFileSync(process.execPath, [scriptPath, "archive", "3.0.0", "--root", fixtureRoot], {
        encoding: "utf8",
      }),
    ).toBe("custom=true\n");
    const materialized = path.join(fixtureRoot, "expected.md");
    expect(
      execFileSync(
        process.execPath,
        [scriptPath, "materialize", "3.0.0", materialized, "--root", fixtureRoot],
        { encoding: "utf8" },
      ),
    ).toBe("custom=true\n");
    expect(readFileSync(materialized, "utf8")).toBe(notes);
    expect(
      execFileSync(
        process.execPath,
        [scriptPath, "sync-docs", "3.0.0", "2.9.0", "--root", fixtureRoot],
        { encoding: "utf8" },
      ),
    ).toBe("changed=true\n");
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});
