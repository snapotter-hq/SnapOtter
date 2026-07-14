---
description: "Implementeer SnapOtter in productie met Docker. Hardwarevereisten, GPU-installatie en reverse-proxyconfiguraties voor Nginx, Traefik en Cloudflare."
i18n_output_hash: 21ff542fcb0c
i18n_source_hash: e0d8d5f6fc87
i18n_provenance: human
---

# Implementatie {#deployment}

SnapOtter wordt geïmplementeerd als een Docker Compose-stack met 3 containers: de SnapOtter-app-image, PostgreSQL 17 en Redis 8. De app-image ondersteunt **linux/amd64** (met NVIDIA CUDA voor AI-versnelling) en **linux/arm64** (CPU), waardoor deze native draait op Intel/AMD-servers, Apple Silicon-Macs en ARM-apparaten zoals de Raspberry Pi 4/5. Intel/AMD iGPU-versnelling via VA-API, Quick Sync of OpenCL wordt vandaag niet ondersteund voor AI-inferentie.

Zie [Docker Image](./docker-tags) voor GPU-installatie, Docker Compose-voorbeelden en versievastlegging.


<!-- korean-ocr-contract:start -->
::: info Compatibiliteit voor Koreaanse OCR
Snelle OCR ondersteunt `auto`, `en`, `de`, `es`, `fr`, `zh` en `ja`, maar geen Koreaans (`ko`). Koreaans vereist het nauwkeurige OCR-pakket en `balanced` of `best`. Het pakket werkt in officiële Linux amd64- en arm64-containers, ook op NVIDIA-hosts waar OCR op de CPU blijft draaien. Niet-ondersteunde systemen krijgen een expliciete compatibiliteitsfout en vallen nooit stil terug op `fast`. Koreaans met `fast` of de oude alias `tesseract` wordt vóór het in de wachtrij plaatsen geweigerd met `FEATURE_INCOMPATIBLE` en `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
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

De app is daarna beschikbaar op `http://localhost:1349`.

> **Docker Hub-ratelimieten?** Vervang `snapotter/snapotter:latest` door `ghcr.io/snapotter-hq/snapotter:latest` om in plaats daarvan van de GitHub Container Registry te halen. Beide registries ontvangen bij elke release dezelfde image.

## Snelstart (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Voor NVIDIA CUDA-versnelling op ondersteunde AI-tools (achtergrondverwijdering, opschaling, gezichtsverbetering):

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

