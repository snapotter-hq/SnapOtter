---
description: "Guide för säkerhetshärdning för SnapOtter. Containersäkerhet, nätverksisolering, Docker-hemligheter, Kubernetes-distribution och efterlevnadsartefakter."
i18n_source_hash: 986f7658430c
i18n_provenance: human
i18n_output_hash: a8e16c353a09
---

# Säkerhet och härdning {#security-hardening}

SnapOtter bearbetar filer helt och hållet på din infrastruktur. Den skickar anonym, innehållsfri produktanalys och kraschrapporter som standard för att hjälpa till att förbättra projektet. Den skickar aldrig dina filer, filnamn, filinnehåll, OCR-utdata, bildmetadata eller dokumenttext. Valfri feedback skickas endast efter att en användare har skickat in den, endast när analys är aktiverad, och kontaktfält inkluderas endast med uttryckligt kontaktsamtycke. En administratör kan stänga av analys- och feedbackinsamling med ett klick under Settings > System > Privacy, ingen ombyggnad krävs. Filbearbetning stannar alltid inuti din container.

Containern körs som en dedikerad icke-root-användare (`snapotter`) med alla Linux-behörigheter borttagna utom den minsta uppsättning som krävs. För den fullständiga policyn för sårbarhetsrapportering och säkerhetsarkitekturen, se [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) på GitHub.

## Containerhärdning {#container-hardening}

Den [standardmässiga docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) innehåller säkerhetshärdning för produktion. Här är en genomgång av varje alternativ och varför det spelar roll:

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

### Varför `no-new-privileges` inte är angivet {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` utelämnas avsiktligt. Startpunkten startar som root för att korrigera volymägarskap och släpper sedan till `snapotter`-användaren via [gosu](https://github.com/tianon/gosu), vilket kräver setuid. När privilegiesläppet är klart körs processen som `snapotter` med alla behörigheter utom de fem som listas ovan borttagna.

Om du använder Kubernetes eller Dockers `--user`-flagga för att köra som icke-root direkt (och kringgå gosu) är `no-new-privileges` säkert att aktivera.

### Varför `read_only` inte är angivet {#why-read-only-is-not-set}

`read_only: true` är inte angivet eftersom PUID/PGID-ommappning skriver till `/etc/passwd` och `/etc/group` vid start. Om du använder Dockers `--user`-flagga eller Kubernetes `runAsUser` i stället för PUID/PGID kan du tryggt aktivera ett skrivskyddat rot-filsystem.

## Nätverksisolering {#network-isolation}

Under normal drift gör containern **noll utgående nätverksanslutningar**. All filbearbetning sker lokalt med hjälp av medföljande bibliotek.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

Det enda undantaget är **AI-modellnedladdningar**: när en användare installerar en AI-funktionsbunt via gränssnittet laddar containern ner det förbyggda buntarkivet från Hugging Face, plus några enskilda modellfiler från GitHub Releases, Google Storage och PyPI. Dessa nedladdningar sker en gång per bunt och lagras i `/data`-volymen.

**Rekommendationer för brandvägg:**

| Scenario | Utgående regel |
|---|---|
| Luftgapad (ingen AI) | Blockera all utgående trafik från containern |
| AI-buntar behövs | Tillåt HTTPS till `huggingface.co`, `*.xethub.hf.co`, `cdn-lfs.huggingface.co`, `github.com`, `objects.githubusercontent.com`, `storage.googleapis.com`, `pypi.org`, `files.pythonhosted.org` under installation, blockera sedan |
| Efter AI-installation | Blockera all utgående trafik - modeller cachas lokalt |

Buntarkiv serveras från Hugging Faces Xet-lagring, som överför via `*.xethub.hf.co`-slutpunkterna parallellt och är det som gör nedladdningar av buntar på flera GB snabba. Om din brandvägg tillåter `huggingface.co` men blockerar `*.xethub.hf.co` lyckas installationer fortfarande men faller tillbaka till en långsammare enkelströmsnedladdning, så tillåtelselista Xet-värdarna för att stanna på den snabba vägen. Helt offline-installationer kan hoppa över allt detta och använda [Offline-buntimport](/sv/guide/deployment) i stället.

För konfiguration av omvänd proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels), se [Distributionsguiden](/sv/guide/deployment#reverse-proxy).

## Docker-hemligheter {#docker-secrets}

För produktionsdistributioner, undvik att skicka hemligheter som klartextmiljövariabler. Startpunkten stöder Dockers `_FILE`-konvention: montera en hemlighet som en fil och ange motsvarande `_FILE`-variabel till dess sökväg.

**Hemligheter som stöds:**

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

## Kubernetes-distribution {#kubernetes-deployment}

Startpunkten upptäcker när containern redan körs som icke-root (t.ex. via Kubernetes `runAsUser`) och hoppar över gosu-privilegiesläppet automatiskt. I det fallet kan den inte köra chown på de monterade volymerna själv, så den verifierar att de är skrivbara och avslutar tidigt med användbar vägledning om de inte är det — se [Lagringsbehörigheter](/sv/guide/deployment#storage-permissions) för `fsGroup`- och främmande-UID-uppsättningar (TrueNAS, OpenShift).

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

Eftersom `runAsUser: 999` anges på podnivå hoppar startpunkten över gosu helt. Detta tillåter `allowPrivilegeEscalation: false`- och `drop: [ALL]`-behörigheter utan konflikt.

För resursdimensionering, se [Hårdvarukrav](/sv/guide/deployment#hardware-requirements).

## Säkerhetskopiering och återställning {#backup-and-recovery}

Beständigt tillstånd är uppdelat på två volymer:

| Volym | Innehåll | Kritisk? |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL-databas (användare, inställningar, pipelines, jobb, granskningslogg) | Ja |
| `/data` (appvolym) | Användaruppladdade filer, AI-modeller, Python-venv | Delvis (se nedan) |

Inom `/data`-volymen:

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

Alternativt, stoppa stacken och ta en ögonblicksbild av `SnapOtter-pgdata`-volymen:

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

AI-modeller uppgår till ungefär 24 GB totalt över alla buntar. Eftersom de kan laddas ner igen, exkludera `/data/ai/` och `/data/venv/` från säkerhetskopior för att spara utrymme. Endast databasen och användarfilerna är kritiska.

## Efterlevnadsartefakter {#compliance-artifacts}

Varje SnapOtter-utgåva innehåller följande säkerhetsartefakter:

| Artefakt | Format | Var du hittar den |
|---|---|---|
| SBOM (CycloneDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases)-tillgång: `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases)-tillgång: `snapotter-v{version}-sbom.spdx.json` |
| Sårbarhetsskanning | Trivy JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases)-tillgång: `snapotter-v{version}-trivy.json` |
| Sårbarhetsskanning | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security)-fliken |
| Statisk analys | CodeQL (JS/TS + Python) | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security)-fliken, körs varje vecka + per PR |
| Beroendegranskning | GitHub-inbyggd | Kontroll per PR, misslyckas vid tillägg med hög allvarlighetsgrad |
| Granskning av Python-beroenden | pip-audit | CI-körningslogg vid varje push |
| Säkerhetspolicy | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) i arkivet |
| Beroendeuppdateringar | Dependabot | Automatiserade veckovisa PR:er för npm, pip, Docker, Actions |

**Köra din egen skanning:**

Ladda ner SBOM:en från utgåvan och skanna den med ditt föredragna verktyg:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM:en och sårbarhetsskanningen återspeglar den exakta avbildning som publicerats för den utgåvan. AI-modellbuntar som installeras efter distributionen ingår inte i SBOM:en eftersom de laddas ner vid körning.
:::
