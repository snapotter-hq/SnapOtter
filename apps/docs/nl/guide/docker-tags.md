---
description: "SnapOtter Docker-image-tags, GPU-benchmarks, versievastzetting en multiplatformondersteuning voor AMD64 en ARM64."
i18n_source_hash: 148b3608e11a
i18n_provenance: human
i18n_output_hash: ae5482dbdd3c
---

# Docker-image {#docker-image}

SnapOtter wordt geleverd als één enkele Docker-image. Draai deze op zichzelf en er wordt een ingebedde PostgreSQL 17 en Redis op de loopback-interface gestart (ingebedde modus); voor productie draai je deze naast aparte PostgreSQL 17- en Redis 8-containers met Compose. De app-image werkt op alle platforms.

## Snelstart {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Zonder ingestelde `DATABASE_URL` draait dit in ingebedde modus: PostgreSQL en Redis starten binnen de container op loopback, met alle gegevens onder het `SnapOtter-data`-volume. Stel `DATABASE_URL` en `REDIS_URL` in (zoals de [Compose](#docker-compose)-stack doet) om in plaats daarvan externe services te gebruiken. Zie [Configuratie](/nl/guide/configuration#embedded-mode).

## NVIDIA CUDA-versnelling {#nvidia-cuda-acceleration}

De image bevat NVIDIA CUDA-ondersteuning op amd64. Als je een NVIDIA-GPU met de [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) geïnstalleerd hebt, voeg dan `--gpus all` toe:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

De image detecteert CUDA automatisch tijdens runtime. Zonder `--gpus all`, of wanneer CUDA niet beschikbaar is, draaien AI-tools op de CPU. Hoe dan ook dezelfde image.

Intel/AMD-iGPU-versnelling via VA-API, Quick Sync of OpenCL wordt momenteel niet ondersteund voor SnapOtter AI-inferentie. Het toewijzen van `/dev/dri` aan de container kan het render-apparaat blootstellen, maar de AI-runtime blijft de CPU gebruiken tenzij CUDA beschikbaar is.

### Benchmarks {#benchmarks}

Getest op een NVIDIA RTX 4070 (12 GB VRAM) met een 572x1024 JPEG-portret.

#### Warme prestaties {#warm-performance}

| Tool | CPU | GPU | Versnelling |
|------|-----|-----|---------|
| Achtergrond verwijderen (u2net) | 2.415ms | 879ms | 2,7x |
| Achtergrond verwijderen (isnet) | 2.457ms | 1.137ms | 2,2x |
| Upscalen 2x | 350ms | 309ms | 1,1x |
| Upscalen 4x | 910ms | 310ms | 2,9x |
| OCR (PaddleOCR) | 137ms | 94ms | 1,5x |
| Gezicht vervagen | 139ms | 122ms | 1,1x |

#### Koude start (eerste verzoek na containerstart) {#cold-start-first-request-after-container-start}

| Tool | CPU | GPU | Versnelling |
|------|-----|-----|---------|
| Achtergrond verwijderen | 22.286ms | 4.792ms | 4,7x |
| Upscalen 2x | 3.957ms | 2.318ms | 1,7x |
| OCR (PaddleOCR) | 1.469ms | 1.090ms | 1,3x |

### CUDA-gezondheidscontrole {#cuda-health-check}

Na het eerste AI-verzoek rapporteert het admin-gezondheidseindpunt de CUDA GPU-status:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

De volledige Compose-stack bevat de app, PostgreSQL 17 en Redis 8. Zie [Implementatie](/nl/guide/deployment) voor de volledige `docker-compose.yml`. Een minimaal voorbeeld:

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

Voeg voor NVIDIA CUDA-versnelling via Docker Compose de deploy-sectie toe aan de SnapOtter-service:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Versievastzetting {#version-pinning}

| Tag | Beschrijving |
|-----|------------|
| `latest` | Nieuwste release |
| `1.11.0` | Exacte versie |
| `1.11` | Nieuwste patch in 1.11.x |
| `1` | Nieuwste minor in 1.x |

## Platforms {#platforms}

| Architectuur | GPU-ondersteuning | Opmerkingen |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Volledige CUDA-versnelling voor AI-tools |
| linux/arm64 | Alleen CPU | Raspberry Pi 4/5, Apple Silicon via Docker Desktop |

## Migratie van vorige tags {#migration-from-previous-tags}

Gebruikte je de `:cuda`-tag, schakel dan over naar `:latest` en houd `--gpus all` aan. Dezelfde GPU-ondersteuning, verenigde image.

Je gegevens en instellingen blijven behouden in de volumes.
