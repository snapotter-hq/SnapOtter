---
description: "SnapOtter in productie uitrollen met Docker. Hardwarevereisten, GPU-installatie en reverse-proxyconfiguraties voor Nginx, Traefik en Cloudflare."
i18n_source_hash: ecc1b528bc4b
i18n_provenance: machine
i18n_output_hash: f8b8947f575d
---

# Uitrol {#deployment}

SnapOtter wordt uitgerold als een Docker Compose-stack met 3 containers: de SnapOtter-app-image, PostgreSQL 17 en Redis 8. De app-image ondersteunt **linux/amd64** (met NVIDIA CUDA voor AI-versnelling) en **linux/arm64** (CPU), dus het draait native op Intel/AMD-servers, Apple Silicon-Macs en ARM-apparaten zoals de Raspberry Pi 4/5. Intel/AMD iGPU-versnelling via VA-API, Quick Sync of OpenCL wordt vandaag de dag niet ondersteund voor AI-inferentie.

Zie [Docker-image](./docker-tags) voor GPU-installatie, Docker Compose-voorbeelden en versievastlegging.

## Snelstart (CPU) {#quick-start-cpu}

```yaml
# docker-compose.yml - Copy this file and run: docker compose up -d
services:
  SnapOtter:
    image: snapotter/snapotter:latest    # or ghcr.io/snapotter-hq/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"                # Web UI + API
    volumes:
      - SnapOtter-data:/data           # AI models, user files (PERSISTENT)
      - SnapOtter-workspace:/tmp/workspace  # Temp processing files (can be tmpfs)
    environment:
      # --- Authentication ---
      - AUTH_ENABLED=true          # Set to false to disable login entirely
      - DEFAULT_USERNAME=admin     # First-run admin username
      - DEFAULT_PASSWORD=admin     # First-run admin password (you'll be forced to change it)

      # --- Database + Queue ---
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=true         # Trust X-Forwarded-For headers (set false if not behind a proxy)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"            # Needed for Python ML shared memory
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
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
    container_name: SnapOtter-redis
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
  SnapOtter-data:       # Named volume - Docker manages permissions automatically
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose up -d
```

De app is dan beschikbaar op `http://localhost:1349`.

> **Docker Hub-ratelimieten?** Vervang `snapotter/snapotter:latest` door `ghcr.io/snapotter-hq/snapotter:latest` om in plaats daarvan vanaf het GitHub Container Registry te pullen. Beide registers ontvangen bij elke release dezelfde image.

## Snelstart (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Voor NVIDIA CUDA-versnelling op AI-tools (achtergrond verwijderen, opschalen, gezichtsverbetering, OCR):

