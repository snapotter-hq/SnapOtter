---
description: "Distribuisci SnapOtter in produzione con Docker. Requisiti hardware, configurazione GPU e configurazioni di reverse proxy per Nginx, Traefik e Cloudflare."
i18n_output_hash: 28e72d02cd08
i18n_source_hash: 98172965118b
i18n_provenance: human
---

# Distribuzione {#deployment}

SnapOtter si distribuisce come stack Docker Compose a 3 container: l'immagine dell'app SnapOtter, PostgreSQL 17 e Redis 8. L'immagine dell'app supporta **linux/amd64** (con NVIDIA CUDA per l'accelerazione AI) e **linux/arm64** (CPU), quindi gira in modo nativo su server Intel/AMD, Mac con Apple Silicon e dispositivi ARM come il Raspberry Pi 4/5. L'accelerazione tramite iGPU Intel/AMD attraverso VA-API, Quick Sync o OpenCL non è supportata per l'inferenza AI al momento.

Vedi [Immagine Docker](./docker-tags) per la configurazione GPU, esempi di Docker Compose e il pinning delle versioni.


<!-- korean-ocr-contract:start -->
::: info Compatibilità OCR per il coreano
OCR veloce supporta `auto`, `en`, `de`, `es`, `fr`, `zh` e `ja`, ma non il coreano (`ko`). Il coreano richiede il pacchetto OCR accurato e `balanced` o `best`. Il pacchetto funziona nei container Linux amd64 e arm64 ufficiali, inclusi gli host NVIDIA, dove l’OCR resta sulla CPU. I sistemi non supportati ricevono un errore di compatibilità esplicito e non passano mai silenziosamente a `fast`. Il coreano con `fast` o con l’alias legacy `tesseract` viene rifiutato prima dell’accodamento con `FEATURE_INCOMPATIBLE` e `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
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

L'app è quindi disponibile all'indirizzo `http://localhost:1349`.

> **Limiti di velocità di Docker Hub?** Sostituisci `snapotter/snapotter:latest` con `ghcr.io/snapotter-hq/snapotter:latest` per effettuare il pull da GitHub Container Registry. Entrambi i registry ricevono la stessa immagine a ogni rilascio.

## Avvio rapido (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Per l'accelerazione NVIDIA CUDA sugli strumenti AI supportati (rimozione dello sfondo, upscaling, miglioramento del volto):

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

Controlla il rilevamento di CUDA nei log:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Requisiti hardware {#hardware-requirements}

Questi valori provengono da benchmark eseguiti su una gamma di sistemi, da una moderna workstation amd64 con una NVIDIA RTX 4070 fino a un Raspberry Pi, eseguendo l'intero catalogo di strumenti su ciascuno e variando i limiti di risorse Docker per trovare il vero limite minimo.

Ti trovi all'estremità bassa di questi livelli (un Pi, un vecchio laptop, un VPS da 2 GB)? [Configurazioni a basse risorse](/it/guide/low-resource) trasforma questi numeri in una guida concreta con tetti già calibrati.

### Riferimento rapido {#quick-reference}

| Livello | Caso d'uso | CPU | RAM | GPU | Archiviazione |
|------|----------|-----|-----|-----|---------|
| Minimo | Strumenti per immagini, file e PDF leggeri; utente singolo; batch piccoli | 2 core | 2 GB | Nessuna | ~7 GB |
| Consigliato | Tutte e cinque le modalità incl. video, PDF e AI su CPU; batch; alcuni utenti | 4 core | 4 GB | Nessuna | ~25 GB |
| Completo | Tutto a piena velocità incl. AI su GPU; batch grandi; molti utenti | 6-8 core | 8 GB | NVIDIA 8 GB+ VRAM (12 GB comodo) | ~35 GB |

**Architettura: solo a 64 bit** (`linux/amd64` o `linux/arm64`). SnapOtter gira in modo nativo su server Intel/AMD, Mac con Apple Silicon e schede ARM a 64 bit, tra cui il **Raspberry Pi 4 e 5** (4-8 GB). **Non** gira su ARM a 32 bit (`armv7`/`armhf`), poiché non viene creata alcuna immagine per esso, né su schede della classe 512 MB come il Pi Zero, che sono al di sotto della soglia minima di memoria (vedi sotto).

### Minimo (strumenti per immagini, file e PDF leggeri; senza AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Risorsa | Requisito |
|---|---|
| CPU | 2 core |
| RAM | 2 GB |
| Disco | ~5,5 GB (immagine) + volume dati |
| GPU | Non richiesta |

Tutti i 222 strumenti del catalogo non-AI, immagine (ridimensiona, ritaglia, converti, comprimi, regola, filigrana), video (taglia, silenzia, remux), audio (converti, normalizza, taglia), PDF (unisci, dividi, comprimi, ruota, proteggi), conversioni di file e preset di conversione dedicati, girano su hardware modesto. La maggior parte delle operazioni si completa in molto meno di un secondo anche su un file di grandi dimensioni: un'immagine da 2,7 MB viene ridimensionata in ~0,05 s e ricodificata in WebP in ~2 s.

La soglia minima di memoria è reale, da una variazione dei limiti di risorse Docker: **512 MB non riescono ad avviare lo stack** (anche un singolo ridimensionamento di immagine viene terminato), **1 GB** gestisce operazioni su file singoli ma un batch multi-file esaurisce la memoria, e **2 GB / 2 core** è la configurazione più piccola che gestisce i batch comodamente.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**L'unica eccezione che richiede molta CPU è la ricodifica video.** Le operazioni di stream-copy (taglio, silenziamento, remux del container) sono istantanee, ma la transcodifica in un codec diverso è vincolata alla CPU. Una clip 1080p / 45 secondi ricodificata in VP9 (WebM) richiede all'incirca **~40 s** su una CPU moderna veloce, ~45 s su Apple Silicon, ~80 s su una CPU mobile a 4 core più vecchia e **~130 s** su un server a 4 core più vecchio. Se il tuo carico di lavoro è ricco di video, dai priorità ai core della CPU e alla frequenza di clock, oppure aumenta il limite `cpus:` del container: il compose fornito limita l'app a 4 core per impostazione predefinita (8 sul compose GPU).

### Consigliato (strumenti AI su CPU) {#recommended-ai-tools-on-cpu}

| Risorsa | Requisito |
|---|---|
| CPU | 4 core |
| RAM | 4 GB |
| Disk | 3 GB (immagine) + circa 20 GB (tutti i pacchetti AI opzionali) + spazio di lavoro |
| GPU | Non richiesta (fallback su CPU) |

**L'installazione e l'esecuzione dei bundle AI più grandi è ciò che spinge la raccomandazione a 4 GB di RAM.** Senza pacchetti opzionali installati, l'app rimane inattiva a circa 360 MB. Gli strumenti Python legacy condividono uno sidecar, mentre lo OCR accurato utilizza uno dispatcher dedicato di lunga durata fissato alla generazione immutabile attiva. Prima dell'attivazione, l'installatore esegue un smoke test sul candidato. Quindi passa atomicamente al nuovo dispatcher e drena il precedente dispatcher prima di garbage collection. Ogni artefatto OCR accurato ufficiale deve superare il suo caso peggiore release suite all'interno di un GiB cgroup da 4, mentre la raccomandazione host da 4 GB lascia spazio per l'applicazione Node.js, Postgres, Redis, code e lavoro simultaneo.

La maggior parte degli strumenti AI è perfettamente utilizzabile su CPU; un paio vogliono davvero una GPU. Misurato su una moderna CPU a 4 core:

| Strumento AI | Tempo su CPU | Utilizzabile su CPU? |
|---|---|---|
| Rilevamento volti (blur-faces, smart-crop, red-eye), rimozione del rumore | meno di 1 s | Sì |
| OCR, trascrizione, sottotitoli | 1-3 s | Sì |
| Colorizzazione, miglioramento dei volti | ~10 s | Sì |
| Rimozione / sostituzione / sfocatura dello sfondo | ~29 s | Sì (dovrai aspettare) |
| Upscaling AI (RealESRGAN) | ~33 s piccole; minuti su immagini grandi | Marginale, GPU fortemente consigliata |
| Restauro foto (pipeline completa) | diversi minuti | No, richiede una GPU o una CPU veloce con molti core |

SnapOtter volutamente non integra questi download di modelli nell'immagine Docker. I bundle AI vengono scaricati solo quando un amministratore abilita lo strumento correlato, memorizzati nel volume persistente `/data/ai` e condivisi da ogni strumento che dipende dallo stesso stack di modelli. Questo mantiene piccola l'immagine finale del container pur consentendo a un'installazione AI completa di raggiungere i valori di archiviazione più elevati indicati sotto.

Alcuni strumenti dipendono da più di un bundle condiviso. Ad esempio, Foto Tessera necessita sia di `background-removal` sia di `face-detection`; se `background-removal` è già installato, abilitare Foto Tessera scarica solo il bundle `face-detection` mancante. Lo stesso riutilizzo si applica a tutti gli strumenti AI.

Stime facoltative di stoccaggio dei pacchetti AI:

| Bundle | Dimensione su disco |
|---|---|
| Rimozione dello sfondo | 4-5 GB |
| Upscaling + Miglioramento volti + Rimozione rumore | 5-6 GB |
| Rilevamento volti | 200-300 MB |
| Gomma per oggetti + Colorizzazione | 1-2 GB |
| OCR preciso (`balanced`/`best`) | ~208-234 MiB scaricato / ~409-488 MiB installato |
| Restauro foto | 4-5 GB |
| Trascrizione | ~600 MB |
| **Tutti i pacchetti** | **~20 GB installati** |

OCR veloce è integrato nell'immagine tramite Tesseract, aggiunge circa 25 MiB e non richiede il pacchetto OCR opzionale o i suoi 4 requisiti di memoria GiB. Il pacchetto accurato è disponibile nei contenitori ufficiali Linux amd64 e arm64 ed esegue ONNX Runtime su CPU. Gli host NVIDIA utilizzano lo stesso runtime CPU OCR, quindi OCR non dipende dalla versione CUDA o dall'architettura GPU. Il runtime accurato richiede almeno 4 GiB di memoria effettiva: il limite cgroup del contenitore configurato, altrimenti memoria host. SnapOtter rifiuta i sistemi al di sotto del minimo di compatibilità firmato prima di scaricare il pacchetto. L'installazione accurata del pacchetto viene rifiutata anche su bare-metal/archivi precostruiti i cui libc e Python ABI non possono essere garantiti.

Le repliche che condividono lo stesso `DATA_DIR` devono usare la stessa architettura CPU; vincola i deployment con più repliche a nodi compatibili tramite la node affinity. Le repliche miste amd64/arm64 richiedono volumi di dati separati e deployment SnapOtter indipendenti.

Il runtime accurato mantiene una generazione attiva e svuota la cache di download dopo l'attivazione. Per questa versione, una prima installazione richiede temporaneamente circa 620-720 MiB per l'archivio più lo staging, e un aggiornamento può raggiungere un picco vicino a 1.2 GiB mentre la vecchia generazione rimane attiva. Il programma di installazione calcola i requisiti esatti dall'indice firmato e dalle generazioni attuali prima del download o dell'estrazione e fallisce anticipatamente se il volume dei dati è troppo piccolo.

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
| CPU | 6-8 core (la preparazione video + la concorrenza girano su CPU anche con AI su GPU) |
| RAM | 8 GB |
| GPU | NVIDIA con 8+ GB di VRAM (12 GB consigliati) |
| Disco | ~35 GB totali |

Una GPU NVIDIA (CUDA) velocizza drasticamente i modelli AI pesanti. Misurato su una RTX 4070 rispetto a una CPU moderna:

| Strumento AI | Accelerazione con GPU | Note |
|---|---|---|
| Upscaling AI (RealESRGAN 2×) | **~47×** | Il guadagno maggiore, meno di un secondo contro ~33 s (minuti su immagini grandi) |
| Miglioramento dei volti (CodeFormer) | **~12×** | ~0,9 s contro ~11 s |
| Trascrizione (Whisper) | ~4,5× | |
| Rimozione / sostituzione / sfocatura dello sfondo | ~4× | ~7 s su GPU contro ~29 s su CPU |
| Colorizzazione | ~1,8× | |
| OCR, rilevamento volti, occhi rossi, rimozione rumore | ~1× | Già veloce su CPU, una GPU non aiuta |
| Restauro foto | nessuna | Vincolato alla CPU anche su una GPU (0% di utilizzo GPU); qui conta più una CPU veloce che una GPU |

Gli strumenti per cui vale la pena una GPU sono **upscaling, miglioramento dei volti, trascrizione e rimozione dello sfondo**. Rilevamento volti, OCR e occhi rossi sono vincolati alla CPU e già veloci, quindi una GPU non aggiunge nulla.

L'utilizzo di picco della VRAM raggiunge 7,5 GB durante l'upscaling con miglioramento dei volti. Una GPU NVIDIA da 6 GB funziona per la maggior parte degli strumenti AI presi singolarmente, ma fallirà con l'upscaling. Con 8-12 GB di VRAM si gestisce tutto.

L'accelerazione tramite iGPU Intel/AMD attraverso VA-API, Quick Sync o OpenCL non è supportata per l'inferenza AI al momento. Mappare `/dev/dri` nel container non abilita l'accelerazione GPU dell'AI; SnapOtter eseguirà gli strumenti AI su CPU a meno che non sia disponibile NVIDIA CUDA.

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

Richieste di ridimensionamento immagine in parallelo contro il container app limitato a 4 core per impostazione predefinita:

| Richieste concorrenti | Tempo medio di risposta | Errori |
|---|---|---|
| 1 | 0,4s | 0 |
| 5 | 1,2s | 0 |
| 10 | 2,1s | 0 |

Il tempo di risposta degrada in modo sub-lineare senza errori man mano che il pool di worker si satura. Aumentare il limite `cpus:` del container app (o usare un host con più core) alza il tetto massimo. Nota che i job pesanti (transcodifica video, AI su CPU) occupano un worker per l'intera durata, quindi dimensiona la CPU in base al numero previsto di job pesanti concorrenti, non solo al numero di richieste.

### Formati immagine supportati {#supported-image-formats}

SnapOtter supporta **55+ formati di input** e **14 formati di output**, inclusi file RAW da 20+ marchi di fotocamere, formati professionali (PSD, EPS, OpenEXR, HDR), codec moderni (JPEG XL, AVIF, HEIC, QOI) e formati scientifici/di gioco (FITS, DDS).

Vedi l'[elenco completo dei formati](/it/guide/supported-formats) per i dettagli su ogni formato supportato, il decoder usato e i controlli di qualità disponibili.

### Limitazioni note {#known-limitations}

- **Il ridimensionamento content-aware** si blocca su immagini grandi (>5 MP) a causa di una limitazione nel binario caire. Funziona bene con immagini più piccole.
- **La decodifica HEIF** richiede 13-23 secondi. HEIC (la variante di Apple) è molto più veloce, tra 0,3 e 0,9 secondi.
- **L'upscaling** va in timeout su CPU per qualsiasi cosa oltre le immagini piccole. GPU richiesta per un uso pratico.
- **Il miglioramento dei volti CodeFormer** è significativamente più lento di GFPGAN (53s contro 2s su GPU). GFPGAN è consigliato per la maggior parte dei casi d'uso.

## Volumi {#volumes}

| Mount / Volume | Scopo | Richiesto? |
|---|---|---|
| `/data` (app) | Modelli AI, venv Python, file utente | **Sì**, perdita di file senza |
| `/tmp/workspace` (app) | File di elaborazione temporanei (puliti automaticamente) | Consigliato |
| `SnapOtter-pgdata` (postgres) | Directory dei dati di PostgreSQL (utenti, impostazioni, pipeline, job) | **Sì**, perdita di dati senza |
| `SnapOtter-redisdata` (redis) | File append-only di Redis per code di job durevoli | Consigliato |

### Bind mount contro volumi con nome {#bind-mounts-vs-named-volumes}

**Volumi con nome** (consigliati), Docker gestisce automaticamente i permessi:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mount**, gestisci tu i permessi. Imposta `PUID`/`PGID` per corrispondere all'utente del tuo host:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Permessi di archiviazione {#storage-permissions}

SnapOtter scrive in due posizioni durante l'esecuzione: `/data` (file utente, log, modelli AI e il venv Python) e `/tmp/workspace` (area temporanea di elaborazione). Entrambe devono essere scrivibili dall'utente con cui gira il container. Se una delle due non lo è, il container **fallisce subito all'avvio** con un messaggio che indica la directory, l'UID/GID in esecuzione e come risolvere, invece di avviarsi \"integro\" e poi fallire al primo upload con un errore criptico.

Il modo in cui vengono gestiti i permessi dipende da come viene avviato il container:

**Predefinito (parte come root, scende a `snapotter`)**, l'entrypoint parte come root, corregge la proprietà dei volumi montati, poi scende all'utente non privilegiato `snapotter` tramite `gosu`. I volumi con nome funzionano senza alcuna configurazione. Per i bind mount, imposta `PUID`/`PGID` sul tuo utente host (sopra) in modo che i file che scrive siano di tua proprietà.

**Kubernetes / OpenShift (non-root tramite `runAsUser`)**, avviato direttamente come utente non-root, il container non può fare il chown dei volumi da solo, quindi l'orchestratore deve renderli scrivibili. Imposta `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Le directory scrivibili dell'immagine sono di proprietà del gruppo GID 0 e scrivibili dal gruppo, quindi un pod in esecuzione con un **UID arbitrario** più il gruppo supplementare root (l'impostazione predefinita di OpenShift) può scrivere senza alcun `chown`.

**TrueNAS Scale (e altre configurazioni con \"UID estraneo\")**, TrueNAS esegue le app come utente non-root (spesso `568:568`) e monta dataset host di proprietà di un utente diverso, quindi né l'entrypoint né `fsGroup` li rendono scrivibili da soli. Scegli una delle opzioni:

- **Esegui l'app come root** (consigliato), lascia l'utente dell'app non impostato oppure impostalo su `0`, e lascia che l'entrypoint predefinito corregga i permessi e scenda a `snapotter`.
- **Esegui come UID `999`**, imposta l'utente/gruppo dell'app su `999:999` (l'utente `snapotter` integrato in SnapOtter) in modo che corrisponda alla proprietà dell'immagine.
- **`chown` il dataset host** sull'UID con cui gira il container, dalla shell di TrueNAS:

  ```bash
  # Usa l'UID dall'errore di avvio (oppure esegui `id` dentro il container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

L'errore di avvio indica l'UID esatto da usare, quindi il percorso più rapido è avviare l'app una volta, leggere il messaggio, poi `chown` (o modificare l'utente) di conseguenza.

## Variabili d'ambiente {#environment-variables}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `AUTH_ENABLED` | `true` | Abilita/disabilita il requisito di login |
| `DEFAULT_USERNAME` | `admin` | Nome utente admin iniziale |
| `DEFAULT_PASSWORD` | `admin` | Password admin iniziale (cambio forzato al primo login) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Limite di upload per file |
| `MAX_BATCH_SIZE` | `100` | Numero massimo di file per richiesta batch |
| `RATE_LIMIT_PER_MIN` | `1000` | Richieste API al minuto per IP (imposta 0 per disabilitare) |
| `MAX_USERS` | `0` (illimitato) | Numero massimo di account utente |
| `TRUST_PROXY` | `true` | Fidati degli header X-Forwarded-For dal reverse proxy |
| `PUID` | `999` | Esegui con questo UID (per i permessi dei bind mount) |
| `PGID` | `999` | Esegui con questo GID (per i permessi dei bind mount) |
| `LOG_LEVEL` | `info` | Verbosità dei log: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Numero massimo di job di elaborazione AI in parallelo |
| `SESSION_DURATION_HOURS` | `168` | Durata della sessione di login (7 giorni) |
| `CORS_ORIGIN` | (vuoto) | Origini consentite separate da virgola, oppure vuoto per la stessa origine |

### Proxy in uscita e CA privata {#outbound-proxy-and-private-ca}

Il contenitore ufficiale abilita il supporto proxy dell'ambiente di Node. Se SnapOtter deve raggiungere il repository di runtime OCR o altri servizi HTTPS tramite un proxy aziendale, impostare `HTTPS_PROXY` (e `HTTP_PROXY` quando necessario). Imposta `NO_PROXY` su un elenco separato da virgole di host che devono essere raggiunti direttamente, come Postgres, Redis e archiviazione di oggetti interni.

Se il proxy o un servizio interno è firmato da un'autorità di certificazione privata, montare il certificato CA in sola lettura e puntarvi `NODE_EXTRA_CA_CERTS`. Il file deve esistere all'avvio del processo Node:

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

Conserva le credenziali proxy all'esterno del file Compose (ad esempio in un file `.env` protetto o segreto). Non disabilitare la verifica TLS: l'indice OCR firmato autentica i metadati della release, mentre la normale validazione TLS protegge comunque il trasporto e ogni altra richiesta in uscita.

## Controllo di integrità {#health-check}

Il container include un controllo di integrità integrato:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse Proxy {#reverse-proxy}

SnapOtter imposta `TRUST_PROXY=true` per impostazione predefinita, così il rate limiting e il logging usano l'IP reale del client dagli header `X-Forwarded-For`.

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

1. Aggiungi un nuovo Proxy Host
2. Imposta Domain Name sul tuo dominio
3. Imposta Scheme su `http`, Forward Hostname su `SnapOtter` (o l'IP del tuo container), Forward Port su `1349`
4. Abilita il supporto WebSocket
5. In Advanced, aggiungi: `client_max_body_size 500M;` e `proxy_buffering off;`

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

`flush_interval -1` disabilita il buffering delle risposte, che è richiesto per gli eventi di avanzamento SSE (elaborazione batch, strumenti AI, installazioni di funzionalità). I timeout estesi permettono agli upload di file grandi di completarsi senza che Caddy chiuda la connessione in anticipo.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Nota: Cloudflare ha un limite di upload di 100 MB sui piani gratuiti. Imposta `MAX_UPLOAD_SIZE_MB=100` per corrispondere.

## CI/CD {#ci-cd}

Il repository GitHub ha tre workflow:

- **ci.yml**, viene eseguito automaticamente a ogni push e PR. Esegue lint, typecheck, test, build e valida l'immagine Docker (senza fare il push).
- **release.yml**, attivato manualmente tramite `workflow_dispatch`. Esegue semantic-release per creare un tag di versione e una release GitHub, poi costruisce un'immagine Docker multi-arch (amd64 + arm64) e fa il push su Docker Hub (`snapotter/snapotter`) e GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml**, costruisce questo sito di documentazione e lo distribuisce su Cloudflare Pages al push su `main`.

Per creare una release, vai su **Actions > Release > Run workflow** nell'interfaccia GitHub, oppure esegui:

```bash
gh workflow run release.yml
```

Semantic-release determina la versione dalla cronologia dei commit. Il tag Docker `latest` punta sempre alla release più recente.

## Analytics {#analytics}

SnapOtter include analytics di prodotto anonime (schemi di utilizzo degli strumenti, segnalazioni di errore) per aiutare a individuare i bug e migliorare le funzionalità. È attivo per impostazione predefinita. I tuoi file, i nomi dei file e i dati personali non ne fanno mai parte. SnapOtter funziona normalmente con le analytics disabilitate.

### Disabilitare le analytics {#disabling-analytics}

La disattivazione a runtime è un interruttore admin con un solo clic. Apri Impostazioni > Sistema > Privacy e disattiva Anonymous Product Analytics. Si ferma immediatamente per l'intera istanza, senza bisogno di ricostruzione.

Per un'immagine che non può mai emettere analytics, imposta la disattivazione definitiva al momento della build clonando il repository e ricostruendo:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Oppure aggiungi il build arg al tuo `docker-compose.yml` esistente:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
