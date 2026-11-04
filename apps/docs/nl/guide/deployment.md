---
description: "Implementeer SnapOtter in productie met Docker. Hardwarevereisten, GPU-installatie en reverse proxy-configuraties voor Nginx, Traefik en Cloudflare."
i18n_source_hash: 0c8f078ebe75
i18n_provenance: machine
i18n_output_hash: 5c847ef3c81b
i18n_hash_version: 2
---

# Implementatie {#deployment}

SnapOtter wordt geïmplementeerd als een Docker Compose-stack met 3 containers: de SnapOtter-appimage, PostgreSQL 17 en Redis 8. De appimage ondersteunt **linux/amd64** (met NVIDIA CUDA voor AI-versnelling) en **linux/arm64** (CPU), dus hij draait native op Intel/AMD-servers, Apple Silicon-Macs en ARM-apparaten zoals de Raspberry Pi 4/5. Intel/AMD iGPU-versnelling via VA-API, Quick Sync of OpenCL wordt momenteel niet ondersteund voor AI-inferentie.

Zie [Docker-image](./docker-tags) voor GPU-installatie, Docker Compose-voorbeelden en versie vastzetten.

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

> **Rate limits van Docker Hub?** Vervang `snapotter/snapotter:latest` door `ghcr.io/snapotter-hq/snapotter:latest` om in plaats daarvan van GitHub Container Registry te pullen. Beide registries ontvangen bij elke release dezelfde image.

## Snelstart (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Voor NVIDIA CUDA-versnelling bij ondersteunde AI-tools (achtergrondverwijdering, upscaling, gezichtsverbetering):

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

Als AI-tools op de CPU draaien terwijl `--gpus all` en de NVIDIA Container Toolkit juist zijn ingesteld, installeer dan de betreffende bundel (bijvoorbeeld Achtergrondverwijdering) opnieuw via **Instellingen → AI-functies**. Het installatieprogramma herstelt de GPU-build van ONNX Runtime, die anders kan worden overschaduwd door een CPU-only build die door een andere bundel (zoals transcriptie) in de gedeelde AI-omgeving is binnengehaald. Als opnieuw installeren via de UI de GPU op een oudere image niet herstelt, zie dan het handmatige herstel in [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490).

## Hardwarevereisten {#hardware-requirements}

Deze cijfers komen uit benchmarks op uiteenlopende systemen, van een moderne amd64-werkstation met een NVIDIA RTX 4070 tot een Raspberry Pi. Op elk systeem is de hele toolcatalogus gedraaid en zijn de Docker-resourcelimieten doorlopen om de werkelijke ondergrens te vinden.

Draait u aan de kleine kant van deze niveaus (een Pi, een oude laptop, een VPS met 2 GB)? [Omgevingen met weinig resources](/nl/guide/low-resource) zet deze cijfers om in een concreet stappenplan met afgestemde limieten.

### Snelle referentie {#quick-reference}

| Niveau | Toepassing | CPU | RAM | GPU | Opslag |
|------|----------|-----|-----|-----|---------|
| Minimaal | Niet-AI-tools (afbeelding, bestanden, lichte PDF) plus ingebouwde Fast OCR en gezichtsdetectie; één gebruiker; kleine batches | 2 cores | 2 GB | Geen | ~7 GB |
| Aanbevolen | Alle vijf de modaliteiten, incl. video, PDF en standaard AI-bundels op CPU; batches; enkele gebruikers | 4 cores | 4 GB (8 GB voor HQ-inpainting) | Geen | ~25 GB |
| Volledig | Alles op snelheid, incl. GPU-AI; grote batches; veel gebruikers | 6-8 cores | 8 GB | NVIDIA 8 GB+ VRAM (12 GB comfortabel) | ~35 GB |

**Architectuur: alleen 64-bit** (`linux/amd64` of `linux/arm64`). SnapOtter draait native op Intel/AMD-servers, Apple Silicon-Macs en 64-bit ARM-borden, waaronder de **Raspberry Pi 4 en 5** (4-8 GB). Het draait **niet** op 32-bit ARM (`armv7`/`armhf`), want daarvoor wordt geen image gebouwd, en ook niet op borden van de 512 MB-klasse zoals de Pi Zero, die onder de geheugenondergrens vallen (zie hieronder).

