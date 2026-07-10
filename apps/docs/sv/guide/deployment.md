---
description: "Distribuera SnapOtter till produktion med Docker. Hårdvarukrav, GPU-konfiguration och konfigurationer för omvänd proxy för Nginx, Traefik och Cloudflare."
i18n_source_hash: ecc1b528bc4b
i18n_provenance: human
i18n_output_hash: fc12b1bffb58
---

# Distribution {#deployment}

SnapOtter distribueras som en Docker Compose-stack med 3 containrar: SnapOtter-appavbildningen, PostgreSQL 17 och Redis 8. Appavbildningen stöder **linux/amd64** (med NVIDIA CUDA för AI-acceleration) och **linux/arm64** (CPU), så den körs nativt på Intel/AMD-servrar, Apple Silicon-datorer och ARM-enheter som Raspberry Pi 4/5. Intel/AMD iGPU-acceleration via VA-API, Quick Sync eller OpenCL stöds inte för AI-inferens i dagsläget.

Se [Docker-avbildning](./docker-tags) för GPU-konfiguration, Docker Compose-exempel och versionslåsning.

## Snabbstart (CPU) {#quick-start-cpu}

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

Appen är då tillgänglig på `http://localhost:1349`.

> **Hastighetsbegränsningar på Docker Hub?** Ersätt `snapotter/snapotter:latest` med `ghcr.io/snapotter-hq/snapotter:latest` för att hämta från GitHub Container Registry istället. Båda registren får samma avbildning vid varje release.

## Snabbstart (NVIDIA CUDA) {#quick-start-nvidia-cuda}

För NVIDIA CUDA-acceleration av AI-verktyg (bakgrundsborttagning, uppskalning, ansiktsförbättring, OCR):

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

