---
description: "SnapOtter के लिए security hardening guide। Container security, network isolation, Docker secrets, Kubernetes deployment, और compliance artifacts।"
i18n_source_hash: c682d19a84ce
i18n_provenance: human
i18n_output_hash: dec5fe277f1d
---

# Security & Hardening {#security-hardening}

SnapOtter files को पूरी तरह से आपके infrastructure पर process करता है। यह project को बेहतर बनाने में मदद करने के लिए default रूप से अनाम, content-free product analytics और crash reports भेजता है। यह कभी भी आपकी files, file names, file contents, OCR output, image metadata, या document text नहीं भेजता। वैकल्पिक feedback केवल तभी भेजा जाता है जब कोई user इसे submit करता है, केवल तभी जब analytics सक्षम हो, और contact fields केवल स्पष्ट contact सहमति के साथ शामिल किए जाते हैं। एक administrator Settings > System > Privacy के तहत एक क्लिक में analytics और feedback capture को बंद कर सकता है, किसी rebuild की आवश्यकता नहीं। File processing हमेशा आपके container के अंदर रहता है।

Container एक समर्पित non-root user (`snapotter`) के रूप में चलता है जिसमें न्यूनतम आवश्यक set को छोड़कर सभी Linux capabilities हटा दी जाती हैं। पूर्ण vulnerability disclosure policy और security architecture के लिए, GitHub पर [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) देखें।

## Container Hardening {#container-hardening}

[default docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) में production security hardening शामिल है। यहाँ प्रत्येक option का विवरण और यह क्यों मायने रखता है:

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
      - RATE_LIMIT_PER_MIN=1000
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

    # --- Resource limits ---
    mem_limit: 6g            # Prevents runaway memory from crashing the host
    memswap_limit: 6g        # No swap - fail fast instead of degrading the host
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

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

### Why `no-new-privileges` Is Not Set {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` को जानबूझकर छोड़ दिया गया है। Entrypoint volume ownership ठीक करने के लिए root के रूप में शुरू होता है, फिर [gosu](https://github.com/tianon/gosu) के माध्यम से `snapotter` user पर छोड़ देता है, जिसके लिए setuid आवश्यक है। एक बार privilege drop पूरा हो जाने पर, process ऊपर सूचीबद्ध पाँच को छोड़कर सभी capabilities के साथ `snapotter` के रूप में चलता है।

यदि आप Kubernetes या Docker के `--user` flag का उपयोग सीधे non-root के रूप में चलाने के लिए करते हैं (gosu को bypass करते हुए), तो `no-new-privileges` को सक्षम करना सुरक्षित है।

### Why `read_only` Is Not Set {#why-read-only-is-not-set}

`read_only: true` सेट नहीं है क्योंकि PUID/PGID remapping startup पर `/etc/passwd` और `/etc/group` पर लिखता है। यदि आप PUID/PGID के बजाय Docker के `--user` flag या Kubernetes `runAsUser` का उपयोग करते हैं, तो आप सुरक्षित रूप से एक read-only root filesystem सक्षम कर सकते हैं।

## Network Isolation {#network-isolation}

सामान्य संचालन के दौरान, container **शून्य outbound network connections** बनाता है। सभी file processing bundled libraries का उपयोग करके स्थानीय रूप से होती है।

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

एकमात्र अपवाद **AI model downloads** है: जब कोई user UI के माध्यम से एक AI feature bundle install करता है, तो container GitHub Releases और PyPI से model files download करता है। ये downloads प्रति bundle एक बार होते हैं और `/data` volume में संग्रहीत किए जाते हैं।

**Firewall recommendations:**

| Scenario | Outbound rule |
|---|---|
| Air-gapped (no AI) | container से सभी outbound traffic को block करें |
| AI bundles needed | install के दौरान `github.com`, `objects.githubusercontent.com`, `pypi.org`, `files.pythonhosted.org` पर HTTPS की अनुमति दें, फिर block करें |
| After AI install | सभी outbound traffic को block करें - models स्थानीय रूप से cache किए गए हैं |

