---
description: "Distribuisci SnapOtter in produzione con Docker. Requisiti hardware, configurazione GPU e configurazioni di reverse proxy per Nginx, Traefik e Cloudflare."
i18n_source_hash: ecc1b528bc4b
i18n_provenance: machine
i18n_output_hash: 80551aa6df89
---

# Distribuzione {#deployment}

SnapOtter si distribuisce come stack Docker Compose a 3 container: l'immagine dell'app SnapOtter, PostgreSQL 17 e Redis 8. L'immagine dell'app supporta **linux/amd64** (con NVIDIA CUDA per l'accelerazione AI) e **linux/arm64** (CPU), quindi funziona nativamente su server Intel/AMD, Mac Apple Silicon e dispositivi ARM come il Raspberry Pi 4/5. L'accelerazione iGPU Intel/AMD tramite VA-API, Quick Sync o OpenCL non è attualmente supportata per l'inferenza AI.

Vedi [Immagine Docker](./docker-tags) per la configurazione della GPU, esempi di Docker Compose e il pinning delle versioni.

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

> **Limiti di rate di Docker Hub?** Sostituisci `snapotter/snapotter:latest` con `ghcr.io/snapotter-hq/snapotter:latest` per effettuare il pull dal GitHub Container Registry. Entrambi i registry ricevono la stessa immagine a ogni release.

## Avvio rapido (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Per l'accelerazione NVIDIA CUDA sugli strumenti AI (rimozione dello sfondo, upscaling, miglioramento del volto, OCR):

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

Verifica il rilevamento di CUDA nei log:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Requisiti hardware {#hardware-requirements}

Questi numeri provengono da benchmark eseguiti su una serie di sistemi, da una moderna workstation amd64 con una NVIDIA RTX 4070 fino a un Raspberry Pi, eseguendo l'intero catalogo di strumenti su ciascuno e variando i limiti di risorse di Docker per individuare il limite reale.

### Riferimento rapido {#quick-reference}

| Livello | Caso d'uso | CPU | RAM | GPU | Archiviazione |
|------|----------|-----|-----|-----|---------|
| Minimo | Strumenti per immagini, file e PDF leggeri; utente singolo; batch piccoli | 2 core | 2 GB | Nessuna | ~7 GB |
| Consigliato | Tutte e cinque le modalità inclusi video, PDF e AI su CPU; batch; alcuni utenti | 4 core | 4 GB | Nessuna | ~25 GB |
| Completo | Tutto a velocità piena inclusa AI su GPU; batch grandi; molti utenti | 6-8 core | 8 GB | NVIDIA 8 GB+ di VRAM (12 GB comodi) | ~35 GB |

**Architettura: solo a 64 bit** (`linux/amd64` o `linux/arm64`). SnapOtter funziona nativamente su server Intel/AMD, Mac Apple Silicon e schede ARM a 64 bit inclusi il **Raspberry Pi 4 e 5** (4-8 GB). **Non** funziona su ARM a 32 bit (`armv7`/`armhf`) — non viene compilata alcuna immagine per esso — né su schede da 512 MB come il Pi Zero, che sono al di sotto del limite di memoria (vedi sotto).

### Minimo (strumenti per immagini, file e PDF leggeri; senza AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Risorsa | Requisito |
|---|---|
| CPU | 2 core |
| RAM | 2 GB |
| Disco | ~5.5 GB (immagine) + volume dati |
| GPU | Non richiesta |

Tutti i 222 strumenti del catalogo non-AI - immagine (ridimensiona, ritaglia, converti, comprimi, regola, filigrana), video (taglia, disattiva audio, remux), audio (converti, normalizza, taglia), PDF (unisci, dividi, comprimi, ruota, proteggi), conversioni di file e preset di conversione dedicati - funzionano su hardware modesto. La maggior parte delle operazioni si completa in ben meno di un secondo anche su un file grande: un'immagine da 2.7 MB viene ridimensionata in ~0.05 s e ricodificata in WebP in ~2 s.

Il limite di memoria è concreto, da uno sweep dei limiti di risorse di Docker: **512 MB non riescono ad avviare lo stack** (persino un singolo ridimensionamento di immagine viene terminato), **1 GB** gestisce le operazioni su file singoli ma un batch multi-file esaurisce la memoria, e **2 GB / 2 core** è la configurazione più piccola che gestisce comodamente i batch.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**L'unica eccezione a uso intensivo di CPU è la ricodifica video.** Le operazioni di stream-copy (taglio, disattivazione audio, remux del container) sono istantanee, ma la transcodifica in un codec diverso è vincolata dalla CPU. Una clip 1080p / 45 secondi ricodificata in VP9 (WebM) richiede circa **~40 s** su una CPU moderna veloce, ~45 s su Apple Silicon, ~80 s su una vecchia CPU mobile a 4 core e **~130 s** su un vecchio server a 4 core. Se il tuo carico di lavoro è a uso intensivo di video, dai priorità ai core della CPU e alla frequenza di clock, oppure aumenta il limite `cpus:` del container: il compose fornito limita l'app a 4 core per impostazione predefinita (8 sul compose GPU).

### Consigliato (strumenti AI su CPU) {#recommended-ai-tools-on-cpu}

| Risorsa | Requisito |
|---|---|
| CPU | 4 core |
| RAM | 4 GB |
| Disco | 3 GB (immagine) + 24 GB (modelli AI) + workspace |
| GPU | Non richiesta (fallback su CPU) |

**L'installazione dei bundle AI è ciò che porta la RAM a 4 GB.** Senza AI installata l'app resta inattiva intorno ai 360 MB; con tutti e sette i bundle installati mantiene ~2.6 GB residenti, perché il sidecar AI Python precarica i suoi modelli (rimozione dello sfondo, upscaling, OCR, trascrizione, rilevamento del volto, ripristino) all'avvio. Le installazioni non-AI restano leggere; le installazioni AI richiedono ≥4 GB.

La maggior parte degli strumenti AI è perfettamente utilizzabile su CPU; un paio richiedono davvero una GPU. Misurato su una moderna CPU a 4 core:

| Strumento AI | Tempo su CPU | Utilizzabile su CPU? |
|---|---|---|
| Rilevamento del volto (sfoca-volti, ritaglio intelligente, occhi rossi), rimozione del rumore | meno di 1 s | Sì |
| OCR, trascrizione, sottotitoli | 1-3 s | Sì |
| Colorazione, miglioramento del volto | ~10 s | Sì |
| Rimozione / sostituzione / sfocatura dello sfondo | ~29 s | Sì (dovrai attendere) |
| Upscaling AI (RealESRGAN) | ~33 s per immagini piccole; minuti su immagini grandi | Marginale — GPU fortemente consigliata |
| Ripristino foto (pipeline completa) | diversi minuti | No — richiede una GPU o una CPU veloce con molti core |

Dimensioni di download dei modelli AI:

| Bundle | Dimensione su disco |
|---|---|
| Rimozione dello sfondo | 4-5 GB |
| Upscaling + miglioramento del volto + rimozione del rumore | 5-6 GB |
| Rilevamento del volto | 200-300 MB |
| Cancellazione oggetti + colorazione | 1-2 GB |
| OCR | 5-6 GB |
| Ripristino foto | 4-5 GB |
| **Tutti i bundle** | **~24 GB** |

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

Una GPU NVIDIA (CUDA) accelera drasticamente i modelli AI più pesanti. Misurato su una RTX 4070 rispetto a una CPU moderna:

| Strumento AI | Accelerazione con GPU | Note |
|---|---|---|
| Upscaling AI (RealESRGAN 2×) | **~47×** | Il guadagno maggiore — meno di un secondo contro ~33 s (minuti su immagini grandi) |
| Miglioramento del volto (CodeFormer) | **~12×** | ~0.9 s contro ~11 s |
| Trascrizione (Whisper) | ~4.5× | |
| Rimozione / sostituzione / sfocatura dello sfondo | ~4× | ~7 s su GPU contro ~29 s su CPU |
| Colorazione | ~1.8× | |
| OCR, rilevamento del volto, occhi rossi, rimozione del rumore | ~1× | Già veloci su CPU — una GPU non aiuta |
| Ripristino foto | nessuna | Vincolato dalla CPU anche su una GPU (0% di utilizzo GPU); qui una CPU veloce conta più di una GPU |

Gli strumenti per cui vale la pena avere una GPU sono **upscaling, miglioramento del volto, trascrizione e rimozione dello sfondo**. Rilevamento del volto, OCR e occhi rossi sono vincolati dalla CPU e già veloci, quindi una GPU non aggiunge nulla.

L'uso di picco della VRAM raggiunge 7.5 GB durante l'upscaling con miglioramento del volto. Una GPU NVIDIA da 6 GB funziona per la maggior parte degli strumenti AI singolarmente ma fallirà sull'upscaling. 8-12 GB di VRAM gestiscono tutto.

L'accelerazione iGPU Intel/AMD tramite VA-API, Quick Sync o OpenCL non è attualmente supportata per l'inferenza AI. Il mapping di `/dev/dri` nel container non abilita l'accelerazione GPU per l'AI; SnapOtter eseguirà gli strumenti AI su CPU a meno che NVIDIA CUDA non sia disponibile.

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

Richieste parallele di ridimensionamento di immagini contro il container dell'app limitato ai 4 core predefiniti:

| Richieste concorrenti | Tempo di risposta medio | Errori |
|---|---|---|
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

Il tempo di risposta degrada in modo sub-lineare senza errori man mano che il pool di worker si satura. Aumentare il limite `cpus:` del container dell'app (o usare un host con più core) alza il tetto. Nota che i job pesanti (transcodifica video, AI su CPU) occupano un worker per tutta la loro durata, quindi dimensiona la CPU in base al numero previsto di job pesanti concorrenti, non solo al conteggio delle richieste.

### Formati di immagine supportati {#supported-image-formats}

SnapOtter supporta **55+ formati di input** e **14 formati di output**, inclusi file RAW da 20+ marche di fotocamere, formati professionali (PSD, EPS, OpenEXR, HDR), codec moderni (JPEG XL, AVIF, HEIC, QOI) e formati scientifici/di gioco (FITS, DDS).

Vedi l'[elenco completo dei formati](/it/guide/supported-formats) per i dettagli su ogni formato supportato, il decoder utilizzato e i controlli di qualità disponibili.

### Limitazioni note {#known-limitations}

- **Il ridimensionamento content-aware** si blocca su immagini grandi (>5 MP) a causa di una limitazione nel binario caire. Funziona bene con immagini più piccole.
- **La decodifica HEIF** richiede 13-23 secondi. HEIC (la variante di Apple) è molto più veloce, con 0.3-0.9 secondi.
- **L'OCR giapponese** fallisce su CPU a causa di un bug MKLDNN di PaddlePaddle. Funziona su GPU.
- **L'upscaling** va in timeout su CPU per qualsiasi immagine oltre le piccole. GPU richiesta per un uso pratico.
- **Il miglioramento del volto CodeFormer** è significativamente più lento di GFPGAN (53s contro 2s su GPU). GFPGAN è consigliato per la maggior parte dei casi d'uso.

## Volumi {#volumes}

| Mount / Volume | Scopo | Richiesto? |
|---|---|---|
| `/data` (app) | Modelli AI, venv Python, file utente | **Sì** - perdita di file senza di esso |
| `/tmp/workspace` (app) | File di elaborazione temporanei (puliti automaticamente) | Consigliato |
| `SnapOtter-pgdata` (postgres) | Directory dati di PostgreSQL (utenti, impostazioni, pipeline, job) | **Sì** - perdita di dati senza di esso |
| `SnapOtter-redisdata` (redis) | File append-only di Redis per code di job durevoli | Consigliato |

### Bind mount vs. volumi denominati {#bind-mounts-vs-named-volumes}

**Volumi denominati** (consigliati) — Docker gestisce i permessi automaticamente:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mount** — Gestisci tu i permessi. Imposta `PUID`/`PGID` in modo che corrispondano al tuo utente host:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Permessi di archiviazione {#storage-permissions}

SnapOtter scrive in due posizioni a runtime: `/data` (file utente, log, modelli AI e il venv Python) e `/tmp/workspace` (scratch di elaborazione temporaneo). Entrambe devono essere scrivibili dall'utente con cui gira il container. Se una delle due non lo è, il container **fallisce immediatamente all'avvio** con un messaggio che nomina la directory, l'UID/GID in esecuzione e come risolvere — invece di avviarsi come "integro" e poi fallire al primo caricamento con un errore criptico.

Come vengono gestiti i permessi dipende da come viene avviato il container:

**Predefinito (parte come root, passa a `snapotter`)** — l'entrypoint parte come root, corregge la proprietà dei volumi montati, poi passa all'utente non privilegiato `snapotter` tramite `gosu`. I volumi denominati funzionano senza configurazione. Per i bind mount, imposta `PUID`/`PGID` sul tuo utente host (sopra) così i file che scrive sono di tua proprietà.

**Kubernetes / OpenShift (non-root tramite `runAsUser`)** — avviato direttamente come utente non-root, il container non può fare chown dei volumi da solo, quindi l'orchestratore deve renderli scrivibili. Imposta `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Le directory scrivibili dell'immagine appartengono al gruppo GID 0 e sono scrivibili dal gruppo, quindi un pod in esecuzione con un **UID arbitrario** più il gruppo supplementare root (l'impostazione predefinita di OpenShift) può scrivere senza alcun `chown`.

**TrueNAS Scale (e altre configurazioni con "UID estraneo")** — TrueNAS esegue le app come utente non-root (spesso `568:568`) e monta dataset host di proprietà di un utente diverso, quindi né l'entrypoint né `fsGroup` li rendono scrivibili da soli. Scegli una delle opzioni:

- **Esegui l'app come root** (consigliato) — lascia l'utente dell'app non impostato oppure impostalo su `0`, e lascia che l'entrypoint predefinito corregga i permessi e passi a `snapotter`.
- **Esegui come UID `999`** — imposta l'utente/gruppo dell'app su `999:999` (l'utente integrato `snapotter` di SnapOtter) così corrisponde alla proprietà dell'immagine.
- **`chown` il dataset host** all'UID con cui gira il container, dalla shell di TrueNAS:

  ```bash
  # Usa l'UID dall'errore di avvio (o esegui `id` dentro il container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

L'errore di avvio nomina l'UID esatto da usare, quindi il percorso più rapido è avviare l'app una volta, leggere il messaggio, poi `chown` (o regolare l'utente) di conseguenza.

## Variabili d'ambiente {#environment-variables}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `AUTH_ENABLED` | `true` | Abilita/disabilita l'obbligo di login |
| `DEFAULT_USERNAME` | `admin` | Nome utente amministratore iniziale |
| `DEFAULT_PASSWORD` | `admin` | Password amministratore iniziale (cambio forzato al primo login) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Limite di caricamento per file |
| `MAX_BATCH_SIZE` | `100` | Numero massimo di file per richiesta batch |
| `RATE_LIMIT_PER_MIN` | `1000` | Richieste API al minuto per IP (imposta 0 per disabilitare) |
| `MAX_USERS` | `0` (illimitato) | Numero massimo di account utente |
| `TRUST_PROXY` | `true` | Fidati degli header X-Forwarded-For dal reverse proxy |
| `PUID` | `999` | Esegui come questo UID (per i permessi dei bind mount) |
| `PGID` | `999` | Esegui come questo GID (per i permessi dei bind mount) |
| `LOG_LEVEL` | `info` | Verbosità del log: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Numero massimo di job di elaborazione AI paralleli |
| `SESSION_DURATION_HOURS` | `168` | Durata della sessione di login (7 giorni) |
| `CORS_ORIGIN` | (vuoto) | Origini consentite separate da virgola, o vuoto per same-origin |

## Health check {#health-check}

Il container include un health check integrato:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse proxy {#reverse-proxy}

SnapOtter imposta `TRUST_PROXY=true` per impostazione predefinita così il rate limiting e il logging usano l'IP reale del client dagli header `X-Forwarded-For`.

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
2. Imposta il Domain Name sul tuo dominio
3. Imposta lo Scheme su `http`, il Forward Hostname su `SnapOtter` (o l'IP del tuo container), la Forward Port su `1349`
4. Abilita il supporto WebSocket
5. Sotto Advanced, aggiungi: `client_max_body_size 500M;` e `proxy_buffering off;`

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

`flush_interval -1` disabilita il buffering delle risposte, necessario per gli eventi di avanzamento SSE (elaborazione batch, strumenti AI, installazioni di funzionalità). I timeout estesi consentono il completamento del caricamento di file grandi senza che Caddy chiuda la connessione prematuramente.

### Cloudflare Tunnel {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Nota: Cloudflare ha un limite di caricamento di 100 MB sui piani gratuiti. Imposta `MAX_UPLOAD_SIZE_MB=100` di conseguenza.

## CI/CD {#ci-cd}

Il repository GitHub ha tre workflow:

- **ci.yml** - Viene eseguito automaticamente a ogni push e PR. Esegue lint, typecheck, test, build e valida l'immagine Docker (senza fare push).
- **release.yml** - Attivato manualmente tramite `workflow_dispatch`. Esegue semantic-release per creare un tag di versione e una release GitHub, poi compila un'immagine Docker multi-arch (amd64 + arm64) e la spinge su Docker Hub (`snapotter/snapotter`) e sul GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Compila questo sito di documentazione e lo distribuisce su Cloudflare Pages al push su `main`.

Per creare una release, vai su **Actions > Release > Run workflow** nell'interfaccia di GitHub, oppure esegui:

```bash
gh workflow run release.yml
```

Semantic-release determina la versione dalla cronologia dei commit. Il tag Docker `latest` punta sempre alla release più recente.

## Analytics {#analytics}

SnapOtter include analytics di prodotto anonime (pattern di utilizzo degli strumenti, segnalazioni di errore) per aiutare a individuare i bug e migliorare le funzionalità. È attiva per impostazione predefinita. I tuoi file, i nomi dei file e i dati personali non ne fanno mai parte. SnapOtter funziona normalmente con le analytics disabilitate.

### Disabilitare le analytics {#disabling-analytics}

L'opt-out a runtime è un interruttore per amministratori con un solo clic. Apri Impostazioni > Sistema > Privacy e disattiva Analytics anonime di prodotto. Si ferma immediatamente per l'intera istanza, senza ricompilazione.

Per un'immagine che non possa mai emettere analytics, imposta la disattivazione hard al momento della build clonando il repository e ricompilando:

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
