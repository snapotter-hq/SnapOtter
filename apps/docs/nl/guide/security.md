---
description: "Handleiding voor beveiligingsverharding van SnapOtter. Containerbeveiliging, netwerkisolatie, Docker-secrets, Kubernetes-implementatie en compliance-artefacten."
i18n_source_hash: 986f7658430c
i18n_provenance: machine
i18n_output_hash: 2131ba905ef5
---

# Beveiliging & verharding {#security-hardening}

SnapOtter verwerkt bestanden volledig op je eigen infrastructuur. Het verstuurt standaard anonieme, inhoudsloze productanalytics en crashrapporten om het project te helpen verbeteren. Het verstuurt nooit je bestanden, bestandsnamen, bestandsinhoud, OCR-uitvoer, afbeeldingsmetadata of documenttekst. Optionele feedback wordt alleen verzonden nadat een gebruiker deze indient, alleen wanneer analytics is ingeschakeld, en contactvelden worden alleen opgenomen met expliciete contacttoestemming. Een beheerder kan analytics en het vastleggen van feedback met één klik uitschakelen onder Instellingen > Systeem > Privacy, geen herbouw vereist. Bestandsverwerking blijft altijd binnen je container.

De container draait als een dedicated niet-root-gebruiker (`snapotter`) met alle Linux-capabilities verwijderd behalve de minimaal vereiste set. Zie voor het volledige beleid voor kwetsbaarheidsonthulling en de beveiligingsarchitectuur [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) op GitHub.

## Containerverharding {#container-hardening}

De [standaard docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) bevat productiebeveiligingsverharding. Hier is een uitsplitsing van elke optie en waarom deze belangrijk is:

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

### Waarom `no-new-privileges` niet is ingesteld {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` is bewust weggelaten. De entrypoint start als root om het volume-eigenaarschap te herstellen en zakt dan via [gosu](https://github.com/tianon/gosu), dat setuid vereist, naar de `snapotter`-gebruiker. Zodra de privilegeverlaging is voltooid, draait het proces als `snapotter` met alle capabilities behalve de vijf hierboven genoemde verwijderd.

Als je Kubernetes of Dockers `--user`-vlag gebruikt om rechtstreeks als niet-root te draaien (met omzeiling van gosu), is `no-new-privileges` veilig om in te schakelen.

### Waarom `read_only` niet is ingesteld {#why-read-only-is-not-set}

`read_only: true` is niet ingesteld omdat PUID/PGID-remapping bij het opstarten naar `/etc/passwd` en `/etc/group` schrijft. Als je Dockers `--user`-vlag of Kubernetes `runAsUser` gebruikt in plaats van PUID/PGID, kun je veilig een alleen-lezen root-bestandssysteem inschakelen.

## Netwerkisolatie {#network-isolation}

Tijdens normaal gebruik maakt de container **nul uitgaande netwerkverbindingen**. Alle bestandsverwerking gebeurt lokaal met gebundelde bibliotheken.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

De enige uitzondering is **AI-modeldownloads**: wanneer een gebruiker een AI-featurebundel via de UI installeert, downloadt de container het vooraf gebouwde bundelarchief van Hugging Face, plus enkele individuele modelbestanden van GitHub Releases, Google Storage en PyPI. Deze downloads gebeuren één keer per bundel en worden opgeslagen in het `/data`-volume.

**Firewallaanbevelingen:**

| Scenario | Uitgaande regel |
|---|---|
| Air-gapped (geen AI) | Blokkeer al het uitgaande verkeer van de container |
| AI-bundels nodig | Sta HTTPS toe naar `huggingface.co`, `*.xethub.hf.co`, `cdn-lfs.huggingface.co`, `github.com`, `objects.githubusercontent.com`, `storage.googleapis.com`, `pypi.org`, `files.pythonhosted.org` tijdens de installatie, blokkeer daarna |
| Na AI-installatie | Blokkeer al het uitgaande verkeer - modellen worden lokaal gecachet |

Bundelarchieven worden geserveerd vanaf Hugging Faces Xet-opslag, die parallel over de `*.xethub.hf.co`-endpoints overdraagt en wat multi-GB-bundeldownloads snel maakt. Als je firewall `huggingface.co` toestaat maar `*.xethub.hf.co` blokkeert, slagen installaties nog steeds maar vallen ze terug op een tragere single-stream-download, dus zet de Xet-hosts op de allowlist om op het snelle pad te blijven. Volledig offline installaties kunnen dit alles overslaan en in plaats daarvan [Offline Bundelimport](/nl/guide/deployment) gebruiken.

