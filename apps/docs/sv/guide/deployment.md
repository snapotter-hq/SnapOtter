---
description: "Driftsätt SnapOtter i produktion med Docker. Maskinvarukrav, GPU-konfiguration och reverse proxy-konfigurationer för Nginx, Traefik och Cloudflare."
i18n_source_hash: 3821f105f4ba
i18n_provenance: machine
i18n_output_hash: 5ebffa079af5
i18n_hash_version: 2
---

# Driftsättning {#deployment}

SnapOtter driftsätts som en Docker Compose-stack med tre containrar: SnapOtter-appavbilden, PostgreSQL 17 och Redis 8. Appavbilden stöder **linux/amd64** (med NVIDIA CUDA för AI-acceleration) och **linux/arm64** (CPU), så den körs nativt på Intel/AMD-servrar, Apple Silicon-Mac och ARM-enheter som Raspberry Pi 4/5. Intel/AMD iGPU-acceleration via VA-API, Quick Sync eller OpenCL stöds inte för AI-inferens i dag.

Se [Docker-avbild](./docker-tags) för GPU-konfiguration, Docker Compose-exempel och versionslåsning.

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
      # Requests are served by a role that can only read and write rows. The
      # owner connects only during boot, to migrate and to grant. Set
      # POSTGRES_APP_PASSWORD and POSTGRES_PASSWORD for any non-local deployment.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=loopback,linklocal,uniquelocal  # Which peers may set the client IP via X-Forwarded-For (default shown)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)

      # --- Engines (empty = the image's own binaries, see Configuration) ---
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
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
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
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

