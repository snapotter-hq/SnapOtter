---
description: "Docker-Image-Tags von SnapOtter, GPU-Benchmarks, Versionsfixierung und Multi-Plattform-Unterstützung für AMD64 und ARM64."
i18n_source_hash: a5871d76250c
i18n_provenance: machine
i18n_output_hash: 51cdc0bc6fbf
i18n_hash_version: 2
---

# Docker-Image {#docker-image}

SnapOtter wird als einzelnes Docker-Image ausgeliefert. Wenn Sie es allein ausführen, startet es ein eingebettetes PostgreSQL 17 und Redis auf der Loopback-Schnittstelle (eingebetteter Modus); für den Produktivbetrieb führen Sie es mit Compose zusammen mit separaten PostgreSQL-17- und Redis-8-Containern aus. Das App-Image läuft auf allen Plattformen.

## Schnellstart {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Wenn `DATABASE_URL` nicht gesetzt ist, läuft das Image im eingebetteten Modus: PostgreSQL und Redis starten im Container auf Loopback, mit allen Daten unter dem Volume `SnapOtter-data`. Setzen Sie `DATABASE_URL` und `REDIS_URL` (wie es der [Compose](#docker-compose)-Stack tut), um stattdessen externe Dienste zu verwenden. Siehe [Konfiguration](/de/guide/configuration#embedded-mode).

## NVIDIA-CUDA-Beschleunigung {#nvidia-cuda-acceleration}

Das Image enthält NVIDIA-CUDA-Unterstützung für amd64. Wenn Sie eine NVIDIA-GPU mit installiertem [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) haben, fügen Sie `--gpus all` hinzu:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Das Image erkennt CUDA zur Laufzeit automatisch. Ohne `--gpus all` oder wenn CUDA nicht verfügbar ist, laufen KI-Werkzeuge auf der CPU. In beiden Fällen dasselbe Image.

Eine Beschleunigung über Intel/AMD-iGPUs mittels VA-API, Quick Sync oder OpenCL wird für die KI-Inferenz von SnapOtter derzeit nicht unterstützt. Das Einbinden von `/dev/dri` in den Container kann das Render-Gerät verfügbar machen, die KI-Laufzeit verwendet aber weiterhin die CPU, sofern CUDA nicht verfügbar ist.

### Benchmarks {#benchmarks}

Getestet auf einer NVIDIA RTX 4070 (12 GB VRAM) mit einem JPEG-Porträt von 572x1024.

#### Leistung im warmen Zustand {#warm-performance}

| Werkzeug | CPU | GPU | Beschleunigung |
|------|-----|-----|---------|
| Hintergrundentfernung (u2net) | 2,415ms | 879ms | 2.7x |
| Hintergrundentfernung (isnet) | 2,457ms | 1,137ms | 2.2x |
| Hochskalierung 2x | 350ms | 309ms | 1.1x |
| Hochskalierung 4x | 910ms | 310ms | 2.9x |
| Gesichter weichzeichnen | 139ms | 122ms | 1.1x |

#### Kaltstart (erste Anfrage nach dem Containerstart) {#cold-start-first-request-after-container-start}

| Werkzeug | CPU | GPU | Beschleunigung |
|------|-----|-----|---------|
| Hintergrundentfernung | 22,286ms | 4,792ms | 4.7x |
| Hochskalierung 2x | 3,957ms | 2,318ms | 1.7x |

OCR ist im CUDA-Vergleich nicht enthalten. Sowohl die integrierte Tesseract-Stufe als auch die optionalen RapidOCR/ONNX-Stufen verwenden die CPU, auch wenn der Container Zugriff auf eine NVIDIA-GPU hat.

### CUDA-Health-Check {#cuda-health-check}

Nach der ersten KI-Anfrage meldet der Admin-Health-Endpunkt den Status der CUDA-GPU:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

Der vollständige Compose-Stack umfasst die App, PostgreSQL 17 und Redis 8. Die komplette `docker-compose.yml` finden Sie unter [Bereitstellung](/de/guide/deployment). Ein minimales Beispiel:

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

Für NVIDIA-CUDA-Beschleunigung über Docker Compose fügen Sie dem SnapOtter-Dienst den Abschnitt deploy hinzu:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Versionsfixierung {#version-pinning}

| Tag | Beschreibung |
|-----|------------|
| `latest` | Neuestes Release |
| `2.2.0` | Exakte Version |
| `2.2` | Neuester Patch in 2.2.x |
| `2` | Neueste Minor-Version in 2.x |

## Plattformen {#platforms}

| Architektur | GPU-Unterstützung | Hinweise |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Volle CUDA-Beschleunigung für KI-Werkzeuge |
| linux/arm64 | Nur CPU | Raspberry Pi 4/5, Apple Silicon über Docker Desktop |

## Migration von früheren Tags {#migration-from-previous-tags}

Wenn Sie den Tag `:cuda` verwendet haben, wechseln Sie zu `:latest` und behalten Sie `--gpus all` bei. Gleiche GPU-Unterstützung, vereinheitlichtes Image.

Ihre Daten und Einstellungen bleiben in den Volumes erhalten.