### Minimaal (afbeeldings-, bestands- en lichte PDF-tools; geen AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Resource | Vereiste |
|---|---|
| CPU | 2 cores |
| RAM | 2 GB |
| Schijf | ~5,5 GB (image) + datavolume |
| GPU | Niet vereist |

Alle 222 niet-AI-tools uit de catalogus (afbeelding: formaat wijzigen, bijsnijden, converteren, comprimeren, aanpassen, watermerk; video: knippen, dempen, remuxen; audio: converteren, normaliseren, knippen; PDF: samenvoegen, splitsen, comprimeren, roteren, beveiligen; bestandsconversies en speciale conversiepresets) draaien op bescheiden hardware. De meeste bewerkingen zijn ruim binnen een seconde klaar, ook bij een groot bestand: een afbeelding van 2,7 MB wordt in ~0,05 s verkleind en in ~2 s opnieuw gecodeerd naar WebP.

De geheugenondergrens is reëel, blijkens een sweep van Docker-resourcelimieten: **512 MB kan de stack niet starten** (zelfs één enkele afbeeldingsverkleining wordt afgebroken), **1 GB** verwerkt bewerkingen op één bestand maar bij een batch met meerdere bestanden raakt het geheugen op, en **2 GB / 2 cores** is de kleinste configuratie die niet-AI-batches comfortabel aankan. Ingebouwde Fast OCR en de bundel `face-detection` passen ook binnen 2 GB, terwijl de grotere AI-bundels (Whisper, LaMa/DDColor, rembg, RealESRGAN, fotorestauratie en SD1.5 HQ-inpainting) 4 tot 8 GB RAM nodig hebben en vooraf worden geweigerd wanneer het vrije geheugen onder hun ondergrens per bundel ligt.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**De enige CPU-intensieve uitzondering is video opnieuw coderen.** Stream-copy-bewerkingen (knippen, dempen, container-remux) zijn direct klaar, maar transcoderen naar een andere codec is CPU-gebonden. Een clip van 1080p / 45 seconden die opnieuw wordt gecodeerd naar VP9 (WebM) duurt ongeveer **~40 s** op een snelle moderne CPU, ~45 s op Apple Silicon, ~80 s op een oudere mobiele 4-core en **~130 s** op een oudere 4-core server. Als uw werklast veel video bevat, geef dan voorrang aan CPU-cores en kloksnelheid, of verhoog de limiet `cpus:` van de container. De meegeleverde compose beperkt de app standaard tot 4 cores (8 bij de GPU-compose).

### Aanbevolen (AI-tools op CPU) {#recommended-ai-tools-on-cpu}

| Resource | Vereiste |
|---|---|
| CPU | 4 cores |
| RAM | 4 GB |
| Schijf | 3 GB (image) + ongeveer 20 GB (alle optionele AI-pakketten) + werkruimte |
| GPU | Niet vereist (CPU-terugval) |

**Het installeren en draaien van de grotere AI-bundels brengt de aanbeveling op 4 GB RAM.** Zonder geïnstalleerde optionele pakketten gebruikt de app in rust ongeveer 360 MB. Oudere Python-tools delen een sidecar, terwijl nauwkeurige OCR een eigen langlevende dispatcher gebruikt die aan de actieve onveranderlijke generatie is vastgemaakt. Vóór activering voert het installatieprogramma een smoke test uit op de kandidaat. Daarna schakelt het atomair over naar de nieuwe dispatcher en laat het de vorige dispatcher leeglopen vóór de garbage collection. Elk officieel artefact voor nauwkeurige OCR moet zijn worstcase-releasesuite doorstaan binnen een cgroup van 4 GiB, terwijl de hostaanbeveling van 4 GB ruimte overlaat voor de Node.js-applicatie, Postgres, Redis, wachtrijen en gelijktijdig werk.

De meeste AI-tools zijn prima bruikbaar op CPU; een paar hebben echt een GPU nodig. Gemeten op een moderne 4-core CPU:

| AI-tool | CPU-tijd | Bruikbaar op CPU? |
|---|---|---|
| Gezichtsdetectie (blur-faces, smart-crop, red-eye), noise-removal | minder dan 1 s | Ja |
| OCR, transcriptie, ondertitels | 1-3 s | Ja |
| Inkleuren, gezichtsverbetering | ~10 s | Ja |
| Achtergrond verwijderen / vervangen / vervagen | ~29 s | Ja (u moet wachten) |
| AI-upscaling (RealESRGAN) | ~33 s klein; minuten bij grote afbeeldingen | Marginaal, GPU sterk aanbevolen |
| Fotorestauratie (volledige pijplijn) | enkele minuten | Nee, vereist een GPU of een snelle CPU met veel cores |

