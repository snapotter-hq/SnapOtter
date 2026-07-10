---
description: "Beveiligingshardening-gids voor SnapOtter. Containerbeveiliging, netwerkisolatie, Docker secrets, Kubernetes-deployment en compliance-artefacten."
i18n_source_hash: c682d19a84ce
i18n_provenance: machine
i18n_output_hash: f6a276f43149
---

# Beveiliging & Hardening {#security-hardening}

SnapOtter verwerkt bestanden volledig op je eigen infrastructuur. Het verstuurt standaard anonieme, inhoudsvrije productanalytics en crashrapporten om het project te helpen verbeteren. Het verstuurt nooit je bestanden, bestandsnamen, bestandsinhoud, OCR-uitvoer, afbeeldingsmetadata of documenttekst. Optionele feedback wordt alleen verstuurd nadat een gebruiker die heeft ingediend, alleen wanneer analytics is ingeschakeld, en contactgegevens worden alleen meegestuurd bij uitdrukkelijke toestemming voor contact. Een beheerder kan analytics en het vastleggen van feedback met één klik uitschakelen onder Settings > System > Privacy, zonder rebuild. Bestandsverwerking blijft altijd binnen je container.

De container draait als een specifieke non-root-gebruiker (`snapotter`) waarbij alle Linux-capabilities zijn verwijderd, op de minimaal vereiste set na. Zie voor het volledige beleid voor kwetsbaarheidsmelding en de beveiligingsarchitectuur [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) op GitHub.

## Container-hardening {#container-hardening}

De [standaard docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) bevat beveiligingshardening voor productie. Hier is een uitleg van elke optie en waarom die van belang is:

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

