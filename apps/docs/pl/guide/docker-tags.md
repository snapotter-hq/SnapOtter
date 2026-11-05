---
description: "Tagi obrazów Docker SnapOtter, testy wydajności GPU, przypinanie wersji i obsługa wielu platform dla AMD64 i ARM64."
i18n_source_hash: a5871d76250c
i18n_provenance: machine
i18n_output_hash: 572812ca3874
i18n_hash_version: 2
---

# Tagi obrazów Docker {#docker-image}

SnapOtter jest dostarczany jako pojedynczy obraz Docker. Uruchomiony samodzielnie, startuje wbudowane PostgreSQL 17 i Redis na interfejsie loopback (tryb wbudowany). W środowisku produkcyjnym należy uruchomić go razem z osobnymi kontenerami PostgreSQL 17 i Redis 8 za pomocą Compose. Obraz aplikacji działa na wszystkich platformach.

## Szybki start {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Bez ustawionego `DATABASE_URL` aplikacja działa w trybie wbudowanym: PostgreSQL i Redis startują wewnątrz kontenera na loopback, a wszystkie dane trafiają do woluminu `SnapOtter-data`. Aby zamiast tego użyć usług zewnętrznych, należy ustawić `DATABASE_URL` i `REDIS_URL` (tak jak robi to stos [Compose](#docker-compose)). Zobacz [Konfiguracja](/pl/guide/configuration#embedded-mode).

## Akceleracja NVIDIA CUDA {#nvidia-cuda-acceleration}

Obraz zawiera obsługę NVIDIA CUDA na amd64. Jeśli dostępna jest karta NVIDIA z zainstalowanym [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html), należy dodać `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Obraz automatycznie wykrywa CUDA w czasie działania. Bez `--gpus all` lub gdy CUDA jest niedostępne, narzędzia AI działają na CPU. W obu przypadkach używany jest ten sam obraz.

Akceleracja zintegrowanych procesorów graficznych Intel/AMD przez VA-API, Quick Sync lub OpenCL nie jest obecnie obsługiwana dla wnioskowania AI w SnapOtter. Zamapowanie `/dev/dri` do kontenera może udostępnić urządzenie renderujące, ale środowisko AI nadal będzie używać CPU, o ile CUDA nie jest dostępne.

### Testy wydajności {#benchmarks}

Testy wykonano na NVIDIA RTX 4070 (12 GB VRAM) z portretem JPEG o rozmiarze 572x1024.

#### Wydajność po rozgrzaniu {#warm-performance}

| Narzędzie | CPU | GPU | Przyspieszenie |
|------|-----|-----|---------|
| Usuwanie tła (u2net) | 2,415ms | 879ms | 2.7x |
| Usuwanie tła (isnet) | 2,457ms | 1,137ms | 2.2x |
| Powiększanie 2x | 350ms | 309ms | 1.1x |
| Powiększanie 4x | 910ms | 310ms | 2.9x |
| Rozmycie twarzy | 139ms | 122ms | 1.1x |

#### Zimny start (pierwsze żądanie po uruchomieniu kontenera) {#cold-start-first-request-after-container-start}

| Narzędzie | CPU | GPU | Przyspieszenie |
|------|-----|-----|---------|
| Usuwanie tła | 22,286ms | 4,792ms | 4.7x |
| Powiększanie 2x | 3,957ms | 2,318ms | 1.7x |

OCR nie jest uwzględniony w porównaniu CUDA. Zarówno wbudowany poziom Tesseract, jak i opcjonalne poziomy RapidOCR/ONNX korzystają z CPU, także wtedy, gdy kontener ma dostęp do GPU NVIDIA.

### Kontrola stanu CUDA {#cuda-health-check}

Po pierwszym żądaniu AI punkt końcowy kontroli stanu dla administratora zgłasza status GPU CUDA:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

Pełny stos Compose obejmuje aplikację, PostgreSQL 17 i Redis 8. Pełny plik `docker-compose.yml` znajduje się w sekcji [Wdrażanie](/pl/guide/deployment). Minimalny przykład:

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

Aby włączyć akcelerację NVIDIA CUDA przez Docker Compose, należy dodać sekcję deploy do usługi SnapOtter:

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
| `2.2.0` | Dokładna wersja |
| `2.2` | Najnowsza poprawka w 2.2.x |
| `2` | Najnowsza wersja podrzędna w 2.x |

## Platformy {#platforms}

| Architektura | Obsługa GPU | Uwagi |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Pełna akceleracja CUDA dla narzędzi AI |
| linux/arm64 | Tylko CPU | Raspberry Pi 4/5, Apple Silicon przez Docker Desktop |

## Migracja z poprzednich tagów {#migration-from-previous-tags}

Jeśli używany był tag `:cuda`, należy przejść na `:latest` i zachować `--gpus all`. Obsługa GPU jest taka sama, obraz jest ujednolicony.

Dane i ustawienia są zachowane w woluminach.