Kontrollera CUDA-detektering i loggarna:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Hårdvarukrav {#hardware-requirements}

De här siffrorna kommer från benchmarks över ett spektrum av system, från en modern amd64-arbetsstation med en NVIDIA RTX 4070 ner till en Raspberry Pi, som kört hela verktygskatalogen på var och en och svept Docker-resursgränser för att hitta det verkliga golvet.

### Snabbreferens {#quick-reference}

| Nivå | Användningsfall | CPU | RAM | GPU | Lagring |
|------|----------|-----|-----|-----|---------|
| Minimum | Bild-, fil- och lätta PDF-verktyg; en användare; små batchar | 2 kärnor | 2 GB | Ingen | ~7 GB |
| Rekommenderad | Alla fem modaliteter inkl. video, PDF och AI på CPU; batchar; några användare | 4 kärnor | 4 GB | Ingen | ~25 GB |
| Full | Allt med hög hastighet inkl. GPU-AI; stora batchar; många användare | 6-8 kärnor | 8 GB | NVIDIA 8 GB+ VRAM (12 GB bekvämt) | ~35 GB |

**Arkitektur: endast 64-bitars** (`linux/amd64` eller `linux/arm64`). SnapOtter körs nativt på Intel/AMD-servrar, Apple Silicon-datorer och 64-bitars ARM-kort inklusive **Raspberry Pi 4 och 5** (4-8 GB). Det körs **inte** på 32-bitars ARM (`armv7`/`armhf`), ingen avbildning byggs för det, och inte heller på kort i 512 MB-klassen såsom Pi Zero, som ligger under minnesgolvet (se nedan).

### Minimum (bild-, fil- och lätta PDF-verktyg; ingen AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Resurs | Krav |
|---|---|
| CPU | 2 kärnor |
| RAM | 2 GB |
| Disk | ~5,5 GB (avbildning) + datavolym |
| GPU | Krävs inte |

Alla 222 icke-AI-katalogverktyg - bild (storleksändring, beskärning, konvertering, komprimering, justering, vattenstämpel), video (trimning, tystning, remux), ljud (konvertering, normalisering, trimning), PDF (sammanslagning, delning, komprimering, rotering, skydd), filkonverteringar och dedikerade konverteringsförinställningar - körs på blygsam hårdvara. De flesta operationer avslutas på klart under en sekund även på en stor fil: en 2,7 MB-bild storleksändras på ~0,05 s och omkodas till WebP på ~2 s.

Minnesgolvet är verkligt, från en svepning av Docker-resursgränser: **512 MB kan inte starta stacken** (även en enda bildstorleksändring dödas), **1 GB** hanterar enfilsoperationer men en flerfilsbatch får slut på minne, och **2 GB / 2 kärnor** är den minsta konfigurationen som hanterar batchar bekvämt.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Det enda CPU-tunga undantaget är videoomkodning.** Stream-copy-operationer (trimning, tystning, container-remux) är omedelbara, men transkodning till en annan codec är CPU-bunden. Ett 1080p / 45-sekunders klipp omkodat till VP9 (WebM) tar ungefär **~40 s** på en snabb modern CPU, ~45 s på Apple Silicon, ~80 s på en äldre mobil 4-kärnig och **~130 s** på en äldre 4-kärnig server. Om din arbetsbelastning är videotung, prioritera CPU-kärnor och klockfrekvens, eller höj containerns `cpus:`-gräns - den levererade compose-filen begränsar appen till 4 kärnor som standard (8 på GPU-compose).

### Rekommenderad (AI-verktyg på CPU) {#recommended-ai-tools-on-cpu}

| Resurs | Krav |
|---|---|
| CPU | 4 kärnor |
| RAM | 4 GB |
| Disk | 3 GB (avbildning) + 24 GB (AI-modeller) + arbetsyta |
| GPU | Krävs inte (CPU-reserv) |

**Att installera AI-buntarna är vad som driver upp RAM till 4 GB.** Utan någon AI installerad ligger appen på tomgång kring 360 MB; med alla sju buntar installerade håller den ~2,6 GB residentt, eftersom Python-AI-sidovagnen förladdar sina modeller (bakgrundsborttagning, uppskalning, OCR, transkribering, ansiktsdetektering, restaurering) vid uppstart. Icke-AI-installationer förblir lätta; AI-installationer behöver ≥4 GB.

De flesta AI-verktyg är fullt användbara på CPU; ett par vill verkligen ha en GPU. Uppmätt på en modern 4-kärnig CPU:

| AI-verktyg | CPU-tid | Användbart på CPU? |
|---|---|---|
| Ansiktsdetektering (blur-faces, smart-crop, red-eye), noise-removal | under 1 s | Ja |
| OCR, transkribering, undertexter | 1-3 s | Ja |
| Colorize, ansiktsförbättring | ~10 s | Ja |
| Bakgrundsborttagning / ersättning / oskärpa | ~29 s | Ja (du får vänta) |
| AI-uppskalning (RealESRGAN) | ~33 s små; minuter på stora bilder | Marginellt - GPU rekommenderas starkt |
| Fotorestaurering (fullständig pipeline) | flera minuter | Nej - behöver en GPU eller en snabb flerkärnig CPU |

Nedladdningsstorlekar för AI-modeller:

| Bunt | Diskstorlek |
|---|---|
| Bakgrundsborttagning | 4-5 GB |
| Uppskalning + Ansiktsförbättring + Brusborttagning | 5-6 GB |
| Ansiktsdetektering | 200-300 MB |
| Objektradering + Colorize | 1-2 GB |
| OCR | 5-6 GB |
| Fotorestaurering | 4-5 GB |
| **Alla buntar** | **~24 GB** |

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Full (AI-verktyg på NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| Resurs | Krav |
|---|---|
| CPU | 6-8 kärnor (videoförberedelse + samtidighet körs på CPU även med GPU-AI) |
| RAM | 8 GB |
| GPU | NVIDIA med 8+ GB VRAM (12 GB rekommenderas) |
| Disk | ~35 GB totalt |

En NVIDIA-GPU (CUDA) snabbar dramatiskt upp de tunga AI-modellerna. Uppmätt på en RTX 4070 mot en modern CPU:

| AI-verktyg | Snabbning med GPU | Anmärkningar |
|---|---|---|
| AI-uppskalning (RealESRGAN 2×) | **~47×** | Den största vinsten - under en sekund mot ~33 s (minuter på stora bilder) |
| Ansiktsförbättring (CodeFormer) | **~12×** | ~0,9 s mot ~11 s |
| Transkribering (Whisper) | ~4,5× | |
| Bakgrundsborttagning / ersättning / oskärpa | ~4× | ~7 s på GPU mot ~29 s på CPU |
| Colorize | ~1,8× | |
| OCR, ansiktsdetektering, red-eye, noise-removal | ~1× | Redan snabbt på CPU - en GPU hjälper inte |
| Fotorestaurering | ingen | CPU-bunden även på en GPU (0% GPU-utnyttjande); en snabb CPU spelar större roll än en GPU här |

De verktyg som är värda en GPU är **uppskalning, ansiktsförbättring, transkribering och bakgrundsborttagning**. Ansiktsdetektering, OCR och red-eye är CPU-bundna och redan snabba, så en GPU tillför ingenting.

Max VRAM-användning når 7,5 GB under uppskalning med ansiktsförbättring. En 6 GB NVIDIA-GPU fungerar för de flesta AI-verktyg individuellt men kommer att misslyckas med uppskalning. 8-12 GB VRAM hanterar allt.

Intel/AMD iGPU-acceleration via VA-API, Quick Sync eller OpenCL stöds inte för AI-inferens i dagsläget. Att mappa `/dev/dri` in i containern aktiverar inte AI-GPU-acceleration; SnapOtter kör AI-verktyg på CPU om inte NVIDIA CUDA är tillgängligt.

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

### Samtidiga användare {#concurrent-users}

Parallella bildstorleksändringsförfrågningar mot den standardmässiga 4-kärnbegränsade appcontainern:

| Samtidiga förfrågningar | Genomsnittlig svarstid | Fel |
|---|---|---|
| 1 | 0,4 s | 0 |
| 5 | 1,2 s | 0 |
| 10 | 2,1 s | 0 |

Svarstiden försämras sublinjärt utan fel när arbetarpoolen mättas. Att höja appcontainerns `cpus:`-gräns (eller använda en värd med fler kärnor) lyfter taket. Notera att tunga jobb (videotranskodning, CPU-AI) håller en arbetare under hela sin varaktighet, så dimensionera CPU efter ditt förväntade antal samtidiga tunga jobb, inte bara antalet förfrågningar.

### Bildformat som stöds {#supported-image-formats}

SnapOtter stöder **55+ indataformat** och **14 utdataformat**, inklusive RAW-filer från 20+ kameramärken, professionella format (PSD, EPS, OpenEXR, HDR), moderna codecs (JPEG XL, AVIF, HEIC, QOI) och vetenskapliga/spelformat (FITS, DDS).

Se den [fullständiga formatlistan](/sv/guide/supported-formats) för detaljer om varje format som stöds, använd avkodare och tillgängliga kvalitetskontroller.

### Kända begränsningar {#known-limitations}

- **Innehållsmedveten storleksändring** kraschar på stora bilder (>5 MP) på grund av en begränsning i caire-binären. Fungerar bra med mindre bilder.
- **HEIF-avkodning** tar 13-23 sekunder. HEIC (Apples variant) är mycket snabbare på 0,3-0,9 sekunder.
- **OCR japanska** misslyckas på CPU på grund av en PaddlePaddle MKLDNN-bugg. Fungerar på GPU.
- **Uppskalning** når tidsgränsen på CPU för allt utöver små bilder. GPU krävs för praktisk användning.
- **CodeFormer**-ansiktsförbättring är betydligt långsammare än GFPGAN (53 s mot 2 s på GPU). GFPGAN rekommenderas för de flesta användningsfall.

## Volymer {#volumes}

| Montering / Volym | Syfte | Krävs? |
|---|---|---|
| `/data` (app) | AI-modeller, Python-venv, användarfiler | **Ja** - filförlust utan den |
| `/tmp/workspace` (app) | Temporära bearbetningsfiler (rensas automatiskt) | Rekommenderas |
| `SnapOtter-pgdata` (postgres) | PostgreSQL-datakatalog (användare, inställningar, pipelines, jobb) | **Ja** - dataförlust utan den |
| `SnapOtter-redisdata` (redis) | Redis append-only-fil för hållbara jobbköer | Rekommenderas |

### Bindmonteringar kontra namngivna volymer {#bind-mounts-vs-named-volumes}

**Namngivna volymer** (rekommenderas) - Docker hanterar behörigheter automatiskt:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bindmonteringar** - Du hanterar behörigheter. Ställ in `PUID`/`PGID` för att matcha din värdanvändare:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Lagringsbehörigheter {#storage-permissions}

SnapOtter skriver till två platser vid körning: `/data` (användarfiler, loggar, AI-modeller och Python-venv) och `/tmp/workspace` (temporär bearbetningsscratch). Båda måste vara skrivbara av användaren som containern körs som. Om någon av dem inte är det **misslyckas containern snabbt vid uppstart** med ett meddelande som namnger katalogen, den körande UID/GID:n och hur du fixar det - istället för att starta "healthy" och sedan misslyckas vid den första uppladdningen med ett kryptiskt fel.

Hur behörigheter hanteras beror på hur containern startas:

**Standard (startar som root, sänker till `snapotter`)** - entrypoint startar som root, fixar ägarskapet för de monterade volymerna och sänker sedan till den oprivilegierade `snapotter`-användaren via `gosu`. Namngivna volymer fungerar utan någon konfiguration. För bindmonteringar, ställ in `PUID`/`PGID` till din värdanvändare (ovan) så att filerna den skriver ägs av dig.

**Kubernetes / OpenShift (icke-root via `runAsUser`)** - startad direkt som en icke-root-användare kan containern inte chown:a volymerna själv, så orkestreraren måste göra dem skrivbara. Ställ in `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Avbildningens skrivbara kataloger är gruppägda av GID 0 och gruppskrivbara, så en pod som körs med ett **godtyckligt UID** plus root-tilläggsgruppen (OpenShift-standarden) kan skriva utan någon `chown`.

**TrueNAS Scale (och andra "främmande UID"-uppsättningar)** - TrueNAS kör appar som en icke-root-användare (ofta `568:568`) och monterar värddataset som ägs av en annan användare, så varken entrypoint eller `fsGroup` gör dem skrivbara på egen hand. Välj en:

- **Kör appen som root** (rekommenderas) - lämna appens användare oställd eller ställ in den till `0`, och låt standard-entrypoint fixa behörigheter och sänka till `snapotter`.
- **Kör som UID `999`** - ställ in appens användare/grupp till `999:999` (SnapOtters inbyggda `snapotter`-användare) så att den matchar avbildningens ägarskap.
- **`chown` värddatasetet** till UID:n som containern körs som, från TrueNAS-skalet:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Uppstartsfelet namnger exakt vilket UID som ska användas, så den snabbaste vägen är att starta appen en gång, läsa meddelandet, sedan `chown` (eller justera användaren) därefter.

## Miljövariabler {#environment-variables}

| Variabel | Standard | Beskrivning |
|---|---|---|
| `AUTH_ENABLED` | `true` | Aktivera/inaktivera inloggningskrav |
| `DEFAULT_USERNAME` | `admin` | Inledande administratörsanvändarnamn |
| `DEFAULT_PASSWORD` | `admin` | Inledande administratörslösenord (framtvingat byte vid första inloggning) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Uppladdningsgräns per fil |
| `MAX_BATCH_SIZE` | `100` | Max antal filer per batchförfrågan |
| `RATE_LIMIT_PER_MIN` | `1000` | API-förfrågningar per minut per IP (ställ in 0 för att inaktivera) |
| `MAX_USERS` | `0` (obegränsat) | Maximalt antal användarkonton |
| `TRUST_PROXY` | `true` | Lita på X-Forwarded-For-headers från omvänd proxy |
| `PUID` | `999` | Kör som detta UID (för bindmonteringsbehörigheter) |
| `PGID` | `999` | Kör som detta GID (för bindmonteringsbehörigheter) |
| `LOG_LEVEL` | `info` | Loggutförlighet: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Max antal parallella AI-bearbetningsjobb |
| `SESSION_DURATION_HOURS` | `168` | Livslängd för inloggningssession (7 dagar) |
| `CORS_ORIGIN` | (tom) | Kommaseparerade tillåtna ursprung, eller tom för samma ursprung |

## Hälsokontroll {#health-check}

Containern inkluderar en inbyggd hälsokontroll:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Omvänd proxy {#reverse-proxy}

SnapOtter ställer in `TRUST_PROXY=true` som standard så att hastighetsbegränsning och loggning använder den verkliga klient-IP:n från `X-Forwarded-For`-headers.

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

1. Lägg till en ny Proxy Host
2. Ställ in Domain Name till din domän
3. Ställ in Scheme till `http`, Forward Hostname till `SnapOtter` (eller din container-IP), Forward Port till `1349`
4. Aktivera WebSocket-stöd
5. Under Advanced, lägg till: `client_max_body_size 500M;` och `proxy_buffering off;`

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

`flush_interval -1` inaktiverar svarsbuffring, vilket krävs för SSE-framstegshändelser (batchbearbetning, AI-verktyg, funktionsinstallationer). De utökade tidsgränserna gör att stora filuppladdningar kan slutföras utan att Caddy stänger anslutningen för tidigt.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

OBS: Cloudflare har en uppladdningsgräns på 100 MB på gratisplaner. Ställ in `MAX_UPLOAD_SIZE_MB=100` för att matcha.

## CI/CD {#ci-cd}

GitHub-repot har tre arbetsflöden:

- **ci.yml** - Körs automatiskt vid varje push och PR. Lintar, typkontrollerar, testar, bygger och validerar Docker-avbildningen (utan att pusha).
- **release.yml** - Utlöses manuellt via `workflow_dispatch`. Kör semantic-release för att skapa en versionstagg och GitHub-release, bygger sedan en multiarkitektur-Docker-avbildning (amd64 + arm64) och pushar till Docker Hub (`snapotter/snapotter`) och GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Bygger den här dokumentationssidan och distribuerar den till Cloudflare Pages vid push till `main`.

För att skapa en release, gå till **Actions > Release > Run workflow** i GitHub-användargränssnittet, eller kör:

```bash
gh workflow run release.yml
```

Semantic-release avgör versionen från commit-historiken. Docker-taggen `latest` pekar alltid på den senaste releasen.

## Analys {#analytics}

SnapOtter inkluderar anonym produktanalys (mönster i verktygsanvändning, felrapporter) för att hjälpa till att fånga buggar och förbättra funktioner. Den är på som standard. Dina filer, filnamn och personuppgifter ingår aldrig i detta. SnapOtter fungerar normalt med analys inaktiverad.

### Inaktivera analys {#disabling-analytics}

Den körtidsmässiga avanmälningen är en administratörsväxel med ett klick. Öppna Settings > System > Privacy och stäng av Anonymous Product Analytics. Den stoppar omedelbart för hela instansen, ingen ombyggnad krävs.

För en avbildning som aldrig kan sända ut analys, ställ in det byggtidsmässiga hård-av genom att klona repot och bygga om:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Eller lägg till byggargumentet i din befintliga `docker-compose.yml`:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
