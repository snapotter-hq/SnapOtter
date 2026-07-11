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
