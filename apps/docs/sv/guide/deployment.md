---
description: "Distribuera SnapOtter till produktion med Docker. Hårdvarukrav, GPU-konfiguration och konfigurationer för omvänd proxy för Nginx, Traefik och Cloudflare."
i18n_source_hash: 6b6957060fa6
i18n_provenance: machine
i18n_output_hash: d357c2cff629
---

# Distribution {#deployment}

SnapOtter distribueras som en Docker Compose-stack med 3 containrar: SnapOtter-appavbildningen, PostgreSQL 17 och Redis 8. Appavbildningen stöder **linux/amd64** (med NVIDIA CUDA för AI-acceleration) och **linux/arm64** (CPU), så den körs nativt på Intel/AMD-servrar, Mac-datorer med Apple Silicon och ARM-enheter som Raspberry Pi 4/5. Intel/AMD iGPU-acceleration via VA-API, Quick Sync eller OpenCL stöds inte för AI-inferens i dagsläget.

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

Appen är sedan tillgänglig på `http://localhost:1349`.

> **Begränsningar för Docker Hub-hastighet?** Ersätt `snapotter/snapotter:latest` med `ghcr.io/snapotter-hq/snapotter:latest` för att hämta från GitHub Container Registry i stället. Båda registren får samma avbildning vid varje utgåva.

## Snabbstart (NVIDIA CUDA) {#quick-start-nvidia-cuda}

För NVIDIA CUDA-acceleration på AI-verktyg (bakgrundsborttagning, uppskalning, ansiktsförbättring, OCR):

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

