// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Contract assertions intentionally match GitHub expression and shell interpolation syntax.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const releaseWorkflowPath = path.resolve(root, ".github/workflows/release.yml");
const manualAttestationPath = path.resolve(root, ".github/workflows/attest.yml");
const releaseConfigPath = path.resolve(root, ".releaserc.json");
const versionSyncPath = path.resolve(root, "scripts/sync-version.sh");

function readRequired(file: string): string {
  expect(existsSync(file), `${path.relative(root, file)} is missing`).toBe(true);
  return readFileSync(file, "utf8");
}

function job(workflow: string, name: string, nextName?: string): string {
  const start = workflow.indexOf(`  ${name}:\n`);
  expect(start, `job ${name} is missing`).toBeGreaterThanOrEqual(0);
  if (!nextName) return workflow.slice(start);
  const end = workflow.indexOf(`  ${nextName}:\n`, start + name.length + 3);
  expect(end, `job ${nextName} is missing`).toBeGreaterThan(start);
  return workflow.slice(start, end);
}

describe("release supply-chain closure", () => {
  it("keeps the GitHub release private until every publication gate succeeds", () => {
    const releaseConfig = JSON.parse(readRequired(releaseConfigPath));
    const githubPlugin = releaseConfig.plugins.find(
      (plugin: unknown) => Array.isArray(plugin) && plugin[0] === "@semantic-release/github",
    );
    expect(githubPlugin?.[1]?.draftRelease).toBe(true);
    expect(githubPlugin?.[1]?.successCommentCondition).toBe(false);
    expect(githubPlugin?.[1]?.releasedLabels).toBe(false);

    const workflow = readRequired(releaseWorkflowPath);
    const publish = job(workflow, "publish-release");
    expect(publish).toContain("needs: [release, aliases]");
    expect(publish).toContain("Verify approved release is still a draft");
    expect(publish).toContain("--draft=false");
  });

  it("commits custom release notes and the published changelog before tagging", () => {
    const releaseConfig = JSON.parse(readRequired(releaseConfigPath));
    const gitPlugin = releaseConfig.plugins.find(
      (plugin: unknown) => Array.isArray(plugin) && plugin[0] === "@semantic-release/git",
    );
    expect(gitPlugin?.[1]?.assets).toContain(".release-notes/*.md");
    expect(gitPlugin?.[1]?.assets).toContain("apps/docs/changelog.md");

    const sync = readRequired(versionSyncPath);
    expect(sync).toContain('manage-release-notes.mjs" archive "$VERSION"');
    expect(sync).toContain('manage-release-notes.mjs" sync-docs "$VERSION"');
    expect(sync).not.toContain('rm -f "$ROOT/.release-notes.md"');
  });

  it("recreates and verifies the exact expected draft on a tag-only retry", () => {
    const workflow = readRequired(releaseWorkflowPath);
    const release = job(workflow, "release", "prebuilt");
    const check = release.indexOf("- name: Check for new release");
    const materialize = release.indexOf("- name: Materialize durable release notes");
    const ensureDraft = release.indexOf("- name: Ensure exact GitHub draft");

    expect(check).toBeGreaterThanOrEqual(0);
    expect(materialize).toBeGreaterThan(check);
    expect(ensureDraft).toBeGreaterThan(materialize);
    expect(release).toContain('git checkout --detach "${release_commit}"');
    expect(release).toContain("node scripts/manage-release-notes.mjs materialize");
    expect(release).toContain('"${VERSION}" /tmp/release-notes.md');
    // The release is created as a draft (draftRelease: true), and GitHub's
    // /releases/tags/{tag} endpoint does not return drafts. Recovery therefore
    // keys off the release id failing to resolve, not off a 404 from a tag
    // lookup that can never succeed here.
    expect(release).toContain('gh release view "v${VERSION}"');
    expect(release).toContain("--json databaseId");
    expect(release).toContain('if [[ ! "${release_id}" =~ ^[0-9]+$ ]]; then');
    expect(release).toContain('gh release create "v${VERSION}"');
    expect(release).toContain("--draft");
    expect(release).toContain("--verify-tag");
    expect(release).toContain("--notes-file /tmp/release-notes.md");
    expect(release).toContain("GitHub draft body differs from committed release notes");
    expect(release).not.toContain("- name: Update docs changelog");
    expect(release).not.toContain("HEAD:main");
  });

  it("never resolves a drafted release through the tag endpoint", () => {
    // Regression guard. GET /repos/{owner}/{repo}/releases/tags/{tag} returns 404
    // for a draft, verified against this repo. Every tag lookup in this workflow
    // ran against the draft semantic-release had just created, so the release job
    // died immediately after pushing the tag. Resolve the numeric id with
    // `gh release view` (which reads drafts) and call /releases/{id} instead.
    const workflow = readRequired(releaseWorkflowPath);
    const tagLookups = workflow
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .filter((line) => /gh api\b[^\n]*releases\/tags\//.test(line));
    expect(tagLookups).toEqual([]);
  });

  it("eliminates the arbitrary manual attestation workflow", () => {
    expect(existsSync(manualAttestationPath)).toBe(false);
  });

  it("keeps unverified archives private and gates the manifest on native archive security", () => {
    const workflow = readRequired(releaseWorkflowPath);
    const prebuilt = job(workflow, "prebuilt", "archive-security");
    const archiveSecurity = job(workflow, "archive-security", "docker");
    const manifest = job(workflow, "manifest", "image-provenance");

    expect(prebuilt).toContain("name: prebuilt-${{ matrix.arch }}");
    expect(prebuilt).toContain("path: |\n            /tmp/${{ env.archive_name }}");
    expect(prebuilt).not.toContain("gh release upload");

    expect(archiveSecurity).toContain("needs: [release, prebuilt]");
    expect(archiveSecurity).toContain("runner: ubuntu-latest");
    expect(archiveSecurity).toContain("runner: ubuntu-24.04-arm");
    expect(archiveSecurity).toContain("name: prebuilt-${{ matrix.arch }}");
    expect(archiveSecurity).toContain("ref: ${{ needs.release.outputs.release_commit }}");
    expect(archiveSecurity).toContain("Verify immutable release tag binding");
    expect(archiveSecurity).toContain("sha256sum --check --strict");
    expect(archiveSecurity).toContain('filter="data"');
    // tsx is asserted at apps/api/node_modules/.bin, where pnpm's workspace layout
    // actually places a workspace-package dependency and where the Docker CMD runs
    // it. The root path never existed and failed the first real release run.
    expect(archiveSecurity).toContain("apps/api/node_modules/.bin/tsx");
    expect(archiveSecurity).not.toContain("snapotter/node_modules/.bin/tsx");
    expect(archiveSecurity).toContain(
      "cyclonedx-json=snapotter-v${VERSION}-archive-linux-${ARCH}-sbom.cdx.json",
    );
    expect(archiveSecurity).toContain(
      "spdx-json=snapotter-v${VERSION}-archive-linux-${ARCH}-sbom.spdx.json",
    );
    expect(archiveSecurity).toContain("scan-type: fs");
    expect(archiveSecurity).toContain("scan-ref: /tmp/prebuilt-root/snapotter");
    expect(archiveSecurity).toContain('exit-code: "1"');
    expect(archiveSecurity).toContain('gh release upload "v${VERSION}"');
    expect(archiveSecurity).toContain("actions/attest-build-provenance@");
    expect(archiveSecurity).toContain('subject-path: "/tmp/prebuilt/${{ env.archive_name }}"');

    expect(manifest).toContain("archive-security");
  });

  it("attests only the exact manifest digest emitted by the immutable release job", () => {
    const workflow = readRequired(releaseWorkflowPath);
    const manifest = job(workflow, "manifest", "image-provenance");
    const provenance = job(workflow, "image-provenance", "release-subjects");
    const aliases = job(workflow, "aliases");

    expect(manifest).toContain("manifest_digest: ${{ steps.manifest_digest.outputs.digest }}");
    expect(manifest).toContain("id: manifest_digest");
    expect(manifest).toContain('echo "digest=${ghcr_digest}" >> "$GITHUB_OUTPUT"');
    expect(manifest).toContain('[[ "${dockerhub_digest}" == "${ghcr_digest}" ]]');

    expect(provenance).toContain("needs: [release, manifest]");
    expect(provenance).toContain("ref: ${{ needs.release.outputs.release_commit }}");
    expect(provenance).toContain("Verify immutable release tag binding");
    expect(provenance).toContain("MANIFEST_DIGEST: ${{ needs.manifest.outputs.manifest_digest }}");
    expect(provenance).toContain('[[ "${resolved_digest}" == "${MANIFEST_DIGEST}" ]]');
    expect(provenance).toContain("subject-name: ghcr.io/snapotter-hq/snapotter");
    expect(provenance).toContain("subject-name: docker.io/snapotter/snapotter");
    expect(
      provenance.match(/subject-digest: \$\{\{ needs\.manifest\.outputs\.manifest_digest \}\}/g),
    ).toHaveLength(2);

    expect(aliases).toContain("needs: [release, manifest, image-provenance, release-subjects]");
  });

  it("cryptographically binds the generated release commit to every published subject", () => {
    const workflow = readRequired(releaseWorkflowPath);
    const releaseSubjects = job(workflow, "release-subjects", "aliases");
    const aliases = job(workflow, "aliases");

    expect(releaseSubjects).toContain(
      "needs: [release, archive-security, manifest, image-provenance]",
    );
    expect(releaseSubjects).toContain("ref: ${{ needs.release.outputs.release_commit }}");
    expect(releaseSubjects).toContain(
      "RELEASE_COMMIT: ${{ needs.release.outputs.release_commit }}",
    );
    expect(releaseSubjects).toContain("WORKFLOW_TRIGGER_COMMIT: ${{ github.sha }}");
    expect(releaseSubjects).toContain('"releaseCommit": release_commit');
    expect(releaseSubjects).toContain('"releaseTag": release_tag');
    expect(releaseSubjects).toContain('"workflowTriggerCommit": workflow_trigger_commit');
    expect(releaseSubjects).toContain('for arch in ("amd64", "arm64")');
    expect(releaseSubjects).toContain('archive = f"snapotter-v{version}-linux-{arch}.tar.gz"');
    expect(releaseSubjects).toContain("docker.io/snapotter/snapotter");
    expect(releaseSubjects).toContain("ghcr.io/snapotter-hq/snapotter");
    expect(releaseSubjects).toContain("actions/attest-build-provenance@");
    expect(releaseSubjects).toContain('subject-path: "/tmp/${{ env.release_subjects_name }}"');
    expect(releaseSubjects).toContain("Existing release-subject manifest differs");
    expect(releaseSubjects).not.toContain("--clobber");
    const build = releaseSubjects.indexOf("Build canonical release-subject manifest");
    const revalidate = releaseSubjects.indexOf(
      "Revalidate release tag immediately before attesting subjects",
    );
    const attest = releaseSubjects.indexOf("Attest release-commit subject binding");
    expect(build).toBeGreaterThanOrEqual(0);
    expect(revalidate).toBeGreaterThan(build);
    expect(attest).toBeGreaterThan(revalidate);
    expect(releaseSubjects.match(/git fetch --force --no-tags origin/g)).toHaveLength(2);
    expect(aliases).toContain("needs: [release, manifest, image-provenance, release-subjects]");
  });

  it("never overwrites an existing immutable release asset", () => {
    const workflow = readRequired(releaseWorkflowPath);
    const archiveSecurity = job(workflow, "archive-security", "docker");
    const scan = job(workflow, "scan", "sbom");
    const sbom = job(workflow, "sbom", "ai-bundles");

    expect(archiveSecurity).toContain("verify_or_upload_asset() {");
    expect(archiveSecurity).toContain("Existing immutable release asset differs");
    expect(archiveSecurity).toContain("Expected exactly one immutable release asset after upload");
    expect(scan).toContain("Existing immutable Trivy report differs");
    expect(sbom).toContain("Existing immutable SBOM differs");
    expect(workflow).not.toContain("--clobber");
  });

  it("uses disjoint archive and image compliance asset names", () => {
    const workflow = readRequired(releaseWorkflowPath);
    const archiveSecurity = job(workflow, "archive-security", "docker");
    const scan = job(workflow, "scan", "sbom");
    const sbom = job(workflow, "sbom", "ai-bundles");

    expect(archiveSecurity).toContain("snapotter-v${VERSION}-archive-linux-${ARCH}-trivy.json");
    expect(scan).toContain("snapotter-v${VERSION}-image-${{ matrix.platform }}-trivy.json");
    expect(sbom).toContain("snapotter-v${VERSION}-image-${{ matrix.platform }}-sbom.cdx.json");
  });

  it("does not create a fallible post-tag changelog commit", () => {
    const workflow = readRequired(releaseWorkflowPath);
    const release = job(workflow, "release", "prebuilt");

    expect(release).not.toContain("- name: Update docs changelog");
    expect(release).not.toContain("git commit");
    expect(release).not.toContain("HEAD:main");
  });

  it("pins every external action to an immutable commit", () => {
    const workflow = readRequired(releaseWorkflowPath);
    const externalUses = [...workflow.matchAll(/^\s*(?:-\s*)?uses:\s*([^./\s][^\s#]*)/gm)].map(
      (match) => match[1],
    );

    expect(externalUses.length).toBeGreaterThan(0);
    for (const action of externalUses) {
      expect(action, `${action} must use an immutable commit`).toMatch(/@[0-9a-f]{40}$/);
    }
  });
});