```yaml
# docker-compose-gpu.yml - Requires: NVIDIA GPU + nvidia-container-toolkit
# Install toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"                # Required for PyTorch CUDA shared memory
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all           # Or set to 1 for a specific GPU
              capabilities: [gpu]
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
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
    container_name: SnapOtter-redis
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

```bash
docker compose -f docker-compose-gpu.yml up -d
```

Controleer CUDA-detectie in de logs:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Hardwarevereisten {#hardware-requirements}

Deze cijfers komen uit benchmarks op een reeks systemen, van een moderne amd64-werkstation met een NVIDIA RTX 4070 tot een Raspberry Pi, waarbij de hele toolcatalogus op elk systeem is uitgevoerd en de Docker-resourcelimieten zijn doorlopen om de echte ondergrens te vinden.

### Snelle referentie {#quick-reference}

| Niveau | Toepassing | CPU | RAM | GPU | Opslag |
|------|----------|-----|-----|-----|---------|
| Minimaal | Afbeeldings-, bestands- en lichte PDF-tools; één gebruiker; kleine batches | 2 cores | 2 GB | Geen | ~7 GB |
| Aanbevolen | Alle vijf modaliteiten incl. video, PDF en AI op CPU; batches; een paar gebruikers | 4 cores | 4 GB | Geen | ~25 GB |
| Volledig | Alles op snelheid incl. GPU-AI; grote batches; veel gebruikers | 6-8 cores | 8 GB | NVIDIA 8 GB+ VRAM (12 GB comfortabel) | ~35 GB |

**Architectuur: alleen 64-bits** (`linux/amd64` of `linux/arm64`). SnapOtter draait native op Intel/AMD-servers, Apple Silicon-Macs en 64-bits ARM-boards, waaronder de **Raspberry Pi 4 en 5** (4-8 GB). Het draait **niet** op 32-bits ARM (`armv7`/`armhf`) — er wordt geen image voor gebouwd — en ook niet op boards uit de 512 MB-klasse zoals de Pi Zero, die onder de geheugenondergrens zitten (zie hieronder).

### Minimaal (afbeeldings-, bestands- en lichte PDF-tools; geen AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Resource | Vereiste |
|---|---|
| CPU | 2 cores |
| RAM | 2 GB |
| Schijf | ~5,5 GB (image) + datavolume |
| GPU | Niet vereist |

Alle 222 non-AI-catalogustools - afbeelding (formaat wijzigen, bijsnijden, converteren, comprimeren, aanpassen, watermerk), video (inkorten, dempen, remuxen), audio (converteren, normaliseren, inkorten), PDF (samenvoegen, splitsen, comprimeren, roteren, beveiligen), bestandsconversies en speciale conversiepresets - draaien op bescheiden hardware. De meeste bewerkingen zijn ruim binnen een seconde klaar, zelfs bij een groot bestand: een afbeelding van 2,7 MB wordt in ~0,05 s van formaat gewijzigd en in ~2 s naar WebP gehercodeerd.

De geheugenondergrens is reëel, uit een doorloop van de Docker-resourcelimieten: **512 MB kan de stack niet starten** (zelfs één enkele formaatwijziging van een afbeelding wordt beëindigd), **1 GB** verwerkt bewerkingen op één bestand maar bij een batch met meerdere bestanden raakt het geheugen op, en **2 GB / 2 cores** is de kleinste configuratie die batches comfortabel aankan.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**De enige CPU-intensieve uitzondering is het hercoderen van video.** Stream-copy-bewerkingen (inkorten, dempen, container-remux) zijn direct klaar, maar transcoderen naar een andere codec is CPU-gebonden. Een clip van 1080p / 45 seconden die naar VP9 (WebM) wordt gehercodeerd, duurt ongeveer **~40 s** op een snelle moderne CPU, ~45 s op Apple Silicon, ~80 s op een oudere mobiele 4-core en **~130 s** op een oudere 4-core-server. Als je werklast videozwaar is, geef dan prioriteit aan CPU-cores en kloksnelheid, of verhoog de `cpus:`-limiet van de container — de meegeleverde compose beperkt de app standaard tot 4 cores (8 op de GPU-compose).

### Aanbevolen (AI-tools op CPU) {#recommended-ai-tools-on-cpu}

| Resource | Vereiste |
|---|---|
| CPU | 4 cores |
| RAM | 4 GB |
| Schijf | 3 GB (image) + 24 GB (AI-modellen) + werkruimte |
| GPU | Niet vereist (CPU-fallback) |

**Het installeren van de AI-bundels is wat het RAM naar 4 GB tilt.** Zonder AI geïnstalleerd draait de app inactief rond de 360 MB; met alle zeven bundels geïnstalleerd houdt hij ~2,6 GB resident vast, omdat de Python AI-sidecar zijn modellen (achtergrond verwijderen, opschalen, OCR, transcriptie, gezichtsdetectie, herstel) bij het opstarten vooraf laadt. Non-AI-installaties blijven licht; AI-installaties hebben ≥4 GB nodig.

De meeste AI-tools zijn prima bruikbaar op CPU; een paar willen echt een GPU. Gemeten op een moderne 4-core-CPU:

| AI-tool | CPU-tijd | Bruikbaar op CPU? |
|---|---|---|
| Gezichtsdetectie (blur-faces, smart-crop, red-eye), noise-removal | onder 1 s | Ja |
| OCR, transcriptie, ondertiteling | 1-3 s | Ja |
| Colorize, gezichtsverbetering | ~10 s | Ja |
| Achtergrond verwijderen / vervangen / vervagen | ~29 s | Ja (je wacht wel even) |
| AI-opschaling (RealESRGAN) | ~33 s klein; minuten bij grote afbeeldingen | Marginaal — GPU sterk aanbevolen |
| Fotoherstel (volledige pipeline) | enkele minuten | Nee — heeft een GPU of een snelle many-core-CPU nodig |

Downloadgroottes van AI-modellen:

| Bundel | Schijfgrootte |
|---|---|
| Achtergrond verwijderen | 4-5 GB |
| Opschaling + gezichtsverbetering + ruisverwijdering | 5-6 GB |
| Gezichtsdetectie | 200-300 MB |
| Objectgum + Colorize | 1-2 GB |
| OCR | 5-6 GB |
| Fotoherstel | 4-5 GB |
| **Alle bundels** | **~24 GB** |

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Volledig (AI-tools op NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| Resource | Vereiste |
|---|---|
| CPU | 6-8 cores (videovoorbereiding + concurrency draaien op CPU, zelfs met GPU-AI) |
| RAM | 8 GB |
| GPU | NVIDIA met 8+ GB VRAM (12 GB aanbevolen) |
| Schijf | ~35 GB totaal |

Een NVIDIA-GPU (CUDA) versnelt de zware AI-modellen aanzienlijk. Gemeten op een RTX 4070 vs een moderne CPU:

| AI-tool | Versnelling met GPU | Opmerkingen |
|---|---|---|
| AI-opschaling (RealESRGAN 2×) | **~47×** | De grootste winst — onder een seconde vs ~33 s (minuten bij grote afbeeldingen) |
| Gezichtsverbetering (CodeFormer) | **~12×** | ~0,9 s vs ~11 s |
| Transcriptie (Whisper) | ~4,5× | |
| Achtergrond verwijderen / vervangen / vervagen | ~4× | ~7 s op GPU vs ~29 s op CPU |
| Colorize | ~1,8× | |
| OCR, gezichtsdetectie, rode ogen, ruisverwijdering | ~1× | Al snel op CPU — een GPU helpt niet |
| Fotoherstel | geen | CPU-gebonden, zelfs op een GPU (0% GPU-gebruik); een snelle CPU telt hier zwaarder dan een GPU |

De tools die een GPU waard zijn, zijn **opschaling, gezichtsverbetering, transcriptie en achtergrond verwijderen**. Gezichtsdetectie, OCR en rode ogen zijn CPU-gebonden en al snel, dus een GPU voegt niets toe.

Het piekgebruik van VRAM bereikt 7,5 GB tijdens opschaling met gezichtsverbetering. Een NVIDIA-GPU van 6 GB werkt voor de meeste AI-tools afzonderlijk maar loopt vast op opschaling. 8-12 GB VRAM kan alles aan.

Intel/AMD iGPU-versnelling via VA-API, Quick Sync of OpenCL wordt vandaag de dag niet ondersteund voor AI-inferentie. Het mappen van `/dev/dri` in de container schakelt geen AI-GPU-versnelling in; SnapOtter voert AI-tools op CPU uit tenzij NVIDIA CUDA beschikbaar is.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 8G
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

### Gelijktijdige gebruikers {#concurrent-users}

Parallelle verzoeken om afbeeldingen van formaat te wijzigen tegen de standaard app-container met een limiet van 4 cores:

| Gelijktijdige verzoeken | Gem. responstijd | Fouten |
|---|---|---|
| 1 | 0,4s | 0 |
| 5 | 1,2s | 0 |
| 10 | 2,1s | 0 |

De responstijd verslechtert sublineair zonder fouten naarmate de workerpool verzadigd raakt. Het verhogen van de `cpus:`-limiet van de app-container (of het gebruik van een host met meer cores) verhoogt het plafond. Merk op dat zware jobs (videotranscodering, CPU-AI) een worker voor hun volledige duur bezet houden, dus schaal de CPU op je verwachte aantal gelijktijdige zware jobs, niet alleen op het aantal verzoeken.

### Ondersteunde afbeeldingsformaten {#supported-image-formats}

SnapOtter ondersteunt **55+ invoerformaten** en **14 uitvoerformaten**, waaronder RAW-bestanden van 20+ cameramerken, professionele formaten (PSD, EPS, OpenEXR, HDR), moderne codecs (JPEG XL, AVIF, HEIC, QOI) en wetenschappelijke/game-formaten (FITS, DDS).

Zie de [volledige formaatlijst](/nl/guide/supported-formats) voor details over elk ondersteund formaat, de gebruikte decoder en de beschikbare kwaliteitsinstellingen.

### Bekende beperkingen {#known-limitations}

- **Content-aware resize** crasht op grote afbeeldingen (>5 MP) door een beperking in de caire-binary. Werkt prima met kleinere afbeeldingen.
- **HEIF-decodering** duurt 13-23 seconden. HEIC (Apple's variant) is veel sneller met 0,3-0,9 seconden.
- **OCR Japans** mislukt op CPU door een PaddlePaddle MKLDNN-bug. Werkt op GPU.
- **Opschaling** loopt op CPU vast bij alles wat groter is dan kleine afbeeldingen. GPU vereist voor praktisch gebruik.
- **CodeFormer**-gezichtsverbetering is aanzienlijk trager dan GFPGAN (53s vs 2s op GPU). GFPGAN wordt aanbevolen voor de meeste toepassingen.

## Volumes {#volumes}

| Mount / Volume | Doel | Vereist? |
|---|---|---|
| `/data` (app) | AI-modellen, Python-venv, gebruikersbestanden | **Ja** - verlies van bestanden zonder dit |
| `/tmp/workspace` (app) | Tijdelijke verwerkingsbestanden (automatisch opgeschoond) | Aanbevolen |
| `SnapOtter-pgdata` (postgres) | PostgreSQL-datamap (gebruikers, instellingen, pipelines, jobs) | **Ja** - gegevensverlies zonder dit |
| `SnapOtter-redisdata` (redis) | Redis append-only-bestand voor duurzame jobwachtrijen | Aanbevolen |

### Bind mounts vs. benoemde volumes {#bind-mounts-vs-named-volumes}

**Benoemde volumes** (aanbevolen) — Docker beheert de rechten automatisch:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mounts** — Jij beheert de rechten. Stel `PUID`/`PGID` in zodat ze overeenkomen met je hostgebruiker:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Opslagrechten {#storage-permissions}

SnapOtter schrijft tijdens runtime naar twee locaties: `/data` (gebruikersbestanden, logs, AI-modellen en de Python-venv) en `/tmp/workspace` (tijdelijke verwerkingsscratch). Beide moeten beschrijfbaar zijn door de gebruiker waaronder de container draait. Als een van beide dat niet is, **faalt de container direct bij het opstarten** met een bericht dat de map, de actieve UID/GID en de oplossing benoemt — in plaats van "healthy" op te starten en dan bij de eerste upload te falen met een cryptische fout.

Hoe rechten worden afgehandeld, hangt af van hoe de container wordt gestart:

**Standaard (start als root, zakt af naar `snapotter`)** — het entrypoint start als root, corrigeert het eigenaarschap van de gemounte volumes en zakt dan af naar de ongeprivilegieerde `snapotter`-gebruiker via `gosu`. Benoemde volumes werken zonder configuratie. Stel voor bind mounts `PUID`/`PGID` in op je hostgebruiker (hierboven) zodat de bestanden die worden geschreven van jou zijn.

**Kubernetes / OpenShift (non-root via `runAsUser`)** — direct gestart als een non-root-gebruiker, kan de container de volumes niet zelf chownen, dus de orchestrator moet ze beschrijfbaar maken. Stel `fsGroup` in:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

De beschrijfbare mappen van de image zijn groepseigendom van GID 0 en groepsbeschrijfbaar, dus een pod die draait met een **willekeurige UID** plus de root-supplementaire groep (de OpenShift-standaard) kan schrijven zonder `chown`.

**TrueNAS Scale (en andere "foreign UID"-opstellingen)** — TrueNAS draait apps als een non-root-gebruiker (vaak `568:568`) en mount host-datasets die eigendom zijn van een andere gebruiker, dus noch het entrypoint noch `fsGroup` maakt ze op eigen kracht beschrijfbaar. Kies er een:

- **Draai de app als root** (aanbevolen) — laat de gebruiker van de app ongedefinieerd of stel deze in op `0`, en laat het standaard-entrypoint de rechten corrigeren en afzakken naar `snapotter`.
- **Draai als UID `999`** — stel de gebruiker/groep van de app in op `999:999` (SnapOtters ingebouwde `snapotter`-gebruiker) zodat deze overeenkomt met het eigenaarschap van de image.
- **`chown` de host-dataset** naar de UID waaronder de container draait, vanuit de TrueNAS-shell:

  ```bash
  # Gebruik de UID uit de opstartfout (of voer `id` uit in de container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

