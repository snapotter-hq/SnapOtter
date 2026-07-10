---
description: "Guide för säkerhetshärdning av SnapOtter. Containersäkerhet, nätverksisolering, Docker-hemligheter, Kubernetes-driftsättning och efterlevnadsartefakter."
i18n_source_hash: c682d19a84ce
i18n_provenance: human
i18n_output_hash: 31f13f59f9e7
---

# Säkerhet och härdning {#security-hardening}

SnapOtter bearbetar filer helt och hållet på din infrastruktur. Den skickar anonym, innehållsfri produktanalys och kraschrapporter som standard för att hjälpa till att förbättra projektet. Den skickar aldrig dina filer, filnamn, filinnehåll, OCR-utdata, bildmetadata eller dokumenttext. Valfri feedback skickas endast efter att en användare har skickat in den, endast när analys är aktiverad, och kontaktfält inkluderas endast med uttryckligt kontaktsamtycke. En administratör kan stänga av analys och feedbackinsamling med ett klick under Settings > System > Privacy, ingen ombyggnad krävs. Filbearbetning stannar alltid inuti din container.

Containern körs som en dedikerad icke-root-användare (`snapotter`) med alla Linux-behörigheter borttagna utom den minsta uppsättning som krävs. För den fullständiga policyn för sårbarhetsrapportering och säkerhetsarkitekturen, se [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) på GitHub.

## Containerhärdning {#container-hardening}

[Standard-docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) inkluderar säkerhetshärdning för produktion. Här är en genomgång av varje alternativ och varför det är viktigt:

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

### Varför `no-new-privileges` inte är satt {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` är avsiktligt utelämnat. Startpunkten startar som root för att åtgärda volymägarskap och släpper sedan ner till `snapotter`-användaren via [gosu](https://github.com/tianon/gosu), vilket kräver setuid. När privilegiesänkningen är klar körs processen som `snapotter` med alla behörigheter utom de fem ovan listade borttagna.

Om du använder Kubernetes eller Dockers `--user`-flagga för att köra som icke-root direkt (och kringgå gosu), är `no-new-privileges` säkert att aktivera.

### Varför `read_only` inte är satt {#why-read-only-is-not-set}

`read_only: true` är inte satt eftersom PUID/PGID-omappning skriver till `/etc/passwd` och `/etc/group` vid start. Om du använder Dockers `--user`-flagga eller Kubernetes `runAsUser` istället för PUID/PGID kan du säkert aktivera ett skrivskyddat rotfilsystem.

## Nätverksisolering {#network-isolation}

Under normal drift gör containern **noll utgående nätverksanslutningar**. All filbearbetning sker lokalt med hjälp av medföljande bibliotek.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

Det enda undantaget är **nedladdningar av AI-modeller**: när en användare installerar ett AI-funktionspaket via gränssnittet laddar containern ner modellfiler från GitHub Releases och PyPI. Dessa nedladdningar sker en gång per paket och lagras i volymen `/data`.

**Brandväggsrekommendationer:**

| Scenario | Utgående regel |
|---|---|
| Air-gapped (ingen AI) | Blockera all utgående trafik från containern |
| AI-paket behövs | Tillåt HTTPS till `github.com`, `objects.githubusercontent.com`, `pypi.org`, `files.pythonhosted.org` under installation, blockera sedan |
| Efter AI-installation | Blockera all utgående trafik - modeller är cachade lokalt |

För konfiguration av omvänd proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels), se [Driftsättningsguiden](/sv/guide/deployment#reverse-proxy).

## Docker-hemligheter {#docker-secrets}

För produktionsdriftsättningar, undvik att skicka hemligheter som miljövariabler i klartext. Startpunkten stöder Dockers `_FILE`-konvention: montera en hemlighet som en fil och sätt motsvarande `_FILE`-variabel till dess sökväg.

**Stödda hemligheter:**

| Variabel | `_FILE`-motsvarighet |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Exempel med Docker Compose-hemligheter:**

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
Docker Compose-hemligheter (utan Swarm) kräver Compose v2.23 eller senare.
:::

## Kubernetes-driftsättning {#kubernetes-deployment}

Startpunkten upptäcker när containern redan körs som icke-root (t.ex. via Kubernetes `runAsUser`) och hoppar över gosu-privilegiesänkningen automatiskt. I det fallet kan den inte köra chown på de monterade volymerna själv, så den verifierar att de är skrivbara och avslutas tidigt med handlingsbar vägledning om de inte är det. Se [Lagringsbehörigheter](/sv/guide/deployment#storage-permissions) för `fsGroup` och konfigurationer med främmande UID (TrueNAS, OpenShift).

**Rekommenderad Pod SecurityContext:**

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

Eftersom `runAsUser: 999` är satt på pod-nivå hoppar startpunkten över gosu helt. Detta tillåter behörigheterna `allowPrivilegeEscalation: false` och `drop: [ALL]` utan konflikt.

För resursdimensionering, se [Hårdvarukrav](/sv/guide/deployment#hardware-requirements).

## Säkerhetskopiering och återställning {#backup-and-recovery}

Beständig data är uppdelad på två volymer:

| Volym | Innehåll | Kritisk? |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL-databas (användare, inställningar, pipelines, jobb, granskningslogg) | Ja |
| `/data` (app-volym) | Användaruppladdade filer, AI-modeller, Python-venv | Delvis (se nedan) |

Inom volymen `/data`:

| Sökväg | Innehåll | Kritisk? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | Användarfiler och bearbetningsresultat | Ja |
| `/data/ai/` | Nedladdade AI-modellfiler | Nej (kan laddas ner igen) |
| `/data/venv/` | Python virtuell miljö | Nej (byggs om vid start) |

### Databassäkerhetskopiering {#database-backup}

Använd `pg_dump` för att säkerhetskopiera databasen medan stacken körs:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

Alternativt, stoppa stacken och ta en ögonblicksbild av volymen `SnapOtter-pgdata`:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Säkerhetskopiering av användarfiler {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

AI-modeller uppgår till cirka 24 GB totalt över alla paket. Eftersom de kan laddas ner igen, uteslut `/data/ai/` och `/data/venv/` från säkerhetskopior för att spara utrymme. Endast databasen och användarfilerna är kritiska.

## Efterlevnadsartefakter {#compliance-artifacts}

Varje SnapOtter-release inkluderar följande säkerhetsartefakter:

| Artefakt | Format | Var man hittar den |
|---|---|---|
| SBOM (CycloneDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases)-tillgång: `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases)-tillgång: `snapotter-v{version}-sbom.spdx.json` |
| Sårbarhetsskanning | Trivy JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases)-tillgång: `snapotter-v{version}-trivy.json` |
| Sårbarhetsskanning | SARIF | Fliken [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Statisk analys | CodeQL (JS/TS + Python) | Fliken [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), körs veckovis + per PR |
| Beroendegranskning | GitHub-inbyggd | Per-PR-kontroll, misslyckas vid tillägg med hög allvarlighetsgrad |
| Granskning av Python-beroenden | pip-audit | CI-körningslogg vid varje push |
| Säkerhetspolicy | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) i repositoryt |
| Beroendeuppdateringar | Dependabot | Automatiserade veckovisa PR:er för npm, pip, Docker, Actions |

**Köra din egen skanning:**

Ladda ner SBOM från releasen och skanna den med ditt föredragna verktyg:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM och sårbarhetsskanningen återspeglar den exakta image som publicerats för den releasen. AI-modellpaket som installeras efter driftsättning inkluderas inte i SBOM eftersom de laddas ner vid körning.
:::
