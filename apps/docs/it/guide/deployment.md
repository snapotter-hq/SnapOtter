---
description: "Distribuire SnapOtter in produzione con Docker. Requisiti hardware, configurazione GPU e configurazioni di reverse proxy per Nginx, Traefik e Cloudflare."
i18n_source_hash: b8c4ed2cc086
i18n_provenance: machine
i18n_output_hash: 44c609676567
i18n_hash_version: 2
---

# Distribuzione {#deployment}

SnapOtter viene distribuito come stack Docker Compose a 3 container: l'immagine dell'app SnapOtter, PostgreSQL 17 e Redis 8. L'immagine dell'app supporta **linux/amd64** (con NVIDIA CUDA per l'accelerazione AI) e **linux/arm64** (CPU), quindi funziona in modo nativo su server Intel/AMD, Mac Apple Silicon e dispositivi ARM come Raspberry Pi 4/5. L'accelerazione iGPU Intel/AMD tramite VA-API, Quick Sync o OpenCL non è attualmente supportata per l'inferenza AI.

Per la configurazione della GPU, gli esempi Docker Compose e il blocco delle versioni, consulti [Immagine Docker](./docker-tags).

## Avvio rapido (CPU) {#quick-start-cpu}

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

L'app sarà quindi disponibile all'indirizzo `http://localhost:1349`.

Lo stack qui sopra si connette come proprietario del database. A partire da SnapOtter 2.3.0 è possibile servire le richieste con un ruolo che si limita a leggere e scrivere righe; consulti [Ruoli a privilegi minimi](./database#least-privilege-roles).

> **Limiti di frequenza di Docker Hub?** Sostituisca `snapotter/snapotter:latest` con `ghcr.io/snapotter-hq/snapotter:latest` per scaricare invece dal GitHub Container Registry. Entrambi i registry ricevono la stessa immagine a ogni rilascio.

## Avvio rapido (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Per l'accelerazione NVIDIA CUDA sugli strumenti AI supportati (rimozione dello sfondo, upscaling, miglioramento dei volti):

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

### Verificare l'accelerazione GPU {#verify-gpu-acceleration}

Controlli il rilevamento di CUDA nei log:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

Se gli strumenti AI girano su CPU anche se `--gpus all` e NVIDIA Container Toolkit sono configurati correttamente, reinstalli il bundle interessato (ad esempio Rimozione sfondo) da **Impostazioni → Funzionalità AI**. Il programma di installazione ripristina la build GPU di ONNX Runtime, che una build solo CPU introdotta da un altro bundle (come la trascrizione) può altrimenti oscurare nell'ambiente AI condiviso. Se la reinstallazione dall'interfaccia non ripristina la GPU su un'immagine meno recente, consulti la riparazione manuale in [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490).

## Requisiti hardware {#hardware-requirements}

Questi valori derivano da benchmark su una serie di sistemi, da una moderna workstation amd64 con NVIDIA RTX 4070 fino a un Raspberry Pi, eseguendo l'intero catalogo di strumenti su ciascuno e variando i limiti di risorse di Docker per trovare la soglia reale.

Sta lavorando sulla fascia bassa di questi livelli (un Pi, un vecchio portatile, un VPS da 2 GB)? [Configurazioni a risorse limitate](/it/guide/low-resource) trasforma questi numeri in una guida concreta con limiti ottimizzati.

### Riferimento rapido {#quick-reference}

| Livello | Caso d'uso | CPU | RAM | GPU | Archiviazione |
|------|----------|-----|-----|-----|---------|
| Minimo | Strumenti non AI (immagini, file, PDF leggeri) più OCR Fast integrato e rilevamento dei volti; singolo utente; piccoli batch | 2 core | 2 GB | Nessuna | ~7 GB |
| Consigliato | Tutte e cinque le modalità, inclusi video, PDF e bundle AI standard su CPU; batch; pochi utenti | 4 core | 4 GB (8 GB per l'inpainting HQ) | Nessuna | ~25 GB |
| Completo | Tutto alla massima velocità, inclusa l'AI su GPU; batch di grandi dimensioni; molti utenti | 6-8 core | 8 GB | NVIDIA con 8 GB+ di VRAM (12 GB comodi) | ~35 GB |

**Architettura: solo 64 bit** (`linux/amd64` o `linux/arm64`). SnapOtter funziona in modo nativo su server Intel/AMD, Mac Apple Silicon e schede ARM a 64 bit, inclusi **Raspberry Pi 4 e 5** (4-8 GB). **Non** funziona su ARM a 32 bit (`armv7`/`armhf`), per cui non viene compilata alcuna immagine, né su schede da 512 MB come il Pi Zero, che sono sotto la soglia di memoria (vedere sotto).

### Minimo (strumenti per immagini, file e PDF leggeri; senza AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Risorsa | Requisito |
|---|---|
| CPU | 2 core |
| RAM | 2 GB |
| Disco | ~5,5 GB (immagine) + volume dati |
| GPU | Non richiesta |

Tutti i 222 strumenti del catalogo non AI, ovvero immagini (ridimensionamento, ritaglio, conversione, compressione, regolazione, filigrana), video (taglio, disattivazione audio, remux), audio (conversione, normalizzazione, taglio), PDF (unione, divisione, compressione, rotazione, protezione), conversioni di file e preset di conversione dedicati, funzionano su hardware modesto. La maggior parte delle operazioni termina in ben meno di un secondo anche su un file grande: un'immagine da 2,7 MB viene ridimensionata in ~0,05 s e ricodificata in WebP in ~2 s.

La soglia di memoria è reale, come risulta da un test sui limiti di risorse di Docker: **512 MB non bastano per avviare lo stack** (anche un singolo ridimensionamento di immagine viene terminato), **1 GB** gestisce operazioni su un singolo file ma un batch di più file esaurisce la memoria, e **2 GB / 2 core** è la configurazione più piccola che gestisce comodamente batch non AI. L'OCR Fast integrato e il bundle `face-detection` stanno anch'essi in 2 GB, mentre i bundle AI più grandi (Whisper, LaMa/DDColor, rembg, RealESRGAN, ripristino foto e inpainting HQ SD1.5) richiedono da 4 a 8 GB di RAM e vengono rifiutati subito quando la memoria libera è inferiore alla soglia del singolo bundle.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**L'unica eccezione che richiede molta CPU è la ricodifica video.** Le operazioni con copia dello stream (taglio, disattivazione audio, remux del contenitore) sono istantanee, ma la transcodifica verso un codec diverso dipende dalla CPU. Una clip 1080p di 45 secondi ricodificata in VP9 (WebM) richiede circa **~40 s** su una CPU moderna veloce, ~45 s su Apple Silicon, ~80 s su un portatile datato a 4 core e **~130 s** su un server datato a 4 core. Se il suo carico di lavoro è incentrato sul video, dia priorità a core e frequenza della CPU, oppure aumenti il limite `cpus:` del container: il compose fornito limita l'app a 4 core per impostazione predefinita (8 nel compose GPU).

### Consigliato (strumenti AI su CPU) {#recommended-ai-tools-on-cpu}

| Risorsa | Requisito |
|---|---|
| CPU | 4 core |
| RAM | 4 GB |
| Disco | 3 GB (immagine) + circa 20 GB (tutti i pacchetti AI opzionali) + workspace |
| GPU | Non richiesta (fallback su CPU) |

**L'installazione e l'esecuzione dei bundle AI più grandi è ciò che porta la raccomandazione a 4 GB di RAM.** Senza pacchetti opzionali installati, l'app resta a riposo intorno ai 360 MB. Gli strumenti Python legacy condividono un sidecar, mentre l'OCR accurato usa un dispatcher dedicato di lunga durata, vincolato alla generazione immutabile attiva. Prima dell'attivazione, il programma di installazione esegue uno smoke test sul candidato. Passa poi in modo atomico al nuovo dispatcher e svuota il dispatcher precedente prima della garbage collection. Ogni artefatto ufficiale di OCR accurato deve superare la propria suite di rilascio nel caso peggiore all'interno di un cgroup da 4 GiB, mentre i 4 GB raccomandati per l'host lasciano margine per l'applicazione Node.js, Postgres, Redis, le code e il lavoro concorrente.

La maggior parte degli strumenti AI è perfettamente utilizzabile su CPU; un paio richiedono davvero una GPU. Misurato su una moderna CPU a 4 core:

| Strumento AI | Tempo CPU | Utilizzabile su CPU? |
|---|---|---|
| Rilevamento volti (blur-faces, smart-crop, red-eye), noise-removal | meno di 1 s | Sì |
| OCR, trascrizione, sottotitoli | 1-3 s | Sì |
| Colorize, miglioramento dei volti | ~10 s | Sì |
| Rimozione / sostituzione / sfocatura dello sfondo | ~29 s | Sì (si dovrà attendere) |
| Upscale AI (RealESRGAN) | ~33 s per immagini piccole; minuti per immagini grandi | Marginale: GPU fortemente consigliata |
| Ripristino foto (pipeline completa) | diversi minuti | No: serve una GPU o una CPU many-core veloce |

SnapOtter non include intenzionalmente questi download di modelli nell'immagine Docker. I bundle AI vengono scaricati solo quando un amministratore abilita lo strumento correlato, vengono memorizzati nel volume persistente `/data/ai` e sono condivisi da ogni strumento che dipende dallo stesso stack di modelli. In questo modo l'immagine finale del container resta piccola, pur consentendo a un'installazione AI completa di raggiungere i valori di archiviazione più elevati riportati sotto.

Alcuni strumenti dipendono da più di un bundle condiviso. Ad esempio, Passport Photo richiede sia `background-removal` sia `face-detection`; se `background-removal` è già installato, abilitare Passport Photo scarica solo il bundle `face-detection` mancante. Lo stesso riutilizzo vale per tutti gli strumenti AI.

Archiviazione dei pacchetti AI opzionali e soglie di memoria CPU (SnapOtter controlla la memoria disponibile prima di inviare al sidecar Python e rifiuta immediatamente le esecuzioni sotto la soglia di memoria libera del bundle):

| Bundle | Dimensione su disco | Soglia di memoria CPU |
|---|---|---|
| Rilevamento volti | 200-300 MB | 2 GB di RAM host (~0,5 GB liberi) |
| Trascrizione | ~600 MB | 4 GB di RAM host (~2 GB liberi) |
| Cancellazione oggetti + Colorize | 1-2 GB | 4 GB di RAM host (~2 GB liberi) |
| OCR accurato (`balanced`/`best`) | ~208-234 MiB di download / ~409-488 MiB installati | 4 GiB di memoria effettiva configurata (`fast` funziona con 2 GB) |
| Rimozione sfondo | 4-5 GB | 4 GB di RAM host (~2,5 GB liberi) |
| Upscale + miglioramento volti + rimozione rumore | 5-6 GB | 4 GB di RAM host (~2,5 GB liberi) |
| Ripristino foto | 4-5 GB | 4 GB di RAM host (~3 GB liberi) |
| Inpainting di alta qualità (`inpaint-hq`) | 5-7 GB | 8 GB di RAM host (~6 GB liberi) |
| **Tutti i bundle** | **~25 GB installati** | **4 GB (8 GB con `inpaint-hq`)** |

L'OCR Fast è integrato nell'immagine tramite Tesseract, aggiunge circa 25 MiB e non richiede il pacchetto OCR opzionale né i suoi 4 GiB di memoria. Fast supporta `auto`, `en`, `de`, `es`, `fr`, `zh` e `ja`, ma non il coreano (`ko`) né l'arabo (`ar`). Entrambi usano `balanced` o `best` e quindi richiedono il pacchetto accurato. Il pacchetto accurato è disponibile nei container Linux ufficiali amd64 e arm64 ed esegue ONNX Runtime su CPU. Gli host NVIDIA usano lo stesso runtime OCR su CPU, quindi l'OCR non dipende dalla versione di CUDA né dall'architettura della GPU. Il runtime accurato richiede almeno 4 GiB di memoria effettiva: il limite cgroup configurato del container, altrimenti la memoria dell'host. SnapOtter rifiuta i sistemi al di sotto di quel minimo di compatibilità firmato prima di scaricare il pacchetto. L'installazione del pacchetto accurato viene inoltre rifiutata sugli archivi bare-metal/precompilati la cui libc e la cui ABI Python non possono essere garantite. Su questi host non supportati, l'OCR per coreano e arabo restituisce un errore esplicito di incompatibilità e non ripiega mai silenziosamente su Fast.

Le repliche che condividono lo stesso `DATA_DIR` devono usare la stessa architettura CPU; fissi le distribuzioni multi-replica con node affinity. Repliche miste amd64/arm64 richiedono volumi dati separati e distribuzioni SnapOtter indipendenti.

Il runtime accurato mantiene una sola generazione attiva e svuota la cache di download dopo l'attivazione. Per questo rilascio, una prima installazione richiede temporaneamente circa 620-720 MiB per l'archivio più lo staging, e un aggiornamento può raggiungere un picco vicino a 1,2 GiB finché la vecchia generazione resta attiva. Il programma di installazione calcola il requisito esatto dall'indice firmato e dalle generazioni correnti prima di scaricare o estrarre, e fallisce subito se il volume dati è troppo piccolo.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Completo (strumenti AI su NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| Risorsa | Requisito |
|---|---|
| CPU | 6-8 core (la preparazione video e la concorrenza girano su CPU anche con l'AI su GPU) |
| RAM | 8 GB |
| GPU | NVIDIA con 8+ GB di VRAM (consigliati 12 GB) |
| Disco | ~35 GB in totale |

Una GPU NVIDIA (CUDA) accelera enormemente i modelli AI più pesanti. Misurato su una RTX 4070 rispetto a una moderna CPU:

| Strumento AI | Accelerazione con GPU | Note |
|---|---|---|
| Upscale AI (RealESRGAN 2×) | **~47×** | Il vantaggio maggiore: meno di un secondo contro ~33 s (minuti su immagini grandi) |
| Miglioramento dei volti (CodeFormer) | **~12×** | ~0,9 s contro ~11 s |
| Trascrizione (Whisper) | ~4,5× | |
| Rimozione / sostituzione / sfocatura dello sfondo | ~4× | ~7 s su GPU contro ~29 s su CPU |
| Colorize | ~1,8× | |
| OCR, rilevamento volti, red-eye, noise-removal | ~1× | Già veloci su CPU: una GPU non aiuta |
| Ripristino foto | nessuna | Dipende dalla CPU anche con una GPU (0% di utilizzo GPU); qui conta più una CPU veloce che una GPU |

Gli strumenti per cui vale la pena avere una GPU sono **upscale, miglioramento dei volti, trascrizione e rimozione dello sfondo**. Il rilevamento dei volti, l'OCR e il red-eye dipendono dalla CPU e sono già veloci, quindi una GPU non aggiunge nulla.

L'uso massimo di VRAM raggiunge 7,5 GB durante l'upscale con miglioramento dei volti. Una GPU NVIDIA da 6 GB funziona con la maggior parte degli strumenti AI singolarmente ma fallirà sull'upscale. 8-12 GB di VRAM gestiscono tutto.

L'accelerazione iGPU Intel/AMD tramite VA-API, Quick Sync o OpenCL non è attualmente supportata per l'inferenza AI. Mappare `/dev/dri` nel container non abilita l'accelerazione GPU per l'AI; SnapOtter eseguirà gli strumenti AI su CPU a meno che NVIDIA CUDA non sia disponibile.

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

### Utenti concorrenti {#concurrent-users}

Richieste parallele di ridimensionamento immagini verso il container dell'app, limitato a 4 core per impostazione predefinita:

| Richieste concorrenti | Tempo medio di risposta | Errori |
|---|---|---|
| 1 | 0,4s | 0 |
| 5 | 1,2s | 0 |
| 10 | 2,1s | 0 |

Il tempo di risposta peggiora in modo sublineare e senza errori man mano che il pool di worker si satura. Aumentare il limite `cpus:` del container dell'app (o usare un host con più core) alza il tetto. Si noti che i job pesanti (transcodifica video, AI su CPU) occupano un worker per tutta la loro durata, quindi dimensioni la CPU in base al numero atteso di job pesanti concorrenti, non solo al numero di richieste.

### Formati immagine supportati {#supported-image-formats}

SnapOtter supporta **55+ formati di input** e **14 formati di output**, inclusi file RAW di oltre 20 marchi di fotocamere, formati professionali (PSD, EPS, OpenEXR, HDR), codec moderni (JPEG XL, AVIF, HEIC, QOI) e formati scientifici/di gioco (FITS, DDS).

Consulti l'[elenco completo dei formati](/it/guide/supported-formats) per i dettagli su ogni formato supportato, il decoder usato e i controlli di qualità disponibili.

### Limitazioni note {#known-limitations}

- Il **ridimensionamento content-aware** va in crash su immagini grandi (>5 MP) a causa di una limitazione del binario caire. Funziona bene con immagini più piccole.
- La **decodifica HEIF** richiede 13-23 secondi. HEIC (la variante Apple) è molto più veloce, con 0,3-0,9 secondi.
- L'**upscale** va in timeout su CPU per qualsiasi immagine oltre le piccole dimensioni. Per un uso pratico è necessaria la GPU.
- Il miglioramento dei volti con **CodeFormer** è significativamente più lento di GFPGAN (53s contro 2s su GPU). GFPGAN è consigliato per la maggior parte dei casi d'uso.

## Volumi {#volumes}

| Mount / Volume | Scopo | Obbligatorio? |
|---|---|---|
| `/data` (app) | Modelli AI, venv Python, file utente | **Sì** - senza di esso si perdono i file |
| `/tmp/workspace` (app) | File temporanei di elaborazione (puliti automaticamente) | Consigliato |
| `SnapOtter-pgdata` (postgres) | Directory dati di PostgreSQL (utenti, impostazioni, pipeline, job) | **Sì** - senza di esso si perdono i dati |
| `SnapOtter-redisdata` (redis) | File append-only di Redis per code di job durevoli | Consigliato |

### Bind mount e volumi con nome {#bind-mounts-vs-named-volumes}

**Volumi con nome** (consigliati): Docker gestisce automaticamente i permessi:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mount**: i permessi sono a Suo carico. Imposti `PUID`/`PGID` in modo che corrispondano all'utente del suo host:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Permessi di archiviazione {#storage-permissions}

In fase di esecuzione SnapOtter scrive in due posizioni: `/data` (file utente, log, modelli AI e venv Python) e `/tmp/workspace` (area di lavoro temporanea per l'elaborazione). Entrambe devono essere scrivibili dall'utente con cui gira il container. In caso contrario, il container **fallisce subito all'avvio** con un messaggio che indica la directory, l'UID/GID in esecuzione e come correggere, invece di avviarsi come "healthy" e poi fallire al primo upload con un errore criptico. Anche la directory dei log (`LOG_DIR`, `/data/logs` nell'immagine) viene controllata allo stesso modo, in ogni modalità di archiviazione, poiché i log restano locali anche quando i file risiedono su S3.

Il modo in cui i permessi vengono gestiti dipende da come viene avviato il container:

**Predefinito (parte come root, passa a `snapotter`)**: l'entrypoint parte come root, corregge la proprietà dei volumi montati, quindi passa all'utente non privilegiato `snapotter` tramite `gosu`. I volumi con nome funzionano senza alcuna configurazione. Per i bind mount, imposti `PUID`/`PGID` sul Suo utente host (vedere sopra) in modo che i file scritti appartengano a Lei.

**Kubernetes / OpenShift (non-root tramite `runAsUser`)**: avviato direttamente come utente non root, il container non può eseguire chown sui volumi, quindi è l'orchestratore a doverli rendere scrivibili. Imposti `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Le directory scrivibili dell'immagine appartengono al gruppo con GID 0 e sono scrivibili dal gruppo, quindi un pod eseguito con un **UID arbitrario** più il gruppo supplementare root (l'impostazione predefinita di OpenShift) può scrivere senza `chown`.

**TrueNAS Scale (e altre configurazioni con "UID esterno")**: TrueNAS esegue le app come utente non root (spesso `568:568`) e monta dataset dell'host appartenenti a un utente diverso, quindi né l'entrypoint né `fsGroup` li rendono scrivibili da soli. Scelga una delle opzioni:

- **Eseguire l'app come root** (consigliato): lasci vuoto l'utente dell'app oppure lo imposti su `0`, e lasci che l'entrypoint predefinito corregga i permessi e passi a `snapotter`.
- **Eseguire come UID `999`**: imposti utente/gruppo dell'app su `999:999` (l'utente `snapotter` integrato di SnapOtter) in modo che corrisponda alla proprietà dell'immagine.
- **`chown` il dataset dell'host** all'UID con cui gira il container, dalla shell di TrueNAS:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

L'errore di avvio indica l'UID esatto da usare, quindi il percorso più rapido è avviare l'app una volta, leggere il messaggio, poi `chown` (o modificare l'utente) di conseguenza.

## Variabili d'ambiente {#environment-variables}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `AUTH_ENABLED` | `true` | Abilita/disabilita il requisito di login |
| `DEFAULT_USERNAME` | `admin` | Nome utente amministratore iniziale |
| `DEFAULT_PASSWORD` | `admin` | Password amministratore iniziale (cambio obbligatorio al primo accesso) |
| `MAX_UPLOAD_SIZE_MB` | `0` (illimitato) | Limite di upload per file in MB. L'immagine fornisce `0`; una build da sorgente parte da 100 |
| `MAX_BATCH_SIZE` | `0` (illimitato) | Numero massimo di file per richiesta batch. L'immagine fornisce `0`; una build da sorgente parte da 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | Richieste API al minuto per IP (impostare 0 per disabilitare) |
| `MAX_USERS` | `0` (illimitato) | Numero massimo di account utente |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Quali peer possono impostare l'IP del client tramite `X-Forwarded-For`. Per impostazione predefinita solo reti private |
| `PUID` | `999` | Esegue con questo UID (per i permessi dei bind mount) |
| `PGID` | `999` | Esegue con questo GID (per i permessi dei bind mount) |
| `LOG_LEVEL` | `info` | Verbosità dei log: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Numero massimo di job di elaborazione AI paralleli |
| `SESSION_DURATION_HOURS` | `168` | Durata della sessione di login (7 giorni) |
| `CORS_ORIGIN` | (vuoto) | Origini consentite separate da virgole, oppure vuoto per la stessa origine |

### Proxy in uscita e CA privata {#outbound-proxy-and-private-ca}

Il container ufficiale abilita il supporto di Node per il proxy da variabili d'ambiente. Se SnapOtter deve raggiungere il repository del runtime OCR o altri servizi HTTPS tramite un proxy aziendale, imposti `HTTPS_PROXY` (e `HTTP_PROXY` se necessario). Imposti `NO_PROXY` su un elenco, separato da virgole, di host che devono essere raggiunti direttamente, come Postgres, Redis e l'object storage interno.

Se il proxy o un servizio interno è firmato da un'autorità di certificazione privata, monti il certificato CA in sola lettura e punti `NODE_EXTRA_CA_CERTS` ad esso. Il file deve esistere all'avvio del processo Node:

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

Mantenga le credenziali del proxy fuori dal file Compose (ad esempio in un file `.env` protetto o in un secret). Non disabiliti la verifica TLS: l'indice OCR firmato autentica i metadati di rilascio, mentre la normale validazione TLS continua a proteggere il trasporto e ogni altra richiesta in uscita.

## Controllo dello stato {#health-check}

Il container include un controllo dello stato integrato:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse proxy {#reverse-proxy}

`TRUST_PROXY` ha come predefinito `loopback,linklocal,uniquelocal`, quindi SnapOtter considera attendibile `X-Forwarded-For` solo se proviene da un peer su una rete privata. Un reverse proxy sullo stesso host, su una rete Docker o sulla Sua LAN è considerato attendibile senza configurazione, il che significa che il rate limiting, il limitatore di forza bruta del login, il log di audit e la allowlist IP enterprise vedono tutti l'IP reale del client senza alcuna configurazione.

Imposti `TRUST_PROXY=true` solo quando il proxy davanti raggiunge SnapOtter da un indirizzo **pubblico**, ad esempio un load balancer cloud su una rete diversa. Su un'istanza esposta direttamente, quel valore rende `request.ip` controllabile da un attaccante, perché chi ruota l'header ottiene un nuovo bucket di rate limit a ogni richiesta.

Due cose da sapere prima di misurare gli IP dei client. Docker Desktop su macOS e Windows serve una porta pubblicata tramite un proxy in userland che riscrive ogni indirizzo di origine con il gateway della VM `192.168.65.1`, quindi nessun valore di `TRUST_PROXY` recupera il vero client in quel caso; per qualsiasi servizio esposto a Internet, distribuisca su Linux. E su qualsiasi piattaforma, raggiungere una porta pubblicata tramite `localhost` viene osservato come gateway del bridge e non come il Suo client, quindi un test su localhost non dice nulla su come venga attribuito un client reale. La tabella completa dei valori di `TRUST_PROXY` e l'avvertenza su Docker Desktop si trovano in [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy).

Due aspetti contano per ogni proxy qui sotto: consentire corpi di richiesta di grandi dimensioni (upload) e non mettere in buffer le risposte. Un proxy che mette in buffer le risposte interrompe l'avanzamento SSE e, in modo più evidente, fa sì che il download di un file grande "parta ma non finisca mai", perché il proxy trattiene l'intero file prima di inoltrarlo. SnapOtter invia `X-Accel-Buffering: no` sui download in modo che nginx li trasmetta in streaming anche se altrove il buffering è lasciato attivo, ma i proxy diversi da nginx richiedono che il buffering delle risposte sia disabilitato esplicitamente (mostrato in ogni configurazione qui sotto). Se un download si blocca a metà, un proxy con buffering davanti è la prima cosa da verificare.

Una nota su HSTS: l'API invia `Strict-Transport-Security` su ogni risposta, quindi un proxy che inoltra gli header di risposta (come fanno tutte le configurazioni qui sotto) non richiede alcuna configurazione HSTS propria. Solo se il proxy è configurato per rimuovere o sovrascrivere gli header di risposta upstream occorre preservare l'header o riaggiungerlo sul bordo.

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

### Distribuzione sotto un sottopercorso {#subpath}

Per servire `https://example.com/snapotter`, imposti `BASE_PATH=/snapotter` nell'ambiente del
container SnapOtter e lo riavvii. I file Compose ufficiali per CPU e GPU
accettano anche `BASE_PATH` dalla Sua shell o dal file Compose `.env`. La stessa
immagine funziona su qualsiasi percorso; non è necessaria alcuna ricompilazione del frontend.

`BASE_PATH` accetta segmenti separati da barre contenenti lettere, cifre, `_` oppure
`-`, inclusi percorsi annidati come `/apps/snapotter`. La barra finale è
facoltativa. Lo lasci vuoto (predefinito), oppure imposti `/`, per una distribuzione alla radice.

Nel Suo blocco server HTTPS Nginx esistente, usi:

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

Questo esempio preserva il prefisso. Sono supportati anche i proxy che rimuovono `/snapotter` prima di
inoltrare. I controlli dello stato interni possono continuare a usare
`/api/v1/health`. Per OIDC o SAML, imposti anche
`EXTERNAL_URL=https://example.com/snapotter` e aggiorni gli URL di
callback del provider di identità in modo che includano rispettivamente `/snapotter/api/auth/oidc/callback` o
`/snapotter/api/auth/saml/callback`.

Gli script API continuano a funzionare senza modifiche: gli URL nelle risposte dell'API, come il
`downloadUrl` di uno strumento, iniziano con `/api/` qualunque sia `BASE_PATH`. Li accodi all'URL
di base della Sua istanza (`https://example.com/snapotter` + `/api/v1/download/...`)
invece di risolverli rispetto alla radice del dominio.

Apra l'interfaccia tramite l'URL con prefisso (`https://example.com/snapotter`). Un
browser che arriva senza il prefisso viene reindirizzato automaticamente; ci si aspetta che solo le richieste
API raggiungano l'app senza prefisso. Se i log riportano
`Requests arrive under /snapotter/ but BASE_PATH is empty`, il Suo proxy sta
inoltrando un prefisso che `BASE_PATH` non dichiara: imposti `BASE_PATH` su di esso,
oppure rimuova il prefisso sul proxy.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Aggiunga un nuovo Proxy Host
2. Imposti Domain Name sul Suo dominio
3. Imposti Scheme su `http`, Forward Hostname su `SnapOtter` (o l'IP del Suo container), Forward Port su `1349`
4. Abiliti il supporto WebSocket
5. In Advanced, aggiunga: `client_max_body_size 500M;` e `proxy_buffering off;`

L'header `Strict-Transport-Security` dell'API passa attraverso NPM così com'è; l'interruttore HSTS nella scheda SSL è facoltativo in aggiunta.

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

Traefik inoltra invariati gli header di risposta upstream, quindi l'header `Strict-Transport-Security` dell'API raggiunge i browser senza un middleware `headers`. Se ne esegue già uno che riscrive gli header di risposta, si assicuri che lasci intatto quell'header.

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

`flush_interval -1` disabilita il buffering delle risposte, necessario per gli eventi di avanzamento SSE (elaborazione batch, strumenti AI, installazione di funzionalità) e per far sì che i download di file grandi vengano trasmessi in streaming invece di bloccarsi. I timeout estesi consentono il completamento di upload di file grandi senza che Caddy chiuda prima la connessione. Caddy inoltra inoltre l'header `Strict-Transport-Security` dell'API senza modificarlo, quindi per HSTS non serve alcuna direttiva `header`.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Nota: Cloudflare ha un limite di upload di 100 MB sui piani gratuiti. Imposti `MAX_UPLOAD_SIZE_MB=100` di conseguenza.

Il tunnel inoltra gli header di risposta dell'API, `Strict-Transport-Security` incluso, quindi non è richiesta alcuna configurazione HSTS nella dashboard (l'impostazione HSTS del bordo di Cloudflare è facoltativa in aggiunta).

## Risoluzione dei problemi {#troubleshooting}

### "Postgres not reachable: EAI_AGAIN" subito dopo un primo avvio fallito {#eai-again-after-failed-first-start}

Se il primissimo `docker compose up -d` fallisce a metà (il motivo più comune è una porta già in uso), un semplice nuovo tentativo con `up -d` può avviare il container dell'app senza collegarlo alla rete compose. L'app va quindi in crash loop con:

```
Postgres not reachable: EAI_AGAIN
```

mentre `docker ps` mostra postgres in stato healthy. L'errore è reale ma indica il container sbagliato: senza la rete, il DNS per l'hostname `postgres` non può essere risolto affatto, e la policy di riavvio ripropone all'infinito lo stesso errore.

Corregga ciò che ha causato il fallimento del primo avvio (di solito: liberare la porta), poi forzi la ricreazione del container dell'app in modo che si ricolleghi alla rete:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: raggiungibile da altri dispositivi, ma non dal PC stesso {#windows-wsl2-loopback}

Con Docker in esecuzione dentro WSL2 (la configurazione Windows più comune), lo stack può essere raggiungibile da ogni altra macchina della rete mentre `http://localhost:1349` va in timeout sullo stesso host Windows, anche con la modalità di rete mirrored di WSL abilitata. La porta non compare mai nel `netstat` di Windows, e i container non hanno alcun problema.

Apra l'app da un altro dispositivo, oppure dall'interno della distro usando il suo indirizzo (`hostname -I` nella shell WSL). Se l'inoltro di localhost funziona nella Sua versione di WSL, lo consideri un vantaggio in più e non qualcosa su cui fare affidamento.

## CI/CD {#ci-cd}

Il repository GitHub ha tre workflow:

- **ci.yml** - Viene eseguito automaticamente a ogni push e PR. Esegue lint, typecheck, test, build e validazione dell'immagine Docker (senza pubblicarla).
- **release.yml** - Avviato manualmente tramite `workflow_dispatch`. Esegue semantic-release per creare un tag di versione e una release GitHub, poi compila un'immagine Docker multi-architettura (amd64 + arm64) e la pubblica su Docker Hub (`snapotter/snapotter`) e GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Compila questo sito di documentazione e lo distribuisce su Cloudflare Pages a ogni push su `main`.

Per creare una release, vada su **Actions > Release > Run workflow** nell'interfaccia di GitHub, oppure esegua:

```bash
gh workflow run release.yml
```

Semantic-release determina la versione dalla cronologia dei commit. Il tag Docker `latest` punta sempre alla release più recente.

## Analytics {#analytics}

SnapOtter include analytics di prodotto anonime (modelli di utilizzo degli strumenti, segnalazioni di errori) per aiutare a individuare bug e migliorare le funzionalità. Sono attive per impostazione predefinita. I Suoi file, i nomi dei file e i dati personali non ne fanno mai parte. SnapOtter funziona normalmente con le analytics disabilitate.

### Disabilitare le analytics {#disabling-analytics}

La disattivazione a runtime è un interruttore per amministratori a un clic. Apra Impostazioni > Sistema > Privacy e disattivi Analytics di prodotto anonime. Si interrompe immediatamente per l'intera istanza, senza bisogno di ricompilare.

Per un'immagine che non possa mai emettere analytics, imposti la disattivazione definitiva in fase di build clonando il repository e ricompilando:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Oppure aggiunga il build arg al Suo `docker-compose.yml` esistente:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