SnapOtter bakt deze modeldownloads bewust niet in de Docker-image. AI-bundels worden alleen opgehaald wanneer een beheerder de bijbehorende tool inschakelt, worden opgeslagen in het persistente volume `/data/ai` en worden gedeeld door elke tool die van dezelfde modelstack afhangt. Zo blijft de uiteindelijke containerimage klein en kan een volledige AI-installatie toch de grotere opslagcijfers hieronder bereiken.

Sommige tools hangen van meer dan één gedeelde bundel af. Pasfoto heeft bijvoorbeeld zowel `background-removal` als `face-detection` nodig; als `background-removal` al is geïnstalleerd, downloadt het inschakelen van Pasfoto alleen de ontbrekende bundel `face-detection`. Hetzelfde hergebruik geldt voor alle AI-tools.

Opslag en CPU-geheugenondergrens van optionele AI-pakketten (SnapOtter controleert het beschikbare geheugen voordat het naar de Python-sidecar stuurt en weigert uitvoeringen onder de ondergrens voor vrij geheugen van de bundel onmiddellijk):

| Bundel | Schijfgrootte | CPU-geheugenondergrens |
|---|---|---|
| Gezichtsdetectie | 200-300 MB | 2 GB host-RAM (~0,5 GB vrij) |
| Transcriptie | ~600 MB | 4 GB host-RAM (~2 GB vrij) |
| Objectwisser + Inkleuren | 1-2 GB | 4 GB host-RAM (~2 GB vrij) |
| Nauwkeurige OCR (`balanced`/`best`) | ~208-234 MiB download / ~409-488 MiB geïnstalleerd | 4 GiB geconfigureerd effectief geheugen (`fast` draait op 2 GB) |
| Achtergrondverwijdering | 4-5 GB | 4 GB host-RAM (~2,5 GB vrij) |
| Upscaling + Gezichtsverbetering + Ruisverwijdering | 5-6 GB | 4 GB host-RAM (~2,5 GB vrij) |
| Fotorestauratie | 4-5 GB | 4 GB host-RAM (~3 GB vrij) |
| Hoogwaardige inpainting (`inpaint-hq`) | 5-7 GB | 8 GB host-RAM (~6 GB vrij) |
| **Alle bundels** | **~25 GB geïnstalleerd** | **4 GB (8 GB met `inpaint-hq`)** |

Fast OCR is via Tesseract in de image ingebouwd, voegt ongeveer 25 MiB toe en heeft het optionele OCR-pakket en de bijbehorende geheugenvereiste van 4 GiB niet nodig. Fast ondersteunt `auto`, `en`, `de`, `es`, `fr`, `zh` en `ja`, maar niet Koreaans (`ko`) of Arabisch (`ar`). Beide gebruiken `balanced` of `best` en vereisen dus het nauwkeurige pakket. Het nauwkeurige pakket is beschikbaar in de officiële Linux amd64- en arm64-containers en draait ONNX Runtime op CPU. NVIDIA-hosts gebruiken dezelfde CPU-OCR-runtime, dus OCR is niet afhankelijk van de CUDA-versie of GPU-architectuur. De nauwkeurige runtime vereist minstens 4 GiB effectief geheugen: de geconfigureerde cgroup-limiet van de container, anders het hostgeheugen. SnapOtter weigert systemen onder dat ondertekende compatibiliteitsminimum voordat het pakket wordt gedownload. Installatie van het nauwkeurige pakket wordt ook geweigerd op bare-metal/vooraf gebouwde archieven waarvan de libc en Python-ABI niet kunnen worden gegarandeerd. Op die niet-ondersteunde hosts geven Koreaanse en Arabische OCR een expliciete incompatibiliteitsfout en vallen ze nooit stilzwijgend terug op Fast. Een expliciet Fast-verzoek voor Koreaans geeft `FEATURE_INCOMPATIBLE` terug met de reden `fast-korean-unsupported` voordat de taak in de wachtrij wordt geplaatst.

