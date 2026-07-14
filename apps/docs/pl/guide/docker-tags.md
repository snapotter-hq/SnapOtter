---
description: "Tagi obrazów Docker SnapOtter, testy wydajności GPU, przypinanie wersji i obsługa wielu platform dla AMD64 oraz ARM64."
i18n_output_hash: 4b47960dc63f
i18n_source_hash: fda322e78b4b
i18n_provenance: human
---

# Obraz Docker {#docker-image}

SnapOtter jest dostarczany jako pojedynczy obraz Docker. Uruchom go samodzielnie, a wystartuje wbudowany PostgreSQL 17 oraz Redis na interfejsie pętli zwrotnej (tryb wbudowany); na produkcji uruchamiaj go obok osobnych kontenerów PostgreSQL 17 i Redis 8 za pomocą Compose. Obraz aplikacji działa na wszystkich platformach.

## Szybki start {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Bez ustawionego `DATABASE_URL` działa to w trybie wbudowanym: PostgreSQL i Redis startują wewnątrz kontenera na pętli zwrotnej, a wszystkie dane trafiają do woluminu `SnapOtter-data`. Ustaw `DATABASE_URL` i `REDIS_URL` (tak jak robi to stos [Compose](#docker-compose)), aby zamiast tego korzystać z usług zewnętrznych. Zobacz [Konfiguracja](/pl/guide/configuration#embedded-mode).

## Akceleracja NVIDIA CUDA {#nvidia-cuda-acceleration}

Obraz zawiera obsługę NVIDIA CUDA na amd64. Jeśli masz kartę GPU NVIDIA z zainstalowanym [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html), dodaj `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Obraz automatycznie wykrywa CUDA w czasie działania. Bez `--gpus all` lub gdy CUDA jest niedostępne, narzędzia AI działają na CPU. To ten sam obraz w obu przypadkach.

Akceleracja iGPU Intel/AMD przez VA-API, Quick Sync lub OpenCL nie jest obecnie obsługiwana dla wnioskowania AI w SnapOtter. Zmapowanie `/dev/dri` do kontenera może udostępnić urządzenie renderujące, ale środowisko uruchomieniowe AI i tak będzie korzystać z CPU, o ile CUDA nie jest dostępne.

### Testy wydajności {#benchmarks}

Testowane na NVIDIA RTX 4070 (12 GB VRAM) na portretowym pliku JPEG 572x1024.

#### Wydajność po rozgrzaniu {#warm-performance}

| Narzędzie | CPU | GPU | Przyspieszenie |
|------|-----|-----|---------|
| Usuwanie tła (u2net) | 2 415 ms | 879 ms | 2,7x |
| Usuwanie tła (isnet) | 2 457 ms | 1 137 ms | 2,2x |
| Powiększanie 2x | 350 ms | 309 ms | 1,1x |
| Powiększanie 4x | 910 ms | 310 ms | 2,9x |
| Rozmycie twarzy | 139 ms | 122 ms | 1,1x |

#### Zimny start (pierwsze żądanie po uruchomieniu kontenera) {#cold-start-first-request-after-container-start}

| Narzędzie | CPU | GPU | Przyspieszenie |
|------|-----|-----|---------|
| Usuwanie tła | 22 286 ms | 4 792 ms | 4,7x |
| Powiększanie 2x | 3 957 ms | 2 318 ms | 1,7x |

OCR nie jest uwzględniony w porównaniu CUDA. Zarówno wbudowana warstwa Tesseract, jak i opcjonalna warstwa RapidOCR/ONNX korzystają z CPU, także wtedy, gdy kontener ma dostęp NVIDIA GPU.

### Kontrola stanu CUDA {#cuda-health-check}

Po pierwszym żądaniu AI administracyjny punkt końcowy stanu zdrowia raportuje status GPU CUDA:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

Pełny stos Compose obejmuje aplikację, PostgreSQL 17 oraz Redis 8. Zobacz [Wdrożenie](/pl/guide/deployment), aby poznać kompletny `docker-compose.yml`. Minimalny przykład:

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

Dla akceleracji NVIDIA CUDA przez Docker Compose dodaj sekcję deploy do usługi SnapOtter:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Przypinanie wersji {#version-pinning}

| Tag | Opis |
|-----|------------|
| `latest` | Najnowsze wydanie |
| `1.11.0` | Dokładna wersja |
| `1.11` | Najnowsza łatka w 1.11.x |
| `1` | Najnowsza wersja podrzędna w 1.x |

## Platformy {#platforms}

| Architektura | Obsługa GPU | Uwagi |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Pełna akceleracja CUDA dla narzędzi AI |
| linux/arm64 | Tylko CPU | Raspberry Pi 4/5, Apple Silicon przez Docker Desktop |

## Migracja z poprzednich tagów {#migration-from-previous-tags}

Jeśli używałeś taga `:cuda`, przejdź na `:latest` i zachowaj `--gpus all`. Taka sama obsługa GPU, ujednolicony obraz.

Twoje dane i ustawienia są zachowywane w woluminach.
