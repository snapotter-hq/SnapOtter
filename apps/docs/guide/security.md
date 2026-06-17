---
description: Security hardening guide for SnapOtter. Container security, network isolation, Docker secrets, Kubernetes deployment, and compliance artifacts.
---

# Security & Hardening

SnapOtter processes files entirely on your infrastructure. No telemetry, no external API calls, no phone-home behavior. Files never leave your network.

The container runs as a dedicated non-root user (`snapotter`) with all Linux capabilities dropped except the minimum required set. For the full vulnerability disclosure policy and security architecture, see [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) on GitHub.

## Container Hardening

The [default docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) includes production security hardening. Here is a breakdown of each option and why it matters:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      # Bind to localhost only for internet-facing deployments:
      - "127.0.0.1:1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_PASSWORD=change-me-immediately
      - RATE_LIMIT_PER_MIN=100

    # --- Resource limits ---
    mem_limit: 6g            # Prevents runaway memory from crashing the host
    memswap_limit: 6g        # No swap -- fail fast instead of degrading the host
    cpus: 4                  # Cap CPU usage to 4 cores
    pids_limit: 512          # Prevents fork bombs

    # --- Capability restrictions ---
    cap_drop:
      - ALL                  # Drop ALL Linux capabilities first
    cap_add:
      - CHOWN                # Needed for volume permission setup
      - SETUID               # Needed for gosu privilege drop (root -> snapotter)
      - SETGID               # Needed for gosu privilege drop
      - DAC_OVERRIDE         # Needed for volume permission setup
      - FOWNER               # Needed for volume permission setup

    # --- Logging ---
    logging:
      driver: json-file
      options:
        max-size: "50m"      # Rotate logs at 50 MB
        max-file: "5"        # Keep 5 rotated log files

    # --- Health check ---
    healthcheck:
      test: ["CMD", "curl", "-sf", "--max-time", "5", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3

    shm_size: "2gb"          # Required for Python ML shared memory
    restart: unless-stopped

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
```

### Why `no-new-privileges` Is Not Set

`security_opt: [no-new-privileges:true]` is intentionally omitted. The entrypoint starts as root to fix volume ownership, then drops to the `snapotter` user via [gosu](https://github.com/tianon/gosu), which requires setuid. Once the privilege drop completes, the process runs as `snapotter` with all capabilities except the five listed above removed.

If you use Kubernetes or Docker's `--user` flag to run as non-root directly (bypassing gosu), `no-new-privileges` is safe to enable.

### Why `read_only` Is Not Set

`read_only: true` is not set because PUID/PGID remapping writes to `/etc/passwd` and `/etc/group` at startup. If you use Docker's `--user` flag or Kubernetes `runAsUser` instead of PUID/PGID, you can safely enable a read-only root filesystem.

## Network Isolation

During normal operation, the container makes **zero outbound network connections**. All file processing happens locally using bundled libraries.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

The only exception is **AI model downloads**: when a user installs an AI feature bundle through the UI, the container downloads model files from GitHub Releases and PyPI. These downloads happen once per bundle and are stored in the `/data` volume.

**Firewall recommendations:**

| Scenario | Outbound rule |
|---|---|
| Air-gapped (no AI) | Block all outbound traffic from the container |
| AI bundles needed | Allow HTTPS to `github.com`, `objects.githubusercontent.com`, `pypi.org`, `files.pythonhosted.org` during install, then block |
| After AI install | Block all outbound traffic -- models are cached locally |

For reverse proxy configuration (Nginx, Traefik, Caddy, Cloudflare Tunnels), see the [Deployment guide](/guide/deployment#reverse-proxy).

## Docker Secrets

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

## Kubernetes Deployment

The entrypoint detects when the container is already running as non-root (e.g., via Kubernetes `runAsUser`) and skips the gosu privilege drop automatically.

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

## Backup and Recovery

All persistent state lives in the `/data` volume:

| Path | Contents | Critical? |
|---|---|---|
| Postgres volume | Database (users, settings, pipelines, audit log) | Yes |
| `/data/uploads/` | User-uploaded files (if file storage is enabled) | Yes |
| `/data/ai/` | Downloaded AI model files | No (re-downloadable) |
| `/data/venv/` | Python virtual environment | No (rebuilt on start) |

Postgres supports online backups via `pg_dump`. A minimal backup strategy:

```bash
# Dump the database while the stack is running
docker compose exec -T postgres pg_dump -U snapotter snapotter > backup.sql

# Archive the /data volume (user files, AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-data.tar.gz -C /data .
```

To restore:

```bash
# Restore the database
cat backup.sql | docker compose exec -T postgres psql -U snapotter snapotter

# Restore the /data volume
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine sh -c "cd /data && tar xzf /backup/snapotter-data.tar.gz"
```

AI models total up to 14 GB across all bundles. Since they are re-downloadable, you can exclude `/data/ai/` and `/data/venv/` from `/data` volume backups to save space. The database dump and `/data/uploads/` are the critical items.

## Compliance Artifacts

Each SnapOtter release includes the following security artifacts:

| Artifact | Format | Where to find it |
|---|---|---|
| SBOM (CycloneDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) asset: `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) asset: `snapotter-v{version}-sbom.spdx.json` |
| Vulnerability scan | Trivy JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) asset: `snapotter-v{version}-trivy.json` |
| Vulnerability scan | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) tab |
| Static analysis | CodeQL (JS/TS + Python) | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) tab, runs weekly + per PR |
| Dependency review | GitHub native | Per-PR check, fails on high-severity additions |
| Python dependency audit | pip-audit | CI run log on every push |
| Security policy | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) in the repository |
| Dependency updates | Dependabot | Automated weekly PRs for npm, pip, Docker, Actions |

**Running your own scan:**

Download the SBOM from the release and scan it with your preferred tool:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.0.0-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.0.0-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.0.0
```

::: info
The SBOM and vulnerability scan reflect the exact image published for that release. AI model bundles installed after deployment are not included in the SBOM since they are downloaded at runtime.
:::
