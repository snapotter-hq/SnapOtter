---
description: "Docker-avbildstaggar för SnapOtter, GPU-benchmarks, versionslåsning och stöd för flera plattformar för AMD64 och ARM64."
i18n_source_hash: a5871d76250c
i18n_provenance: machine
i18n_output_hash: 7ee99184f203
i18n_hash_version: 2
---

# Docker-avbildstaggar {#docker-image}

SnapOtter levereras som en enda Docker-avbild. Kör den fristående så startar den en inbäddad PostgreSQL 17 och Redis på loopback-gränssnittet (inbäddat läge). I produktion körs den tillsammans med separata PostgreSQL 17- och Redis 8-containrar med Compose. Appavbilden fungerar på alla plattformar.

## Snabbstart {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Utan `DATABASE_URL` körs avbilden i inbäddat läge: PostgreSQL och Redis startar inuti containern på loopback, med all data under volymen `SnapOtter-data`. Ange `DATABASE_URL` och `REDIS_URL` (som [Compose](#docker-compose)-stacken gör) för att använda externa tjänster i stället. Se [Konfiguration](/sv/guide/configuration#embedded-mode).

## NVIDIA CUDA-acceleration {#nvidia-cuda-acceleration}

Avbilden innehåller stöd för NVIDIA CUDA på amd64. Om du har ett NVIDIA-grafikkort och [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) är installerat, lägg till `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Avbilden identifierar CUDA automatiskt vid körning. Utan `--gpus all`, eller när CUDA inte är tillgängligt, körs AI-verktygen på CPU. Samma avbild i båda fallen.

Acceleration med Intel/AMD iGPU via VA-API, Quick Sync eller OpenCL stöds inte för AI-inferens i SnapOtter i dagsläget. Att mappa `/dev/dri` in i containern kan exponera renderingsenheten, men AI-körmiljön använder ändå CPU om inte CUDA är tillgängligt.

### Benchmarks {#benchmarks}

Testat på ett NVIDIA RTX 4070 (12 GB VRAM) med ett porträtt i JPEG på 572x1024.

#### Prestanda med varm start {#warm-performance}

| Verktyg | CPU | GPU | Snabbare |
|------|-----|-----|---------|
| Bakgrundsborttagning (u2net) | 2,415ms | 879ms | 2.7x |
| Bakgrundsborttagning (isnet) | 2,457ms | 1,137ms | 2.2x |
| Uppskalning 2x | 350ms | 309ms | 1.1x |
| Uppskalning 4x | 910ms | 310ms | 2.9x |
| Ansiktsoskärpa | 139ms | 122ms | 1.1x |

#### Kallstart (första begäran efter containerstart) {#cold-start-first-request-after-container-start}

| Verktyg | CPU | GPU | Snabbare |
|------|-----|-----|---------|
| Bakgrundsborttagning | 22,286ms | 4,792ms | 4.7x |
| Uppskalning 2x | 3,957ms | 2,318ms | 1.7x |

OCR ingår inte i CUDA-jämförelsen. Både den inbyggda Tesseract-nivån och de valfria RapidOCR/ONNX-nivåerna använder CPU, även när containern har åtkomst till NVIDIA-GPU.

### CUDA-hälsokontroll {#cuda-health-check}

Efter den första AI-begäran rapporterar administratörens hälsoslutpunkt status för CUDA-GPU:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

Den fullständiga Compose-stacken omfattar appen, PostgreSQL 17 och Redis 8. Se [Driftsättning](/sv/guide/deployment) för hela `docker-compose.yml`. Ett minimalt exempel:

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

För NVIDIA CUDA-acceleration via Docker Compose, lägg till avsnittet deploy i SnapOtter-tjänsten:

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
| `2.2.0` | Exakt version |
| `2.2` | Senaste patchen i 2.2.x |
| `2` | Senaste mindre versionen i 2.x |

## Plattformar {#platforms}

| Arkitektur | GPU-stöd | Anmärkningar |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Full CUDA-acceleration för AI-verktyg |
| linux/arm64 | Endast CPU | Raspberry Pi 4/5, Apple Silicon via Docker Desktop |

## Migrering från tidigare taggar {#migration-from-previous-tags}

Om du använde taggen `:cuda`, byt till `:latest` och behåll `--gpus all`. Samma GPU-stöd, enhetlig avbild.

Dina data och inställningar bevaras i volymerna.