Controleer de CUDA-detectie in de logs:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Hardwarevereisten {#hardware-requirements}

Deze cijfers komen uit benchmarks op een reeks systemen, van een moderne amd64-werkstation met een NVIDIA RTX 4070 tot een Raspberry Pi, waarbij op elk systeem de volledige toolcatalogus werd uitgevoerd en de Docker-resourcelimieten werden doorlopen om de echte ondergrens te vinden.

### Snelle referentie {#quick-reference}

| Niveau | Gebruikssituatie | CPU | RAM | GPU | Opslag |
|------|----------|-----|-----|-----|---------|
| Minimum | Afbeeldings-, bestands- en lichte PDF-tools; één gebruiker; kleine batches | 2 cores | 2 GB | Geen | ~7 GB |
| Aanbevolen | Alle vijf modaliteiten incl. video, PDF en AI op CPU; batches; enkele gebruikers | 4 cores | 4 GB | Geen | ~25 GB |
| Volledig | Alles op snelheid incl. GPU-AI; grote batches; veel gebruikers | 6-8 cores | 8 GB | NVIDIA 8 GB+ VRAM (12 GB comfortabel) | ~35 GB |

**Architectuur: uitsluitend 64-bit** (`linux/amd64` of `linux/arm64`). SnapOtter draait native op Intel/AMD-servers, Apple Silicon-Macs en 64-bit ARM-boards, waaronder de **Raspberry Pi 4 en 5** (4-8 GB). Het draait **niet** op 32-bit ARM (`armv7`/`armhf`) — er wordt geen image voor gebouwd — en ook niet op boards van de 512 MB-klasse zoals de Pi Zero, die onder de geheugenondergrens liggen (zie hieronder).

### Minimum (afbeeldings-, bestands- en lichte PDF-tools; geen AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Resource | Vereiste |
|---|---|
| CPU | 2 cores |
| RAM | 2 GB |
| Schijf | ~5.5 GB (image) + datavolume |
| GPU | Niet vereist |

Alle 222 niet-AI-catalogustools - afbeelding (formaat wijzigen, bijsnijden, converteren, comprimeren, aanpassen, watermerk), video (trimmen, dempen, remux), audio (converteren, normaliseren, trimmen), PDF (samenvoegen, splitsen, comprimeren, roteren, beveiligen), bestandsconversies en speciale conversiepresets - draaien op bescheiden hardware. De meeste bewerkingen zijn zelfs bij een groot bestand ruim binnen een seconde klaar: een afbeelding van 2.7 MB wordt in ~0.05 s van formaat gewijzigd en in ~2 s naar WebP hercodeerd.

De geheugenondergrens is reëel, uit een Docker-resourcelimietsweep: **512 MB kan de stack niet starten** (zelfs één enkele formaatwijziging van een afbeelding wordt afgebroken), **1 GB** verwerkt bewerkingen op één bestand, maar een batch met meerdere bestanden raakt door het geheugen heen, en **2 GB / 2 cores** is de kleinste configuratie die batches comfortabel aankan.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**De enige CPU-intensieve uitzondering is video-hercodering.** Stream-copy-bewerkingen (trimmen, dempen, container-remux) zijn direct, maar transcoderen naar een andere codec is CPU-gebonden. Een clip van 1080p / 45 seconden die naar VP9 (WebM) wordt hercodeerd, duurt ongeveer **~40 s** op een snelle moderne CPU, ~45 s op Apple Silicon, ~80 s op een oudere mobiele 4-core en **~130 s** op een oudere 4-core server. Als je werklast video-intensief is, geef dan prioriteit aan CPU-cores en kloksnelheid, of verhoog de `cpus:`-limiet van de container — de meegeleverde compose beperkt de app standaard tot 4 cores (8 op de GPU-compose).

### Aanbevolen (AI-tools op CPU) {#recommended-ai-tools-on-cpu}

| Resource | Vereiste |
|---|---|
| CPU | 4 cores |
| RAM | 4 GB |
| Disk | 3 GB (afbeelding) + ongeveer 20 GB (alle optionele AI-pakketten) + werkruimte |
| GPU | Niet vereist (CPU-terugval) |

**Het installeren en uitvoeren van de grotere AI-bundels is wat de aanbeveling naar 4 GB RAM duwt.** Als er geen optionele pakketten zijn geïnstalleerd, is de app ongeveer 360 MB inactief. Oudere Python-tools delen een sidecar, terwijl de nauwkeurige OCR een speciale, langlevende dispatcher gebruikt die is vastgemaakt aan de actieve onveranderlijke generatie. Vóór activering voert het installatieprogramma een smoke test uit op de kandidaat. Vervolgens schakelt hij atomair over naar de nieuwe dispatcher en leegt de eerdere dispatcher vóór garbage collection. Elk officieel nauwkeurig OCR-artefact moet de release suite in het slechtste geval passeren in een 4 GiB cgroup, terwijl de hostaanbeveling van 4 GB ruimte laat voor de Node.js-applicatie, Postgres, Redis, wachtrijen en gelijktijdig werk.

De meeste AI-tools zijn prima bruikbaar op CPU; een paar willen echt een GPU. Gemeten op een moderne 4-core CPU:

| AI-tool | CPU-tijd | Bruikbaar op CPU? |
|---|---|---|
| Gezichtsdetectie (gezichten vervagen, smart-crop, rode ogen), ruisverwijdering | onder 1 s | Ja |
| OCR, transcriptie, ondertitels | 1-3 s | Ja |
| Inkleuren, gezichtsverbetering | ~10 s | Ja |
| Achtergrond verwijderen / vervangen / vervagen | ~29 s | Ja (je wacht even) |
| AI-upscale (RealESRGAN) | ~33 s klein; minuten bij grote afbeeldingen | Marginaal — GPU sterk aanbevolen |
| Fotorestauratie (volledige pijplijn) | enkele minuten | Nee — vereist een GPU of een snelle CPU met veel cores |

SnapOtter bakt deze modeldownloads bewust niet in de Docker-image. AI-bundels worden pas opgehaald wanneer een beheerder de bijbehorende tool inschakelt, opgeslagen in het persistente `/data/ai`-volume en gedeeld door elke tool die van dezelfde modelstack afhankelijk is. Dit houdt de uiteindelijke containerimage klein en laat een volledige AI-installatie toch de grotere opslagcijfers hieronder bereiken.

Sommige tools zijn afhankelijk van meer dan één gedeelde bundel. Zo heeft Pasfoto zowel `background-removal` als `face-detection` nodig; als `background-removal` al is geïnstalleerd, downloadt het inschakelen van Pasfoto alleen de ontbrekende `face-detection`-bundel. Hetzelfde hergebruik geldt voor alle AI-tools.

Schattingen van optionele AI-pakketopslag:

| Bundel | Schijfgrootte |
|---|---|
| Achtergrond verwijderen | 4-5 GB |
| Upscale + Gezichtsverbetering + Ruisverwijdering | 5-6 GB |
| Gezichtsdetectie | 200-300 MB |
| Objectgom + Inkleuren | 1-2 GB |
| Nauwkeurige OCR (`balanced`/`best`) | ~208-234 MiB downloaden / ~409-488 MiB geïnstalleerd |
| Fotorestauratie | 4-5 GB |
| Transcriptie | ~600 MB |
| **Alle bundels** | **~20 GB geïnstalleerd** |

Snelle OCR is in het beeld ingebouwd via Tesseract, voegt ongeveer 25 MiB toe en vereist niet het optionele OCR-pakket of de 4 GiB-geheugenvereiste. Het nauwkeurige pakket is beschikbaar in de officiële Linux amd64- en arm64-containers en draait ONNX Runtime op CPU. NVIDIA-hosts gebruiken dezelfde CPU OCR-runtime, dus OCR is niet afhankelijk van de CUDA-versie of GPU-architectuur. De nauwkeurige runtime vereist minimaal 4 GiB effectief geheugen: de geconfigureerde container cgroup-limiet, anders hostgeheugen. SnapOtter wijst systemen af ​​die lager zijn dan het ondertekende compatibiliteitsminimum voordat het pakket wordt gedownload. Nauwkeurige pakketinstallatie wordt ook afgewezen op bare-metal/voorafgebouwde archieven waarvan libc en Python ABI niet kunnen worden gegarandeerd.

Replica's die dezelfde `DATA_DIR` delen, moeten dezelfde CPU-architectuur gebruiken; zet deployments met meerdere replica's via node-affiniteit vast op compatibele nodes. Gemengde amd64/arm64-replica's hebben afzonderlijke datavolumes en onafhankelijke SnapOtter-deployments nodig.

De nauwkeurige runtime houdt één actieve generatie aan en wist de downloadcache na activering. Voor deze release heeft een eerste installatie tijdelijk ongeveer 620-720 MiB nodig voor het archief plus staging, en een upgrade kan pieken in de buurt van 1.2 GiB terwijl de oude generatie actief blijft. Het installatieprogramma berekent de exacte vereisten op basis van de ondertekende index en de huidige generaties voordat het wordt gedownload of geëxtraheerd, en mislukt vroegtijdig als het gegevensvolume te klein is.

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

Een NVIDIA-GPU (CUDA) versnelt de zware AI-modellen dramatisch. Gemeten op een RTX 4070 versus een moderne CPU:

| AI-tool | Versnelling met GPU | Opmerkingen |
|---|---|---|
| AI-upscale (RealESRGAN 2×) | **~47×** | De grootste winst — onder een seconde versus ~33 s (minuten bij grote afbeeldingen) |
| Gezichtsverbetering (CodeFormer) | **~12×** | ~0.9 s versus ~11 s |
| Transcriptie (Whisper) | ~4.5× | |
| Achtergrond verwijderen / vervangen / vervagen | ~4× | ~7 s op GPU versus ~29 s op CPU |
| Inkleuren | ~1.8× | |
| OCR, gezichtsdetectie, rode ogen, ruisverwijdering | ~1× | Al snel op CPU — een GPU helpt niet |
| Fotorestauratie | geen | CPU-gebonden, zelfs op een GPU (0% GPU-benutting); een snelle CPU telt hier meer dan een GPU |

De tools die een GPU waard zijn, zijn **upscale, gezichtsverbetering, transcriptie en achtergrond verwijderen**. Gezichtsdetectie, OCR en rode ogen zijn CPU-gebonden en al snel, dus een GPU voegt niets toe.

Het piek-VRAM-gebruik bereikt 7.5 GB tijdens upscalen met gezichtsverbetering. Een NVIDIA-GPU van 6 GB werkt voor de meeste AI-tools afzonderlijk, maar zal falen bij upscalen. 8-12 GB VRAM verwerkt alles.

Intel/AMD iGPU-versnelling via VA-API, Quick Sync of OpenCL wordt vandaag niet ondersteund voor AI-inferentie. Het toewijzen van `/dev/dri` aan de container schakelt geen AI-GPU-versnelling in; SnapOtter draait AI-tools op CPU tenzij NVIDIA CUDA beschikbaar is.

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

Parallelle verzoeken voor het wijzigen van afbeeldingsformaat tegen de standaard app-container die op 4 cores is beperkt:

| Gelijktijdige verzoeken | Gem. reactietijd | Fouten |
|---|---|---|
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

De reactietijd verslechtert sublineair zonder fouten naarmate de workerpool verzadigd raakt. Het verhogen van de `cpus:`-limiet van de app-container (of het gebruik van een host met meer cores) tilt het plafond op. Merk op dat zware jobs (video-transcodering, CPU-AI) een worker voor hun volledige duur vasthouden, dus dimensioneer de CPU op je verwachte aantal gelijktijdige zware jobs, niet alleen op het aantal verzoeken.

### Ondersteunde afbeeldingsformaten {#supported-image-formats}

SnapOtter ondersteunt **55+ invoerformaten** en **14 uitvoerformaten**, waaronder RAW-bestanden van 20+ cameramerken, professionele formaten (PSD, EPS, OpenEXR, HDR), moderne codecs (JPEG XL, AVIF, HEIC, QOI) en wetenschappelijke/gaming-formaten (FITS, DDS).

Zie de [volledige formaatlijst](/nl/guide/supported-formats) voor details over elk ondersteund formaat, de gebruikte decoder en de beschikbare kwaliteitsregelaars.

### Bekende beperkingen {#known-limitations}

- **Content-aware resize** loopt vast op grote afbeeldingen (>5 MP) door een beperking in de caire-binary. Werkt prima met kleinere afbeeldingen.
- **HEIF-decodering** duurt 13-23 seconden. HEIC (Apples variant) is veel sneller met 0.3-0.9 seconden.
- **Upscale** verloopt via time-out op CPU voor alles boven kleine afbeeldingen. GPU vereist voor praktisch gebruik.
- **CodeFormer**-gezichtsverbetering is aanzienlijk trager dan GFPGAN (53s versus 2s op GPU). GFPGAN wordt voor de meeste gebruikssituaties aanbevolen.

## Volumes {#volumes}

| Mount / Volume | Doel | Vereist? |
|---|---|---|
| `/data` (app) | AI-modellen, Python-venv, gebruikersbestanden | **Ja** - bestandsverlies zonder dit |
| `/tmp/workspace` (app) | Tijdelijke verwerkingsbestanden (automatisch opgeschoond) | Aanbevolen |
| `SnapOtter-pgdata` (postgres) | PostgreSQL-datamap (gebruikers, instellingen, pijplijnen, jobs) | **Ja** - dataverlies zonder dit |
| `SnapOtter-redisdata` (redis) | Redis append-only-bestand voor duurzame jobwachtrijen | Aanbevolen |

### Bind mounts versus named volumes {#bind-mounts-vs-named-volumes}

**Named volumes** (aanbevolen) — Docker beheert de permissies automatisch:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mounts** — Jij beheert de permissies. Stel `PUID`/`PGID` in zodat ze overeenkomen met je host-gebruiker:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Opslagpermissies {#storage-permissions}

SnapOtter schrijft tijdens runtime naar twee locaties: `/data` (gebruikersbestanden, logs, AI-modellen en de Python-venv) en `/tmp/workspace` (tijdelijke verwerkingsscratch). Beide moeten beschrijfbaar zijn door de gebruiker waaronder de container draait. Als een van beide dat niet is, **faalt de container direct bij het opstarten** met een bericht dat de map, de draaiende UID/GID en de oplossing noemt — in plaats van "gezond" op te starten en dan bij de eerste upload met een cryptische fout te falen.

Hoe de permissies worden afgehandeld, hangt af van hoe de container wordt gestart:

**Standaard (start als root, zakt naar `snapotter`)** — de entrypoint start als root, herstelt het eigenaarschap van de gekoppelde volumes en zakt dan via `gosu` naar de niet-geprivilegieerde `snapotter`-gebruiker. Named volumes werken zonder configuratie. Stel voor bind mounts `PUID`/`PGID` in op je host-gebruiker (hierboven) zodat de bestanden die het schrijft eigendom van jou zijn.

**Kubernetes / OpenShift (niet-root via `runAsUser`)** — rechtstreeks gestart als niet-root-gebruiker, kan de container de volumes niet zelf chown'en, dus de orchestrator moet ze beschrijfbaar maken. Stel `fsGroup` in:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

De beschrijfbare mappen van de image zijn groepseigendom van GID 0 en groepsbeschrijfbaar, zodat een pod die met een **willekeurige UID** plus de root-supplementaire groep draait (de OpenShift-standaard) kan schrijven zonder `chown`.

**TrueNAS Scale (en andere "foreign UID"-configuraties)** — TrueNAS draait apps als een niet-root-gebruiker (vaak `568:568`) en koppelt host-datasets die eigendom zijn van een andere gebruiker, dus noch de entrypoint noch `fsGroup` maakt ze op eigen kracht beschrijfbaar. Kies er één:

- **Draai de app als root** (aanbevolen) — laat de gebruiker van de app ongedefinieerd of stel deze in op `0`, en laat de standaard-entrypoint de permissies herstellen en naar `snapotter` zakken.
- **Draai als UID `999`** — stel de gebruiker/groep van de app in op `999:999` (SnapOtters ingebouwde `snapotter`-gebruiker) zodat deze overeenkomt met het eigenaarschap van de image.
- **`chown` de host-dataset** naar de UID waaronder de container draait, vanuit de TrueNAS-shell:

  ```bash
  # Gebruik de UID uit de opstartfout (of voer `id` uit in de container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

De opstartfout noemt de exacte UID die je moet gebruiken, dus de snelste weg is de app één keer te starten, het bericht te lezen en dan overeenkomstig te `chown` (of de gebruiker aan te passen).

## Omgevingsvariabelen {#environment-variables}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `AUTH_ENABLED` | `true` | Inlogvereiste in-/uitschakelen |
| `DEFAULT_USERNAME` | `admin` | Initiële beheerdersgebruikersnaam |
| `DEFAULT_PASSWORD` | `admin` | Initieel beheerderswachtwoord (wijziging verplicht bij eerste login) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Uploadlimiet per bestand |
| `MAX_BATCH_SIZE` | `100` | Max. bestanden per batchverzoek |
| `RATE_LIMIT_PER_MIN` | `1000` | API-verzoeken per minuut per IP (stel 0 in om uit te schakelen) |
| `MAX_USERS` | `0` (onbeperkt) | Maximaal aantal gebruikersaccounts |
| `TRUST_PROXY` | `true` | Vertrouw X-Forwarded-For-headers van reverse proxy |
| `PUID` | `999` | Draaien onder deze UID (voor bind-mount-permissies) |
| `PGID` | `999` | Draaien onder deze GID (voor bind-mount-permissies) |
| `LOG_LEVEL` | `info` | Logbreedsprakigheid: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Max. parallelle AI-verwerkingsjobs |
| `SESSION_DURATION_HOURS` | `168` | Levensduur van inlogsessie (7 dagen) |
| `CORS_ORIGIN` | (leeg) | Komma-gescheiden toegestane origins, of leeg voor same-origin |

### Uitgaande proxy en privé-CA {#outbound-proxy-and-private-ca}

De officiële container maakt Node's omgevingsproxy-ondersteuning mogelijk. Als SnapOtter de OCR runtime repository of andere HTTPS-services moet bereiken via een bedrijfsproxy, stelt u `HTTPS_PROXY` in (en `HTTP_PROXY` indien nodig). Stel `NO_PROXY` in op een door komma's gescheiden lijst met hosts die rechtstreeks moeten worden bereikt, zoals Postgres, Redis en interne objectopslag.

Als de proxy of een interne service is ondertekend door een particuliere certificeringsinstantie, koppelt u het CA-certificaat alleen-lezen en verwijst u `NODE_EXTRA_CA_CERTS` ernaar. Het bestand moet bestaan ​​wanneer het knooppuntproces start:

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

Bewaar de proxyreferenties buiten het Compose-bestand (bijvoorbeeld in een beveiligd `.env`-bestand of geheim). Schakel TLS-verificatie niet uit: de ondertekende OCR-index verifieert de metagegevens van de release, terwijl normale TLS-validatie nog steeds het transport en elk ander uitgaand verzoek beschermt.

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

SnapOtter stelt `TRUST_PROXY=true` standaard in zodat ratelimiting en logging het echte client-IP uit de `X-Forwarded-For`-headers gebruiken.

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

`flush_interval -1` schakelt responsbuffering uit, wat vereist is voor SSE-voortgangsgebeurtenissen (batchverwerking, AI-tools, feature-installaties). De verlengde time-outs laten grote bestandsuploads voltooien zonder dat Caddy de verbinding vroegtijdig sluit.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Opmerking: Cloudflare heeft een uploadlimiet van 100 MB op gratis abonnementen. Stel `MAX_UPLOAD_SIZE_MB=100` hierop in.

## CI/CD {#ci-cd}

De GitHub-repository heeft drie workflows:

- **ci.yml** - Draait automatisch bij elke push en PR. Lint, typechecked, test, bouwt en valideert de Docker-image (zonder te pushen).
- **release.yml** - Handmatig geactiveerd via `workflow_dispatch`. Draait semantic-release om een versietag en GitHub-release te maken, bouwt dan een multi-arch Docker-image (amd64 + arm64) en pusht naar Docker Hub (`snapotter/snapotter`) en GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Bouwt deze documentatiesite en implementeert deze naar Cloudflare Pages bij een push naar `main`.

Ga om een release te maken naar **Actions > Release > Run workflow** in de GitHub-UI, of voer uit:

```bash
gh workflow run release.yml
```

Semantic-release bepaalt de versie op basis van de commitgeschiedenis. De `latest` Docker-tag wijst altijd naar de meest recente release.

## Analytics {#analytics}

SnapOtter bevat anonieme productanalytics (patronen van toolgebruik, foutrapporten) om bugs te helpen opsporen en functies te verbeteren. Het staat standaard aan. Je bestanden, bestandsnamen en persoonlijke gegevens maken hier nooit deel van uit. SnapOtter werkt normaal met analytics uitgeschakeld.

### Analytics uitschakelen {#disabling-analytics}

De runtime-opt-out is een beheerderstoggle met één klik. Open Instellingen > Systeem > Privacy en zet Anonieme Productanalytics uit. Het stopt onmiddellijk voor de hele instance, geen herbouw vereist.

Voor een image die nooit analytics kan uitzenden, stel je de build-time-harde-uitschakeling in door de repository te klonen en te herbouwen:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Of voeg het build-argument toe aan je bestaande `docker-compose.yml`:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
