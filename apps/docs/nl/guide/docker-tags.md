---
description: "SnapOtter Docker-imagetags, GPU-benchmarks, versie vastzetten en multiplatformondersteuning voor AMD64 en ARM64."
i18n_source_hash: a5871d76250c
i18n_provenance: machine
i18n_output_hash: 5070e07ae6a7
i18n_hash_version: 2
---

# Docker-image {#docker-image}

SnapOtter wordt geleverd als één Docker-image. Draait u het zelfstandig, dan start het een ingebouwde PostgreSQL 17 en Redis op de loopback-interface (embedded modus); voor productie draait u het naast aparte PostgreSQL 17- en Redis 8-containers met Compose. De app-image werkt op alle platformen.

## Snelstart {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Zonder ingestelde `DATABASE_URL` draait dit in embedded modus: PostgreSQL en Redis starten binnen de container op loopback, met alle data onder het volume `SnapOtter-data`. Stel `DATABASE_URL` en `REDIS_URL` in (zoals de [Compose](#docker-compose)-stack doet) om in plaats daarvan externe services te gebruiken. Zie [Configuratie](/nl/guide/configuration#embedded-mode).

## NVIDIA CUDA-versnelling {#nvidia-cuda-acceleration}

De image bevat NVIDIA CUDA-ondersteuning op amd64. Als u een NVIDIA-GPU hebt met de [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) geïnstalleerd, voegt u `--gpus all` toe:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

De image detecteert CUDA automatisch tijdens runtime. Zonder `--gpus all`, of wanneer CUDA niet beschikbaar is, draaien AI-tools op de CPU. In beide gevallen dezelfde image.

Versnelling via een Intel/AMD-iGPU met VA-API, Quick Sync of OpenCL wordt momenteel niet ondersteund voor SnapOtter AI-inferentie. Het koppelen van `/dev/dri` in de container kan het render-apparaat beschikbaar maken, maar de AI-runtime gebruikt dan nog steeds de CPU tenzij CUDA beschikbaar is.

### Benchmarks {#benchmarks}

Getest op een NVIDIA RTX 4070 (12 GB VRAM) met een JPEG-portret van 572x1024.

#### Warme prestaties {#warm-performance}

| Tool | CPU | GPU | Versnelling |
|------|-----|-----|---------|
| Achtergrond verwijderen (u2net) | 2,415ms | 879ms | 2.7x |
| Achtergrond verwijderen (isnet) | 2,457ms | 1,137ms | 2.2x |
| Opschalen 2x | 350ms | 309ms | 1.1x |
| Opschalen 4x | 910ms | 310ms | 2.9x |
| Gezichten vervagen | 139ms | 122ms | 1.1x |

#### Koude start (eerste verzoek na het starten van de container) {#cold-start-first-request-after-container-start}

| Tool | CPU | GPU | Versnelling |
|------|-----|-----|---------|
| Achtergrond verwijderen | 22,286ms | 4,792ms | 4.7x |
| Opschalen 2x | 3,957ms | 2,318ms | 1.7x |

OCR is niet opgenomen in de CUDA-vergelijking. Zowel de ingebouwde Tesseract-laag als de optionele RapidOCR/ONNX-lagen gebruiken de CPU, ook wanneer de container toegang tot een NVIDIA-GPU heeft.

### CUDA-gezondheidscontrole {#cuda-health-check}

Na het eerste AI-verzoek meldt het health-endpoint voor beheerders de status van de CUDA-GPU:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

De volledige Compose-stack bevat de app, PostgreSQL 17 en Redis 8. Zie [Implementatie](/nl/guide/deployment) voor het volledige `docker-compose.yml`. Een minimaal voorbeeld:

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

Voor NVIDIA CUDA-versnelling via Docker Compose voegt u de deploy-sectie toe aan de SnapOtter-service:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Versies vastzetten {#version-pinning}

| Tag | Beschrijving |
|-----|------------|
| `latest` | Laatste release |
| `2.2.0` | Exacte versie |
| `2.2` | Laatste patch in 2.2.x |
| `2` | Laatste minor in 2.x |

## Platformen {#platforms}

| Architectuur | GPU-ondersteuning | Opmerkingen |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Volledige CUDA-versnelling voor AI-tools |
| linux/arm64 | Alleen CPU | Raspberry Pi 4/5, Apple Silicon via Docker Desktop |

## Migratie vanaf eerdere tags {#migration-from-previous-tags}

Als u de tag `:cuda` gebruikte, schakel dan over naar `:latest` en behoud `--gpus all`. Dezelfde GPU-ondersteuning, één uniforme image.

Uw data en instellingen blijven bewaard in de volumes.