Zie voor de configuratie van de reverse proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels) de [Implementatiehandleiding](/nl/guide/deployment#reverse-proxy).

## Docker-secrets {#docker-secrets}

Vermijd bij productie-implementaties het doorgeven van secrets als platte-tekst-omgevingsvariabelen. De entrypoint ondersteunt Dockers `_FILE`-conventie: koppel een secret als bestand en stel de bijbehorende `_FILE`-variabele in op het pad ervan.

**Ondersteunde secrets:**

| Variabele | `_FILE`-equivalent |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Voorbeeld met Docker Compose-secrets:**

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
Docker Compose-secrets (zonder Swarm) vereisen Compose v2.23 of later.
:::

## Kubernetes-implementatie {#kubernetes-deployment}

De entrypoint detecteert wanneer de container al als niet-root draait (bijv. via Kubernetes `runAsUser`) en slaat de gosu-privilegeverlaging automatisch over. In dat geval kan het de gekoppelde volumes niet zelf chown'en, dus verifieert het of ze beschrijfbaar zijn en stopt het vroegtijdig met bruikbare aanwijzingen als dat niet zo is — zie [Opslagpermissies](/nl/guide/deployment#storage-permissions) voor `fsGroup` en foreign-UID-configuraties (TrueNAS, OpenShift).

**Aanbevolen Pod SecurityContext:**

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

Omdat `runAsUser: 999` op podniveau is ingesteld, slaat de entrypoint gosu volledig over. Dit maakt `allowPrivilegeEscalation: false`- en `drop: [ALL]`-capabilities zonder conflict mogelijk.

Zie voor de dimensionering van resources [Hardwarevereisten](/nl/guide/deployment#hardware-requirements).

## Back-up en herstel {#backup-and-recovery}

Persistente staat is verdeeld over twee volumes:

| Volume | Inhoud | Kritiek? |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL-database (gebruikers, instellingen, pijplijnen, jobs, auditlog) | Ja |
| `/data` (app-volume) | Door gebruikers geüploade bestanden, AI-modellen, Python-venv | Gedeeltelijk (zie hieronder) |

Binnen het `/data`-volume:

| Pad | Inhoud | Kritiek? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | Gebruikersbestanden en verwerkingsresultaten | Ja |
| `/data/ai/` | Gedownloade AI-modelbestanden | Nee (opnieuw te downloaden) |
| `/data/venv/` | Python virtual environment | Nee (opnieuw gebouwd bij start) |

### Databaseback-up {#database-backup}

Gebruik `pg_dump` om de database te back-uppen terwijl de stack draait:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

Stop anders de stack en maak een snapshot van het `SnapOtter-pgdata`-volume:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Back-up van gebruikersbestanden {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

AI-modellen tellen op tot ongeveer 24 GB over alle bundels. Aangezien ze opnieuw te downloaden zijn, sluit je `/data/ai/` en `/data/venv/` uit van back-ups om ruimte te besparen. Alleen de database en gebruikersbestanden zijn kritiek.

## Compliance-artefacten {#compliance-artifacts}

Elke SnapOtter-release bevat de volgende beveiligingsartefacten:

| Artefact | Formaat | Waar te vinden |
|---|---|---|
| SBOM (CycloneDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases)-asset: `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases)-asset: `snapotter-v{version}-sbom.spdx.json` |
| Kwetsbaarheidsscan | Trivy JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases)-asset: `snapotter-v{version}-trivy.json` |
| Kwetsbaarheidsscan | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security)-tabblad |
| Statische analyse | CodeQL (JS/TS + Python) | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security)-tabblad, draait wekelijks + per PR |
| Dependency review | GitHub-native | Controle per PR, faalt op toevoegingen met hoge ernst |
| Python-dependency-audit | pip-audit | CI-runlog bij elke push |
| Beveiligingsbeleid | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) in de repository |
| Dependency-updates | Dependabot | Geautomatiseerde wekelijkse PR's voor npm, pip, Docker, Actions |

**Je eigen scan uitvoeren:**

Download de SBOM van de release en scan deze met je voorkeurstool:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
De SBOM en kwetsbaarheidsscan weerspiegelen de exacte image die voor die release is gepubliceerd. AI-modelbundels die na implementatie zijn geïnstalleerd, zijn niet in de SBOM opgenomen omdat ze tijdens runtime worden gedownload.
:::