Replica's die dezelfde `DATA_DIR` delen, moeten dezelfde CPU-architectuur gebruiken; zet implementaties met meerdere replica's vast met node affinity. Gemengde amd64/arm64-replica's hebben aparte datavolumes en onafhankelijke SnapOtter-implementaties nodig.

De nauwkeurige runtime houdt één actieve generatie bij en leegt de downloadcache na activering. Voor deze release heeft een eerste installatie tijdelijk ongeveer 620-720 MiB nodig voor het archief plus staging, en een upgrade kan pieken rond 1,2 GiB zolang de oude generatie actief blijft. Het installatieprogramma berekent de exacte vereiste uit de ondertekende index en de huidige generaties voordat het downloadt of uitpakt, en faalt vroeg als het datavolume te klein is.

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
| CPU | 6-8 cores (videovoorbereiding + gelijktijdigheid draaien op CPU, ook met GPU-AI) |
| RAM | 8 GB |
| GPU | NVIDIA met 8+ GB VRAM (12 GB aanbevolen) |
| Schijf | ~35 GB totaal |

Een NVIDIA GPU (CUDA) versnelt de zware AI-modellen enorm. Gemeten op een RTX 4070 tegenover een moderne CPU:

| AI-tool | Versnelling met GPU | Opmerkingen |
|---|---|---|
| AI-upscaling (RealESRGAN 2×) | **~47×** | De grootste winst: minder dan een seconde tegenover ~33 s (minuten bij grote afbeeldingen) |
| Gezichtsverbetering (CodeFormer) | **~12×** | ~0,9 s tegenover ~11 s |
| Transcriptie (Whisper) | ~4,5× | |
| Achtergrond verwijderen / vervangen / vervagen | ~4× | ~7 s op GPU tegenover ~29 s op CPU |
| Inkleuren | ~1,8× | |
| OCR, gezichtsdetectie, red-eye, noise-removal | ~1× | Al snel op CPU, een GPU helpt niet |
| Fotorestauratie | geen | CPU-gebonden, zelfs op een GPU (0% GPU-gebruik); een snelle CPU telt hier zwaarder dan een GPU |

De tools die een GPU waard zijn, zijn **upscaling, gezichtsverbetering, transcriptie en achtergrondverwijdering**. Gezichtsdetectie, OCR en red-eye zijn CPU-gebonden en al snel, dus een GPU voegt daar niets toe.

Het piekgebruik van VRAM bereikt 7,5 GB tijdens upscaling met gezichtsverbetering. Een NVIDIA GPU van 6 GB werkt voor de meeste AI-tools afzonderlijk, maar faalt bij upscaling. Met 8-12 GB VRAM kan alles.

Intel/AMD iGPU-versnelling via VA-API, Quick Sync of OpenCL wordt momenteel niet ondersteund voor AI-inferentie. Het mappen van `/dev/dri` in de container schakelt geen AI-GPU-versnelling in; SnapOtter draait AI-tools op CPU, tenzij NVIDIA CUDA beschikbaar is.

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

Parallelle verzoeken voor het verkleinen van afbeeldingen tegen de standaard app-container met een limiet van 4 cores:

| Gelijktijdige verzoeken | Gem. responstijd | Fouten |
|---|---|---|
| 1 | 0,4s | 0 |
| 5 | 1,2s | 0 |
| 10 | 2,1s | 0 |

De responstijd neemt sublineair toe zonder fouten naarmate de workerpool verzadigd raakt. Het verhogen van de limiet `cpus:` van de appcontainer (of een host met meer cores) verhoogt het plafond. Let op: zware taken (videotranscodering, CPU-AI) houden een worker bezet voor hun volledige duur, dus dimensioneer de CPU op het verwachte aantal gelijktijdige zware taken, niet alleen op het aantal verzoeken.

### Ondersteunde afbeeldingsformaten {#supported-image-formats}

SnapOtter ondersteunt **55+ invoerformaten** en **14 uitvoerformaten**, waaronder RAW-bestanden van 20+ cameramerken, professionele formaten (PSD, EPS, OpenEXR, HDR), moderne codecs (JPEG XL, AVIF, HEIC, QOI) en wetenschappelijke/gamingformaten (FITS, DDS).

Zie de [volledige formatenlijst](/nl/guide/supported-formats) voor details over elk ondersteund formaat, de gebruikte decoder en de beschikbare kwaliteitsinstellingen.