De opstartfout benoemt de exacte UID die je moet gebruiken, dus de snelste route is om de app één keer te starten, het bericht te lezen en dan `chown` (of de gebruiker aan te passen) dienovereenkomstig.

## Omgevingsvariabelen {#environment-variables}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `AUTH_ENABLED` | `true` | Aanmeldvereiste in-/uitschakelen |
| `DEFAULT_USERNAME` | `admin` | Initiële beheerdersgebruikersnaam |
| `DEFAULT_PASSWORD` | `admin` | Initieel beheerderswachtwoord (geforceerde wijziging bij eerste aanmelding) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Uploadlimiet per bestand |
| `MAX_BATCH_SIZE` | `100` | Max. bestanden per batchverzoek |
| `RATE_LIMIT_PER_MIN` | `1000` | API-verzoeken per minuut per IP (stel 0 in om uit te schakelen) |
| `MAX_USERS` | `0` (onbeperkt) | Maximum aantal gebruikersaccounts |
| `TRUST_PROXY` | `true` | X-Forwarded-For-headers van reverse proxy vertrouwen |
| `PUID` | `999` | Draaien als deze UID (voor bind-mount-rechten) |
| `PGID` | `999` | Draaien als deze GID (voor bind-mount-rechten) |
| `LOG_LEVEL` | `info` | Logdetailniveau: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Max. parallelle AI-verwerkingsjobs |
| `SESSION_DURATION_HOURS` | `168` | Levensduur aanmeldsessie (7 dagen) |
| `CORS_ORIGIN` | (leeg) | Door komma's gescheiden toegestane origins, of leeg voor same-origin |

