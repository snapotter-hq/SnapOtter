---
description: "Tag image Docker SnapOtter, benchmark GPU, penyematan versi, dan dukungan multi-platform untuk AMD64 dan ARM64."
i18n_output_hash: 1285488cc707
i18n_source_hash: fda322e78b4b
i18n_provenance: human
---

# Image Docker {#docker-image}

SnapOtter dikirim sebagai satu image Docker. Jalankan sendiri dan ia akan memulai PostgreSQL 17 tertanam serta Redis pada antarmuka loopback (mode tertanam); untuk produksi, jalankan bersama container PostgreSQL 17 dan Redis 8 terpisah dengan Compose. Image aplikasi ini bekerja di semua platform.

## Mulai cepat {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Tanpa `DATABASE_URL` yang disetel, ini berjalan dalam mode tertanam: PostgreSQL dan Redis dimulai di dalam container pada loopback, dengan semua data di bawah volume `SnapOtter-data`. Setel `DATABASE_URL` dan `REDIS_URL` (seperti yang dilakukan stack [Compose](#docker-compose)) untuk menggunakan layanan eksternal sebagai gantinya. Lihat [Konfigurasi](/id/guide/configuration#embedded-mode).

## Akselerasi NVIDIA CUDA {#nvidia-cuda-acceleration}

Image menyertakan dukungan NVIDIA CUDA pada amd64. Jika Anda memiliki GPU NVIDIA dengan [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) terpasang, tambahkan `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Image mendeteksi CUDA secara otomatis saat runtime. Tanpa `--gpus all`, atau saat CUDA tidak tersedia, tool AI berjalan di CPU. Image yang sama untuk keduanya.

Akselerasi iGPU Intel/AMD melalui VA-API, Quick Sync, atau OpenCL saat ini tidak didukung untuk inferensi AI SnapOtter. Memetakan `/dev/dri` ke dalam container dapat mengekspos perangkat render, tetapi runtime AI akan tetap menggunakan CPU kecuali CUDA tersedia.

### Benchmark {#benchmarks}

Diuji pada NVIDIA RTX 4070 (VRAM 12 GB) dengan potret JPEG 572x1024.

#### Performa hangat {#warm-performance}

| Tool | CPU | GPU | Percepatan |
|------|-----|-----|---------|
| Penghapusan latar (u2net) | 2.415ms | 879ms | 2,7x |
| Penghapusan latar (isnet) | 2.457ms | 1.137ms | 2,2x |
| Upscale 2x | 350ms | 309ms | 1,1x |
| Upscale 4x | 910ms | 310ms | 2,9x |
| Blur wajah | 139ms | 122ms | 1,1x |

#### Cold start (permintaan pertama setelah container mulai) {#cold-start-first-request-after-container-start}

| Tool | CPU | GPU | Percepatan |
|------|-----|-----|---------|
| Penghapusan latar | 22.286ms | 4.792ms | 4,7x |
| Upscale 2x | 3.957ms | 2.318ms | 1,7x |

OCR tidak termasuk dalam perbandingan CUDA. Tingkat Tesseract bawaan dan tingkat RapidOCR/ONNX opsional menggunakan CPU, termasuk ketika kontainer memiliki akses NVIDIA GPU.

### Pemeriksaan kesehatan CUDA {#cuda-health-check}

Setelah permintaan AI pertama, endpoint kesehatan admin melaporkan status GPU CUDA:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

Stack Compose lengkap mencakup aplikasi, PostgreSQL 17, dan Redis 8. Lihat [Penerapan](/id/guide/deployment) untuk `docker-compose.yml` lengkap. Contoh minimal:

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

Untuk akselerasi NVIDIA CUDA via Docker Compose, tambahkan bagian deploy ke layanan SnapOtter:

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
| `1.11.0` | Versi persis |
| `1.11` | Patch terbaru di 1.11.x |
| `1` | Minor terbaru di 1.x |

## Platform {#platforms}

| Arsitektur | Dukungan GPU | Catatan |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Akselerasi CUDA penuh untuk tool AI |
| linux/arm64 | Hanya CPU | Raspberry Pi 4/5, Apple Silicon via Docker Desktop |

## Migrasi dari tag sebelumnya {#migration-from-previous-tags}

Jika Anda sebelumnya menggunakan tag `:cuda`, beralihlah ke `:latest` dan pertahankan `--gpus all`. Dukungan GPU sama, image terpadu.

Data dan pengaturan Anda dipertahankan di dalam volume.
