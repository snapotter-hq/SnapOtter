---
description: "SnapOtter Docker-Image-Tags, GPU-Benchmarks, Versionsfixierung und Multi-Plattform-Unterstützung für AMD64 und ARM64."
i18n_source_hash: 148b3608e11a
i18n_provenance: human
i18n_output_hash: bf7df15424fd
---

# Docker-Image {#docker-image}

SnapOtter wird als einzelnes Docker-Image ausgeliefert. Wenn Sie es allein ausführen, startet es ein eingebettetes PostgreSQL 17 und Redis auf der Loopback-Schnittstelle (eingebetteter Modus); für den Produktivbetrieb führen Sie es zusammen mit separaten PostgreSQL-17- und Redis-8-Containern per Compose aus. Das App-Image funktioniert auf allen Plattformen.

## Schnellstart {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Ohne gesetztes `DATABASE_URL` läuft dies im eingebetteten Modus: PostgreSQL und Redis starten innerhalb des Containers auf dem Loopback, wobei alle Daten unter dem Volume `SnapOtter-data` liegen. Setzen Sie `DATABASE_URL` und `REDIS_URL` (wie es der [Compose](#docker-compose)-Stack tut), um stattdessen externe Dienste zu verwenden. Siehe [Konfiguration](/de/guide/configuration#embedded-mode).

## NVIDIA-CUDA-Beschleunigung {#nvidia-cuda-acceleration}

Das Image enthält NVIDIA-CUDA-Unterstützung auf amd64. Wenn Sie über eine NVIDIA-GPU mit installiertem [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) verfügen, fügen Sie `--gpus all` hinzu:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Das Image erkennt CUDA zur Laufzeit automatisch. Ohne `--gpus all` oder wenn CUDA nicht verfügbar ist, laufen die KI-Werkzeuge auf der CPU. In beiden Fällen dasselbe Image.

Intel/AMD-iGPU-Beschleunigung über VA-API, Quick Sync oder OpenCL wird für die KI-Inferenz von SnapOtter derzeit nicht unterstützt. Das Einbinden von `/dev/dri` in den Container kann das Rendergerät verfügbar machen, aber die KI-Laufzeit nutzt weiterhin die CPU, sofern CUDA nicht verfügbar ist.

### Benchmarks {#benchmarks}

Getestet auf einer NVIDIA RTX 4070 (12 GB VRAM) mit einem 572x1024-JPEG-Porträt.

#### Warme Leistung {#warm-performance}

| Werkzeug | CPU | GPU | Beschleunigung |
|------|-----|-----|---------|
| Hintergrundentfernung (u2net) | 2.415 ms | 879 ms | 2,7x |
| Hintergrundentfernung (isnet) | 2.457 ms | 1.137 ms | 2,2x |
| Hochskalierung 2x | 350 ms | 309 ms | 1,1x |
| Hochskalierung 4x | 910 ms | 310 ms | 2,9x |
| OCR (PaddleOCR) | 137 ms | 94 ms | 1,5x |
| Gesichtsunschärfe | 139 ms | 122 ms | 1,1x |

#### Kaltstart (erste Anfrage nach Containerstart) {#cold-start-first-request-after-container-start}

| Werkzeug | CPU | GPU | Beschleunigung |
|------|-----|-----|---------|
| Hintergrundentfernung | 22.286 ms | 4.792 ms | 4,7x |
| Hochskalierung 2x | 3.957 ms | 2.318 ms | 1,7x |
| OCR (PaddleOCR) | 1.469 ms | 1.090 ms | 1,3x |

### CUDA-Statusprüfung {#cuda-health-check}

Nach der ersten KI-Anfrage meldet der Admin-Health-Endpunkt den Status der CUDA-GPU:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

Der vollständige Compose-Stack umfasst die App, PostgreSQL 17 und Redis 8. Siehe [Bereitstellung](/de/guide/deployment) für die vollständige `docker-compose.yml`. Ein minimales Beispiel:

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

Für NVIDIA-CUDA-Beschleunigung über Docker Compose fügen Sie den deploy-Abschnitt zum SnapOtter-Dienst hinzu:

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
| `latest` | Neueste Version |
| `1.11.0` | Exakte Version |
| `1.11` | Neuester Patch in 1.11.x |
| `1` | Neueste Minor-Version in 1.x |

## Plattformen {#platforms}

| Architektur | GPU-Unterstützung | Hinweise |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Volle CUDA-Beschleunigung für KI-Werkzeuge |
| linux/arm64 | nur CPU | Raspberry Pi 4/5, Apple Silicon über Docker Desktop |

## Migration von früheren Tags {#migration-from-previous-tags}

Wenn Sie den Tag `:cuda` verwendet haben, wechseln Sie zu `:latest` und behalten Sie `--gpus all`. Gleiche GPU-Unterstützung, vereinheitlichtes Image.

Ihre Daten und Einstellungen bleiben in den Volumes erhalten.