`security_opt: [no-new-privileges:true]` is opzettelijk weggelaten. Het entrypoint start als root om het eigenaarschap van volumes te herstellen en zakt daarna terug naar de `snapotter`-gebruiker via [gosu](https://github.com/tianon/gosu), wat setuid vereist. Zodra de privilege-drop is voltooid, draait het proces als `snapotter` met alle capabilities verwijderd op de vijf hierboven genoemde na.

Als je Kubernetes of Dockers `--user`-flag gebruikt om direct als non-root te draaien (en gosu omzeilt), kan `no-new-privileges` veilig worden ingeschakeld.

### Waarom `read_only` niet is ingesteld {#why-read-only-is-not-set}

`read_only: true` is niet ingesteld omdat het remappen van PUID/PGID bij het opstarten naar `/etc/passwd` en `/etc/group` schrijft. Als je Dockers `--user`-flag of Kubernetes `runAsUser` gebruikt in plaats van PUID/PGID, kun je veilig een alleen-lezen root-bestandssysteem inschakelen.

## Netwerkisolatie {#network-isolation}

Tijdens normaal gebruik maakt de container **nul uitgaande netwerkverbindingen**. Alle bestandsverwerking gebeurt lokaal met gebundelde libraries.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

De enige uitzondering zijn **AI-modeldownloads**: wanneer een gebruiker via de UI een AI-functiebundel installeert, downloadt de container modelbestanden van GitHub Releases en PyPI. Deze downloads gebeuren één keer per bundel en worden opgeslagen in het `/data`-volume.

**Firewall-aanbevelingen:**

| Scenario | Uitgaande regel |
|---|---|
| Air-gapped (geen AI) | Blokkeer al het uitgaande verkeer vanaf de container |
| AI-bundels nodig | Sta HTTPS toe naar `github.com`, `objects.githubusercontent.com`, `pypi.org`, `files.pythonhosted.org` tijdens de installatie, blokkeer daarna |
| Na AI-installatie | Blokkeer al het uitgaande verkeer - modellen zijn lokaal gecachet |

Voor de configuratie van een reverse proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels), zie de [Deployment-gids](/nl/guide/deployment#reverse-proxy).

## Docker secrets {#docker-secrets}

Vermijd bij productie-deployments het doorgeven van secrets als omgevingsvariabelen in platte tekst. Het entrypoint ondersteunt Dockers `_FILE`-conventie: koppel een secret als bestand en stel de bijbehorende `_FILE`-variabele in op het pad ervan.

**Ondersteunde secrets:**

| Variabele | `_FILE`-equivalent |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Voorbeeld met Docker Compose secrets:**

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
Docker Compose secrets (zonder Swarm) vereisen Compose v2.23 of hoger.
:::

## Kubernetes-deployment {#kubernetes-deployment}

Het entrypoint detecteert wanneer de container al als non-root draait (bijv. via Kubernetes `runAsUser`) en slaat de gosu-privilege-drop automatisch over. In dat geval kan het de gekoppelde volumes niet zelf van eigenaar wijzigen, dus verifieert het of ze beschrijfbaar zijn en stopt het vroegtijdig met bruikbare aanwijzingen als dat niet zo is. Zie [Storage permissions](/nl/guide/deployment#storage-permissions) voor `fsGroup` en foreign-UID-configuraties (TrueNAS, OpenShift).

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

Omdat `runAsUser: 999` op podniveau is ingesteld, slaat het entrypoint gosu volledig over. Zo kunnen de capabilities `allowPrivilegeEscalation: false` en `drop: [ALL]` zonder conflict worden gebruikt.

Voor het bepalen van de resourcegrootte, zie [Hardware Requirements](/nl/guide/deployment#hardware-requirements).

## Back-up en herstel {#backup-and-recovery}

De persistente staat is verdeeld over twee volumes:

| Volume | Inhoud | Kritiek? |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL-database (gebruikers, instellingen, pipelines, jobs, audit log) | Ja |
| `/data` (app-volume) | Door gebruikers geüploade bestanden, AI-modellen, Python venv | Gedeeltelijk (zie hieronder) |

Binnen het `/data`-volume:

| Pad | Inhoud | Kritiek? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | Gebruikersbestanden en verwerkingsresultaten | Ja |
| `/data/ai/` | Gedownloade AI-modelbestanden | Nee (opnieuw te downloaden) |
| `/data/venv/` | Python virtual environment | Nee (wordt bij het opstarten opnieuw opgebouwd) |

### Databaseback-up {#database-backup}

Gebruik `pg_dump` om de database te back-uppen terwijl de stack draait:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

Stop de stack als alternatief en maak een snapshot van het `SnapOtter-pgdata`-volume:

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

AI-modellen zijn samen goed voor tot ongeveer 24 GB over alle bundels. Omdat ze opnieuw te downloaden zijn, kun je `/data/ai/` en `/data/venv/` van back-ups uitsluiten om ruimte te besparen. Alleen de database en de gebruikersbestanden zijn kritiek.

## Compliance-artefacten {#compliance-artifacts}

Elke SnapOtter-release bevat de volgende beveiligingsartefacten:

| Artefact | Formaat | Waar te vinden |
|---|---|---|
| SBOM (CycloneDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) asset: `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) asset: `snapotter-v{version}-sbom.spdx.json` |
| Kwetsbaarheidsscan | Trivy JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) asset: `snapotter-v{version}-trivy.json` |
| Kwetsbaarheidsscan | SARIF | Tabblad [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Statische analyse | CodeQL (JS/TS + Python) | Tabblad [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), draait wekelijks + per PR |
| Dependency review | GitHub native | Controle per PR, faalt bij toevoegingen met hoge ernst |
| Python dependency-audit | pip-audit | CI-runlog bij elke push |
| Beveiligingsbeleid | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) in de repository |
| Dependency-updates | Dependabot | Geautomatiseerde wekelijkse PR's voor npm, pip, Docker, Actions |

**Je eigen scan uitvoeren:**

Download de SBOM uit de release en scan deze met de tool van je voorkeur:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
De SBOM en de kwetsbaarheidsscan weerspiegelen exact de image die voor die release is gepubliceerd. AI-modelbundels die na de deployment worden geïnstalleerd, zijn niet opgenomen in de SBOM omdat ze tijdens runtime worden gedownload.
:::