### Bekende beperkingen {#known-limitations}

- **Content-aware resize** crasht bij grote afbeeldingen (>5 MP) door een beperking in de caire-binary. Werkt goed bij kleinere afbeeldingen.
- **HEIF-decodering** duurt 13-23 seconden. HEIC (de variant van Apple) is veel sneller met 0,3-0,9 seconden.
- **Upscaling** loopt op CPU in een time-out bij alles boven kleine afbeeldingen. Voor praktisch gebruik is een GPU nodig.
- **CodeFormer** voor gezichtsverbetering is aanzienlijk trager dan GFPGAN (53s tegenover 2s op GPU). GFPGAN wordt voor de meeste toepassingen aanbevolen.

## Volumes {#volumes}

| Mount / Volume | Doel | Vereist? |
|---|---|---|
| `/data` (app) | AI-modellen, Python-venv, gebruikersbestanden | **Ja** - bestandsverlies zonder |
| `/tmp/workspace` (app) | Tijdelijke verwerkingsbestanden (automatisch opgeschoond) | Aanbevolen |
| `SnapOtter-pgdata` (postgres) | PostgreSQL-datamap (gebruikers, instellingen, pipelines, taken) | **Ja** - gegevensverlies zonder |
| `SnapOtter-redisdata` (redis) | Redis append-only-bestand voor duurzame taakwachtrijen | Aanbevolen |

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

SnapOtter schrijft tijdens runtime naar twee locaties: `/data` (gebruikersbestanden, logs, AI-modellen en de Python-venv) en `/tmp/workspace` (tijdelijke verwerkingsruimte). Beide moeten beschrijfbaar zijn voor de gebruiker waaronder de container draait. Is dat bij een van beide niet zo, dan **faalt de container direct bij het opstarten** met een bericht dat de map, de actieve UID/GID en de oplossing noemt, in plaats van "gezond" te starten en bij de eerste upload met een cryptische fout te falen. De logmap (`LOG_DIR`, `/data/logs` in de image) wordt op dezelfde manier gecontroleerd, in elke opslagmodus, omdat logs lokaal blijven, ook als bestanden in S3 staan.

Hoe rechten worden afgehandeld, hangt af van hoe de container wordt gestart:

**Standaard (start als root, schakelt over naar `snapotter`)**: de entrypoint start als root, corrigeert het eigendom van de gemounte volumes en schakelt dan via `gosu` over naar de onbevoegde gebruiker `snapotter`. Benoemde volumes werken zonder configuratie. Stel bij bind mounts `PUID`/`PGID` in op uw hostgebruiker (zie hierboven), zodat de bestanden die het schrijft uw eigendom zijn.

**Kubernetes / OpenShift (niet-root via `runAsUser`)**: wanneer de container rechtstreeks als niet-rootgebruiker wordt gestart, kan hij de volumes zelf niet chownen, dus de orchestrator moet ze beschrijfbaar maken. Stel `fsGroup` in:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

De beschrijfbare mappen van de image zijn eigendom van groep GID 0 en groep-beschrijfbaar, zodat een pod die met een **willekeurige UID** plus de aanvullende rootgroep draait (de OpenShift-standaard) kan schrijven zonder `chown`.

**TrueNAS Scale (en andere opstellingen met een "vreemde UID")**: TrueNAS draait apps als een niet-rootgebruiker (vaak `568:568`) en mount host-datasets die eigendom zijn van een andere gebruiker, dus noch de entrypoint noch `fsGroup` maakt ze op zichzelf beschrijfbaar. Kies een van de volgende opties:

- **Draai de app als root** (aanbevolen): laat de gebruiker van de app leeg of stel die in op `0`, en laat de standaard entrypoint de rechten corrigeren en overschakelen naar `snapotter`.
- **Draai als UID `999`**: stel de gebruiker/groep van de app in op `999:999` (de ingebouwde gebruiker `snapotter` van SnapOtter), zodat die overeenkomt met het eigendom van de image.
- **`chown` de host-dataset** naar de UID waaronder de container draait, vanuit de TrueNAS-shell:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

De opstartfout noemt de exacte te gebruiken UID, dus de snelste weg is de app één keer te starten, het bericht te lezen en daarna `chown` uit te voeren (of de gebruiker aan te passen).

