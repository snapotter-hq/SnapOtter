// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Contract assertions intentionally match GitHub expression and shell interpolation syntax.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const releaseWorkflowPath = path.resolve(root, ".github/workflows/release.yml");
const manualAttestationPath = path.resolve(root, ".github/workflows/attest.yml");

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
    expect(archiveSecurity).toContain("node_modules/.bin/tsx --version");
    expect(archiveSecurity).toContain(
      "cyclonedx-json=snapotter-v${VERSION}-linux-${ARCH}-sbom.cdx.json",
    );
    expect(archiveSecurity).toContain(
      "spdx-json=snapotter-v${VERSION}-linux-${ARCH}-sbom.spdx.json",
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
    const provenance = job(workflow, "image-provenance", "aliases");
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

    expect(aliases).toContain("needs: [release, manifest, image-provenance]");
  });

  it("never overwrites an existing immutable release asset", () => {
    const workflow = readRequired(releaseWorkflowPath);
    const archiveSecurity = job(workflow, "archive-security", "docker");

    expect(archiveSecurity).toContain("verify_or_upload_asset() {");
    expect(archiveSecurity).toContain("Existing immutable release asset differs");
    expect(archiveSecurity).toContain("Expected exactly one immutable release asset after upload");
    expect(archiveSecurity).not.toContain("--clobber");
  });

  it("fails closed on changelog commit or push errors", () => {
    const workflow = readRequired(releaseWorkflowPath);
    const release = job(workflow, "release", "prebuilt");
    const changelog = release.slice(release.indexOf("- name: Update docs changelog"));

    expect(changelog).toContain("if git diff --cached --quiet; then");
    expect(changelog).toContain('echo "Docs changelog already current for v${VERSION}."');
    expect(changelog).toContain('git commit -m "docs: update changelog for v${VERSION} [skip ci]"');
    expect(changelog).toContain(
      'git push "https://x-access-token:${RELEASE_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" HEAD:main',
    );
    expect(changelog).not.toMatch(/git (?:commit|push)[^\n]*\|\| true/);
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
