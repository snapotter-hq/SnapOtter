# Releasing SnapOtter

SnapOtter ships a multi-arch container image to Docker Hub (`snapotter/snapotter`) and GHCR (`ghcr.io/snapotter-hq/snapotter`). Releases are cut by hand, and the image publish is gated. The build and scan run automatically, but the public `latest` and version tags only go live after a maintainer approves the run.

## How the pipeline is wired

`.github/workflows/release.yml` runs on `workflow_dispatch` only. Nothing publishes when a PR merges to `main`. One dispatch runs these jobs in order:

1. `release`: semantic-release computes the next version from the Conventional Commits since the last tag, tags it, and creates the GitHub release with notes.
2. `prebuilt`: builds the source archives (amd64, arm64) and attaches them to the GitHub release.
3. `docker`: builds both arches and pushes them to Docker Hub + GHCR **by digest only**. These pushes are unnamed and are not pullable by any tag.
4. `scan`: Trivy scans the built image and fails the run on unignored CRITICAL/HIGH vulnerabilities.
5. `sbom`: generates CycloneDX + SPDX SBOMs and attaches them to the GitHub release.
6. `manifest`: **gated.** Creates the public `latest`, `vX.Y.Z`, `X.Y`, and `X` tags on both registries. This is the moment the image becomes pullable by tag.

The `manifest` job targets the `publish-images` GitHub Environment, which requires a maintainer to approve the run before it proceeds. If Trivy fails at step 4, `manifest` never runs and no tags are published.

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

1. Make sure `main` is green and everything you want in the release is merged.
2. Optional: to override the auto-generated release notes, add a `.release-notes.md` on `main`. If present, it replaces the GitHub release body and seeds the docs changelog.
3. Dispatch the workflow:
   ```bash
   gh workflow run release.yml --repo snapotter-hq/SnapOtter
   ```
   Or from the Actions tab: **Release → Run workflow**.
4. Watch the run. Jobs `release` through `sbom` run without intervention.

## Approve the publish

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

To abort, **Reject** the deployment instead. The version tag and the GitHub release still exist, so delete them by hand if you want to fully unwind. No image tags get published.

## After the tags are live

- [ ] Confirm the tags resolve:
      ```bash
      docker pull snapotter/snapotter:latest
      docker pull ghcr.io/snapotter-hq/snapotter:vX.Y.Z
      ```
- [ ] Optional: attest provenance by dispatching **Attest Provenance** (`attest.yml`) with the image digest.
- [ ] The Docker Hub description syncs from `DOCKERHUB.md` through its own workflow. No action needed unless you changed it.

## Notes

- The `docker` job uploads layers by digest before the gate. They are untagged, invisible on the registry tag lists, and exist so Trivy can scan the real image before you approve. Registry garbage collection reclaims unreferenced digests over time. If you want nothing at all pushed before approval, move the `environment: publish-images` gate from `manifest` up to the `docker` job, at the cost of approving before the scan runs.
- To change who can approve, edit **Settings → Environments → publish-images → Required reviewers**.
- AI feature bundles publish separately (`ai-bundles.yml`). The release's `ai-bundles` job is disabled (`if: false`); bundles are built and pushed to HuggingFace out of band.