## Omgevingsvariabelen {#environment-variables}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `AUTH_ENABLED` | `true` | Inlogvereiste in- of uitschakelen |
| `DEFAULT_USERNAME` | `admin` | Gebruikersnaam van de eerste beheerder |
| `DEFAULT_PASSWORD` | `admin` | Wachtwoord van de eerste beheerder (wijziging afgedwongen bij eerste login) |
| `MAX_UPLOAD_SIZE_MB` | `0` (onbeperkt) | Uploadlimiet per bestand in MB. De image levert `0`; een build vanuit de broncode begint op 100 |
| `MAX_BATCH_SIZE` | `0` (onbeperkt) | Max. aantal bestanden per batchverzoek. De image levert `0`; een build vanuit de broncode begint op 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | API-verzoeken per minuut per IP (stel 0 in om uit te schakelen) |
| `MAX_USERS` | `0` (onbeperkt) | Maximaal aantal gebruikersaccounts |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Welke peers het client-IP mogen instellen via `X-Forwarded-For`. Standaard alleen privénetwerken |
| `PUID` | `999` | Draai onder deze UID (voor rechten van bind mounts) |
| `PGID` | `999` | Draai onder deze GID (voor rechten van bind mounts) |
| `LOG_LEVEL` | `info` | Uitgebreidheid van logs: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Max. aantal parallelle AI-verwerkingstaken |
| `SESSION_DURATION_HOURS` | `168` | Levensduur van de inlogsessie (7 dagen) |
| `CORS_ORIGIN` | (leeg) | Kommagescheiden toegestane origins, of leeg voor same-origin |

### Uitgaande proxy en privé-CA {#outbound-proxy-and-private-ca}

De officiële container schakelt de ondersteuning van Node voor proxy's via omgevingsvariabelen in. Als SnapOtter de OCR-runtimerepository of andere HTTPS-diensten via een bedrijfsproxy moet bereiken, stel dan `HTTPS_PROXY` in (en `HTTP_PROXY` indien nodig). Stel `NO_PROXY` in op een kommagescheiden lijst van hosts die rechtstreeks moeten worden bereikt, zoals Postgres, Redis en interne objectopslag.

Als de proxy of een interne dienst is ondertekend door een privé-certificeringsinstantie, mount dan het CA-certificaat alleen-lezen en laat `NODE_EXTRA_CA_CERTS` ernaar verwijzen. Het bestand moet bestaan wanneer het Node-proces start:

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

Bewaar de proxy-inloggegevens buiten het Compose-bestand (bijvoorbeeld in een beschermd `.env`-bestand of secret). Schakel TLS-verificatie niet uit: de ondertekende OCR-index authenticeert releasemetadata, terwijl normale TLS-validatie het transport en elk ander uitgaand verzoek blijft beschermen.

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

`TRUST_PROXY` staat standaard op `loopback,linklocal,uniquelocal`, dus SnapOtter vertrouwt `X-Forwarded-For` alleen van een peer op een privénetwerk. Een reverse proxy op dezelfde host, op een Docker-netwerk of op uw LAN wordt standaard vertrouwd. Dat betekent dat rate limiting, de brute-force-limiter voor inloggen, het auditlogboek en de enterprise IP-allowlist allemaal het echte client-IP zien, zonder configuratie.

Stel `TRUST_PROXY=true` alleen in wanneer de proxy ervoor SnapOtter vanaf een **openbaar** adres bereikt, bijvoorbeeld een cloud-loadbalancer op een ander netwerk. Op een rechtstreeks blootgestelde instantie maakt die waarde `request.ip` door een aanvaller te sturen, omdat een aanroeper die de header roteert per verzoek een nieuwe rate-limit-bucket krijgt.

Twee dingen om te weten voordat u client-IP's gaat meten. Docker Desktop op macOS en Windows serveert een gepubliceerde poort via een userland-proxy die elk bronadres herschrijft naar de VM-gateway `192.168.65.1`, dus geen enkele waarde van `TRUST_PROXY` herstelt daar het echte client-IP; implementeer op Linux voor alles wat op internet staat. En op elk platform wordt het bereiken van een gepubliceerde poort via `localhost` waargenomen als de bridge-gateway in plaats van als uw client, dus een localhost-test zegt niets over hoe een echte client wordt toegeschreven. De volledige tabel met waarden van `TRUST_PROXY` en het voorbehoud voor Docker Desktop staan in [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy).

