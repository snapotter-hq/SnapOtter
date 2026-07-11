---
description: "Tag delle immagini Docker di SnapOtter, benchmark GPU, blocco delle versioni e supporto multipiattaforma per AMD64 e ARM64."
i18n_source_hash: 148b3608e11a
i18n_provenance: human
i18n_output_hash: a04890140b33
---

# Immagine Docker {#docker-image}

SnapOtter viene distribuito come singola immagine Docker. Eseguila da sola e avvia un PostgreSQL 17 e un Redis incorporati sull'interfaccia di loopback (modalità incorporata); per la produzione, eseguila insieme a container PostgreSQL 17 e Redis 8 separati con Compose. L'immagine dell'app funziona su tutte le piattaforme.

## Avvio rapido {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Senza alcun `DATABASE_URL` impostato, viene eseguita in modalità incorporata: PostgreSQL e Redis si avviano all'interno del container sul loopback, con tutti i dati nel volume `SnapOtter-data`. Imposta `DATABASE_URL` e `REDIS_URL` (come fa lo stack [Compose](#docker-compose)) per utilizzare invece servizi esterni. Vedi [Configurazione](/it/guide/configuration#embedded-mode).

## Accelerazione NVIDIA CUDA {#nvidia-cuda-acceleration}

L'immagine include il supporto NVIDIA CUDA su amd64. Se hai una GPU NVIDIA con l'[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) installato, aggiungi `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

L'immagine rileva automaticamente CUDA a runtime. Senza `--gpus all`, o quando CUDA non è disponibile, gli strumenti IA vengono eseguiti su CPU. In entrambi i casi si tratta della stessa immagine.

L'accelerazione iGPU Intel/AMD tramite VA-API, Quick Sync o OpenCL non è supportata oggi per l'inferenza IA di SnapOtter. La mappatura di `/dev/dri` all'interno del container può esporre il render device, ma il runtime IA userà comunque la CPU a meno che CUDA non sia disponibile.

### Benchmark {#benchmarks}

Testato su una NVIDIA RTX 4070 (12 GB di VRAM) con un ritratto JPEG 572x1024.

#### Prestazioni a caldo {#warm-performance}

| Strumento | CPU | GPU | Velocità |
|------|-----|-----|---------|
| Rimozione sfondo (u2net) | 2.415 ms | 879 ms | 2,7x |
| Rimozione sfondo (isnet) | 2.457 ms | 1.137 ms | 2,2x |
| Upscale 2x | 350 ms | 309 ms | 1,1x |
| Upscale 4x | 910 ms | 310 ms | 2,9x |
| OCR (PaddleOCR) | 137 ms | 94 ms | 1,5x |
| Sfocatura volti | 139 ms | 122 ms | 1,1x |

#### Avvio a freddo (prima richiesta dopo l'avvio del container) {#cold-start-first-request-after-container-start}

| Strumento | CPU | GPU | Velocità |
|------|-----|-----|---------|
| Rimozione sfondo | 22.286 ms | 4.792 ms | 4,7x |
| Upscale 2x | 3.957 ms | 2.318 ms | 1,7x |
| OCR (PaddleOCR) | 1.469 ms | 1.090 ms | 1,3x |

### Controllo di integrità CUDA {#cuda-health-check}

Dopo la prima richiesta IA, l'endpoint di integrità di amministrazione riporta lo stato della GPU CUDA:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

Lo stack Compose completo include l'app, PostgreSQL 17 e Redis 8. Vedi [Distribuzione](/it/guide/deployment) per il `docker-compose.yml` completo. Un esempio minimo:

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
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

Per l'accelerazione NVIDIA CUDA tramite Docker Compose, aggiungi la sezione deploy al servizio SnapOtter:

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
| `1.11.0` | Versione esatta |
| `1.11` | Ultima patch di 1.11.x |
| `1` | Ultima minor di 1.x |

## Piattaforme {#platforms}

| Architettura | Supporto GPU | Note |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Accelerazione CUDA completa per gli strumenti IA |
| linux/arm64 | Solo CPU | Raspberry Pi 4/5, Apple Silicon tramite Docker Desktop |

## Migrazione dai tag precedenti {#migration-from-previous-tags}

Se usavi il tag `:cuda`, passa a `:latest` e mantieni `--gpus all`. Stesso supporto GPU, immagine unificata.

I tuoi dati e le tue impostazioni vengono conservati nei volumi.