## Health check {#health-check}

De container bevat een ingebouwde health check:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse proxy {#reverse-proxy}

SnapOtter stelt standaard `TRUST_PROXY=true` in zodat ratelimiting en logging het echte client-IP uit de `X-Forwarded-For`-headers gebruiken.

### Nginx {#nginx}

```nginx
server {
    listen 80;
    server_name images.example.com;

    # Match MAX_UPLOAD_SIZE_MB (0 = nginx default 1M, so set high for unlimited)
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:1349;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE support (batch progress, feature install progress)
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Voeg een nieuwe Proxy Host toe
2. Stel Domain Name in op je domein
3. Stel Scheme in op `http`, Forward Hostname op `SnapOtter` (of je container-IP), Forward Port op `1349`
4. Schakel WebSocket-ondersteuning in
5. Voeg onder Advanced toe: `client_max_body_size 500M;` en `proxy_buffering off;`

### Traefik {#traefik}

```yaml
# Add these labels to the SnapOtter service in docker-compose.yml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.snapotter.rule=Host(`images.example.com`)"
  - "traefik.http.routers.snapotter.entrypoints=websecure"
  - "traefik.http.routers.snapotter.tls.certresolver=letsencrypt"
  - "traefik.http.services.snapotter.loadbalancer.server.port=1349"
  # Increase upload limit (default 2MB is too low)
  - "traefik.http.middlewares.snapotter-body.buffering.maxRequestBodyBytes=524288000"
  - "traefik.http.routers.snapotter.middlewares=snapotter-body"
```

### Caddy {#caddy}

```txt
images.example.com {
    reverse_proxy localhost:1349 {
        flush_interval -1
        transport http {
            read_timeout 300s
            write_timeout 300s
        }
    }
}
```

`flush_interval -1` schakelt responsbuffering uit, wat vereist is voor SSE-voortgangsgebeurtenissen (batchverwerking, AI-tools, functie-installaties). De verlengde time-outs zorgen ervoor dat grote bestandsuploads kunnen worden voltooid zonder dat Caddy de verbinding voortijdig sluit.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Let op: Cloudflare heeft een uploadlimiet van 100 MB op gratis abonnementen. Stel `MAX_UPLOAD_SIZE_MB=100` zo in dat het overeenkomt.

## CI/CD {#ci-cd}

De GitHub-repository heeft drie workflows:

- **ci.yml** - Draait automatisch bij elke push en PR. Lint, typecheckt, test, bouwt en valideert de Docker-image (zonder te pushen).
- **release.yml** - Handmatig getriggerd via `workflow_dispatch`. Voert semantic-release uit om een versietag en GitHub-release te maken, bouwt vervolgens een multi-arch Docker-image (amd64 + arm64) en pusht naar Docker Hub (`snapotter/snapotter`) en het GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Bouwt deze documentatiesite en rolt hem uit naar Cloudflare Pages bij een push naar `main`.

Om een release te maken, ga naar **Actions > Release > Run workflow** in de GitHub-UI, of voer uit:

```bash
gh workflow run release.yml
```

Semantic-release bepaalt de versie op basis van de commitgeschiedenis. De Docker-tag `latest` verwijst altijd naar de meest recente release.

## Analytics {#analytics}

SnapOtter bevat anonieme productanalytics (patronen van toolgebruik, foutrapporten) om bugs op te sporen en functies te verbeteren. Deze staat standaard aan. Je bestanden, bestandsnamen en persoonlijke gegevens maken hier nooit deel van uit. SnapOtter werkt normaal met analytics uitgeschakeld.

### Analytics uitschakelen {#disabling-analytics}

De runtime-opt-out is een beheerdersschakelaar met één klik. Open Instellingen > Systeem > Privacy en zet Anonieme productanalytics uit. Het stopt onmiddellijk voor de hele instantie, geen rebuild nodig.

Voor een image die nooit analytics kan uitzenden, stel je de hard-off op buildtijd in door de repository te klonen en opnieuw te bouwen:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Of voeg de build-arg toe aan je bestaande `docker-compose.yml`:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
