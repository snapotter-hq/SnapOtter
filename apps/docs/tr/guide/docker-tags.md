---
description: "SnapOtter Docker imaj etiketleri, GPU kıyaslamaları, sürüm sabitleme ve AMD64 ile ARM64 için çoklu platform desteği."
i18n_source_hash: a5871d76250c
i18n_provenance: machine
i18n_output_hash: a5cdb6ef0b38
i18n_hash_version: 2
---

# Docker İmaj {#docker-image}

SnapOtter tek bir Docker imajı olarak sunulur. Tek başına çalıştırıldığında loopback arayüzünde gömülü bir PostgreSQL 17 ve Redis başlatır (gömülü mod); üretim ortamında ise Compose ile ayrı PostgreSQL 17 ve Redis 8 kapsayıcılarıyla birlikte çalıştırın. Uygulama imajı tüm platformlarda çalışır.

## Hızlı başlangıç {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

`DATABASE_URL` ayarlanmadığında bu komut gömülü modda çalışır: PostgreSQL ve Redis kapsayıcının içinde loopback üzerinde başlar ve tüm veriler `SnapOtter-data` birimi altında tutulur. Bunun yerine harici servisleri kullanmak için `DATABASE_URL` ve `REDIS_URL` değişkenlerini ayarlayın ([Compose](#docker-compose) yığınının yaptığı gibi). Bkz. [Yapılandırma](/tr/guide/configuration#embedded-mode).

## NVIDIA CUDA hızlandırma {#nvidia-cuda-acceleration}

İmaj, amd64 üzerinde NVIDIA CUDA desteği içerir. [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) kurulu bir NVIDIA GPU'nuz varsa `--gpus all` ekleyin:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

İmaj, çalışma zamanında CUDA'yı otomatik algılar. `--gpus all` olmadan ya da CUDA kullanılamadığında yapay zeka araçları CPU üzerinde çalışır. Her iki durumda da aynı imaj kullanılır.

VA-API, Quick Sync veya OpenCL üzerinden Intel/AMD iGPU hızlandırma, SnapOtter yapay zeka çıkarımı için şu anda desteklenmemektedir. `/dev/dri` aygıtını kapsayıcıya eşlemek render aygıtını açığa çıkarabilir, ancak CUDA kullanılabilir olmadıkça yapay zeka çalışma zamanı yine CPU kullanır.

### Kıyaslamalar {#benchmarks}

572x1024 boyutunda bir JPEG portre ile NVIDIA RTX 4070 (12 GB VRAM) üzerinde test edilmiştir.

#### Sıcak performans {#warm-performance}

| Araç | CPU | GPU | Hızlanma |
|------|-----|-----|---------|
| Arka plan kaldırma (u2net) | 2,415ms | 879ms | 2.7x |
| Arka plan kaldırma (isnet) | 2,457ms | 1,137ms | 2.2x |
| 2x büyütme | 350ms | 309ms | 1.1x |
| 4x büyütme | 910ms | 310ms | 2.9x |
| Yüz bulanıklaştırma | 139ms | 122ms | 1.1x |

#### Soğuk başlangıç (kapsayıcı başladıktan sonraki ilk istek) {#cold-start-first-request-after-container-start}

| Araç | CPU | GPU | Hızlanma |
|------|-----|-----|---------|
| Arka plan kaldırma | 22,286ms | 4,792ms | 4.7x |
| 2x büyütme | 3,957ms | 2,318ms | 1.7x |

OCR, CUDA karşılaştırmasına dahil değildir. Yerleşik Tesseract katmanı ve isteğe bağlı RapidOCR/ONNX katmanlarının ikisi de, kapsayıcının NVIDIA GPU erişimi olduğunda bile CPU kullanır.

### CUDA sağlık denetimi {#cuda-health-check}

İlk yapay zeka isteğinden sonra yönetici sağlık uç noktası CUDA GPU durumunu bildirir:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

Tam Compose yığını uygulamayı, PostgreSQL 17'yi ve Redis 8'i içerir. Eksiksiz `docker-compose.yml` için [Dağıtım](/tr/guide/deployment) sayfasına bakın. Asgari bir örnek:

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

Docker Compose ile NVIDIA CUDA hızlandırma için SnapOtter servisine deploy bölümünü ekleyin:

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
| `2.2.0` | Tam sürüm |
| `2.2` | 2.2.x içindeki en son yama |
| `2` | 2.x içindeki en son minör sürüm |

## Platformlar {#platforms}

| Mimari | GPU desteği | Notlar |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Yapay zeka araçları için tam CUDA hızlandırma |
| linux/arm64 | Yalnızca CPU | Raspberry Pi 4/5, Docker Desktop ile Apple Silicon |

## Önceki etiketlerden geçiş {#migration-from-previous-tags}

`:cuda` etiketini kullanıyorsanız `:latest` etiketine geçin ve `--gpus all` ayarını koruyun. GPU desteği aynıdır, imaj birleştirilmiştir.

Verileriniz ve ayarlarınız birimlerde korunur.