Stacken ovan ansluter som databasägare. Från och med SnapOtter 2.3.0 kan du hantera förfrågningar med en roll som bara läser och skriver rader, se [Roller med minsta möjliga behörighet](./database#least-privilege-roles).

> **Gränser hos Docker Hub?** Ersätt `snapotter/snapotter:latest` med `ghcr.io/snapotter-hq/snapotter:latest` för att hämta från GitHub Container Registry i stället. Båda registren får samma avbild vid varje utgåva.

## Snabbstart (NVIDIA CUDA) {#quick-start-nvidia-cuda}

För NVIDIA CUDA-acceleration av AI-verktyg som stöds (bakgrundsborttagning, uppskalning, ansiktsförbättring):

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
      # Runtime role (rows only) and the boot-only owner connection. See the CPU
      # example above.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Engines (empty = the image's own binaries, see Configuration)
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
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
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
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

### Verifiera GPU-acceleration {#verify-gpu-acceleration}

Kontrollera CUDA-identifieringen i loggarna:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

Om AI-verktyg körs på CPU trots att `--gpus all` och NVIDIA Container Toolkit är korrekt konfigurerade, installera om det berörda paketet (till exempel Background Removal) från **Settings → AI Features**. Installationsprogrammet återställer GPU-bygget av ONNX Runtime, som annars kan skuggas av ett CPU-bygge som ett annat paket (till exempel transkribering) har dragit in i den delade AI-miljön. Om en ominstallation från gränssnittet inte återställer GPU på en äldre avbild, se den manuella reparationen i [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490).

## Maskinvarukrav {#hardware-requirements}

Siffrorna kommer från prestandatester på en rad system, från en modern amd64-arbetsstation med NVIDIA RTX 4070 ned till en Raspberry Pi. Hela verktygskatalogen kördes på varje system och Docker-resursgränserna varierades för att hitta den verkliga miniminivån.

Kör du på den lägre änden av nivåerna (en Pi, en gammal bärbar dator, en VPS med 2 GB)? [Konfigurationer med låga resurser](/sv/guide/low-resource) omsätter siffrorna till en konkret genomgång med anpassade gränser.

### Snabböversikt {#quick-reference}

| Nivå | Användningsfall | CPU | RAM | GPU | Lagring |
|------|----------|-----|-----|-----|---------|
| Minimum | Verktyg utan AI (bild, filer, lätt PDF) plus inbyggd Fast OCR och ansiktsdetektering; en användare; små batchar | 2 kärnor | 2 GB | Ingen | ~7 GB |
| Rekommenderad | Alla fem modaliteter inklusive video, PDF och standardpaket för AI på CPU; batchar; några användare | 4 kärnor | 4 GB (8 GB för HQ-inpainting) | Ingen | ~25 GB |
| Full | Allt i full fart inklusive GPU-AI; stora batchar; många användare | 6-8 kärnor | 8 GB | NVIDIA 8 GB+ VRAM (12 GB bekvämt) | ~35 GB |

**Arkitektur: endast 64-bit** (`linux/amd64` eller `linux/arm64`). SnapOtter körs nativt på Intel/AMD-servrar, Apple Silicon-Mac och 64-bitars ARM-kort, inklusive **Raspberry Pi 4 och 5** (4-8 GB). Det körs **inte** på 32-bitars ARM (`armv7`/`armhf`), eftersom ingen avbild byggs för det, och inte heller på kort i 512 MB-klassen som Pi Zero, som ligger under minnesgränsen (se nedan).

### Minimum (bild-, fil- och lätta PDF-verktyg, ingen AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Resurs | Krav |
|---|---|
| CPU | 2 kärnor |
| RAM | 2 GB |
| Disk | ~5,5 GB (avbild) + datavolym |
| GPU | Krävs inte |

Alla 222 katalogverktyg utan AI, nämligen bild (ändra storlek, beskära, konvertera, komprimera, justera, vattenstämpel), video (klippa, ljud av, remux), ljud (konvertera, normalisera, klippa), PDF (slå ihop, dela, komprimera, rotera, skydda), filkonverteringar och särskilda konverteringsförinställningar, körs på blygsam maskinvara. De flesta operationer blir klara på långt under en sekund även för en stor fil: en bild på 2,7 MB ändrar storlek på ~0,05 s och kodas om till WebP på ~2 s.

Minnesgränsen är verklig, enligt ett svep över Docker-resursgränser: **512 MB kan inte starta stacken** (även en enda storleksändring av en bild avbryts), **1 GB** klarar åtgärder på enskilda filer men en batch med flera filer får slut på minne, och **2 GB / 2 kärnor** är den minsta konfiguration som hanterar batchar utan AI bekvämt. Inbyggd Fast OCR och paketet `face-detection` ryms också inom 2 GB, medan de större AI-paketen (Whisper, LaMa/DDColor, rembg, RealESRGAN, fotorestaurering och SD1.5 HQ-inpainting) behöver 4 till 8 GB RAM och avvisas direkt när det lediga minnet understiger paketets gräns.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Det enda CPU-tunga undantaget är omkodning av video.** Operationer med strömkopiering (klippa, ljud av, behållar-remux) är omedelbara, men omkodning till en annan kodek är CPU-bunden. Ett klipp på 1080p / 45 sekunder som kodas om till VP9 (WebM) tar ungefär **~40 s** på en snabb modern CPU, ~45 s på Apple Silicon, ~80 s på en äldre mobil 4-kärnig och **~130 s** på en äldre 4-kärnig server. Om din arbetsbelastning är videotung, prioritera CPU-kärnor och klockfrekvens, eller höj containerns gräns `cpus:`. Den medföljande compose-filen begränsar appen till 4 kärnor som standard (8 i GPU-compose-filen).

### Rekommenderad (AI-verktyg på CPU) {#recommended-ai-tools-on-cpu}

| Resurs | Krav |
|---|---|
| CPU | 4 kärnor |
| RAM | 4 GB |
| Disk | 3 GB (avbild) + cirka 20 GB (alla valfria AI-paket) + arbetsyta |
| GPU | Krävs inte (CPU-reserv) |

**Att installera och köra de större AI-paketen är det som driver rekommendationen till 4 GB RAM.** Utan några valfria paket installerade ligger appen på cirka 360 MB i viloläge. Äldre Python-verktyg delar en sidecar, medan exakt OCR använder en dedikerad långlivad dispatcher som är knuten till den aktiva oföränderliga generationen. Före aktivering kör installationsprogrammet ett rökprov på kandidaten. Därefter växlar det atomiskt till den nya dispatchern och tömmer den tidigare dispatchern före skräpinsamling. Varje officiellt artefakt för exakt OCR måste klara sin sämsta-fall-svit för utgåvan inom en cgroup på 4 GiB, medan värdrekommendationen på 4 GB lämnar utrymme för Node.js-applikationen, Postgres, Redis, köer och samtidigt arbete.

De flesta AI-verktyg är fullt användbara på CPU, men ett par behöver verkligen en GPU. Uppmätt på en modern 4-kärnig CPU:

| AI-verktyg | CPU-tid | Användbart på CPU? |
|---|---|---|
| Ansiktsdetektering (blur-faces, smart-crop, red-eye), noise-removal | under 1 s | Ja |
| OCR, transkribering, undertexter | 1-3 s | Ja |
| Colorize, ansiktsförbättring | ~10 s | Ja |
| Bakgrundsborttagning / ersättning / suddning | ~29 s | Ja (du får vänta) |
| AI-uppskalning (RealESRGAN) | ~33 s för små, minuter för stora bilder | Marginellt, GPU rekommenderas starkt |
| Fotorestaurering (hela pipelinen) | flera minuter | Nej, kräver en GPU eller en snabb CPU med många kärnor |

SnapOtter lägger medvetet inte in dessa modellnedladdningar i Docker-avbilden. AI-paket hämtas först när en administratör aktiverar det relaterade verktyget, lagras i den beständiga volymen `/data/ai` och delas av alla verktyg som beror på samma modellstack. Det håller den slutliga containeravbilden liten samtidigt som en fullständig AI-installation kan nå de större lagringstalen nedan.

Vissa verktyg beror på mer än ett delat paket. Till exempel behöver Passport Photo både `background-removal` och `face-detection`. Om `background-removal` redan är installerat hämtar aktiveringen av Passport Photo bara det saknade paketet `face-detection`. Samma återanvändning gäller för alla AI-verktyg.

Lagring för valfria AI-paket och minnesgränser för CPU (SnapOtter kontrollerar tillgängligt minne innan körning skickas till Python-sidecaren och avvisar direkt körningar under paketets gräns för ledigt minne):

| Paket | Diskstorlek | Minnesgräns för CPU |
|---|---|---|
| Ansiktsdetektering | 200-300 MB | 2 GB värd-RAM (~0,5 GB ledigt) |
| Transkribering | ~600 MB | 4 GB värd-RAM (~2 GB ledigt) |
| Object eraser + Colorize | 1-2 GB | 4 GB värd-RAM (~2 GB ledigt) |
| Exakt OCR (`balanced`/`best`) | ~208-234 MiB nedladdning / ~409-488 MiB installerat | 4 GiB konfigurerat effektivt minne (`fast` körs på 2 GB) |
| Bakgrundsborttagning | 4-5 GB | 4 GB värd-RAM (~2,5 GB ledigt) |
| Upscale + Face enhance + Noise removal | 5-6 GB | 4 GB värd-RAM (~2,5 GB ledigt) |
| Fotorestaurering | 4-5 GB | 4 GB värd-RAM (~3 GB ledigt) |
| Inpainting av hög kvalitet (`inpaint-hq`) | 5-7 GB | 8 GB värd-RAM (~6 GB ledigt) |
| **Alla paket** | **~25 GB installerat** | **4 GB (8 GB med `inpaint-hq`)** |

Fast OCR är inbyggt i avbilden via Tesseract, tar ungefär 25 MiB och kräver varken det valfria OCR-paketet eller dess minneskrav på 4 GiB. Fast stöder `auto`, `en`, `de`, `es`, `fr`, `zh` och `ja`, men inte koreanska (`ko`) eller arabiska (`ar`). Båda använder `balanced` eller `best` och kräver därför det exakta paketet. Det exakta paketet finns i de officiella Linux-containrarna för amd64 och arm64 och kör ONNX Runtime på CPU. NVIDIA-värdar använder samma CPU-runtime för OCR, så OCR beror inte på CUDA-versionen eller GPU-arkitekturen. Den exakta runtimen kräver minst 4 GiB effektivt minne: den konfigurerade cgroup-gränsen för containern, annars värdminnet. SnapOtter avvisar system under det signerade kompatibilitetsminimumet innan paketet laddas ned. Installation av det exakta paketet avvisas också på bare-metal-/förbyggda arkiv där libc och Python-ABI inte kan garanteras. På dessa värdar som inte stöds ger koreansk och arabisk OCR ett tydligt inkompatibilitetsfel och faller aldrig tyst tillbaka på Fast. En uttrycklig Fast-begäran för koreanska returnerar `FEATURE_INCOMPATIBLE` med orsaken `fast-korean-unsupported` innan jobbet köas.

Repliker som delar samma `DATA_DIR` måste ha samma CPU-arkitektur. Lås driftsättningar med flera repliker med nodaffinitet. Blandade amd64-/arm64-repliker behöver separata datavolymer och oberoende SnapOtter-driftsättningar.

Den exakta runtimen behåller en aktiv generation och rensar sin nedladdningscache efter aktivering. För den här utgåvan behöver en första installation tillfälligt ungefär 620-720 MiB för arkivet plus mellanlagring, och en uppgradering kan toppa nära 1,2 GiB medan den gamla generationen är aktiv. Installationsprogrammet beräknar det exakta kravet från det signerade indexet och de aktuella generationerna före nedladdning eller uppackning, och misslyckas tidigt om datavolymen är för liten.

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
| CPU | 6-8 kärnor (videoförberedelse och samtidighet körs på CPU även med GPU-AI) |
| RAM | 8 GB |
| GPU | NVIDIA med 8+ GB VRAM (12 GB rekommenderas) |
| Disk | ~35 GB totalt |

En NVIDIA GPU (CUDA) snabbar upp de tunga AI-modellerna dramatiskt. Uppmätt på en RTX 4070 jämfört med en modern CPU:

| AI-verktyg | Hastighetsökning med GPU | Anmärkningar |
|---|---|---|
| AI-uppskalning (RealESRGAN 2×) | **~47×** | Den största vinsten: under en sekund jämfört med ~33 s (minuter för stora bilder) |
| Ansiktsförbättring (CodeFormer) | **~12×** | ~0,9 s jämfört med ~11 s |
| Transkribering (Whisper) | ~4,5× | |
| Bakgrundsborttagning / ersättning / suddning | ~4× | ~7 s på GPU jämfört med ~29 s på CPU |
| Colorize | ~1,8× | |
| OCR, ansiktsdetektering, red-eye, noise-removal | ~1× | Redan snabbt på CPU, en GPU hjälper inte |
| Fotorestaurering | ingen | CPU-bunden även på en GPU (0 % GPU-utnyttjande), en snabb CPU spelar större roll än en GPU här |

De verktyg som är värda en GPU är **uppskalning, ansiktsförbättring, transkribering och bakgrundsborttagning**. Ansiktsdetektering, OCR och red-eye är CPU-bundna och redan snabba, så en GPU tillför ingenting.

Högsta VRAM-användning når 7,5 GB vid uppskalning med ansiktsförbättring. En NVIDIA GPU med 6 GB fungerar för de flesta AI-verktyg var för sig men misslyckas vid uppskalning. 8-12 GB VRAM klarar allt.

Intel/AMD iGPU-acceleration via VA-API, Quick Sync eller OpenCL stöds inte för AI-inferens i dag. Att mappa `/dev/dri` in i containern aktiverar inte AI-GPU-acceleration. SnapOtter kör AI-verktyg på CPU om inte NVIDIA CUDA är tillgängligt.

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

Parallella förfrågningar om storleksändring av bilder mot standardappcontainern begränsad till 4 kärnor:

| Samtidiga förfrågningar | Genomsnittlig svarstid | Fel |
|---|---|---|
| 1 | 0,4 s | 0 |
| 5 | 1,2 s | 0 |
| 10 | 2,1 s | 0 |

Svarstiden försämras sublinjärt utan fel när arbetarpoolen mättas. Att höja appcontainerns gräns `cpus:` (eller använda en värd med fler kärnor) lyfter taket. Observera att tunga jobb (videotranskodning, CPU-AI) håller en arbetare under hela sin körtid, så dimensionera CPU efter det förväntade antalet samtidiga tunga jobb, inte bara antalet förfrågningar.

### Bildformat som stöds {#supported-image-formats}

SnapOtter stöder **55+ indataformat** och **14 utdataformat**, inklusive RAW-filer från 20+ kameramärken, professionella format (PSD, EPS, OpenEXR, HDR), moderna kodekar (JPEG XL, AVIF, HEIC, QOI) samt vetenskapliga format och spelformat (FITS, DDS).

Se den [fullständiga formatlistan](/sv/guide/supported-formats) för detaljer om varje format som stöds, avkodaren som används och tillgängliga kvalitetsinställningar.

### Kända begränsningar {#known-limitations}

- **Innehållsmedveten storleksändring** kraschar på stora bilder (>5 MP) på grund av en begränsning i binären caire. Fungerar bra med mindre bilder.
- **HEIF-avkodning** tar 13-23 sekunder. HEIC (Apples variant) är mycket snabbare, 0,3-0,9 sekunder.
- **Uppskalning** får tidsgränsen överskriden på CPU för allt utöver små bilder. GPU krävs för praktisk användning.
- **CodeFormer** för ansiktsförbättring är betydligt långsammare än GFPGAN (53 s jämfört med 2 s på GPU). GFPGAN rekommenderas för de flesta användningsfall.

## Volymer {#volumes}

| Monteringspunkt / volym | Syfte | Krävs? |
|---|---|---|
| `/data` (app) | AI-modeller, Python-venv, användarfiler | **Ja** - filförlust utan den |
| `/tmp/workspace` (app) | Temporära bearbetningsfiler (rensas automatiskt) | Rekommenderas |
| `SnapOtter-pgdata` (postgres) | PostgreSQL-datakatalog (användare, inställningar, pipelines, jobb) | **Ja** - dataförlust utan den |
| `SnapOtter-redisdata` (redis) | Redis append-only-fil för beständiga jobbköer | Rekommenderas |

### Bind mounts jämfört med namngivna volymer {#bind-mounts-vs-named-volumes}

**Namngivna volymer** (rekommenderas) - Docker hanterar behörigheter automatiskt:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mounts** - Du hanterar behörigheterna. Ange `PUID`/`PGID` så att de motsvarar din värdanvändare:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Lagringsbehörigheter {#storage-permissions}

SnapOtter skriver till två platser under körning: `/data` (användarfiler, loggar, AI-modeller och Python-venv) och `/tmp/workspace` (temporärt arbetsutrymme för bearbetning). Båda måste vara skrivbara för den användare som containern körs som. Om någon av dem inte är det **misslyckas containern direkt vid start** med ett meddelande som anger katalogen, aktuellt UID/GID och hur det åtgärdas, i stället för att starta som "frisk" och sedan misslyckas vid den första uppladdningen med ett kryptiskt fel. Loggkatalogen (`LOG_DIR`, `/data/logs` i avbilden) kontrolleras på samma sätt i alla lagringslägen, eftersom loggar förblir lokala även när filer ligger i S3.

Hur behörigheter hanteras beror på hur containern startas:

**Standard (startar som root, byter till `snapotter`)** - startskriptet startar som root, rättar ägarskapet för de monterade volymerna och byter sedan till den obehöriga användaren `snapotter` via `gosu`. Namngivna volymer fungerar utan konfiguration. För bind mounts, ange `PUID`/`PGID` till din värdanvändare (ovan) så att filerna den skriver ägs av dig.

**Kubernetes / OpenShift (icke-root via `runAsUser`)** - när containern startas direkt som en användare utan root kan den inte själv köra chown på volymerna, så orkestreraren måste göra dem skrivbara. Ange `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Avbildens skrivbara kataloger ägs av gruppen GID 0 och är gruppskrivbara, så en pod som körs med ett **godtyckligt UID** plus root som tilläggsgrupp (OpenShift-standard) kan skriva utan `chown`.

**TrueNAS Scale (och andra konfigurationer med "främmande UID")** - TrueNAS kör appar som en användare utan root (ofta `568:568`) och monterar värddatamängder som ägs av en annan användare, så varken startskriptet eller `fsGroup` gör dem skrivbara på egen hand. Välj ett alternativ:

- **Kör appen som root** (rekommenderas) - lämna appens användare osatt eller sätt den till `0`, och låt standardstartskriptet rätta behörigheterna och byta till `snapotter`.
- **Kör som UID `999`** - ange appens användare/grupp till `999:999` (SnapOtters inbyggda användare `snapotter`) så att den motsvarar avbildens ägarskap.
- **`chown` värddatamängden** till det UID som containern körs som, från TrueNAS-skalet:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Startfelet anger exakt vilket UID som ska användas, så den snabbaste vägen är att starta appen en gång, läsa meddelandet och sedan `chown` (eller justera användaren) därefter.

## Miljövariabler {#environment-variables}

| Variabel | Standard | Beskrivning |
|---|---|---|
| `AUTH_ENABLED` | `true` | Aktivera/inaktivera inloggningskrav |
| `DEFAULT_USERNAME` | `admin` | Första administratörens användarnamn |
| `DEFAULT_PASSWORD` | `admin` | Första administratörens lösenord (byte krävs vid första inloggningen) |
| `MAX_UPLOAD_SIZE_MB` | `0` (obegränsat) | Uppladdningsgräns per fil i MB. Avbilden levereras med `0`, ett bygge från källkod börjar på 100 |
| `MAX_BATCH_SIZE` | `0` (obegränsat) | Max antal filer per batchbegäran. Avbilden levereras med `0`, ett bygge från källkod börjar på 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | API-förfrågningar per minut och IP (sätt 0 för att inaktivera) |
| `MAX_USERS` | `0` (obegränsat) | Maximalt antal användarkonton |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Vilka peers som får ange klientens IP via `X-Forwarded-For`. Som standard endast privata nätverk |
| `PUID` | `999` | Kör som detta UID (för behörigheter på bind mounts) |
| `PGID` | `999` | Kör som detta GID (för behörigheter på bind mounts) |
| `LOG_LEVEL` | `info` | Loggdetaljnivå: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Max antal parallella AI-bearbetningsjobb |
| `SESSION_DURATION_HOURS` | `168` | Inloggningssessionens livslängd (7 dagar) |
| `CORS_ORIGIN` | (tom) | Kommaseparerade tillåtna ursprung, eller tom för samma ursprung |

### Utgående proxy och privat CA {#outbound-proxy-and-private-ca}

Den officiella containern aktiverar Nodes stöd för proxy via miljövariabler. Om SnapOtter måste nå OCR-runtimens arkiv eller andra HTTPS-tjänster via en företagsproxy, ange `HTTPS_PROXY` (och `HTTP_PROXY` vid behov). Ange `NO_PROXY` till en kommaseparerad lista över värdar som måste nås direkt, till exempel Postgres, Redis och intern objektlagring.

Om proxyn eller en intern tjänst är signerad av en privat certifikatutfärdare, montera CA-certifikatet skrivskyddat och peka `NODE_EXTRA_CA_CERTS` på det. Filen måste finnas när Node-processen startar:

```yaml
services:
  app:
    environment:
      HTTPS_PROXY: http://proxy.example.internal:3128
      HTTP_PROXY: http://proxy.example.internal:3128
      NO_PROXY: postgres,redis,minio,localhost,127.0.0.1
      NODE_EXTRA_CA_CERTS: /etc/snapotter/custom-ca.pem
    volumes:
      - ./company-ca.pem:/etc/snapotter/custom-ca.pem:ro
```

Håll proxyns inloggningsuppgifter utanför Compose-filen (till exempel i en skyddad `.env`-fil eller en hemlighet). Inaktivera inte TLS-verifiering: det signerade OCR-indexet autentiserar utgåvans metadata, medan vanlig TLS-validering fortsatt skyddar transporten och alla andra utgående förfrågningar.

## Hälsokontroll {#health-check}

Containern innehåller en inbyggd hälsokontroll:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse proxy {#reverse-proxy}

`TRUST_PROXY` är som standard `loopback,linklocal,uniquelocal`, så SnapOtter litar på `X-Forwarded-For` endast från en peer i ett privat nätverk. En reverse proxy på samma värd, i ett Docker-nätverk eller i ditt LAN är betrodd direkt, vilket innebär att hastighetsbegränsning, inloggningsspärren mot brute force, granskningsloggen och IP-tillåtelselistan i enterprise-utgåvan alla ser den verkliga klient-IP:n utan konfiguration.

Ange `TRUST_PROXY=true` endast när proxyn framför når SnapOtter från en **publik** adress, till exempel en molnlastbalanserare i ett annat nätverk. På en direkt exponerad instans gör det värdet att `request.ip` kan styras av en angripare, eftersom en anropare som roterar headern får en ny hastighetsbegränsningsbucket för varje begäran.

Två saker att känna till innan du börjar mäta klient-IP:n. Docker Desktop på macOS och Windows betjänar en publicerad port via en användarlandsproxy som skriver om varje källadress till VM-gatewayen `192.168.65.1`, så inget värde på `TRUST_PROXY` återställer den verkliga klienten där. Distribuera på Linux för allt som är internetvänt. Och på alla plattformar ses en åtkomst till en publicerad port via `localhost` som bridge-gatewayen i stället för som din klient, så ett localhost-test säger ingenting om hur en verklig klient identifieras. Hela tabellen över värden för `TRUST_PROXY` och förbehållet om Docker Desktop finns i [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy).

Två saker gäller för varje proxy nedan: tillåt stora förfrågningskroppar (uppladdningar) och buffra inte svar. En proxy som buffrar svar bryter SSE-förlopp och gör, mer påtagligt, att en nedladdning av en stor fil "startar men aldrig blir klar", eftersom proxyn håller hela filen innan den skickas vidare. SnapOtter skickar `X-Accel-Buffering: no` vid nedladdningar så att nginx strömmar dem även om buffring är påslagen på annat håll, men andra proxyer än nginx behöver ha svarsbuffring uttryckligen avstängd (visas i varje konfiguration nedan). Om en nedladdning stannar halvvägs är en buffrande proxy framför det första att kontrollera.

En anmärkning om HSTS: API:t skickar `Strict-Transport-Security` på varje svar självt, så en proxy som för vidare svarsheaders (alla konfigurationer nedan gör det) behöver ingen egen HSTS-konfiguration. Först om din proxy är konfigurerad att ta bort eller åsidosätta svarsheaders från uppströms måste du bevara headern eller lägga till den igen vid kanten.

### Nginx {#nginx}

```nginx
server {
    # Plain HTTP shown for brevity. Terminate TLS in your own `listen 443 ssl`
    # server block; the Strict-Transport-Security header the API sends passes
    # through with every proxied response, so no add_header is needed there.
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

        # Stream responses instead of buffering: needed for SSE progress
        # (batch, AI, feature installs) and for large file downloads.
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Driftsättning under en undersökväg {#subpath}

För att servera `https://example.com/snapotter`, ange `BASE_PATH=/snapotter` i
SnapOtter-containerns miljö och starta om den. De officiella Compose-filerna för CPU och GPU
accepterar också `BASE_PATH` från ditt skal eller din Compose-fil `.env`. Samma
avbild fungerar på vilken sökväg som helst, ingen ombyggnad av frontend behövs.

`BASE_PATH` accepterar snedstrecksseparerade segment som innehåller bokstäver, siffror, `_` eller
`-`, inklusive kapslade sökvägar som `/apps/snapotter`. Ett avslutande snedstreck är
valfritt. Lämna det tomt (standard), eller ange `/`, för en driftsättning på roten.

Använd följande i ditt befintliga Nginx HTTPS-serverblock:

```nginx
location = /snapotter {
    return 308 /snapotter/$is_args$args;
}
location /snapotter/ {
    proxy_pass http://localhost:1349;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 500M;
    proxy_buffering off;
    proxy_read_timeout 300s;
}
```

Exemplet bevarar prefixet. Proxyer som tar bort `/snapotter` innan de
vidarebefordrar stöds också. Interna hälsokontroller kan fortsätta använda
`/api/v1/health`. För OIDC eller SAML, ange också
`EXTERNAL_URL=https://example.com/snapotter` och uppdatera identitetsleverantörens
callback-URL:er så att de innehåller `/snapotter/api/auth/oidc/callback` respektive
`/snapotter/api/auth/saml/callback`.

API-skript fortsätter fungera oförändrade: URL:er i API-svar, till exempel ett verktygs
`downloadUrl`, börjar med `/api/` oavsett vad `BASE_PATH` är. Lägg till dem efter
instansens bas-URL (`https://example.com/snapotter` + `/api/v1/download/...`)
i stället för att lösa dem mot domänroten.

Öppna gränssnittet via den prefixade URL:en (`https://example.com/snapotter`). En
webbläsare som kommer utan prefixet skickas dit automatiskt, endast API-förfrågningar
förväntas nå appen utan prefix. Om loggarna säger
`Requests arrive under /snapotter/ but BASE_PATH is empty` vidarebefordrar din proxy
ett prefix som `BASE_PATH` inte deklarerar: ange `BASE_PATH` till det,
eller ta bort prefixet i proxyn.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Lägg till en ny Proxy Host
2. Ange Domain Name till din domän
3. Ange Scheme till `http`, Forward Hostname till `SnapOtter` (eller din container-IP), Forward Port till `1349`
4. Aktivera WebSocket-stöd
5. Under Advanced, lägg till: `client_max_body_size 500M;` och `proxy_buffering off;`

API:ts header `Strict-Transport-Security` passerar NPM oförändrad. HSTS-reglaget på SSL-fliken är valfritt utöver den.

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

Traefik vidarebefordrar svarsheaders från uppströms oförändrade, så API:ts header `Strict-Transport-Security` når webbläsarna utan en `headers`-middleware. Om du redan kör en som skriver om svarsheaders, se till att den lämnar den headern intakt.

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

`flush_interval -1` stänger av svarsbuffring, vilket krävs för SSE-förloppshändelser (batchbearbetning, AI-verktyg, funktionsinstallationer) och för att stora filnedladdningar ska strömmas igenom i stället för att stanna. De förlängda tidsgränserna låter stora filuppladdningar slutföras utan att Caddy stänger anslutningen i förtid. Caddy för också API:ts header `Strict-Transport-Security` vidare orörd, så inget direktiv `header` behövs för HSTS.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Obs: Cloudflare har en uppladdningsgräns på 100 MB för gratisplaner. Ange `MAX_UPLOAD_SIZE_MB=100` så att den motsvarar detta.

Tunneln vidarebefordrar API:ts svarsheaders, `Strict-Transport-Security` inkluderad, så ingen HSTS-konfiguration i instrumentpanelen krävs (Cloudflares egen HSTS-inställning vid kanten är valfri utöver den).

## Felsökning {#troubleshooting}

### "Postgres not reachable: EAI_AGAIN" direkt efter en misslyckad första start {#eai-again-after-failed-first-start}

Om den allra första `docker compose up -d` misslyckas halvvägs (en port som redan används är den vanliga orsaken) kan ett enkelt nytt försök med `up -d` starta appcontainern utan att ansluta den till compose-nätverket. Appen kraschar då i en loop med:

```
Postgres not reachable: EAI_AGAIN
```

medan `docker ps` visar att postgres är frisk. Felet är verkligt men pekar på fel container: utan nätverket kan DNS för värdnamnet `postgres` inte alls lösas, och omstartspolicyn spelar upp samma fel om och om igen.

Åtgärda det som avbröt den första starten (oftast: frigör porten) och tvinga sedan fram en ny skapelse av appcontainern så att den återansluts till nätverket:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: nåbar från andra enheter, men inte från själva datorn {#windows-wsl2-loopback}

När Docker körs inuti WSL2 (den vanliga Windows-konfigurationen) kan stacken vara nåbar från alla andra maskiner i ditt nätverk medan `http://localhost:1349` får tidsgränsen överskriden på själva Windows-värden, även med WSL:s speglade nätverksläge aktiverat. Porten dyker aldrig upp i Windows `netstat`, och inget är fel med containrarna.

Öppna appen från en annan enhet, eller inifrån distributionen med dess egen adress (`hostname -I` i WSL-skalet). Om vidarebefordran av localhost råkar fungera i din WSL-version, se det som en bonus och inte något att förlita sig på.

## CI/CD {#ci-cd}

GitHub-förvaret har tre arbetsflöden:

- **ci.yml** - Körs automatiskt vid varje push och PR. Kör lint, typkontroll, tester, bygger och validerar Docker-avbilden (utan att pusha).
- **release.yml** - Startas manuellt via `workflow_dispatch`. Kör semantic-release för att skapa en versionstagg och en GitHub-utgåva, bygger sedan en Docker-avbild för flera arkitekturer (amd64 + arm64) och pushar till Docker Hub (`snapotter/snapotter`) och GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Bygger den här dokumentationssajten och driftsätter den på Cloudflare Pages vid push till `main`.

För att skapa en utgåva, gå till **Actions > Release > Run workflow** i GitHub-gränssnittet, eller kör:

```bash
gh workflow run release.yml
```

Semantic-release avgör versionen utifrån incheckningshistoriken. Docker-taggen `latest` pekar alltid på den senaste utgåvan.

## Analys {#analytics}

SnapOtter innehåller anonym produktanalys (användningsmönster för verktyg, felrapporter) som hjälper till att hitta buggar och förbättra funktioner. Den är påslagen som standard. Dina filer, filnamn och personuppgifter ingår aldrig. SnapOtter fungerar normalt med analysen avstängd.

### Inaktivera analys {#disabling-analytics}

Avanmälan vid körning är ett administratörsreglage med ett klick. Öppna Settings > System > Privacy och stäng av Anonymous Product Analytics. Det slutar gälla omedelbart för hela instansen, ingen ombyggnad behövs.

För en avbild som aldrig kan skicka analys, ange det hårda avstängningsläget vid bygget genom att klona förvaret och bygga om:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Eller lägg till build arg i din befintliga `docker-compose.yml`:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
