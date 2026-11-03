# Releasing SnapOtter

SnapOtter ships a multi-arch container image to Docker Hub (`snapotter/snapotter`) and GHCR (`ghcr.io/snapotter-hq/snapotter`). Releases are cut by hand, and every publish is gated. Nothing reaches Docker Hub, GHCR, or HuggingFace until a maintainer approves the run, and the public `latest` and version tags need a second approval after the scans.

## How the pipeline is wired

`.github/workflows/release.yml` runs on `workflow_dispatch` only. Nothing publishes when a PR merges to `main`. One dispatch runs these jobs:

1. `release`: semantic-release computes the next version from the Conventional Commits since the last tag, runs `scripts/sync-version.sh` (workspace versions, `APP_VERSION`, version-pinned docs references, docs changelog), tags it, and creates a **draft** GitHub release with the committed notes.
2. `prebuilt` and `archive-security`: build the source archives (amd64, arm64), then verify, scan, and attest them before they are attached to the release.
3. `publish-approval`: **gated.** The first approval. Nothing from step 4 on runs until a maintainer approves it, so a rejection here publishes nothing to Docker Hub, GHCR, or HuggingFace.
4. `docker`: builds both arches and pushes them to Docker Hub + GHCR **by digest only**. These pushes are unnamed and are not pullable by any tag.
5. `scan` and `sbom`: Trivy scans the built image and fails the run on unignored CRITICAL/HIGH vulnerabilities; CycloneDX + SPDX SBOMs are attached to the release.
6. `ai-bundles`: builds, verifies, signs, and uploads the AI feature bundles to HuggingFace. It runs after `docker`, so after the first approval.
7. `manifest`: **gated.** The second approval. Creates the public `latest`, `X.Y.Z`, `X.Y`, and `X` image tags (no `v` prefix; the git tag and GitHub release are `vX.Y.Z`) on both registries. This is the moment the image becomes pullable by tag.
8. `image-provenance`, `release-subjects`, `aliases`: attest the immutable image manifest, bind the release commit to the published subjects, and advance the non-regressing aliases.
9. `publish-release`: flips the GitHub release from draft to public. This is also what triggers the Discord `#announcements` post (a GitHub webhook on `release` events).

`publish-approval` and `manifest` both target the `publish-images` GitHub Environment, which requires a maintainer to approve each of them before it proceeds. If Trivy fails at step 5, `manifest` never runs and no tags are published.

## One-time setup: `RELEASE_TOKEN`

Step 1 (`release`) pushes a version-bump commit and tag to `main`, which is protected. The default GitHub Actions token cannot push past the required status checks, so the workflow authenticates that push with `RELEASE_TOKEN`: a fine-grained PAT owned by an admin. Because `enforce_admins` is off on `main`, an admin identity bypasses the checks.

Create it once, and rotate it when it expires:

1. GitHub → **Settings → Developer settings → Fine-grained personal access tokens → Generate new token**.
2. Resource owner: `snapotter-hq`. Repository access: **Only select repositories → `snapotter-hq/SnapOtter`**.
3. Repository permissions: **Contents** read+write, **Issues** read+write, **Pull requests** read+write. semantic-release commits and tags (Contents) and comments on released issues/PRs (Issues, Pull requests). Metadata read is added automatically.
4. Expiration: your call, up to a year. Set a reminder to rotate before it lapses.
5. Store it as a repo secret:
   ```bash
   gh secret set RELEASE_TOKEN --repo snapotter-hq/SnapOtter
   ```
   Paste the token when prompted.

If `RELEASE_TOKEN` is missing, the workflow falls back to the default token, the push to `main` is rejected by branch protection, and the `release` job fails at the semantic-release step. So set the secret before cutting a release. A classic PAT with the `repo` scope also works and is simpler to configure, but it can reach every repo you have access to, so the fine-grained token is preferred.

## Cut a release

0. **Confirm the GPU runner is online.** The `ai-bundles` job signs the OCR runtime index only after `verify-ocr-nvidia` passes, and that job needs the self-hosted box. The gated `manifest` job lists `ai-bundles` in its `needs`, so an offline runner means no public image tags at all. A queued self-hosted job waits up to 24 hours rather than failing, so check before you dispatch:

   ```bash
   gh api repos/snapotter-hq/SnapOtter/actions/runners --jq '
     [.runners[] | select(.status=="online")
      | {name, labels: [.labels[].name | ascii_downcase]}
      | select(.labels | (index("self-hosted") and index("linux")
                          and index("x64") and index("snapotter-nvidia")))
      | .name] as $ok
     | if ($ok|length)>0 then "ready: \($ok|join(", "))"
       else "NO ONLINE snapotter-nvidia RUNNER, do not dispatch" end'
   ```

   This has to be run by a maintainer, not by the workflow: listing self-hosted runners requires Administration:read, which is not an available `GITHUB_TOKEN` permission. If it reports no runner, start the service on the GPU box (`systemctl --user start github-runner`) and re-check. The workflow's own `preflight-gpu-runner` job claims the same labels before anything expensive runs, so a missed check shows up as a run parked on the first job instead of a late, unexplained stall.

