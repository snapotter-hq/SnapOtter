---
description: "SnapOtter Docker imaj etiketleri, GPU karşılaştırmaları, sürüm sabitleme ve AMD64 ile ARM64 için çoklu platform desteği."
i18n_source_hash: 148b3608e11a
i18n_provenance: human
i18n_output_hash: ad7046cd45ce
---

# Docker İmajı {#docker-image}

SnapOtter tek bir Docker imajı olarak dağıtılır. Tek başına çalıştırdığınızda, loopback arayüzünde gömülü bir PostgreSQL 17 ve Redis başlatır (gömülü mod); üretim için, Compose ile ayrı PostgreSQL 17 ve Redis 8 konteynerlerinin yanında çalıştırın. Uygulama imajı tüm platformlarda çalışır.

## Hızlı başlangıç {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Hiçbir `DATABASE_URL` ayarlanmadığında bu, gömülü modda çalışır: PostgreSQL ve Redis konteyner içinde loopback üzerinde başlar ve tüm veriler `SnapOtter-data` birimi altında tutulur. Bunun yerine harici hizmetleri kullanmak için `DATABASE_URL` ve `REDIS_URL` ayarlayın ([Compose](#docker-compose) yığınının yaptığı gibi). Bkz. [Yapılandırma](/tr/guide/configuration#embedded-mode).

## NVIDIA CUDA hızlandırması {#nvidia-cuda-acceleration}

İmaj, amd64 üzerinde NVIDIA CUDA desteği içerir. [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) kurulu bir NVIDIA GPU'nuz varsa `--gpus all` ekleyin:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

İmaj, CUDA'yı çalışma zamanında otomatik olarak algılar. `--gpus all` olmadan veya CUDA kullanılamadığında, AI araçları CPU üzerinde çalışır. Her iki durumda da aynı imaj.

Intel/AMD iGPU hızlandırması, VA-API, Quick Sync veya OpenCL aracılığıyla, bugün SnapOtter AI çıkarımı için desteklenmemektedir. `/dev/dri` öğesini konteyner içine eşlemek render aygıtını açığa çıkarabilir, ancak CUDA kullanılabilir olmadıkça AI çalışma zamanı yine de CPU kullanır.

### Karşılaştırmalar {#benchmarks}

572x1024 boyutunda bir JPEG portresiyle bir NVIDIA RTX 4070 (12 GB VRAM) üzerinde test edildi.

#### Sıcak performans {#warm-performance}

| Araç | CPU | GPU | Hızlanma |
|------|-----|-----|---------|
| Arka plan kaldırma (u2net) | 2.415ms | 879ms | 2,7x |
| Arka plan kaldırma (isnet) | 2.457ms | 1.137ms | 2,2x |
| 2x büyütme | 350ms | 309ms | 1,1x |
| 4x büyütme | 910ms | 310ms | 2,9x |
| OCR (PaddleOCR) | 137ms | 94ms | 1,5x |
| Yüz bulanıklaştırma | 139ms | 122ms | 1,1x |

#### Soğuk başlangıç (konteyner başlangıcından sonraki ilk istek) {#cold-start-first-request-after-container-start}

| Araç | CPU | GPU | Hızlanma |
|------|-----|-----|---------|
| Arka plan kaldırma | 22.286ms | 4.792ms | 4,7x |
| 2x büyütme | 3.957ms | 2.318ms | 1,7x |
| OCR (PaddleOCR) | 1.469ms | 1.090ms | 1,3x |

### CUDA sağlık kontrolü {#cuda-health-check}

İlk AI isteğinden sonra, yönetici sağlık uç noktası CUDA GPU durumunu raporlar:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

Tam Compose yığını uygulamayı, PostgreSQL 17'yi ve Redis 8'i içerir. Eksiksiz `docker-compose.yml` için bkz. [Dağıtım](/tr/guide/deployment). Minimal bir örnek:

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

Docker Compose aracılığıyla NVIDIA CUDA hızlandırması için, SnapOtter hizmetine deploy bölümünü ekleyin:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Sürüm sabitleme {#version-pinning}

| Etiket | Açıklama |
|-----|------------|
| `latest` | En son sürüm |
| `1.11.0` | Tam sürüm |
| `1.11` | 1.11.x içindeki en son yama |
| `1` | 1.x içindeki en son ara sürüm |

## Platformlar {#platforms}

| Mimari | GPU desteği | Notlar |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | AI araçları için tam CUDA hızlandırması |
| linux/arm64 | Yalnızca CPU | Raspberry Pi 4/5, Docker Desktop aracılığıyla Apple Silicon |

## Önceki etiketlerden geçiş {#migration-from-previous-tags}

`:cuda` etiketini kullanıyorduysanız, `:latest` öğesine geçin ve `--gpus all` öğesini koruyun. Aynı GPU desteği, birleşik imaj.

Verileriniz ve ayarlarınız birimlerde korunur.
