---
description: Security hardening guide for SnapOtter. Container security, network isolation, Docker secrets, Kubernetes deployment, and compliance artifacts.
---

# Security & Hardening {#security-hardening}

SnapOtter processes files entirely on your infrastructure. It sends anonymous, content-free product analytics and crash reports by default to help improve the project. It never sends your files, file names, file contents, OCR output, image metadata, or document text. Optional feedback is sent only after a user submits it, only when analytics is enabled, and contact fields are included only with explicit contact consent. An administrator can turn analytics and feedback capture off in one click under Settings > System > Privacy, no rebuild required. File processing always stays inside your container.

The container runs as a dedicated non-root user (`snapotter`) with all Linux capabilities dropped except the minimum required set. For the full vulnerability disclosure policy and security architecture, see [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) on GitHub.

## Container Hardening {#container-hardening}

The canonical [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) and [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) Compose files are the source of truth. Do not copy an abbreviated example into production; deploy the file from the release tag you verified.

Both stacks apply the following controls:

- Memory, swap, CPU, and PID limits contain runaway native processing.
- Every service drops all Linux capabilities. The application adds back only `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` for volume ownership, the one-way `gosu` identity drop, and graceful signal forwarding. PostgreSQL and Redis receive only the subset their official entrypoints need.
- `security_opt: [no-new-privileges:true]` prevents processes in the application, PostgreSQL, and Redis containers from gaining additional privileges. This remains compatible with `gosu`: the entrypoint begins as root, prepares the volumes, and only drops to the dedicated `snapotter` user.
- PostgreSQL and Redis image inputs are pinned by digest. The application should likewise be pinned to a verified release tag or digest rather than `latest`.
- Health checks, bounded JSON log rotation, durable Redis AOF, and restart policy are defined centrally in the canonical files.

For an internet-facing deployment, bind port 1349 to loopback and terminate TLS at a maintained reverse proxy. Generate unique PostgreSQL and Redis credentials, store secrets in protected files or a secret manager, and change the initial administrator password immediately.

### Why `read_only` Is Not Set {#why-read-only-is-not-set}

`read_only: true` is not set because PUID/PGID remapping writes to `/etc/passwd` and `/etc/group` at startup. If you use Docker's `--user` flag or Kubernetes `runAsUser` instead of PUID/PGID, you can safely enable a read-only root filesystem.

## Network Isolation {#network-isolation}

File processing is local, but a default installation is **not an egress-free system**. Anonymous product analytics use PostHog and crash reporting uses Sentry when telemetry is enabled. Set `SNAPOTTER_TELEMETRY=0` (or disable analytics under Settings > System > Privacy) to turn off both. SnapOtter never includes uploaded files, file names, OCR output, document text, or other file contents in those events.

Other outbound traffic is feature-driven: AI bundle/model installation downloads signed release inputs; URL import fetches a user-requested public URL; and explicitly configured OIDC, SAML, OpenTelemetry, webhooks, S3-compatible storage, or similar integrations contact the destinations chosen by the administrator. Runtime model downloads are disabled by default. Set `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` only to explicitly opt into automatic fallback downloads. An [offline bundle import](/guide/deployment) can provision AI features without runtime model egress.

**Firewall recommendations:**

| Scenario | Outbound rule |
|---|---|
| Air-gapped | Set `SNAPOTTER_TELEMETRY=0` and `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, use offline AI bundle import, disable URL import and external integrations, then block egress |
| Default telemetry | Allow the PostHog and Sentry endpoints listed by your browser/network logs; disable telemetry if policy does not permit them |
| AI bundles needed | During installation, allow HTTPS to `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`; then block those hosts |
| External integrations | Allow only the exact administrator-configured OIDC/SAML/OTLP/webhook/object-storage destinations |

Bundle archives are served from Hugging Face's Xet storage, which transfers over the `*.xethub.hf.co` endpoints in parallel and is what makes multi-GB bundle downloads fast. If your firewall allows `huggingface.co` but blocks `*.xethub.hf.co`, installs still succeed but fall back to a slower single-stream download, so allowlist the Xet hosts to stay on the fast path. Fully offline installs can skip all of this and use [Offline Bundle Import](/guide/deployment) instead.

For reverse proxy configuration (Nginx, Traefik, Caddy, Cloudflare Tunnels), see the [Deployment guide](/guide/deployment#reverse-proxy).

## Docker Secrets {#docker-secrets}

For production deployments, avoid passing secrets as plain-text environment variables. The entrypoint supports Docker's `_FILE` convention: mount a secret as a file and set the corresponding `_FILE` variable to its path.

**Supported secrets:**

| Variable | `_FILE` equivalent |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Example with Docker Compose secrets:**

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD_FILE=/run/secrets/snapotter_password
      - COOKIE_SECRET_FILE=/run/secrets/cookie_secret
    secrets:
      - snapotter_password
      - cookie_secret

secrets:
  snapotter_password:
    file: ./secrets/snapotter_password.txt
  cookie_secret:
    file: ./secrets/cookie_secret.txt
```

::: tip
Docker Compose secrets (without Swarm) require Compose v2.23 or later.
:::

## Kubernetes Deployment {#kubernetes-deployment}