1. Make sure `main` is green and everything you want in the release is merged.
2. Optional: to override the auto-generated release notes, add a `.release-notes.md` on `main`. If present, it replaces the GitHub release body and seeds the docs changelog.
3. Dispatch the workflow:
   ```bash
   gh workflow run release.yml --repo snapotter-hq/SnapOtter
   ```
   Or from the Actions tab: **Release → Run workflow**.
4. Watch the run. Once `release` finishes, the run pauses at `publish-approval` while `prebuilt` and `archive-security` carry on without intervention.

## Approve the publish

There are two approvals, both under **Review deployments** → `publish-images`.

### First approval: `publish-approval`

This releases the image build, the digest pushes, and the HuggingFace bundle upload. Before approving, check that `release` produced the version you expected and that the draft GitHub release looks right. To stop here, **Reject**: nothing reaches Docker Hub, GHCR, or HuggingFace.

### Second approval: `manifest`

When the run reaches `manifest` it pauses with a "Review deployments" prompt, and you get a GitHub notification.

Before approving, check:

- [ ] `release` produced the version you expected and the GitHub release looks right.
- [ ] `scan` (Trivy) passed. Review the report attached to the GitHub release if anything is unclear.
- [ ] The build checked out the right tag (the `docker` job uses `vX.Y.Z`).
- [ ] Optional: smoke-test the digest before it becomes `latest`. The digest is in the `docker` job log under "Build and push by digest":
      ```bash
      docker run --rm -p 1349:1349 ghcr.io/snapotter-hq/snapotter@sha256:<digest>
      ```

Then approve: open the run, click **Review deployments**, select `publish-images`, and **Approve and deploy**. The `manifest` job runs and the tags go live.

To abort, **Reject** the deployment instead. The version tag and the GitHub release still exist, so delete them by hand if you want to fully unwind. No image tags get published, though the untagged digests and that version's HuggingFace bundles already went out after the first approval.

## After the tags are live

- [ ] Confirm the tags resolve:
      ```bash
      docker pull snapotter/snapotter:latest
      docker pull ghcr.io/snapotter-hq/snapotter:X.Y.Z
      ```
- [ ] Provenance is attested by the `image-provenance` job; there is no separate attestation workflow. Spot-check it:
      ```bash
      gh attestation verify oci://ghcr.io/snapotter-hq/snapotter:X.Y.Z --repo snapotter-hq/SnapOtter
      ```
- [ ] A `[GitHub]` release post appears in Discord `#announcements` within about a minute of the release going public.
- [ ] Update the release banner and tag table in `DOCKERHUB.md` and open a PR. The Docker Hub description syncs from it through its own workflow once merged. Do this after the tags are live, not before, because the banner says what `latest` points at.

## Notes

- The `docker` job uploads layers by digest after the first approval and before the second. They are untagged, invisible on the registry tag lists, and exist so Trivy can scan the real image before you approve the tags. Registry garbage collection reclaims unreferenced digests over time. The HuggingFace bundles are also uploaded between the two approvals, so rejecting `manifest` leaves that version's bundles published.
- To change who can approve, edit **Settings → Environments → publish-images → Required reviewers**.
- AI feature bundles are built and published by the release's `ai-bundles` job, which calls the reusable `ai-bundles.yml` to build, verify, sign, and upload them to HuggingFace. The gated `manifest` job lists `ai-bundles` in its `needs`, so a version's public image tags go live only once that version's bundles are published. Publishing is idempotent: if the bundle release already exists it is verified, not re-uploaded.
- `ai-bundles.yml` also has an opt-in `verify-model-bundles` job (input `verify_model_bundles`, default false) that installs each published model bundle into the unpublished release image and runs its tool against a fixture, using `docker/verify-model-bundle-runtime.sh`. It is not wired into `release.yml` or the `publish` job yet. To make it a release gate, pass `verify_model_bundles: true` from `release.yml` and add `verify-model-bundles` to `publish`'s `needs`.
