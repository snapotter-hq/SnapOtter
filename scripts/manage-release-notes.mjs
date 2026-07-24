#!/usr/bin/env node

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SEMVER =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;

function assertVersion(version) {
  if (!SEMVER.test(version)) throw new Error(`Invalid semantic version: ${version}`);
}

export function archiveCustomReleaseNotes(root, version) {
  assertVersion(version);
  const source = path.join(root, ".release-notes.md");
  if (!existsSync(source)) return false;

  const archiveDirectory = path.join(root, ".release-notes");
  const archived = path.join(archiveDirectory, `v${version}.md`);
  mkdirSync(archiveDirectory, { recursive: true });
  if (existsSync(archived)) {
    if (!readFileSync(source).equals(readFileSync(archived))) {
      throw new Error(`Archived release notes differ for v${version}`);
    }
    rmSync(source);
  } else {
    renameSync(source, archived);
  }
  return true;
}

export function materializeReleaseNotes(root, version, output) {
  assertVersion(version);
  const archived = path.join(root, ".release-notes", `v${version}.md`);
  if (existsSync(archived)) {
    copyFileSync(archived, output);
    return true;
  }

  const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(`^# \\[${escapedVersion}\\](?:\\(|\\s|$)`, "m");
  const match = heading.exec(changelog);
  if (!match) throw new Error(`CHANGELOG.md has no generated notes for v${version}`);
  const tail = changelog.slice(match.index);
  const nextHeading = /\n# \[[0-9]/.exec(tail);
  const notes = tail.slice(0, nextHeading?.index ?? tail.length).trimEnd();
  writeFileSync(output, `${notes}\n`);
  return false;
}

function docsChangelogBody(notes) {
  let body = notes.replaceAll("\r\n", "\n");
  body = body.replace(/^# SnapOtter [^\n]+[ \t]*\n(?:[ \t]*\n)?/, "");
  body = body.replace(/^## Highlights[ \t]*\n/, "");
  const upgrade = /^## Upgrade[ \t]*$/m.exec(body);
  if (upgrade) {
    const tail = body.slice(upgrade.index);
    const divider = /^---[ \t]*$/m.exec(tail);
    body = `${body.slice(0, upgrade.index)}${divider ? tail.slice(divider.index + divider[0].length) : ""}`;
  }
  return body.replace(/^---[ \t]*$/gm, "").trim();
}

export function syncDocsChangelog(
  root,
  version,
  previousVersion,
  relativePath = "apps/docs/changelog.md",
) {
  assertVersion(version);
  assertVersion(previousVersion);
  const archived = path.join(root, ".release-notes", `v${version}.md`);
  if (!existsSync(archived)) return false;

  const body = docsChangelogBody(readFileSync(archived, "utf8"));
  const entry = [
    `## v${version}`,
    "",
    body,
    "",
    `[Full diff on GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v${previousVersion}...v${version})`,
    "",
    "---",
  ].join("\n");
  const changelogPath = path.join(root, relativePath);
  const changelog = readFileSync(changelogPath, "utf8");
  if (changelog.includes(`\n\n${entry}\n`)) return false;

  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^## v${escapedVersion}(?:[ \\t]+\\{#[^}]+\\})?[ \\t]*$`, "m").test(changelog)) {
    throw new Error(`Published changelog entry differs for v${version}`);
  }
  const heading = /^# Changelog(?:[ \t]+\{#[^}]+\})?[ \t]*$/m.exec(changelog);
  if (!heading) throw new Error("Published changelog heading is missing");
  const insertion = heading.index + heading[0].length;
  const next = `${changelog.slice(0, insertion)}\n\n${entry}${changelog.slice(insertion)}`;
  writeFileSync(changelogPath, next);
  return true;
}

function main() {
  const [command, version, argument] = process.argv.slice(2);
  const rootFlag = process.argv.indexOf("--root");
  const root = rootFlag === -1 ? process.cwd() : path.resolve(process.argv[rootFlag + 1] ?? "");

  if (command === "archive" && version) {
    process.stdout.write(`custom=${archiveCustomReleaseNotes(root, version)}\n`);
    return;
  }
  if (command === "materialize" && version && argument) {
    process.stdout.write(`custom=${materializeReleaseNotes(root, version, argument)}\n`);
    return;
  }
  if (command === "sync-docs" && version && argument) {
    process.stdout.write(`changed=${syncDocsChangelog(root, version, argument)}\n`);
    return;
  }
  throw new Error(
    "Usage: manage-release-notes.mjs <archive VERSION | materialize VERSION OUTPUT | sync-docs VERSION PREVIOUS_VERSION> [--root PATH]",
  );
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url)
  main();