Reverse proxy configuration (Nginx, Traefik, Caddy, Cloudflare Tunnels) के लिए, [Deployment guide](/hi/guide/deployment#reverse-proxy) देखें।

## Docker Secrets {#docker-secrets}

Production deployments के लिए, secrets को plain-text environment variables के रूप में पास करने से बचें। Entrypoint Docker के `_FILE` convention का समर्थन करता है: एक secret को एक file के रूप में mount करें और संबंधित `_FILE` variable को उसके path पर सेट करें।

**Supported secrets:**

| Variable | `_FILE` equivalent |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Docker Compose secrets के साथ उदाहरण:**

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
Docker Compose secrets (Swarm के बिना) के लिए Compose v2.23 या बाद वाला संस्करण आवश्यक है।
:::

## Kubernetes Deployment {#kubernetes-deployment}

Entrypoint पता लगाता है कि container पहले से ही non-root के रूप में चल रहा है (जैसे, Kubernetes `runAsUser` के माध्यम से) और gosu privilege drop को स्वचालित रूप से छोड़ देता है। उस स्थिति में यह mounted volumes को स्वयं chown नहीं कर सकता, इसलिए यह सत्यापित करता है कि वे writable हैं और यदि नहीं हैं तो कार्रवाई योग्य मार्गदर्शन के साथ जल्दी बाहर निकल जाता है — `fsGroup` और foreign-UID setups (TrueNAS, OpenShift) के लिए [Storage permissions](/hi/guide/deployment#storage-permissions) देखें।

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

चूँकि `runAsUser: 999` pod level पर सेट है, entrypoint gosu को पूरी तरह छोड़ देता है। यह बिना किसी conflict के `allowPrivilegeEscalation: false` और `drop: [ALL]` capabilities की अनुमति देता है।

Resource sizing के लिए, [Hardware Requirements](/hi/guide/deployment#hardware-requirements) देखें।

## Backup and Recovery {#backup-and-recovery}

Persistent state दो volumes में विभाजित है:

| Volume | Contents | Critical? |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL database (users, settings, pipelines, jobs, audit log) | Yes |
| `/data` (app volume) | User-uploaded files, AI models, Python venv | Partially (नीचे देखें) |

`/data` volume के भीतर:

| Path | Contents | Critical? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | User files और processing results | Yes |
| `/data/ai/` | Downloaded AI model files | No (फिर से download योग्य) |
| `/data/venv/` | Python virtual environment | No (start पर पुनर्निर्मित) |

### Database backup {#database-backup}

Stack के चलते हुए database का backup लेने के लिए `pg_dump` का उपयोग करें:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

वैकल्पिक रूप से, stack को रोकें और `SnapOtter-pgdata` volume का snapshot लें:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### User files backup {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

AI models सभी bundles में कुल लगभग 24 GB तक होते हैं। चूँकि वे फिर से download योग्य हैं, स्थान बचाने के लिए backups से `/data/ai/` और `/data/venv/` को बाहर रखें। केवल database और user files महत्वपूर्ण हैं।

## Compliance Artifacts {#compliance-artifacts}

प्रत्येक SnapOtter release में निम्नलिखित security artifacts शामिल हैं:

| Artifact | Format | Where to find it |
|---|---|---|
| SBOM (CycloneDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) asset: `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) asset: `snapotter-v{version}-sbom.spdx.json` |
| Vulnerability scan | Trivy JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) asset: `snapotter-v{version}-trivy.json` |
| Vulnerability scan | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) tab |
| Static analysis | CodeQL (JS/TS + Python) | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) tab, साप्ताहिक + प्रति PR चलता है |
| Dependency review | GitHub native | Per-PR check, high-severity additions पर विफल होता है |
| Python dependency audit | pip-audit | हर push पर CI run log |
| Security policy | Markdown | repository में [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| Dependency updates | Dependabot | npm, pip, Docker, Actions के लिए स्वचालित साप्ताहिक PRs |

**अपना स्वयं का scan चलाना:**

Release से SBOM download करें और इसे अपने पसंदीदा tool के साथ scan करें:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM और vulnerability scan उस release के लिए प्रकाशित सटीक image को दर्शाते हैं। Deployment के बाद install किए गए AI model bundles SBOM में शामिल नहीं हैं क्योंकि वे runtime पर download किए जाते हैं।
:::