The entrypoint detects when the container is already running as non-root (e.g., via Kubernetes `runAsUser`) and skips the gosu privilege drop automatically. In that case it cannot chown the mounted volumes itself, so it verifies they are writable and exits early with actionable guidance if they are not — see [Storage permissions](/guide/deployment#storage-permissions) for `fsGroup` and foreign-UID setups (TrueNAS, OpenShift).

**Recommended Pod SecurityContext:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: snapotter
spec:
  replicas: 1
  selector:
    matchLabels:
      app: snapotter
  template:
    metadata:
      labels:
        app: snapotter
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 999
        runAsGroup: 999
        fsGroup: 999
      containers:
        - name: snapotter
          image: snapotter/snapotter:latest
          ports:
            - containerPort: 1349
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: [ALL]
          resources:
            requests:
              cpu: "1"
              memory: 2Gi
            limits:
              cpu: "4"
              memory: 6Gi
          livenessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 60
            periodSeconds: 30
            timeoutSeconds: 5
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
          volumeMounts:
            - name: data
              mountPath: /data
            - name: workspace
              mountPath: /tmp/workspace
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: snapotter-data
        - name: workspace
          emptyDir:
            medium: Memory
            sizeLimit: 2Gi
```

Since `runAsUser: 999` is set at the pod level, the entrypoint skips gosu entirely. This allows `allowPrivilegeEscalation: false` and `drop: [ALL]` capabilities without conflict.

For resource sizing, see [Hardware Requirements](/guide/deployment#hardware-requirements).

## Backup and Recovery {#backup-and-recovery}

The production Compose stack defines four volumes. Stop ingress and let active jobs finish before taking a coordinated backup so PostgreSQL, Redis, and file state describe the same point in time.

| Volume | Contents | Recovery treatment |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL users, settings, pipelines, jobs, file metadata, and audit log | Critical; use a fail-fast logical dump for portable recovery |
| `SnapOtter-data` | Saved library objects, logs, and AI state (`/data/files, /data/logs, /data/ai, /data/ai/venv`) | Back up the whole volume; to save space, deliberately omit all AI state and reinstall its bundles |
| `SnapOtter-redisdata` | Redis AOF for durable BullMQ queue state | Back up after pausing the app and forcing `SAVE`; required to resume queued work exactly |
| `SnapOtter-workspace` | Temporary object-storage keys (`/tmp/workspace/uploads, /tmp/workspace/outputs`) | Do not back up after all jobs are drained or cancelled; never discard it while jobs are active |

Compose normally prefixes volume names with the project name. Resolve the real source volume from the mounted container instead of assuming that a display name such as `SnapOtter-data` is the Docker volume name.

### Database backup {#database-backup}

Use PostgreSQL's custom archive format and verify the archive before treating the backup as complete:

```bash
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore only into a fresh/disposable target first; any SQL error fails the command.
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

Test every backup by restoring it into an isolated stack, checking database records and file checksums, and starting the application. The repository's `tests/qa/backup-restore-drill.sh` automates that release gate against an explicit `QA_IMAGE`.

If your platform takes crash-consistent volume snapshots instead, stop the entire stack first and snapshot all critical volumes as one set. A raw PostgreSQL data-directory copy from a running container is not a supported logical backup.

### File and queue backup {#file-and-queue-backup}

Pause the application before capturing file and queue volumes. Use `docker inspect` to resolve the actual volume name, force Redis to persist its current state, and archive with ownership and permissions preserved:

```bash
docker stop SnapOtter
docker exec SnapOtter-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning SAVE
docker stop SnapOtter-redis

DATA_VOLUME="$(docker inspect SnapOtter --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"
REDIS_VOLUME="$(docker inspect SnapOtter-redis --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"

install -d -m 700 backup
docker run --rm -v "$DATA_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-data.tar.gz -C /source .
docker run --rm -v "$REDIS_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-redis.tar.gz -C /source .
sha256sum backup/snapotter-*.tar.gz > backup/SHA256SUMS
```

Restart Redis before the application. If you intentionally exclude `/data/ai`, remove the whole AI subtree rather than preserving an `installed.json` record without its models or virtual environment. Keep backup files encrypted, access-controlled, and separate from the host running SnapOtter.

## Compliance Artifacts {#compliance-artifacts}

Each SnapOtter release includes the following security artifacts:

| Artifact | Format | Where to find it |
|---|---|---|
| Release subject binding | Canonical JSON + GitHub attestation | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) asset: `snapotter-v{version}-release-subjects.json` |
| Archive SBOM | CycloneDX and SPDX JSON | Release assets: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| Image SBOM | CycloneDX and SPDX JSON | Release assets: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Vulnerability scans | Trivy JSON | Release assets with matching `archive-linux-{arch}` or `image-linux-{arch}` prefixes |
| Vulnerability scan | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) tab |
| Static analysis | CodeQL (JS/TS + Python) | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) tab, runs weekly + per PR |
| Dependency review | GitHub native | Per-PR check, fails on high-severity additions |
| Python dependency audit | pip-audit | CI run log on every push |
| Security policy | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) in the repository |
| Dependency updates | Dependabot | Automated weekly PRs for npm, pip, Docker, Actions |

**Running your own scan:**

Download the release-subject manifest and verify that it was attested by the release workflow:

```bash
gh attestation verify snapotter-v2.2.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

The manifest records `releaseTag`, `releaseCommit`, and `workflowTriggerCommit` separately. Verify that `releaseCommit` is the commit peeled from the immutable tag, then verify the SHA-256 digest of the archive, image, SBOM, or scan you consume against its entry in `subjects`. This distinction is intentional: checking out a newly created release commit does not change the commit identity in the workflow's OIDC credential.

You can also scan a downloaded SBOM or the image directly:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.2.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.2.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.2.0
```

::: info
Image SBOMs and scans reflect the exact architecture-specific image published for that release. Archive SBOMs and scans describe the prebuilt archive separately. AI model bundles installed after deployment are not included in these SBOMs because they are downloaded at runtime.
:::