Kontrollera CUDA-identifiering i loggarna:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Hårdvarukrav {#hardware-requirements}

Dessa siffror kommer från benchmarktester över en rad system, från en modern amd64-arbetsstation med en NVIDIA RTX 4070 ner till en Raspberry Pi, där hela verktygskatalogen kördes på var och en och Docker-resursgränserna svepte över värdena för att hitta det verkliga golvet.

### Snabbreferens {#quick-reference}

| Nivå | Användningsfall | CPU | RAM | GPU | Lagring |
|------|----------|-----|-----|-----|---------|
| Minimum | Bild-, fil- och lätta PDF-verktyg; en enda användare; små batchar | 2 kärnor | 2 GB | Ingen | ~7 GB |
| Rekommenderad | Alla fem modaliteter inkl. video, PDF och AI på CPU; batchar; ett fåtal användare | 4 kärnor | 4 GB | Ingen | ~25 GB |
| Full | Allt med hög hastighet inkl. GPU-AI; stora batchar; många användare | 6-8 kärnor | 8 GB | NVIDIA 8 GB+ VRAM (12 GB bekvämt) | ~35 GB |

**Arkitektur: endast 64-bitars** (`linux/amd64` eller `linux/arm64`). SnapOtter körs nativt på Intel/AMD-servrar, Mac-datorer med Apple Silicon och 64-bitars ARM-kort inklusive **Raspberry Pi 4 och 5** (4-8 GB). Den körs **inte** på 32-bitars ARM (`armv7`/`armhf`) — ingen avbildning byggs för den — och inte heller på kort i 512 MB-klassen som Pi Zero, vilka ligger under minnesgolvet (se nedan).

### Minimum (bild-, fil- och lätta PDF-verktyg; ingen AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Resurs | Krav |
|---|---|
| CPU | 2 kärnor |
| RAM | 2 GB |
| Disk | ~5,5 GB (avbildning) + datavolym |
| GPU | Krävs inte |

Alla 222 icke-AI-katalogverktyg - bild (ändra storlek, beskär, konvertera, komprimera, justera, vattenmärke), video (klipp, tysta, remuxa), ljud (konvertera, normalisera, klipp), PDF (slå samman, dela, komprimera, rotera, skydda), filkonverteringar och dedikerade konverteringsförinställningar - körs på blygsam hårdvara. De flesta operationer slutförs på långt under en sekund även på en stor fil: en bild på 2,7 MB ändrar storlek på ~0,05 s och kodas om till WebP på ~2 s.

Minnesgolvet är verkligt, enligt en svepning av Docker-resursgränser: **512 MB kan inte starta stacken** (till och med en enda bildstorleksändring dödas), **1 GB** klarar operationer på enstaka filer men en batch med flera filer får slut på minne, och **2 GB / 2 kärnor** är den minsta konfiguration som klarar batchar bekvämt.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Det enda CPU-tunga undantaget är omkodning av video.** Stream-copy-operationer (klipp, tysta, containerremux) är omedelbara, men transkodning till en annan codec är CPU-bunden. Ett klipp på 1080p / 45 sekunder som kodas om till VP9 (WebM) tar ungefär **~40 s** på en snabb modern CPU, ~45 s på Apple Silicon, ~80 s på en äldre mobil 4-kärna och **~130 s** på en äldre 4-kärnig server. Om din arbetsbelastning är videotung, prioritera CPU-kärnor och klockfrekvens, eller höj containerns `cpus:`-gräns — den levererade compose-filen begränsar appen till 4 kärnor som standard (8 på GPU-compose).

### Rekommenderad (AI-verktyg på CPU) {#recommended-ai-tools-on-cpu}

| Resurs | Krav |
|---|---|
| CPU | 4 kärnor |
| RAM | 4 GB |
| Disk | 3 GB (avbildning) + 24 GB (AI-modeller) + arbetsyta |
| GPU | Krävs inte (CPU-reserv) |

**Att installera AI-buntarna är det som driver upp RAM till 4 GB.** Utan installerad AI ligger appen på tomgång runt 360 MB; med alla sju buntar installerade håller den ~2,6 GB residerande, eftersom Python-AI-sidovagnen förladdar sina modeller (bakgrundsborttagning, uppskalning, OCR, transkribering, ansiktsigenkänning, restaurering) vid start. Icke-AI-installationer förblir lätta; AI-installationer behöver ≥4 GB.

De flesta AI-verktyg är fullt användbara på CPU; ett par vill verkligen ha en GPU. Uppmätt på en modern 4-kärnig CPU:

| AI-verktyg | CPU-tid | Användbart på CPU? |
|---|---|---|
| Ansiktsigenkänning (blur-faces, smart-crop, red-eye), brusborttagning | under 1 s | Ja |
| OCR, transkribering, undertexter | 1-3 s | Ja |
| Färgläggning, ansiktsförbättring | ~10 s | Ja |
| Bakgrundsborttagning / -ersättning / -oskärpa | ~29 s | Ja (du får vänta) |
| AI-uppskalning (RealESRGAN) | ~33 s liten; minuter på stora bilder | Marginellt — GPU rekommenderas starkt |
| Fotorestaurering (fullständig pipeline) | flera minuter | Nej — behöver en GPU eller en snabb CPU med många kärnor |

SnapOtter bakar avsiktligt inte in dessa modellnedladdningar i Docker-avbildningen. AI-buntar hämtas endast när en administratör aktiverar det relaterade verktyget, lagras i den beständiga `/data/ai`-volymen och delas av varje verktyg som är beroende av samma modellstack. Detta håller den slutliga containeravbildningen liten samtidigt som en fullständig AI-installation kan nå de större lagringstalen nedan.

Vissa verktyg är beroende av mer än en delad bunt. Passfoto behöver till exempel både `background-removal` och `face-detection`; om `background-removal` redan är installerad laddar aktiveringen av Passfoto bara ner den saknade `face-detection`-bunten. Samma återanvändning gäller för alla AI-verktyg.

Storlekar för AI-modellnedladdning:

| Bunt | Diskstorlek |
|---|---|
| Bakgrundsborttagning | 4-5 GB |
| Uppskalning + ansiktsförbättring + brusborttagning | 5-6 GB |
| Ansiktsigenkänning | 200-300 MB |
| Objektradering + färgläggning | 1-2 GB |
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

| AI-verktyg | Hastighetsökning med GPU | Anteckningar |
|---|---|---|
| AI-uppskalning (RealESRGAN 2×) | **~47×** | Den största vinsten — under en sekund mot ~33 s (minuter på stora bilder) |
| Ansiktsförbättring (CodeFormer) | **~12×** | ~0,9 s mot ~11 s |
| Transkribering (Whisper) | ~4,5× | |
| Bakgrundsborttagning / -ersättning / -oskärpa | ~4× | ~7 s på GPU mot ~29 s på CPU |
| Färgläggning | ~1,8× | |
| OCR, ansiktsigenkänning, red-eye, brusborttagning | ~1× | Redan snabbt på CPU — en GPU hjälper inte |
| Fotorestaurering | ingen | CPU-bunden även på en GPU (0 % GPU-utnyttjande); en snabb CPU spelar större roll än en GPU här |

De verktyg som är värda en GPU är **uppskalning, ansiktsförbättring, transkribering och bakgrundsborttagning**. Ansiktsigenkänning, OCR och red-eye är CPU-bundna och redan snabba, så en GPU tillför ingenting.

Högsta VRAM-användning når 7,5 GB under uppskalning med ansiktsförbättring. En NVIDIA-GPU med 6 GB fungerar för de flesta AI-verktyg var för sig men misslyckas med uppskalning. 8-12 GB VRAM klarar allt.

Intel/AMD iGPU-acceleration via VA-API, Quick Sync eller OpenCL stöds inte för AI-inferens i dagsläget. Att mappa `/dev/dri` in i containern aktiverar inte GPU-acceleration för AI; SnapOtter kör AI-verktyg på CPU om inte NVIDIA CUDA är tillgängligt.

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

Parallella bildstorleksändringsförfrågningar mot den standardmässiga appcontainern begränsad till 4 kärnor:

| Samtidiga förfrågningar | Genomsnittlig svarstid | Fel |
|---|---|---|
| 1 | 0,4 s | 0 |
| 5 | 1,2 s | 0 |
| 10 | 2,1 s | 0 |

Svarstiden försämras underlinjärt utan fel när arbetarpoolen mättas. Att höja appcontainerns `cpus:`-gräns (eller använda en värd med fler kärnor) höjer taket. Observera att tunga jobb (videotranskodning, CPU-AI) håller en arbetare under hela sin varaktighet, så dimensionera CPU:n efter ditt förväntade antal samtidiga tunga jobb, inte bara antalet förfrågningar.

### Bildformat som stöds {#supported-image-formats}

SnapOtter stöder **55+ indataformat** och **14 utdataformat**, inklusive RAW-filer från 20+ kameramärken, professionella format (PSD, EPS, OpenEXR, HDR), moderna codec-format (JPEG XL, AVIF, HEIC, QOI) och vetenskapliga/spelformat (FITS, DDS).

Se den [fullständiga formatlistan](/sv/guide/supported-formats) för detaljer om varje format som stöds, dekoder som används och tillgängliga kvalitetskontroller.

### Kända begränsningar {#known-limitations}

- **Innehållsmedveten storleksändring** kraschar på stora bilder (>5 MP) på grund av en begränsning i caire-binären. Fungerar utmärkt med mindre bilder.
- **HEIF-avkodning** tar 13-23 sekunder. HEIC (Apples variant) är mycket snabbare på 0,3-0,9 sekunder.
- **OCR japanska** misslyckas på CPU på grund av en PaddlePaddle MKLDNN-bugg. Fungerar på GPU.
- **Uppskalning** får timeout på CPU för allt utöver små bilder. GPU krävs för praktisk användning.
- **CodeFormer**-ansiktsförbättring är betydligt långsammare än GFPGAN (53 s mot 2 s på GPU). GFPGAN rekommenderas för de flesta användningsfall.

## Volymer {#volumes}

| Montering / volym | Syfte | Krävs? |
|---|---|---|
| `/data` (app) | AI-modeller, Python-venv, användarfiler | **Ja** - filförlust utan den |
| `/tmp/workspace` (app) | Tillfälliga bearbetningsfiler (rensas automatiskt) | Rekommenderas |
| `SnapOtter-pgdata` (postgres) | PostgreSQL-datakatalog (användare, inställningar, pipelines, jobb) | **Ja** - dataförlust utan den |
| `SnapOtter-redisdata` (redis) | Redis append-only-fil för hållbara jobbköer | Rekommenderas |

### Bind-monteringar vs. namngivna volymer {#bind-mounts-vs-named-volumes}

**Namngivna volymer** (rekommenderas) — Docker hanterar behörigheter automatiskt:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind-monteringar** — Du hanterar behörigheter. Ange `PUID`/`PGID` så att de matchar din värdanvändare:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Lagringsbehörigheter {#storage-permissions}

SnapOtter skriver till två platser vid körning: `/data` (användarfiler, loggar, AI-modeller och Python-venv) och `/tmp/workspace` (tillfällig bearbetningsscratch). Båda måste vara skrivbara av den användare som containern körs som. Om någon av dem inte är det **misslyckas containern snabbt vid start** med ett meddelande som namnger katalogen, det körande UID/GID och hur du åtgärdar det — i stället för att starta "hälsosamt" och sedan misslyckas vid den första uppladdningen med ett kryptiskt fel.

Hur behörigheter hanteras beror på hur containern startas:

**Standard (startar som root, släpper till `snapotter`)** — startpunkten startar som root, korrigerar ägarskapet för de monterade volymerna och släpper sedan till den icke-privilegierade `snapotter`-användaren via `gosu`. Namngivna volymer fungerar utan konfiguration. För bind-monteringar, ange `PUID`/`PGID` till din värdanvändare (ovan) så att de filer den skriver ägs av dig.

**Kubernetes / OpenShift (icke-root via `runAsUser`)** — när containern startas direkt som en icke-root-användare kan den inte köra chown på volymerna själv, så orkestreraren måste göra dem skrivbara. Ange `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Avbildningens skrivbara kataloger är gruppägda av GID 0 och gruppskrivbara, så en pod som körs med ett **godtyckligt UID** plus root-tilläggsgruppen (OpenShift-standarden) kan skriva utan `chown`.

**TrueNAS Scale (och andra "främmande UID"-uppsättningar)** — TrueNAS kör appar som en icke-root-användare (ofta `568:568`) och monterar värddataset som ägs av en annan användare, så varken startpunkten eller `fsGroup` gör dem skrivbara på egen hand. Välj ett av följande:

- **Kör appen som root** (rekommenderas) — lämna appens användare oinställd eller ange den till `0`, och låt standardstartpunkten korrigera behörigheter och släppa till `snapotter`.
- **Kör som UID `999`** — ange appens användare/grupp till `999:999` (SnapOtters inbyggda `snapotter`-användare) så att den matchar avbildningens ägarskap.
- **`chown` värddatasetet** till det UID som containern körs som, från TrueNAS-skalet:

  ```bash
  # Använd UID:t från startfelet (eller kör `id` inuti containern)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Startfelet namnger det exakta UID:t som ska användas, så den snabbaste vägen är att starta appen en gång, läsa meddelandet och sedan köra `chown` (eller justera användaren) i enlighet med det.

## Miljövariabler {#environment-variables}

| Variabel | Standard | Beskrivning |
|---|---|---|
| `AUTH_ENABLED` | `true` | Aktivera/inaktivera inloggningskrav |
| `DEFAULT_USERNAME` | `admin` | Ursprungligt administratörsanvändarnamn |
| `DEFAULT_PASSWORD` | `admin` | Ursprungligt administratörslösenord (tvingad ändring vid första inloggningen) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Uppladdningsgräns per fil |
| `MAX_BATCH_SIZE` | `100` | Max antal filer per batchförfrågan |
| `RATE_LIMIT_PER_MIN` | `1000` | API-förfrågningar per minut per IP (ange 0 för att inaktivera) |
| `MAX_USERS` | `0` (obegränsat) | Maximalt antal användarkonton |
| `TRUST_PROXY` | `true` | Lita på X-Forwarded-For-huvuden från omvänd proxy |
| `PUID` | `999` | Kör som detta UID (för bind-monteringsbehörigheter) |
| `PGID` | `999` | Kör som detta GID (för bind-monteringsbehörigheter) |
| `LOG_LEVEL` | `info` | Loggutförlighet: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Max parallella AI-bearbetningsjobb |
| `SESSION_DURATION_HOURS` | `168` | Livslängd för inloggningssession (7 dagar) |
| `CORS_ORIGIN` | (tom) | Kommaseparerade tillåtna ursprung, eller tom för samma ursprung |

## Hälsokontroll {#health-check}

Containern innehåller en inbyggd hälsokontroll:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Omvänd proxy {#reverse-proxy}

SnapOtter anger `TRUST_PROXY=true` som standard så att hastighetsbegränsning och loggning använder den verkliga klient-IP:n från `X-Forwarded-For`-huvuden.

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
2. Ange Domain Name till din domän
3. Ange Scheme till `http`, Forward Hostname till `SnapOtter` (eller din container-IP), Forward Port till `1349`
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

`flush_interval -1` inaktiverar svarsbuffring, vilket krävs för SSE-förloppshändelser (batchbearbetning, AI-verktyg, funktionsinstallationer). De utökade timeouterna gör att stora filuppladdningar kan slutföras utan att Caddy stänger anslutningen för tidigt.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Obs: Cloudflare har en uppladdningsgräns på 100 MB på gratisplaner. Ange `MAX_UPLOAD_SIZE_MB=100` så att den matchar.

## CI/CD {#ci-cd}

GitHub-arkivet har tre arbetsflöden:

- **ci.yml** - Körs automatiskt vid varje push och PR. Kör lint, typkontroll, tester, bygge och validerar Docker-avbildningen (utan att pusha).
- **release.yml** - Utlöses manuellt via `workflow_dispatch`. Kör semantic-release för att skapa en versionstagg och GitHub-utgåva, bygger sedan en Docker-avbildning för flera arkitekturer (amd64 + arm64) och pushar till Docker Hub (`snapotter/snapotter`) och GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Bygger denna dokumentationssida och distribuerar den till Cloudflare Pages vid push till `main`.

För att skapa en utgåva, gå till **Actions > Release > Run workflow** i GitHub-gränssnittet, eller kör:

```bash
gh workflow run release.yml
```

Semantic-release avgör versionen utifrån commit-historiken. Docker-taggen `latest` pekar alltid på den senaste utgåvan.

## Analys {#analytics}

SnapOtter innehåller anonym produktanalys (mönster för verktygsanvändning, felrapporter) för att hjälpa till att fånga buggar och förbättra funktioner. Den är på som standard. Dina filer, filnamn och personuppgifter är aldrig en del av detta. SnapOtter fungerar normalt med analys inaktiverad.

### Inaktivera analys {#disabling-analytics}

Bortval vid körning är en administratörsväxel med ett klick. Öppna Settings > System > Privacy och stäng av Anonymous Product Analytics. Den stoppas omedelbart för hela instansen, ingen ombyggnad krävs.

För en avbildning som aldrig kan sända analys, ange den hårda avstängningen vid byggtid genom att klona arkivet och bygga om:

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
