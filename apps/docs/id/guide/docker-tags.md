---
description: "Tag image Docker SnapOtter, benchmark GPU, penyematan versi, dan dukungan multi-platform untuk AMD64 dan ARM64."
i18n_source_hash: a5871d76250c
i18n_provenance: machine
i18n_output_hash: 8312de46422d
i18n_hash_version: 2
---

# Docker Image {#docker-image}

SnapOtter dirilis sebagai satu image Docker. Jalankan sendirian dan image ini memulai PostgreSQL 17 dan Redis tertanam pada antarmuka loopback (mode embedded); untuk produksi, jalankan bersama container PostgreSQL 17 dan Redis 8 terpisah dengan Compose. Image aplikasi berfungsi di semua platform.

## Mulai cepat {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Tanpa `DATABASE_URL` yang diatur, image ini berjalan dalam mode embedded: PostgreSQL dan Redis dimulai di dalam container pada loopback, dengan semua data di bawah volume `SnapOtter-data`. Atur `DATABASE_URL` dan `REDIS_URL` (seperti yang dilakukan stack [Compose](#docker-compose)) untuk menggunakan layanan eksternal. Lihat [Konfigurasi](/id/guide/configuration#embedded-mode).

## Akselerasi NVIDIA CUDA {#nvidia-cuda-acceleration}

Image ini menyertakan dukungan NVIDIA CUDA di amd64. Jika Anda memiliki GPU NVIDIA dengan [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) terinstal, tambahkan `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Image mendeteksi CUDA secara otomatis saat runtime. Tanpa `--gpus all`, atau ketika CUDA tidak tersedia, alat AI berjalan di CPU. Image yang sama untuk keduanya.

Akselerasi iGPU Intel/AMD melalui VA-API, Quick Sync, atau OpenCL saat ini belum didukung untuk inferensi AI SnapOtter. Memetakan `/dev/dri` ke dalam container dapat mengekspos perangkat render, tetapi runtime AI tetap akan menggunakan CPU kecuali CUDA tersedia.

### Benchmark {#benchmarks}

Diuji pada NVIDIA RTX 4070 (VRAM 12 GB) dengan potret JPEG 572x1024.

#### Performa warm {#warm-performance}

| Alat | CPU | GPU | Percepatan |
|------|-----|-----|---------|
| Penghapusan latar belakang (u2net) | 2,415ms | 879ms | 2.7x |
| Penghapusan latar belakang (isnet) | 2,457ms | 1,137ms | 2.2x |
| Upscale 2x | 350ms | 309ms | 1.1x |
| Upscale 4x | 910ms | 310ms | 2.9x |
| Blur wajah | 139ms | 122ms | 1.1x |

#### Cold start (permintaan pertama setelah container dimulai) {#cold-start-first-request-after-container-start}

| Alat | CPU | GPU | Percepatan |
|------|-----|-----|---------|
| Penghapusan latar belakang | 22,286ms | 4,792ms | 4.7x |
| Upscale 2x | 3,957ms | 2,318ms | 1.7x |

OCR tidak disertakan dalam perbandingan CUDA. Baik tier Tesseract bawaan maupun tier RapidOCR/ONNX opsional menggunakan CPU, termasuk ketika container memiliki akses GPU NVIDIA.

### Health check CUDA {#cuda-health-check}

Setelah permintaan AI pertama, endpoint health admin melaporkan status GPU CUDA:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

Stack Compose lengkap mencakup aplikasi, PostgreSQL 17, dan Redis 8. Lihat [Deployment](/id/guide/deployment) untuk `docker-compose.yml` yang lengkap. Contoh minimal:

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

Untuk akselerasi NVIDIA CUDA melalui Docker Compose, tambahkan bagian deploy ke layanan SnapOtter:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Penyematan versi {#version-pinning}

| Tag | Deskripsi |
|-----|------------|
| `latest` | Rilis terbaru |
| `2.2.0` | Versi persis |
| `2.2` | Patch terbaru di 2.2.x |
| `2` | Minor terbaru di 2.x |

## Platform {#platforms}

| Arsitektur | Dukungan GPU | Catatan |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Akselerasi CUDA penuh untuk alat AI |
| linux/arm64 | Hanya CPU | Raspberry Pi 4/5, Apple Silicon melalui Docker Desktop |

## Migrasi dari tag sebelumnya {#migration-from-previous-tags}

Jika Anda menggunakan tag `:cuda`, beralihlah ke `:latest` dan pertahankan `--gpus all`. Dukungan GPU yang sama, image yang terpadu.

Data dan pengaturan Anda tetap tersimpan di volume.
