---
description: "SnapOtters Docker-avbildningstaggar, GPU-benchmarks, versionslåsning och stöd för flera plattformar för AMD64 och ARM64."
i18n_source_hash: 148b3608e11a
i18n_provenance: human
i18n_output_hash: 498e06cec10c
---

# Docker-avbildning {#docker-image}

SnapOtter levereras som en enda Docker-avbildning. Kör den fristående så startar den en inbäddad PostgreSQL 17 och Redis på loopback-gränssnittet (inbäddat läge); i produktion kör du den tillsammans med separata containrar för PostgreSQL 17 och Redis 8 med Compose. App-avbildningen fungerar på alla plattformar.

## Snabbstart {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Utan att `DATABASE_URL` är satt körs detta i inbäddat läge: PostgreSQL och Redis startar inuti containern på loopback, med all data under volymen `SnapOtter-data`. Sätt `DATABASE_URL` och `REDIS_URL` (som [Compose](#docker-compose)-stacken gör) för att använda externa tjänster i stället. Se [Konfiguration](/sv/guide/configuration#embedded-mode).

## NVIDIA CUDA-acceleration {#nvidia-cuda-acceleration}

Avbildningen inkluderar stöd för NVIDIA CUDA på amd64. Om du har en NVIDIA-GPU med [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) installerat lägger du till `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Avbildningen upptäcker CUDA automatiskt vid körning. Utan `--gpus all`, eller när CUDA inte är tillgängligt, körs AI-verktygen på CPU. Samma avbildning oavsett.

Acceleration med Intel/AMD iGPU via VA-API, Quick Sync eller OpenCL stöds inte för SnapOtters AI-inferens i dag. Att mappa in `/dev/dri` i containern kan exponera renderingsenheten, men AI-körtiden använder fortfarande CPU om inte CUDA finns tillgängligt.

### Benchmarks {#benchmarks}

Testat på en NVIDIA RTX 4070 (12 GB VRAM) med ett 572x1024 JPEG-porträtt.

#### Varm prestanda {#warm-performance}

| Verktyg | CPU | GPU | Snabbhetsökning |
|------|-----|-----|---------|
| Bakgrundsborttagning (u2net) | 2 415 ms | 879 ms | 2,7x |
| Bakgrundsborttagning (isnet) | 2 457 ms | 1 137 ms | 2,2x |
| Uppskalning 2x | 350 ms | 309 ms | 1,1x |
| Uppskalning 4x | 910 ms | 310 ms | 2,9x |
| OCR (PaddleOCR) | 137 ms | 94 ms | 1,5x |
| Ansiktsoskärpa | 139 ms | 122 ms | 1,1x |

#### Kallstart (första begäran efter containerstart) {#cold-start-first-request-after-container-start}

| Verktyg | CPU | GPU | Snabbhetsökning |
|------|-----|-----|---------|
| Bakgrundsborttagning | 22 286 ms | 4 792 ms | 4,7x |
| Uppskalning 2x | 3 957 ms | 2 318 ms | 1,7x |
| OCR (PaddleOCR) | 1 469 ms | 1 090 ms | 1,3x |

### CUDA-hälsokontroll {#cuda-health-check}

Efter den första AI-begäran rapporterar administratörens hälsoslutpunkt CUDA-GPU-status:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

Hela Compose-stacken inkluderar appen, PostgreSQL 17 och Redis 8. Se [Distribution](/sv/guide/deployment) för den kompletta `docker-compose.yml`. Ett minimalt exempel:

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

För NVIDIA CUDA-acceleration via Docker Compose lägger du till deploy-avsnittet till SnapOtter-tjänsten:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Versionslåsning {#version-pinning}

| Tagg | Beskrivning |
|-----|------------|
| `latest` | Senaste utgåvan |
| `1.11.0` | Exakt version |
| `1.11` | Senaste patch i 1.11.x |
| `1` | Senaste minor i 1.x |

## Plattformar {#platforms}

| Arkitektur | GPU-stöd | Anteckningar |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Full CUDA-acceleration för AI-verktyg |
| linux/arm64 | Endast CPU | Raspberry Pi 4/5, Apple Silicon via Docker Desktop |

## Migrering från tidigare taggar {#migration-from-previous-tags}

Om du använde taggen `:cuda` byter du till `:latest` och behåller `--gpus all`. Samma GPU-stöd, en enhetlig avbildning.

Dina data och inställningar bevaras i volymerna.
