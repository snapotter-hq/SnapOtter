---
description: "Tag delle immagini Docker di SnapOtter, benchmark GPU, blocco delle versioni e supporto multipiattaforma per AMD64 e ARM64."
i18n_source_hash: a5871d76250c
i18n_provenance: machine
i18n_output_hash: ad12c20f9ac9
i18n_hash_version: 2
---

# Immagine Docker {#docker-image}

SnapOtter viene distribuito come una singola immagine Docker. Se la esegue da sola, avvia PostgreSQL 17 e Redis incorporati sull'interfaccia di loopback (modalità incorporata); in produzione, la esegua insieme a container PostgreSQL 17 e Redis 8 separati con Compose. L'immagine dell'app funziona su tutte le piattaforme.

## Avvio rapido {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Se `DATABASE_URL` non è impostato, viene eseguita in modalità incorporata: PostgreSQL e Redis si avviano all'interno del container su loopback, con tutti i dati sotto il volume `SnapOtter-data`. Imposti `DATABASE_URL` e `REDIS_URL` (come fa lo stack [Compose](#docker-compose)) per usare invece servizi esterni. Consulti [Configurazione](/it/guide/configuration#embedded-mode).

## Accelerazione NVIDIA CUDA {#nvidia-cuda-acceleration}

L'immagine include il supporto NVIDIA CUDA su amd64. Se dispone di una GPU NVIDIA con [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) installato, aggiunga `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

L'immagine rileva automaticamente CUDA in fase di esecuzione. Senza `--gpus all`, o quando CUDA non è disponibile, gli strumenti AI girano su CPU. La stessa immagine in entrambi i casi.

L'accelerazione iGPU Intel/AMD tramite VA-API, Quick Sync o OpenCL non è attualmente supportata per l'inferenza AI di SnapOtter. Mappare `/dev/dri` nel container può esporre il dispositivo di rendering, ma il runtime AI continuerà a usare la CPU a meno che CUDA non sia disponibile.

### Benchmark {#benchmarks}

Testato su una NVIDIA RTX 4070 (12 GB di VRAM) con un ritratto JPEG di 572x1024.

#### Prestazioni a caldo {#warm-performance}

| Strumento | CPU | GPU | Accelerazione |
|------|-----|-----|---------|
| Rimozione sfondo (u2net) | 2.415ms | 879ms | 2,7x |
| Rimozione sfondo (isnet) | 2.457ms | 1.137ms | 2,2x |
| Upscale 2x | 350ms | 309ms | 1,1x |
| Upscale 4x | 910ms | 310ms | 2,9x |
| Sfocatura volti | 139ms | 122ms | 1,1x |

#### Avvio a freddo (prima richiesta dopo l'avvio del container) {#cold-start-first-request-after-container-start}

| Strumento | CPU | GPU | Accelerazione |
|------|-----|-----|---------|
| Rimozione sfondo | 22.286ms | 4.792ms | 4,7x |
| Upscale 2x | 3.957ms | 2.318ms | 1,7x |

L'OCR non è incluso nel confronto CUDA. Sia il livello Tesseract integrato sia i livelli opzionali RapidOCR/ONNX usano la CPU, anche quando il container ha accesso alla GPU NVIDIA.

### Controllo dello stato di CUDA {#cuda-health-check}

Dopo la prima richiesta AI, l'endpoint di health per amministratori riporta lo stato della GPU CUDA:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

Lo stack Compose completo include l'app, PostgreSQL 17 e Redis 8. Consulti [Distribuzione](/it/guide/deployment) per il `docker-compose.yml` completo. Un esempio minimo:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      # Runtime role (rows only), then the boot-only owner connection.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    environment:
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

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

Per l'accelerazione NVIDIA CUDA tramite Docker Compose, aggiunga la sezione deploy al servizio SnapOtter:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Blocco delle versioni {#version-pinning}

| Tag | Descrizione |
|-----|------------|
| `latest` | Ultima release |
| `2.2.0` | Versione esatta |
| `2.2` | Ultima patch della 2.2.x |
| `2` | Ultima minor della 2.x |

## Piattaforme {#platforms}

| Architettura | Supporto GPU | Note |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Accelerazione CUDA completa per gli strumenti AI |
| linux/arm64 | Solo CPU | Raspberry Pi 4/5, Apple Silicon tramite Docker Desktop |

## Migrazione dai tag precedenti {#migration-from-previous-tags}

Se utilizzava il tag `:cuda`, passi a `:latest` e mantenga `--gpus all`. Stesso supporto GPU, immagine unificata.

I Suoi dati e le Sue impostazioni sono conservati nei volumi.