Twee dingen gelden voor elke onderstaande proxy: sta grote request-bodies toe (uploads) en buffer geen antwoorden. Een proxy die antwoorden buffert, verstoort SSE-voortgang en zorgt, nog zichtbaarder, dat een download van een groot bestand "begint maar nooit eindigt", omdat de proxy het hele bestand vasthoudt voordat hij het doorgeeft. SnapOtter stuurt `X-Accel-Buffering: no` mee bij downloads, zodat nginx ze streamt, ook als buffering elders aan blijft staan, maar andere proxy's dan nginx moeten antwoordbuffering expliciet uitschakelen (te zien in elke configuratie hieronder). Als een download halverwege vastloopt, controleer dan eerst of een bufferende proxy ervoor staat.

Een opmerking over HSTS: de API stuurt `Strict-Transport-Security` zelf mee bij elk antwoord, dus een proxy die responseheaders doorgeeft (alle onderstaande configuraties doen dat) heeft geen eigen HSTS-instelling nodig. Alleen als uw proxy is geconfigureerd om upstream-responseheaders te verwijderen of te overschrijven, moet u de header behouden of aan de rand opnieuw toevoegen.

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

Om `https://example.com/snapotter` te serveren, stelt u `BASE_PATH=/snapotter` in in de omgeving van de
SnapOtter-container en start u die opnieuw. De officiële CPU- en GPU-Compose-bestanden
accepteren ook `BASE_PATH` vanuit uw shell of uw Compose-bestand `.env`. Dezelfde
image werkt op elk pad; een frontend-rebuild is niet nodig.

`BASE_PATH` accepteert door schuine strepen gescheiden segmenten met letters, cijfers, `_` of
`-`, inclusief geneste paden zoals `/apps/snapotter`. Een afsluitende schuine streep is
optioneel. Laat het leeg (de standaard), of stel `/` in, voor een implementatie in de root.

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

Dit voorbeeld behoudt het voorvoegsel. Proxy's die `/snapotter` verwijderen voordat ze doorsturen,
worden ook ondersteund. Interne health checks kunnen `/api/v1/health` blijven gebruiken. Stel voor OIDC of SAML ook
`EXTERNAL_URL=https://example.com/snapotter` in en werk de callback-URL's van de identiteitsprovider bij zodat ze `/snapotter/api/auth/oidc/callback` respectievelijk
`/snapotter/api/auth/saml/callback` bevatten.

API-scripts blijven ongewijzigd werken: URL's in API-antwoorden, zoals de
`downloadUrl` van een tool, beginnen met `/api/`, wat `BASE_PATH` ook is. Voeg ze toe aan de basis-URL van uw
instantie (`https://example.com/snapotter` + `/api/v1/download/...`)
in plaats van ze ten opzichte van de domeinroot op te lossen.

Open de UI via de URL met voorvoegsel (`https://example.com/snapotter`). Een
browser die zonder het voorvoegsel binnenkomt, wordt automatisch daarheen gestuurd; alleen API-verzoeken
mogen zonder voorvoegsel bij de app aankomen. Als de logs `Requests arrive under /snapotter/ but BASE_PATH is empty` melden, stuurt uw proxy
een voorvoegsel door dat `BASE_PATH` niet declareert: stel `BASE_PATH` daarop in,
of verwijder het voorvoegsel bij de proxy.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Voeg een nieuwe Proxy Host toe
2. Stel Domain Name in op uw domein
3. Stel Scheme in op `http`, Forward Hostname op `SnapOtter` (of het IP van uw container), Forward Port op `1349`
4. Schakel WebSocket-ondersteuning in
5. Voeg onder Advanced toe: `client_max_body_size 500M;` en `proxy_buffering off;`

De `Strict-Transport-Security`-header van de API komt ongewijzigd door NPM heen; de HSTS-schakelaar op het tabblad SSL is daar optioneel bovenop.

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

Traefik stuurt upstream-responseheaders ongewijzigd door, dus de `Strict-Transport-Security`-header van de API bereikt browsers zonder `headers`-middleware. Als u er al een draait die responseheaders herschrijft, zorg er dan voor dat die header intact blijft.

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

