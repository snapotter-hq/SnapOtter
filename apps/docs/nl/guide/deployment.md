---
description: "Implementeer SnapOtter in productie met Docker. Hardwarevereisten, GPU-configuratie en reverse proxy-configuraties voor Nginx, Traefik en Cloudflare."
i18n_source_hash: b8c4ed2cc086
i18n_provenance: machine
i18n_output_hash: 7c17eac87ffb
i18n_hash_version: 2
---

# Implementatie {#deployment}

SnapOtter wordt geïmplementeerd als een Docker Compose-stack met 3 containers: de SnapOtter-app-image, PostgreSQL 17 en Redis 8. De app-image ondersteunt **linux/amd64** (met NVIDIA CUDA voor AI-versnelling) en **linux/arm64** (CPU), dus het draait native op Intel/AMD-servers, Apple Silicon-Macs en ARM-apparaten zoals de Raspberry Pi 4/5. Versnelling via een Intel/AMD-iGPU met VA-API, Quick Sync of OpenCL wordt momenteel niet ondersteund voor AI-inferentie.

Zie [Docker-image](./docker-tags) voor GPU-configuratie, Docker Compose-voorbeelden en het vastzetten van versies.

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

De app is daarna beschikbaar op `http://localhost:1349`.

De bovenstaande stack verbindt als eigenaar van de database. Vanaf SnapOtter 2.3.0 kunt u verzoeken afhandelen met een rol die alleen rijen leest en schrijft; zie [Rollen met minimale rechten](./database#least-privilege-roles).

> **Rate limits bij Docker Hub?** Vervang `snapotter/snapotter:latest` door `ghcr.io/snapotter-hq/snapotter:latest` om in plaats daarvan van de GitHub Container Registry te pullen. Beide registries ontvangen bij elke release dezelfde image.

## Snelstart (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Voor NVIDIA CUDA-versnelling van ondersteunde AI-tools (achtergrondverwijdering, opschaling, gezichtsverbetering):

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

### GPU-versnelling controleren {#verify-gpu-acceleration}

Controleer de CUDA-detectie in de logs:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

Als AI-tools op de CPU draaien terwijl `--gpus all` en de NVIDIA Container Toolkit correct zijn ingesteld, installeer dan de betreffende bundel (bijvoorbeeld Background Removal) opnieuw via **Settings → AI Features**. Het installatieprogramma herstelt de GPU-build van ONNX Runtime, die een CPU-only build die door een andere bundel (zoals transcriptie) is binnengehaald anders kan overschaduwen in de gedeelde AI-omgeving. Herstelt opnieuw installeren vanuit de interface de GPU niet op een oudere image, zie dan de handmatige reparatie in [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490).

## Hardwarevereisten {#hardware-requirements}

Deze getallen komen uit benchmarks op uiteenlopende systemen, van een moderne amd64-werkstation met een NVIDIA RTX 4070 tot een Raspberry Pi, waarbij op elk systeem de hele toolcatalogus is uitgevoerd en Docker-resourcelimieten zijn gevarieerd om de werkelijke ondergrens te vinden.

Draait u aan de kleine kant van deze niveaus (een Pi, een oude laptop, een VPS met 2 GB)? [Setups met weinig resources](/nl/guide/low-resource) zet deze getallen om in een concrete handleiding met afgestemde limieten.

### Snel overzicht {#quick-reference}

| Niveau | Toepassing | CPU | RAM | GPU | Opslag |
|------|----------|-----|-----|-----|---------|
| Minimum | Niet-AI-tools (afbeeldingen, bestanden, lichte PDF) plus ingebouwde snelle OCR en gezichtsdetectie; één gebruiker; kleine batches | 2 cores | 2 GB | Geen | ~7 GB |
| Aanbevolen | Alle vijf modaliteiten, inclusief video, PDF en standaard AI-bundels op de CPU; batches; enkele gebruikers | 4 cores | 4 GB (8 GB voor HQ-inpainting) | Geen | ~25 GB |
| Volledig | Alles op snelheid, inclusief GPU-AI; grote batches; veel gebruikers | 6-8 cores | 8 GB | NVIDIA 8 GB+ VRAM (12 GB comfortabel) | ~35 GB |

**Architectuur: alleen 64-bit** (`linux/amd64` of `linux/arm64`). SnapOtter draait native op Intel/AMD-servers, Apple Silicon-Macs en 64-bit ARM-boards, waaronder de **Raspberry Pi 4 en 5** (4-8 GB). Het draait **niet** op 32-bit ARM (`armv7`/`armhf`), want daarvoor wordt geen image gebouwd, en ook niet op boards van de 512 MB-klasse zoals de Pi Zero, die onder de geheugenondergrens liggen (zie hieronder).

### Minimum (afbeeldings-, bestands- en lichte PDF-tools; geen AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Resource | Vereiste |
|---|---|
| CPU | 2 cores |
| RAM | 2 GB |
| Schijf | ~5,5 GB (image) + datavolume |
| GPU | Niet vereist |

Alle 222 niet-AI-tools uit de catalogus draaien op bescheiden hardware: afbeeldingen (formaat wijzigen, bijsnijden, converteren, comprimeren, aanpassen, watermerk), video (knippen, dempen, remux), audio (converteren, normaliseren, knippen), PDF (samenvoegen, splitsen, comprimeren, roteren, beveiligen), bestandsconversies en speciale conversiepresets. De meeste bewerkingen zijn ruim binnen een seconde klaar, zelfs bij een groot bestand: een afbeelding van 2,7 MB wordt in ~0,05 s verkleind en in ~2 s opnieuw gecodeerd naar WebP.

De geheugenondergrens is reëel, blijkens een sweep van Docker-resourcelimieten: **512 MB kan de stack niet starten** (zelfs één enkele formaatwijziging van een afbeelding wordt afgebroken), **1 GB** verwerkt bewerkingen op één bestand maar bij een batch met meerdere bestanden raakt het geheugen op, en **2 GB / 2 cores** is de kleinste configuratie die niet-AI-batches comfortabel aankan. De ingebouwde snelle OCR en de bundel `face-detection` passen ook binnen 2 GB, terwijl de grotere AI-bundels (Whisper, LaMa/DDColor, rembg, RealESRGAN, fotorestauratie en SD1.5 HQ-inpainting) 4 tot 8 GB RAM nodig hebben en vooraf worden geweigerd wanneer het vrije geheugen onder hun ondergrens per bundel ligt.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**De ene CPU-zware uitzondering is video opnieuw coderen.** Stream-copy-bewerkingen (knippen, dempen, container-remux) zijn direct klaar, maar transcoderen naar een andere codec is CPU-gebonden. Een clip van 1080p / 45 seconden die opnieuw wordt gecodeerd naar VP9 (WebM) duurt ongeveer **~40 s** op een snelle moderne CPU, ~45 s op Apple Silicon, ~80 s op een oudere mobiele 4-core en **~130 s** op een oudere 4-core-server. Is uw workload videozwaar, geef dan prioriteit aan CPU-cores en kloksnelheid, of verhoog de limiet `cpus:` van de container: de meegeleverde compose beperkt de app standaard tot 4 cores (8 bij de GPU-compose).

### Aanbevolen (AI-tools op de CPU) {#recommended-ai-tools-on-cpu}

| Resource | Vereiste |
|---|---|
| CPU | 4 cores |
| RAM | 4 GB |
| Schijf | 3 GB (image) + ongeveer 20 GB (alle optionele AI-pakketten) + werkruimte |
| GPU | Niet vereist (terugval op CPU) |

**Het installeren en draaien van de grotere AI-bundels is wat de aanbeveling naar 4 GB RAM duwt.** Zonder geïnstalleerde optionele pakketten gebruikt de app in rust ongeveer 360 MB. Legacy Python-tools delen een sidecar, terwijl nauwkeurige OCR een speciale langlevende dispatcher gebruikt die aan de actieve onveranderlijke generatie is vastgepind. Vóór activering voert het installatieprogramma een smoke test uit op de kandidaat. Daarna schakelt het atomisch over naar de nieuwe dispatcher en laat het de vorige dispatcher leeglopen vóór garbage collection. Elk officieel artefact voor nauwkeurige OCR moet zijn worstcase-releasesuite doorstaan binnen een cgroup van 4 GiB, terwijl de aanbeveling van 4 GB voor de host ruimte laat voor de Node.js-applicatie, Postgres, Redis, wachtrijen en gelijktijdig werk.

De meeste AI-tools zijn prima bruikbaar op de CPU; een paar willen echt een GPU. Gemeten op een moderne 4-core CPU:

| AI-tool | CPU-tijd | Bruikbaar op CPU? |
|---|---|---|
| Gezichtsdetectie (blur-faces, smart-crop, red-eye), ruisverwijdering | minder dan 1 s | Ja |
| OCR, transcriptie, ondertitels | 1-3 s | Ja |
| Inkleuren, gezichtsverbetering | ~10 s | Ja |
| Achtergrond verwijderen / vervangen / vervagen | ~29 s | Ja (u moet wachten) |
| AI-opschaling (RealESRGAN) | ~33 s klein; minuten bij grote afbeeldingen | Marginaal, GPU sterk aanbevolen |
| Fotorestauratie (volledige pipeline) | enkele minuten | Nee, vereist een GPU of een snelle CPU met veel cores |

SnapOtter bakt deze modeldownloads bewust niet in de Docker-image. AI-bundels worden pas opgehaald wanneer een beheerder de bijbehorende tool inschakelt, worden opgeslagen in het persistente volume `/data/ai` en worden gedeeld door elke tool die van dezelfde modelstack afhangt. Zo blijft de uiteindelijke containerimage klein, terwijl een volledige AI-installatie nog steeds de grotere opslagcijfers hieronder kan bereiken.

Sommige tools hangen af van meer dan één gedeelde bundel. Passport Photo heeft bijvoorbeeld zowel `background-removal` als `face-detection` nodig; als `background-removal` al is geïnstalleerd, downloadt het inschakelen van Passport Photo alleen de ontbrekende bundel `face-detection`. Hetzelfde hergebruik geldt voor alle AI-tools.

Opslag voor optionele AI-pakketten en ondergrenzen voor CPU-geheugen (SnapOtter controleert het beschikbare geheugen voordat het naar de Python-sidecar verstuurt en weigert uitvoeringen onder de ondergrens voor vrij geheugen van de bundel direct):

| Bundel | Schijfgrootte | Ondergrens CPU-geheugen |
|---|---|---|
| Gezichtsdetectie | 200-300 MB | 2 GB host-RAM (~0,5 GB vrij) |
| Transcriptie | ~600 MB | 4 GB host-RAM (~2 GB vrij) |
| Object eraser + Colorize | 1-2 GB | 4 GB host-RAM (~2 GB vrij) |
| Nauwkeurige OCR (`balanced`/`best`) | ~208-234 MiB download / ~409-488 MiB geïnstalleerd | 4 GiB geconfigureerd effectief geheugen (`fast` draait op 2 GB) |
| Achtergrondverwijdering | 4-5 GB | 4 GB host-RAM (~2,5 GB vrij) |
| Upscale + gezichtsverbetering + ruisverwijdering | 5-6 GB | 4 GB host-RAM (~2,5 GB vrij) |
| Fotorestauratie | 4-5 GB | 4 GB host-RAM (~3 GB vrij) |
| High-Quality Inpainting (`inpaint-hq`) | 5-7 GB | 8 GB host-RAM (~6 GB vrij) |
| **Alle bundels** | **~25 GB geïnstalleerd** | **4 GB (8 GB met `inpaint-hq`)** |

Snelle OCR is via Tesseract in de image ingebouwd, voegt ongeveer 25 MiB toe en vereist niet het optionele OCR-pakket of de geheugenvereiste daarvan van 4 GiB. Snel ondersteunt `auto`, `en`, `de`, `es`, `fr`, `zh` en `ja`, maar niet Koreaans (`ko`) of Arabisch (`ar`). Beide gebruiken `balanced` of `best` en vereisen daarom het nauwkeurige pakket. Het nauwkeurige pakket is beschikbaar in de officiële Linux amd64- en arm64-containers en draait ONNX Runtime op de CPU. NVIDIA-hosts gebruiken dezelfde CPU-OCR-runtime, dus OCR is niet afhankelijk van de CUDA-versie of GPU-architectuur. De nauwkeurige runtime vereist minimaal 4 GiB effectief geheugen: de geconfigureerde cgroup-limiet van de container, anders het hostgeheugen. SnapOtter weigert systemen onder dat ondertekende compatibiliteitsminimum voordat het pakket wordt gedownload. Installatie van het nauwkeurige pakket wordt ook geweigerd op bare-metal-/vooraf gebouwde archieven waarvan de libc en Python-ABI niet gegarandeerd kunnen worden. Op die niet-ondersteunde hosts geven Koreaanse en Arabische OCR een expliciete incompatibiliteitsfout en vallen ze nooit stilzwijgend terug op Snel.

Replica's die hetzelfde `DATA_DIR` delen moeten dezelfde CPU-architectuur gebruiken; zet implementaties met meerdere replica's vast met node affinity. Gemengde amd64/arm64-replica's hebben aparte datavolumes en onafhankelijke SnapOtter-implementaties nodig.

De nauwkeurige runtime houdt één actieve generatie bij en wist de downloadcache na activering. Voor deze release heeft een eerste installatie tijdelijk ongeveer 620-720 MiB nodig voor het archief plus staging, en een upgrade kan pieken tot bijna 1,2 GiB terwijl de oude generatie actief blijft. Het installatieprogramma berekent de exacte vereiste uit de ondertekende index en de huidige generaties vóór het downloaden of uitpakken, en faalt vroegtijdig als het datavolume te klein is.

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
| CPU | 6-8 cores (videovoorbereiding + concurrency draaien op de CPU, ook met GPU-AI) |
| RAM | 8 GB |
| GPU | NVIDIA met 8+ GB VRAM (12 GB aanbevolen) |
| Schijf | ~35 GB totaal |

Een NVIDIA-GPU (CUDA) versnelt de zware AI-modellen enorm. Gemeten op een RTX 4070 tegenover een moderne CPU:

| AI-tool | Versnelling met GPU | Opmerkingen |
|---|---|---|
| AI-opschaling (RealESRGAN 2×) | **~47×** | De grootste winst: minder dan een seconde tegenover ~33 s (minuten bij grote afbeeldingen) |
| Gezichtsverbetering (CodeFormer) | **~12×** | ~0,9 s tegenover ~11 s |
| Transcriptie (Whisper) | ~4,5× | |
| Achtergrond verwijderen / vervangen / vervagen | ~4× | ~7 s op GPU tegenover ~29 s op CPU |
| Inkleuren | ~1,8× | |
| OCR, gezichtsdetectie, red-eye, ruisverwijdering | ~1× | Al snel op de CPU, een GPU helpt niet |
| Fotorestauratie | geen | CPU-gebonden, ook op een GPU (0% GPU-gebruik); een snelle CPU is hier belangrijker dan een GPU |

De tools die een GPU waard zijn, zijn **opschaling, gezichtsverbetering, transcriptie en achtergrondverwijdering**. Gezichtsdetectie, OCR en red-eye zijn CPU-gebonden en al snel, dus een GPU voegt niets toe.

Het piekgebruik van VRAM bereikt 7,5 GB tijdens opschaling met gezichtsverbetering. Een NVIDIA-GPU van 6 GB werkt voor de meeste AI-tools afzonderlijk, maar faalt bij opschaling. Met 8-12 GB VRAM kan alles.

Versnelling via een Intel/AMD-iGPU met VA-API, Quick Sync of OpenCL wordt momenteel niet ondersteund voor AI-inferentie. Het koppelen van `/dev/dri` in de container schakelt AI-GPU-versnelling niet in; SnapOtter draait AI-tools op de CPU tenzij NVIDIA CUDA beschikbaar is.

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

Parallelle verzoeken voor het wijzigen van afbeeldingsformaat tegen de standaard app-container met een limiet van 4 cores:

| Gelijktijdige verzoeken | Gem. responstijd | Fouten |
|---|---|---|
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

De responstijd loopt sub-lineair op zonder fouten naarmate de workerpool verzadigd raakt. Het verhogen van de limiet `cpus:` van de appcontainer (of een host met meer cores) verlegt het plafond. Houd er rekening mee dat zware jobs (videotranscodering, AI op de CPU) een worker gedurende hun volledige looptijd bezet houden, dus dimensioneer de CPU op het verwachte aantal gelijktijdige zware jobs, niet alleen op het aantal verzoeken.

### Ondersteunde afbeeldingsformaten {#supported-image-formats}

SnapOtter ondersteunt **55+ invoerformaten** en **14 uitvoerformaten**, waaronder RAW-bestanden van 20+ cameramerken, professionele formaten (PSD, EPS, OpenEXR, HDR), moderne codecs (JPEG XL, AVIF, HEIC, QOI) en wetenschappelijke/gamingformaten (FITS, DDS).

Zie de [volledige formatenlijst](/nl/guide/supported-formats) voor details over elk ondersteund formaat, de gebruikte decoder en de beschikbare kwaliteitsinstellingen.

### Bekende beperkingen {#known-limitations}

- **Content-aware resize** crasht bij grote afbeeldingen (>5 MP) door een beperking in de caire-binary. Werkt prima met kleinere afbeeldingen.
- **HEIF-decodering** duurt 13-23 seconden. HEIC (de variant van Apple) is veel sneller met 0,3-0,9 seconden.
- **Opschaling** loopt op de CPU in een time-out bij alles boven kleine afbeeldingen. Voor praktisch gebruik is een GPU vereist.
- Gezichtsverbetering met **CodeFormer** is aanzienlijk trager dan GFPGAN (53 s tegenover 2 s op GPU). GFPGAN wordt voor de meeste toepassingen aanbevolen.

## Volumes {#volumes}

| Mount / volume | Doel | Vereist? |
|---|---|---|
| `/data` (app) | AI-modellen, Python-venv, gebruikersbestanden | **Ja** - zonder dit gaan bestanden verloren |
| `/tmp/workspace` (app) | Tijdelijke verwerkingsbestanden (automatisch opgeruimd) | Aanbevolen |
| `SnapOtter-pgdata` (postgres) | PostgreSQL-datamap (gebruikers, instellingen, pipelines, jobs) | **Ja** - zonder dit gaat data verloren |
| `SnapOtter-redisdata` (redis) | Redis append-only-bestand voor duurzame jobwachtrijen | Aanbevolen |

### Bind mounts versus benoemde volumes {#bind-mounts-vs-named-volumes}

**Benoemde volumes** (aanbevolen): Docker beheert de rechten automatisch:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mounts**: u beheert de rechten zelf. Stel `PUID`/`PGID` in op uw hostgebruiker:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Opslagrechten {#storage-permissions}

SnapOtter schrijft tijdens runtime naar twee locaties: `/data` (gebruikersbestanden, logs, AI-modellen en de Python-venv) en `/tmp/workspace` (tijdelijke verwerkingsruimte). Beide moeten schrijfbaar zijn voor de gebruiker als wie de container draait. Is dat bij een van beide niet zo, dan **faalt de container direct bij het opstarten** met een melding die de map, de draaiende UID/GID en de oplossing noemt, in plaats van "healthy" te starten en bij de eerste upload met een cryptische fout te falen. De logmap (`LOG_DIR`, `/data/logs` in de image) wordt op dezelfde manier gecontroleerd, in elke opslagmodus, omdat logs lokaal blijven ook wanneer bestanden in S3 staan.

Hoe rechten worden afgehandeld hangt af van hoe de container wordt gestart:

**Standaard (start als root, schakelt over naar `snapotter`)**: de entrypoint start als root, corrigeert het eigendom van de gekoppelde volumes en schakelt daarna via `gosu` over naar de onbevoorrechte gebruiker `snapotter`. Benoemde volumes werken zonder configuratie. Stel voor bind mounts `PUID`/`PGID` in op uw hostgebruiker (zie hierboven), zodat de bestanden die de container schrijft van u zijn.

**Kubernetes / OpenShift (niet-root via `runAsUser`)**: rechtstreeks als niet-rootgebruiker gestart kan de container de volumes niet zelf met chown overnemen, dus moet de orchestrator ze schrijfbaar maken. Stel `fsGroup` in:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

De schrijfbare mappen van de image zijn eigendom van groep GID 0 en groepsschrijfbaar, dus een pod die met een **willekeurige UID** plus de aanvullende rootgroep draait (de OpenShift-standaard) kan schrijven zonder `chown`.

**TrueNAS Scale (en andere setups met een "vreemde UID")**: TrueNAS draait apps als niet-rootgebruiker (vaak `568:568`) en koppelt host-datasets die van een andere gebruiker zijn, dus noch de entrypoint noch `fsGroup` maakt ze op zichzelf schrijfbaar. Kies er een:

- **Draai de app als root** (aanbevolen): laat de gebruiker van de app leeg of stel hem in op `0`, en laat de standaard entrypoint de rechten corrigeren en overschakelen naar `snapotter`.
- **Draai als UID `999`**: stel de gebruiker/groep van de app in op `999:999` (de ingebouwde gebruiker `snapotter` van SnapOtter) zodat deze overeenkomt met het eigendom in de image.
- **`chown` de host-dataset** naar de UID waarmee de container draait, vanuit de TrueNAS-shell:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

De opstartfout noemt de exacte te gebruiken UID, dus de snelste weg is de app eenmaal te starten, de melding te lezen en daarna `chown` (of de gebruiker aan te passen) overeenkomstig.

## Omgevingsvariabelen {#environment-variables}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `AUTH_ENABLED` | `true` | Aanmeldvereiste in- of uitschakelen |
| `DEFAULT_USERNAME` | `admin` | Initiële gebruikersnaam van de beheerder |
| `DEFAULT_PASSWORD` | `admin` | Initieel wachtwoord van de beheerder (wijziging afgedwongen bij eerste aanmelding) |
| `MAX_UPLOAD_SIZE_MB` | `0` (onbeperkt) | Uploadlimiet per bestand in MB. De image levert `0` mee; een build vanaf de broncode begint bij 100 |
| `MAX_BATCH_SIZE` | `0` (onbeperkt) | Max. aantal bestanden per batchverzoek. De image levert `0` mee; een build vanaf de broncode begint bij 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | API-verzoeken per minuut per IP (stel 0 in om uit te schakelen) |
| `MAX_USERS` | `0` (onbeperkt) | Maximum aantal gebruikersaccounts |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Welke peers het client-IP mogen instellen via `X-Forwarded-For`. Standaard alleen privénetwerken |
| `PUID` | `999` | Draai als deze UID (voor rechten op bind mounts) |
| `PGID` | `999` | Draai als deze GID (voor rechten op bind mounts) |
| `LOG_LEVEL` | `info` | Uitgebreidheid van logs: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (automatisch) | Max. aantal parallelle AI-verwerkingsjobs |
| `SESSION_DURATION_HOURS` | `168` | Levensduur van aanmeldsessies (7 dagen) |
| `CORS_ORIGIN` | (leeg) | Kommagescheiden toegestane origins, of leeg voor same-origin |

### Uitgaande proxy en privé-CA {#outbound-proxy-and-private-ca}

De officiële container schakelt de ondersteuning van Node voor omgevingsproxy's in. Moet SnapOtter de OCR-runtimerepository of andere HTTPS-services via een bedrijfsproxy bereiken, stel dan `HTTPS_PROXY` in (en indien nodig `HTTP_PROXY`). Stel `NO_PROXY` in op een kommagescheiden lijst van hosts die rechtstreeks bereikt moeten worden, zoals Postgres, Redis en interne objectopslag.

Als de proxy of een interne service is ondertekend door een privécertificeringsinstantie, koppel het CA-certificaat dan alleen-lezen en laat `NODE_EXTRA_CA_CERTS` ernaar verwijzen. Het bestand moet bestaan wanneer het Node-proces start:

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

Houd de proxy-inloggegevens buiten het Compose-bestand (bijvoorbeeld in een beveiligd `.env`-bestand of geheim). Schakel TLS-verificatie niet uit: de ondertekende OCR-index authenticeert de release-metadata, terwijl normale TLS-validatie het transport en elk ander uitgaand verzoek blijft beschermen.

## Healthcheck {#health-check}

De container bevat een ingebouwde healthcheck:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse proxy {#reverse-proxy}

`TRUST_PROXY` staat standaard op `loopback,linklocal,uniquelocal`, dus SnapOtter vertrouwt `X-Forwarded-For` alleen van een peer op een privénetwerk. Een reverse proxy op dezelfde host, op een Docker-netwerk of op uw LAN wordt standaard vertrouwd, wat betekent dat rate limiting, de brute-forcebeveiliging bij aanmelden, het auditlog en de enterprise-IP-toelatingslijst allemaal het echte client-IP zien zonder configuratie.

Stel `TRUST_PROXY=true` alleen in wanneer de proxy ervoor SnapOtter vanaf een **openbaar** adres bereikt, bijvoorbeeld een cloud-load balancer op een ander netwerk. Op een rechtstreeks blootgestelde instantie maakt die waarde `request.ip` door een aanvaller te sturen, omdat een aanroeper die de header roteert per verzoek een nieuwe rate-limit-bucket krijgt.

Twee dingen om te weten voordat u client-IP's gaat meten. Docker Desktop op macOS en Windows serveert een gepubliceerde poort via een userland-proxy die elk bronadres herschrijft naar de VM-gateway `192.168.65.1`, dus geen enkele waarde van `TRUST_PROXY` herstelt daar de echte client; implementeer op Linux voor alles wat aan internet is blootgesteld. En op elk platform wordt het bereiken van een gepubliceerde poort via `localhost` waargenomen als de bridge-gateway en niet als uw client, dus een localhost-test zegt niets over hoe een echte client wordt toegeschreven. De volledige tabel met waarden van `TRUST_PROXY` en het voorbehoud voor Docker Desktop staan in [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy).

Twee dingen gelden voor elke proxy hieronder: sta grote request bodies toe (uploads) en buffer geen responses. Een proxy die responses buffert breekt SSE-voortgang en laat, nog zichtbaarder, een download van een groot bestand "starten maar nooit afmaken", omdat de proxy het hele bestand vasthoudt voordat hij het doorgeeft. SnapOtter stuurt `X-Accel-Buffering: no` mee bij downloads zodat nginx ze streamt, ook als buffering elders aan blijft staan, maar andere proxy's dan nginx hebben expliciet uitgeschakelde responsebuffering nodig (getoond in elke configuratie hieronder). Stokt een download halverwege, controleer dan eerst of een bufferende proxy ervoor staat.

Een opmerking over HSTS: de API stuurt `Strict-Transport-Security` zelf mee bij elke respons, dus een proxy die responsheaders doorgeeft (alle onderstaande configuraties doen dat) heeft geen eigen HSTS-configuratie nodig. Alleen als uw proxy is geconfigureerd om upstream-responsheaders te verwijderen of te overschrijven, moet u de header behouden of aan de rand opnieuw toevoegen.

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

### Implementeren onder een subpad {#subpath}

Om `https://example.com/snapotter` te serveren, stelt u `BASE_PATH=/snapotter` in de
omgeving van de SnapOtter-container in en start u die opnieuw. De officiële CPU- en GPU-Compose-
bestanden accepteren ook `BASE_PATH` vanuit uw shell of uw Compose-`.env`-bestand. Dezelfde
image werkt op elk pad; een frontend-rebuild is niet nodig.

`BASE_PATH` accepteert door slashes gescheiden segmenten met letters, cijfers, `_` of
`-`, inclusief geneste paden zoals `/apps/snapotter`. Een afsluitende slash is
optioneel. Laat het leeg (de standaard), of stel `/` in, voor een implementatie op de root.

Gebruik in uw bestaande Nginx HTTPS-serverblok:

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

Dit voorbeeld behoudt het voorvoegsel. Proxy's die `/snapotter` verwijderen vóór het
doorsturen worden ook ondersteund. Interne healthchecks kunnen `/api/v1/health`
blijven gebruiken. Stel voor OIDC of SAML ook
`EXTERNAL_URL=https://example.com/snapotter` in en werk de callback-URL's van de identity provider bij zodat ze respectievelijk `/snapotter/api/auth/oidc/callback` of
`/snapotter/api/auth/saml/callback` bevatten.

API-scripts blijven ongewijzigd werken: URL's in API-responses, zoals de
`downloadUrl` van een tool, beginnen met `/api/` wat `BASE_PATH` ook is. Voeg ze toe aan de basis-URL van uw
instantie (`https://example.com/snapotter` + `/api/v1/download/...`)
in plaats van ze te herleiden tegen de root van het domein.

Open de interface via de URL met voorvoegsel (`https://example.com/snapotter`). Een
browser die zonder het voorvoegsel binnenkomt wordt automatisch daarheen gestuurd; alleen API-
verzoeken worden verwacht zonder voorvoegsel bij de app aan te komen. Als de logs
`Requests arrive under /snapotter/ but BASE_PATH is empty` melden, stuurt uw proxy een
voorvoegsel door dat `BASE_PATH` niet declareert: stel `BASE_PATH` erop in,
of verwijder het voorvoegsel bij de proxy.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Voeg een nieuwe Proxy Host toe
2. Stel Domain Name in op uw domein
3. Stel Scheme in op `http`, Forward Hostname op `SnapOtter` (of het IP van uw container) en Forward Port op `1349`
4. Schakel WebSocket-ondersteuning in
5. Voeg onder Advanced toe: `client_max_body_size 500M;` en `proxy_buffering off;`

De header `Strict-Transport-Security` van de API gaat ongewijzigd door NPM heen; de HSTS-schakelaar op het tabblad SSL is daarbovenop optioneel.

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

Traefik stuurt upstream-responsheaders ongewijzigd door, dus de header `Strict-Transport-Security` van de API bereikt browsers zonder `headers`-middleware. Draait u al een middleware die responsheaders herschrijft, zorg dan dat die deze header intact laat.

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

`flush_interval -1` schakelt responsebuffering uit, wat vereist is voor SSE-voortgangsgebeurtenissen (batchverwerking, AI-tools, functie-installaties) en om te zorgen dat downloads van grote bestanden doorstromen in plaats van te stokken. De verlengde time-outs laten uploads van grote bestanden voltooien zonder dat Caddy de verbinding vroegtijdig sluit. Caddy geeft ook de header `Strict-Transport-Security` van de API ongewijzigd door, dus voor HSTS is geen `header`-directive nodig.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Let op: Cloudflare heeft een uploadlimiet van 100 MB op gratis abonnementen. Stel `MAX_UPLOAD_SIZE_MB=100` daarop af.

De tunnel stuurt de responsheaders van de API door, `Strict-Transport-Security` inbegrepen, dus er is geen HSTS-configuratie in het dashboard nodig (de eigen HSTS-instelling van Cloudflare aan de edge is daarbovenop optioneel).

## Probleemoplossing {#troubleshooting}

### "Postgres not reachable: EAI_AGAIN" direct na een mislukte eerste start {#eai-again-after-failed-first-start}

Als de allereerste `docker compose up -d` halverwege mislukt (een poort die al in gebruik is, is de gebruikelijke reden), kan een gewone nieuwe poging met `up -d` de appcontainer starten zonder die aan het compose-netwerk te koppelen. De app crasht dan herhaaldelijk met:

```
Postgres not reachable: EAI_AGAIN
```

terwijl `docker ps` toont dat postgres healthy is. De fout is echt maar wijst naar de verkeerde container: zonder het netwerk kan DNS voor de hostnaam `postgres` helemaal niet worden omgezet, en het herstartbeleid speelt dezelfde fout eindeloos opnieuw af.

Herstel wat de eerste start deed mislukken (meestal: maak de poort vrij) en dwing daarna af dat de appcontainer opnieuw wordt aangemaakt zodat hij weer aan het netwerk wordt gekoppeld:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: bereikbaar vanaf andere apparaten, niet vanaf de pc zelf {#windows-wsl2-loopback}

Met Docker binnen WSL2 (de gebruikelijke Windows-setup) kan de stack bereikbaar zijn vanaf elke andere machine op uw netwerk terwijl `http://localhost:1349` op de Windows-host zelf in een time-out loopt, zelfs met de gespiegelde netwerkmodus van WSL ingeschakeld. De poort verschijnt nooit in `netstat` van Windows en er is niets mis met de containers.

Open de app vanaf een ander apparaat, of vanuit de distro met het eigen adres ervan (`hostname -I` in de WSL-shell). Als localhost-forwarding toevallig werkt op uw WSL-versie, beschouw dat dan als een bonus en niet als iets om op te vertrouwen.

## CI/CD {#ci-cd}

De GitHub-repository heeft drie workflows:

- **ci.yml** - Draait automatisch bij elke push en PR. Voert lint, typecheck, tests en build uit en valideert de Docker-image (zonder te pushen).
- **release.yml** - Handmatig gestart via `workflow_dispatch`. Draait semantic-release om een versietag en GitHub-release aan te maken, bouwt daarna een multi-arch Docker-image (amd64 + arm64) en pusht die naar Docker Hub (`snapotter/snapotter`) en GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Bouwt deze documentatiesite en implementeert die op Cloudflare Pages bij een push naar `main`.

Om een release te maken gaat u in de GitHub-interface naar **Actions > Release > Run workflow**, of voert u uit:

```bash
gh workflow run release.yml
```

Semantic-release bepaalt de versie uit de commitgeschiedenis. De Docker-tag `latest` wijst altijd naar de meest recente release.

## Analyse {#analytics}

SnapOtter bevat anonieme productanalyse (gebruikspatronen van tools, foutrapporten) om bugs op te sporen en functies te verbeteren. Het staat standaard aan. Uw bestanden, bestandsnamen en persoonlijke gegevens maken daar nooit deel van uit. SnapOtter werkt normaal met uitgeschakelde analyse.

### Analyse uitschakelen {#disabling-analytics}

De opt-out tijdens runtime is een beheerderschakelaar met één klik. Open Settings > System > Privacy en zet Anonymous Product Analytics uit. Het stopt direct voor de hele instantie, zonder opnieuw te bouwen.

Voor een image die nooit analyse kan uitzenden, stelt u de harde uitschakeling tijdens de build in door de repository te klonen en opnieuw te bouwen:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Of voeg het build-argument toe aan uw bestaande `docker-compose.yml`:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