`flush_interval -1` schakelt antwoordbuffering uit, wat vereist is voor SSE-voortgangsgebeurtenissen (batchverwerking, AI-tools, functie-installaties) en om grote bestandsdownloads te laten streamen in plaats van vast te lopen. De verlengde time-outs laten grote bestandsuploads voltooien zonder dat Caddy de verbinding te vroeg sluit. Caddy geeft de `Strict-Transport-Security`-header van de API ook ongewijzigd door, dus voor HSTS is geen `header`-directive nodig.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Let op: Cloudflare heeft op gratis abonnementen een uploadlimiet van 100 MB. Stel `MAX_UPLOAD_SIZE_MB=100` daarop af.

De tunnel stuurt de responseheaders van de API door, `Strict-Transport-Security` inbegrepen, dus er is geen HSTS-configuratie in het dashboard nodig (de eigen HSTS-instelling van Cloudflare aan de rand is daar optioneel bovenop).

## Probleemoplossing {#troubleshooting}

### "Postgres not reachable: EAI_AGAIN" direct na een mislukte eerste start {#eai-again-after-failed-first-start}

Als de allereerste `docker compose up -d` halverwege mislukt (een poort die al in gebruik is, is de gebruikelijke reden), kan een eenvoudige nieuwe poging met `up -d` de appcontainer starten zonder hem aan het compose-netwerk te koppelen. De app crasht dan in een lus met:

```
Postgres not reachable: EAI_AGAIN
```

terwijl `docker ps` laat zien dat postgres gezond is. De fout is echt, maar wijst naar de verkeerde container: zonder het netwerk kan DNS voor de hostnaam `postgres` helemaal niet worden omgezet, en het herstartbeleid speelt dezelfde fout eindeloos opnieuw af.

Herstel wat de eerste start verstoorde (meestal: maak de poort vrij) en dwing dan af dat de appcontainer opnieuw wordt aangemaakt, zodat hij zich weer met het netwerk verbindt:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: bereikbaar vanaf andere apparaten, niet vanaf de pc zelf {#windows-wsl2-loopback}

Met Docker binnen WSL2 (de gebruikelijke Windows-opstelling) kan de stack bereikbaar zijn vanaf elke andere machine op uw netwerk, terwijl `http://localhost:1349` op de Windows-host zelf in een time-out loopt, zelfs met de gespiegelde netwerkmodus van WSL ingeschakeld. De poort verschijnt nooit in Windows `netstat`, en er is niets mis met de containers.

Open de app vanaf een ander apparaat, of vanuit de distro zelf met het eigen adres (`hostname -I` in de WSL-shell). Als localhost-forwarding op uw WSL-versie toevallig werkt, beschouw dat dan als een extraatje en reken er niet op.

## CI/CD {#ci-cd}

De GitHub-repository heeft drie workflows:

- **ci.yml** - Draait automatisch bij elke push en PR. Voert lint, typecheck, tests en build uit en valideert de Docker-image (zonder te pushen).
- **release.yml** - Handmatig gestart via `workflow_dispatch`. Draait semantic-release om een versietag en GitHub-release te maken, bouwt daarna een multi-arch Docker-image (amd64 + arm64) en pusht die naar Docker Hub (`snapotter/snapotter`) en GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Bouwt deze documentatiesite en implementeert die naar Cloudflare Pages bij een push naar `main`.

Om een release te maken, gaat u in de GitHub-UI naar **Actions > Release > Run workflow**, of voert u uit:

```bash
gh workflow run release.yml
```

Semantic-release bepaalt de versie uit de commitgeschiedenis. De Docker-tag `latest` wijst altijd naar de meest recente release.

## Analytics {#analytics}

SnapOtter bevat anonieme productanalyse (gebruikspatronen van tools, foutrapporten) om bugs op te sporen en functies te verbeteren. Het staat standaard aan. Uw bestanden, bestandsnamen en persoonlijke gegevens maken daar nooit deel van uit. SnapOtter werkt normaal met analytics uitgeschakeld.

### Analytics uitschakelen {#disabling-analytics}

De runtime-opt-out is een beheerdersschakelaar met één klik. Open Instellingen > Systeem > Privacy en schakel Anonieme productanalyse uit. Het stopt direct voor de hele instantie, zonder rebuild.

Voor een image die nooit analytics kan versturen, stelt u de hard-off tijdens het bouwen in door de repository te klonen en opnieuw te bouwen:

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
